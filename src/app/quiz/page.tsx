import Link from "next/link";
import QuizCatalogLoader from "@/features/quiz/components/quiz-catalog-loader";
import styles from "@/features/quiz/styles/quiz-page.module.css";

/** タイプ相性クイズのページ。catalog.db読み込みはClient Loaderへ委譲する。 */
export default function QuizPage() {
  return (
    <main className={styles.container}>
      <header className={styles.hero}>
        <h1>タイプあいしょう チャレンジ！</h1>
        <p>わざの こうかを おぼえて、めざせ タイプマスター！</p>
        <Link className={styles.practiceLink} href="/quiz/practice">
          バトルチームで挑戦！ 実践編 →
        </Link>
        <Link className={styles.practiceLink} href="/move-quiz">
          採用率上位の技を当てよう！ ポケモン技クイズ →
        </Link>
      </header>
      <QuizCatalogLoader />
    </main>
  );
}
