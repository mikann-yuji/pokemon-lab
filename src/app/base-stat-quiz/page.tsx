import Link from "next/link";
import BaseStatQuizLoader from "@/features/base-stat-quiz/components/base-stat-quiz-loader";
import pageStyles from "@/features/quiz/styles/quiz-page.module.css";
import styles from "@/features/base-stat-quiz/styles/base-stat-quiz.module.css";

export default function BaseStatQuizPage() {
  return (
    <main className={pageStyles.container}>
      <header className={pageStyles.hero}>
        <p className={styles.eyebrow}>POKEMON BASE STATS QUIZ</p>
        <h1>ポケモン種族値クイズ</h1>
        <p>H-A-B-C-D-Sを見抜いて、ポケモンへの理解を深めよう！</p>
        <Link className={styles.backLink} href="/move-quiz">← ポケモン技クイズへ</Link>
      </header>
      <BaseStatQuizLoader />
    </main>
  );
}
