import Link from "next/link";
import DamageAdjustmentMapLoader from "@/features/damage-adjustment-map/components/damage-adjustment-map-loader";
import styles from "@/features/damage-adjustment-map/styles/damage-adjustment-map.module.css";

export default function DamageAdjustmentMapPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link className={styles.backLink} href="/damage-calculator">
          ← ダメージ計算へ戻る
        </Link>
        <h1>ダメージ調整マップ</h1>
        <p>
          火力と耐久の能力ポイントを動かし、正式なダメージ計算結果がどの撃破範囲に入るかを確認できます。
          レベル50・個体値31固定です。
        </p>
      </header>
      <DamageAdjustmentMapLoader />
    </main>
  );
}
