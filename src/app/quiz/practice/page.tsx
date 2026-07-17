import Link from "next/link";
import PracticeQuizLoader from "@/features/quiz/components/practice-quiz-loader";
import pageStyles from "@/features/quiz/styles/quiz-page.module.css";
import styles from "@/features/quiz/styles/practice-quiz.module.css";

export default function PracticeQuizPage() {
  return (
    <main className={pageStyles.container}>
      <header className={pageStyles.hero}>
        <p className={styles.eyebrow}>TYPE MATCHUP PRACTICE</p>
        <h1>タイプ相性クイズ 実践編</h1>
        <p>自分のバトルチームで、相手への有効打を見つけよう！</p>
        <Link className={styles.backLink} href="/quiz">
          ← 通常編に戻る
        </Link>
      </header>
      <PracticeQuizLoader />
    </main>
  );
}
