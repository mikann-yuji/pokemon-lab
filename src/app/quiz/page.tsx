import Link from "next/link";
import QuizGame from "@/features/quiz/components/quiz-game";
import TypeMatchupMatrix from "@/features/quiz/components/type-matchup-matrix";
import { createQuestions } from "@/features/quiz/quiz-logic";
import styles from "@/features/quiz/styles/quiz-page.module.css";
import { getTypeMatchups } from "@/infrastructure/database/type-matchup-repository";

/**
 * SQLiteからタイプ相性を読み込み、クイズと確認用マトリックスを表示するページ。
 */
export default function QuizPage() {
  // DBアクセスはServer Componentで行い、ブラウザ側には必要なデータだけを渡す。
  const typeMatchups = getTypeMatchups();
  const initialQuestions = createQuestions(typeMatchups);

  return (
    <main className={styles.container}>
      <Link href="/" className={styles.backLink}>
        ← Back to Home
      </Link>
      <QuizGame
        initialQuestions={initialQuestions}
        typeMatchups={typeMatchups}
      />
      <TypeMatchupMatrix typeMatchups={typeMatchups} />
    </main>
  );
}
