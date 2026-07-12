"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  deleteBattleRecord,
  getBattleRecords,
  saveBattleRecord,
  type BattleRecord,
} from "../infrastructure/battle-record-repository";
import {
  getTrainingPokemonIconCatalog,
  type TrainingPokemon,
} from "@/features/training/infrastructure/training-catalog-repository";
import styles from "../styles/battle-records.module.css";

const MAX_IMAGE_WIDTH = 1280;
const IMAGE_QUALITY = 0.82;
const SIGNATURE_SIZE = 28;
const HUE_BUCKETS = 18;
const OPPONENT_SLOT_RECTS = [
  { x: 0.716, y: 0.153, width: 0.087, height: 0.087 },
  { x: 0.716, y: 0.269, width: 0.087, height: 0.087 },
  { x: 0.716, y: 0.386, width: 0.087, height: 0.087 },
  { x: 0.716, y: 0.501, width: 0.087, height: 0.087 },
  { x: 0.716, y: 0.617, width: 0.087, height: 0.087 },
  { x: 0.716, y: 0.733, width: 0.087, height: 0.087 },
] as const;

type DetectionCandidate = {
  pokemon: TrainingPokemon;
  score: number;
};

type DetectionSlot = {
  slot: number;
  cropDataUrl: string;
  candidates: DetectionCandidate[];
};

type ReferenceSignature = {
  pokemon: TrainingPokemon;
  signature: number[];
};

function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function formatBattleAt(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を処理できませんでした。");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
}

function rgbToHueBucket(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.08 || max < 0.16) return -1;

  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  const degrees = (hue * 60 + 360) % 360;
  return Math.min(HUE_BUCKETS - 1, Math.floor((degrees / 360) * HUE_BUCKETS));
}

function shouldUsePixel(red: number, green: number, blue: number, alpha: number) {
  if (alpha < 32) return false;
  const isRedPanel = red > 110 && green < 95 && blue < 130 && red > green * 1.3;
  const isWhiteUi = red > 220 && green > 220 && blue > 220;
  return !isRedPanel && !isWhiteUi;
}

function createSignature(source: CanvasImageSource) {
  const canvas = document.createElement("canvas");
  canvas.width = SIGNATURE_SIZE;
  canvas.height = SIGNATURE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("画像を解析できませんでした。");
  context.drawImage(source, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
  const { data } = context.getImageData(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
  const histogram = Array.from({ length: HUE_BUCKETS + 3 }, () => 0);

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];
    if (!shouldUsePixel(red, green, blue, alpha)) continue;
    const bucket = rgbToHueBucket(red, green, blue);
    if (bucket >= 0) histogram[bucket] += 1;
    if (red + green + blue < 180) histogram[HUE_BUCKETS] += 1;
    if (red > 180 && green > 180 && blue < 150) histogram[HUE_BUCKETS + 1] += 1;
    if (red > 180 && blue > 180 && green < 170) histogram[HUE_BUCKETS + 2] += 1;
  }

  const magnitude = Math.hypot(...histogram);
  return magnitude > 0 ? histogram.map((value) => value / magnitude) : histogram;
}

function cosineSimilarity(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読み込めませんでした: ${src}`));
    image.src = src;
  });
}

async function buildReferenceSignatures(catalog: TrainingPokemon[]) {
  const signatures: ReferenceSignature[] = [];
  const candidates = catalog.filter((pokemon) => pokemon.imageUrl).slice(0, 260);
  const settled = await Promise.allSettled(
    candidates.map(async (pokemon) => {
      const image = await loadImageElement(pokemon.imageUrl!);
      return { pokemon, signature: createSignature(image) };
    }),
  );
  for (const result of settled) {
    if (result.status === "fulfilled") signatures.push(result.value);
  }
  return signatures;
}

async function detectOpponentPokemon(imageDataUrl: string) {
  const [sourceImage, catalog] = await Promise.all([
    loadImageElement(imageDataUrl),
    getTrainingPokemonIconCatalog(),
  ]);
  const references = await buildReferenceSignatures(catalog);
  if (references.length === 0) {
    throw new Error("照合用のポケモン画像を読み込めませんでした。オンライン時に一度画像を表示してキャッシュしてください。");
  }

  const slots: DetectionSlot[] = [];
  for (const [index, rect] of OPPONENT_SLOT_RECTS.entries()) {
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 120;
    cropCanvas.height = 90;
    const cropContext = cropCanvas.getContext("2d");
    if (!cropContext) continue;
    cropContext.drawImage(
      sourceImage,
      rect.x * sourceImage.naturalWidth,
      rect.y * sourceImage.naturalHeight,
      rect.width * sourceImage.naturalWidth,
      rect.height * sourceImage.naturalHeight,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
    );
    const signature = createSignature(cropCanvas);
    const candidates = references
      .map((reference) => ({
        pokemon: reference.pokemon,
        score: cosineSimilarity(signature, reference.signature),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    slots.push({
      slot: index + 1,
      cropDataUrl: cropCanvas.toDataURL("image/jpeg", 0.86),
      candidates,
    });
  }
  return slots;
}

export function BattleRecords() {
  const [records, setRecords] = useState<BattleRecord[]>([]);
  const [battleAt, setBattleAt] = useState(() => toDateTimeLocalValue(Date.now()));
  const [memo, setMemo] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detections, setDetections] = useState<DetectionSlot[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getBattleRecords()
      .then((savedRecords) => {
        if (active) setRecords(savedRecords);
      })
      .catch((loadError: unknown) => {
        console.error("Failed to load battle records.", loadError);
        if (active) setError("バトル記録を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const previewLabel = useMemo(
    () => (imageDataUrl ? "選択中の写真" : "写真未選択"),
    [imageDataUrl],
  );

  async function handleImageChange(file: File | undefined) {
    setError("");
    setMessage("");
    if (!file) {
      setImageDataUrl("");
      setDetections([]);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください。");
      return;
    }
    try {
      setImageDataUrl(await resizeImage(file));
      setDetections([]);
    } catch (resizeError: unknown) {
      console.error("Failed to resize battle image.", resizeError);
      setError("写真を読み込めませんでした。");
    }
  }

  async function handleSave() {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const savedRecord = await saveBattleRecord({
        battleAt: fromDateTimeLocalValue(battleAt),
        memo,
        imageDataUrl,
      });
      setRecords((current) => [savedRecord, ...current]);
      setMemo("");
      setImageDataUrl("");
      setBattleAt(toDateTimeLocalValue(Date.now()));
      setMessage("保存しました。");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "バトル記録を保存できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDetect() {
    if (!imageDataUrl) {
      setError("先に選出画面の写真を選択してください。");
      return;
    }
    setError("");
    setMessage("");
    setDetecting(true);
    try {
      setDetections(await detectOpponentPokemon(imageDataUrl));
      setMessage("相手側6枠の候補を検出しました。");
    } catch (detectError: unknown) {
      console.error("Failed to detect opponent Pokemon.", detectError);
      setError(
        detectError instanceof Error
          ? detectError.message
          : "相手ポケモンを検出できませんでした。",
      );
    } finally {
      setDetecting(false);
    }
  }

  async function handleDelete(id: number) {
    setError("");
    setMessage("");
    await deleteBattleRecord(id);
    setRecords((current) => current.filter((record) => record.id !== id));
  }

  return (
    <main className={styles.page}>
      <section className={styles.header} aria-labelledby="battle-record-title">
        <p>Battle Records</p>
        <h1 id="battle-record-title">バトル記録</h1>
      </section>

      <section className={styles.editor} aria-label="バトル記録の追加">
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>日時</span>
            <input
              type="datetime-local"
              value={battleAt}
              onChange={(event) => setBattleAt(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>選出画面の写真</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => void handleImageChange(event.target.files?.[0])}
            />
          </label>

          <label className={`${styles.field} ${styles.memoField}`}>
            <span>メモ</span>
            <textarea
              rows={5}
              value={memo}
              placeholder="選出理由、初手、相手の型、反省点など"
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.preview} aria-label={previewLabel}>
          {imageDataUrl ? (
            <Image
              src={imageDataUrl}
              alt="保存前の選出画面"
              width={1280}
              height={720}
              unoptimized
            />
          ) : (
            <span>写真を選択</span>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "保存中" : "保存"}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={detecting || !imageDataUrl}
            onClick={() => void handleDetect()}
          >
            {detecting ? "検出中" : "相手候補を検出"}
          </button>
          {message ? <p className={styles.success}>{message}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>

        {detections.length > 0 ? (
          <div className={styles.detectionPanel}>
            <div>
              <h2>検出候補</h2>
              <p>
                画像内の相手側6枠を固定位置で切り出し、ローカルで色特徴を照合しています。
              </p>
            </div>
            <div className={styles.detectionGrid}>
              {detections.map((slot) => (
                <article className={styles.detectionCard} key={slot.slot}>
                  <Image
                    src={slot.cropDataUrl}
                    alt={`相手枠${slot.slot}の切り出し`}
                    width={120}
                    height={90}
                    unoptimized
                  />
                  <div>
                    <strong>枠 {slot.slot}</strong>
                    <ol>
                      {slot.candidates.map((candidate) => (
                        <li key={candidate.pokemon.id}>
                          <span>{candidate.pokemon.nameJa}</span>
                          <small>{Math.round(candidate.score * 100)}%</small>
                        </li>
                      ))}
                    </ol>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.records} aria-label="保存済みバトル記録">
        <div className={styles.recordsHeader}>
          <h2>保存済み</h2>
          <span>{records.length}件</span>
        </div>
        {loading ? null : records.length === 0 ? (
          <p className={styles.empty}>まだバトル記録はありません。</p>
        ) : (
          <div className={styles.recordGrid}>
            {records.map((record) => (
              <article className={styles.recordCard} key={record.id}>
                <Image
                  src={record.imageDataUrl}
                  alt={`${formatBattleAt(record.battleAt)}の選出画面`}
                  width={1280}
                  height={720}
                  unoptimized
                />
                <div className={styles.recordBody}>
                  <time dateTime={new Date(record.battleAt).toISOString()}>
                    {formatBattleAt(record.battleAt)}
                  </time>
                  {record.memo ? <p>{record.memo}</p> : <p>メモなし</p>}
                  <button
                    type="button"
                    onClick={() => void handleDelete(record.id)}
                  >
                    削除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
