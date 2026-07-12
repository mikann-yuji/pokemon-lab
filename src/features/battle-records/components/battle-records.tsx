"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  deleteBattleRecord,
  getBattleRecords,
  saveBattleRecord,
  type BattleRecord,
} from "../infrastructure/battle-record-repository";
import styles from "../styles/battle-records.module.css";

const MAX_IMAGE_WIDTH = 1280;
const IMAGE_QUALITY = 0.82;

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

export function BattleRecords() {
  const [records, setRecords] = useState<BattleRecord[]>([]);
  const [battleAt, setBattleAt] = useState(() => toDateTimeLocalValue(Date.now()));
  const [memo, setMemo] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください。");
      return;
    }
    try {
      setImageDataUrl(await resizeImage(file));
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
          {message ? <p className={styles.success}>{message}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
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
