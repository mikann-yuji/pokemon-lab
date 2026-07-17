import Link from "next/link";
import MoveQuizLoader from "@/features/move-quiz/components/move-quiz-loader";
import pageStyles from "@/features/quiz/styles/quiz-page.module.css";
import styles from "@/features/move-quiz/styles/move-quiz.module.css";

export default function MoveQuizPage() {
  return (
    <main className={pageStyles.container}>
      <header className={pageStyles.hero}>
        <p className={styles.eyebrow}>POKEMON MOVE QUIZ</p>
        <h1>ポケモン技クイズ</h1>
        <p>よく採用される技を見抜いて、対戦知識を磨こう！</p>
        <Link className={styles.backLink} href="/quiz">
          ← タイプ相性クイズへ
        </Link>
      </header>
      <MoveQuizLoader />
    </main>
  );
}
