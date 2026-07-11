import { ReverseDamageCalculatorCatalogLoader } from "@/features/damage-calculator/components/reverse-damage-calculator-catalog-loader";
import styles from "@/features/damage-calculator/styles/reverse-damage-calculator.module.css";

export default function ReverseDamageCalculatorPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>Battle Simulator</p>
        <h1>ぎゃくびきダメージ計算</h1>
        <span>
          受けたダメージ量や与えた割合から、相手が攻撃・耐久のどこに能力ポイントを振っているかを絞り込みます。
        </span>
      </header>
      <ReverseDamageCalculatorCatalogLoader />
    </main>
  );
}
