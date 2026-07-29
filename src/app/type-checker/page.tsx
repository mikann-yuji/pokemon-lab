import TypeChecker from "@/features/type-checker/components/type-checker";
import styles from "@/features/type-checker/styles/type-checker.module.css";

export default function TypeCheckerPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1>タイプチェッカー</h1>
        <p>
          保存済みバトルチームの弱点の一貫性と、各ポケモンの攻撃技が通るタイプをまとめて確認できます。
        </p>
      </header>
      <TypeChecker />
    </main>
  );
}
