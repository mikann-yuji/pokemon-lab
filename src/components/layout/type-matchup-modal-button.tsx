"use client";

/**
 * このファイルの役割:
 * 全ページ共通のヘッダーから、catalog.db 由来のタイプ相性表をモーダル表示する。
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TypeMatchup } from "@/domain/type-matchup";
import TypeMatchupMatrix from "@/features/quiz/components/type-matchup-matrix";
import { getTypeMatchups } from "@/features/quiz/infrastructure/quiz-catalog-repository";
import styles from "./type-matchup-modal-button.module.css";

type TypeMatchupModalButtonProps = {
  /** モバイルメニュー内から開いた時、親ヘッダーのメニューを閉じるために呼ぶ。 */
  onOpen?: () => void;
};

/** ヘッダー上のボタンと、初回だけ catalog.db から読み込むタイプ相性表モーダル。 */
export function TypeMatchupModalButton({
  onOpen,
}: TypeMatchupModalButtonProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [typeMatchups, setTypeMatchups] = useState<TypeMatchup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // モーダル表示中は Esc で閉じられるようにし、背後のページスクロールを止める。
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  /** モーダルを開き、初回だけ catalog.db からタイプ相性を取得する。 */
  function openModal() {
    onOpen?.();
    setOpen(true);
    if (typeMatchups.length > 0 || loading) return;

    setLoading(true);
    setError("");
    void getTypeMatchups()
      .then(setTypeMatchups)
      .catch((caught: unknown) => {
        console.error("catalog.db からタイプ相性表を読み込めませんでした。", caught);
        setError("タイプ相性表を読み込めませんでした。");
      })
      .finally(() => setLoading(false));
  }

  const modal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <button
              className={styles.backdrop}
              type="button"
              aria-label="タイプ相性表を閉じる"
              onClick={() => setOpen(false)}
            />
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p>TYPE MATCHUPS</p>
                  <h2 id={titleId}>タイプ相性表</h2>
                </div>
                <button
                  className={styles.closeButton}
                  type="button"
                  ref={closeButtonRef}
                  onClick={() => setOpen(false)}
                >
                  閉じる
                </button>
              </div>

              {loading ? (
                <p className={styles.statusMessage}>
                  タイプ相性表を読み込んでいます...
                </p>
              ) : error ? (
                <p className={styles.statusMessage} role="alert">
                  {error}
                </p>
              ) : (
                <TypeMatchupMatrix typeMatchups={typeMatchups} />
              )}
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        className={styles.headerButton}
        type="button"
        onClick={openModal}
      >
        タイプ相性表
      </button>
      {modal}
    </>
  );
}
