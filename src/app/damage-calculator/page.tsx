import { DamageCalculatorCatalogLoader } from "@/features/damage-calculator/components/damage-calculator-catalog-loader";
import styles from "@/features/damage-calculator/styles/damage-calculator.module.css";

/**
 * ダメージ計算ページのServer Component。
 *
 * SQLiteはサーバー側でのみ読み込み、シリアライズ可能なカタログを
 * Client Componentへ渡す。ブラウザがSQLiteへ直接触れない構成にすることで、
 * DBライブラリをクライアント用JavaScriptへ混ぜずに済む。
 */
export default function DamageCalculatorPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <h3>ダメージ計算</h3>
      </header>
      <DamageCalculatorCatalogLoader />
    </main>
  );
}
