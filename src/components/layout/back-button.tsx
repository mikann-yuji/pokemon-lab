"use client";

import { useRouter } from "next/navigation";
import styles from "./back-button.module.css";

/** 全ページ共通で、ブラウザ履歴の前ページへ戻るボタン。 */
export function BackButton() {
  const router = useRouter();

  return (
    <button
      className={styles.backButton}
      type="button"
      aria-label="前のページに戻る"
      onClick={() => router.back()}
    >
      ←
    </button>
  );
}
