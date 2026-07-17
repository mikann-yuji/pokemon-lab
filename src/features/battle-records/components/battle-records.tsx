"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import { PokemonCombobox } from "@/features/damage-calculator/components/pokemon-combobox";
import {
  deleteBattleRecord,
  getBattleRecords,
  saveBattleRecord,
  type BattleRecord,
} from "../infrastructure/battle-record-repository";
import {
  loadRemoteDetectionSamples,
  saveRemoteDetectionSample,
  type DetectionLearningSample,
} from "../infrastructure/detection-learning-repository";
import styles from "../styles/battle-records.module.css";

const MAX_IMAGE_WIDTH = 1280;
const IMAGE_QUALITY = 0.82;
const SIGNATURE_SIZE = 36;
const HUE_BUCKETS = 18;
const LEARNING_STORAGE_KEY = "pokemon-lab:battle-record-detection-learning:v1";
const FALLBACK_OPPONENT_SLOT_RECTS = [
  { x: 0.758, y: 0.128, width: 0.082, height: 0.095 },
  { x: 0.758, y: 0.245, width: 0.082, height: 0.095 },
  { x: 0.758, y: 0.362, width: 0.082, height: 0.095 },
  { x: 0.758, y: 0.478, width: 0.082, height: 0.095 },
  { x: 0.758, y: 0.595, width: 0.082, height: 0.095 },
  { x: 0.758, y: 0.712, width: 0.082, height: 0.095 },
] as const;

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DetectionCandidate = {
  pokemon: ChampionsIcon;
  score: number;
};

type DetectionSlot = {
  slot: number;
  cropDataUrl: string;
  signature: number[];
  candidates: DetectionCandidate[];
};

type ReferenceSignature = {
  pokemon: ChampionsIcon;
  signature: number[];
};

type ChampionsIcon = {
  id: number;
  name: string;
  nameJa: string;
  iconPath: string;
};

type LearnedDetection = DetectionLearningSample;

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
  const isTypeIconBlue = blue > 165 && red < 120 && green > 120;
  const isTypeIconOrange = red > 190 && green > 120 && green < 190 && blue < 90;
  const isTypeIconRed = red > 185 && green < 100 && blue < 100;
  return (
    !isRedPanel &&
    !isWhiteUi &&
    !isTypeIconBlue &&
    !isTypeIconOrange &&
    !isTypeIconRed
  );
}

function isOpponentPanelPixel(red: number, green: number, blue: number, alpha: number) {
  return alpha > 160 && red > 120 && green < 80 && blue > 60 && red > green * 1.8;
}

function detectOpponentSlotRects(sourceImage: HTMLImageElement): CropRect[] {
  const sampleWidth = 320;
  const sampleHeight = Math.max(1, Math.round((sourceImage.naturalHeight / sourceImage.naturalWidth) * sampleWidth));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [...FALLBACK_OPPONENT_SLOT_RECTS];
  context.drawImage(sourceImage, 0, 0, sampleWidth, sampleHeight);

  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
  const minX = Math.floor(sampleWidth * 0.55);
  const rowHits = Array.from({ length: sampleHeight }, () => 0);
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = minX; x < sampleWidth; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      if (isOpponentPanelPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) {
        rowHits[y] += 1;
      }
    }
  }

  const minRowHits = Math.max(10, Math.round(sampleWidth * 0.045));
  const bands: Array<{ top: number; bottom: number }> = [];
  let bandStart: number | null = null;
  for (let y = 0; y < sampleHeight; y += 1) {
    if (rowHits[y] >= minRowHits) {
      bandStart ??= y;
    } else if (bandStart !== null) {
      if (y - bandStart >= sampleHeight * 0.035) bands.push({ top: bandStart, bottom: y - 1 });
      bandStart = null;
    }
  }
  if (bandStart !== null) bands.push({ top: bandStart, bottom: sampleHeight - 1 });

  const rects = bands.slice(0, 6).map((band) => {
    let left = sampleWidth;
    let right = minX;
    for (let y = band.top; y <= band.bottom; y += 1) {
      for (let x = minX; x < sampleWidth; x += 1) {
        const index = (y * sampleWidth + x) * 4;
        if (isOpponentPanelPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    const panelWidth = Math.max(1, right - left + 1);
    const panelHeight = Math.max(1, band.bottom - band.top + 1);
    return {
      x: (left + panelWidth * 0.08) / sampleWidth,
      y: (band.top + panelHeight * 0.04) / sampleHeight,
      width: (panelWidth * 0.42) / sampleWidth,
      height: (panelHeight * 0.92) / sampleHeight,
    };
  });

  return rects.length === 6 ? rects : [...FALLBACK_OPPONENT_SLOT_RECTS];
}

function createSignature(source: CanvasImageSource) {
  const canvas = document.createElement("canvas");
  canvas.width = SIGNATURE_SIZE;
  canvas.height = SIGNATURE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("画像を解析できませんでした。");
  context.drawImage(source, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
  const { data } = context.getImageData(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
  const histogram = Array.from({ length: HUE_BUCKETS + 3 + 16 }, () => 0);

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

    const pixel = index / 4;
    const x = pixel % SIGNATURE_SIZE;
    const y = Math.floor(pixel / SIGNATURE_SIZE);
    const cellX = Math.min(3, Math.floor((x / SIGNATURE_SIZE) * 4));
    const cellY = Math.min(3, Math.floor((y / SIGNATURE_SIZE) * 4));
    histogram[HUE_BUCKETS + 3 + cellY * 4 + cellX] += 1;
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

async function loadChampionsIcons(): Promise<ChampionsIcon[]> {
  const response = await fetch("/champions-icons/manifest.json");
  if (!response.ok) {
    throw new Error("同梱アイコンの一覧を読み込めませんでした。");
  }
  return response.json() as Promise<ChampionsIcon[]>;
}

function isSelectableBattlePreviewIcon(pokemon: ChampionsIcon) {
  return !pokemon.name.includes("-mega");
}

function loadLearnedDetections(): LearnedDetection[] {
  try {
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearnedDetection[];
    return parsed.filter(
      (item) =>
        Number.isFinite(item.pokemonId) &&
        Array.isArray(item.signature) &&
        item.signature.length > 0,
    );
  } catch {
    return [];
  }
}

function saveLearnedDetection(pokemonId: number, signature: number[]) {
  const next = [
    { pokemonId, signature, updatedAt: Date.now() },
    ...loadLearnedDetections(),
  ].slice(0, 300);
  window.localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(next));
}

function mergeLearnedDetections(samples: LearnedDetection[]) {
  const byKey = new Map<string, LearnedDetection>();
  for (const sample of [...samples, ...loadLearnedDetections()]) {
    const key = `${sample.pokemonId}:${sample.signature
      .map((value) => value.toFixed(4))
      .join(",")}`;
    const current = byKey.get(key);
    if (!current || sample.updatedAt > current.updatedAt) {
      byKey.set(key, sample);
    }
  }
  const next = [...byKey.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 300);
  window.localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(next));
  return next;
}

async function syncRemoteDetectionSamplesToLocal() {
  const remoteSamples = await loadRemoteDetectionSamples();
  return mergeLearnedDetections(remoteSamples);
}

function getLearnedScore(
  signature: number[],
  pokemonId: number,
  samples: LearnedDetection[],
) {
  return samples
    .filter((item) => item.pokemonId === pokemonId)
    .reduce(
      (best, item) => Math.max(best, cosineSimilarity(signature, item.signature)),
      0,
    );
}

async function buildReferenceSignatures(catalog: ChampionsIcon[]) {
  const signatures: ReferenceSignature[] = [];
  const settled = await Promise.allSettled(
    catalog.map(async (pokemon) => {
      const image = await loadImageElement(pokemon.iconPath);
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
    loadChampionsIcons(),
  ]);
  const learnedSamples = [
    ...(await syncRemoteDetectionSamplesToLocal().catch((error: unknown) => {
      console.warn("Failed to load remote detection samples.", error);
      return loadLearnedDetections();
    })),
  ];
  const selectableCatalog = catalog.filter(isSelectableBattlePreviewIcon);
  const references = await buildReferenceSignatures(selectableCatalog);
  if (references.length === 0) {
    throw new Error("照合用の同梱アイコンを読み込めませんでした。");
  }

  const slots: DetectionSlot[] = [];
  for (const [index, rect] of detectOpponentSlotRects(sourceImage).entries()) {
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
        score: Math.max(
          cosineSimilarity(signature, reference.signature),
          getLearnedScore(signature, reference.pokemon.id, learnedSamples) + 0.08,
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    slots.push({
      slot: index + 1,
      cropDataUrl: cropCanvas.toDataURL("image/jpeg", 0.86),
      signature,
      candidates,
    });
  }
  return { catalog: selectableCatalog, slots };
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
  const [iconCatalog, setIconCatalog] = useState<ChampionsIcon[]>([]);
  const [correctionBySlot, setCorrectionBySlot] = useState<Record<number, string>>(
    {},
  );
  const [correctionInputBySlot, setCorrectionInputBySlot] = useState<
    Record<number, string>
  >({});
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const loadRecords = useCallback(async (active = true) => {
    const savedRecords = await getBattleRecords();
    if (active) setRecords(savedRecords);
  }, []);

  useEffect(() => {
    if (!navigator.onLine) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void syncRemoteDetectionSamplesToLocal()
        .then((samples) => {
          if (active && samples.length > 0) {
            setMessage(`検出補足データを同期しました: ${samples.length}件`);
          }
        })
        .catch((syncError: unknown) => {
          console.warn("Failed to sync detection learning samples.", syncError);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadRecords(active)
        .catch((loadError: unknown) => {
          console.error("Failed to load battle records.", loadError);
          if (active) setError("バトル記録を読み込めませんでした。");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadRecords]);

  useEffect(() => {
    let active = true;
    const handleSynced = () => {
      void loadRecords(active).catch((loadError: unknown) => {
        console.error("Failed to reload battle records after sync.", loadError);
        if (active) setError("同期後のバトル記録を読み込めませんでした。");
      });
    };
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    return () => {
      active = false;
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    };
  }, [loadRecords]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      setCorrectionBySlot({});
      setCorrectionInputBySlot({});
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください。");
      return;
    }
    try {
      setImageDataUrl(await resizeImage(file));
      setDetections([]);
      setCorrectionBySlot({});
      setCorrectionInputBySlot({});
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
      const result = await detectOpponentPokemon(imageDataUrl);
      setIconCatalog(result.catalog);
      setDetections(result.slots);
      setCorrectionBySlot(
        Object.fromEntries(
          result.slots.flatMap((slot) =>
            slot.candidates[0]
              ? [[slot.slot, String(slot.candidates[0].pokemon.id)]]
              : [],
          ),
        ),
      );
      setCorrectionInputBySlot(
        Object.fromEntries(
          result.slots.flatMap((slot) =>
            slot.candidates[0]
              ? [[slot.slot, slot.candidates[0].pokemon.nameJa]]
              : [],
          ),
        ),
      );
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

  async function registerCorrection(slot: DetectionSlot) {
    const pokemonId = Number(correctionBySlot[slot.slot]);
    if (!Number.isFinite(pokemonId)) return;
    const sample = {
      pokemonId,
      signature: slot.signature,
      updatedAt: 0,
    };
    saveLearnedDetection(sample.pokemonId, sample.signature);
    const pokemon = iconCatalog.find((item) => item.id === pokemonId);
    try {
      await saveRemoteDetectionSample(sample);
      setMessage(
        `${pokemon?.nameJa ?? "選択したポケモン"}を正解として共有学習しました。`,
      );
      setToast("正解登録しました。");
    } catch (error: unknown) {
      console.warn("Failed to save remote detection sample.", error);
      setMessage(
        `${pokemon?.nameJa ?? "選択したポケモン"}を端末内に学習しました。`,
      );
      setToast("正解登録しました。");
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
      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
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
                画像内の相手側6枠を自動検出して切り出し、ローカルで色特徴を照合しています。
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
                    <div className={styles.learningControls}>
                      <PokemonCombobox
                        id={`battle-record-correction-${slot.slot}`}
                        label={`枠${slot.slot}の正解ポケモン`}
                        pokemonCatalog={iconCatalog}
                        selectedPokemon={
                          iconCatalog.find(
                            (pokemon) =>
                              String(pokemon.id) === correctionBySlot[slot.slot],
                          ) ?? null
                        }
                        inputValue={correctionInputBySlot[slot.slot] ?? ""}
                        onInputValueChange={(value) => {
                          const exactMatch = iconCatalog.find(
                            (pokemon) => pokemon.nameJa === value,
                          );
                          setCorrectionInputBySlot((current) => ({
                            ...current,
                            [slot.slot]: value,
                          }));
                          setCorrectionBySlot((current) => ({
                            ...current,
                            [slot.slot]: exactMatch ? String(exactMatch.id) : "",
                          }));
                        }}
                        onSelect={(pokemon) => {
                          setCorrectionBySlot((current) => ({
                            ...current,
                            [slot.slot]: pokemon ? String(pokemon.id) : "",
                          }));
                          setCorrectionInputBySlot((current) => ({
                            ...current,
                            [slot.slot]: pokemon?.nameJa ?? "",
                          }));
                        }}
                      />
                      <button
                        type="button"
                        disabled={!correctionBySlot[slot.slot]}
                        onClick={() => void registerCorrection(slot)}
                      >
                        正解登録
                      </button>
                    </div>
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
