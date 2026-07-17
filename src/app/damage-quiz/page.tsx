import Link from "next/link";
import DamageQuizLoader from "@/features/damage-quiz/components/damage-quiz-loader";
import pageStyles from "@/features/quiz/styles/quiz-page.module.css";
import styles from "@/features/damage-quiz/styles/damage-quiz.module.css";

export default function DamageQuizPage() {
  return (
    <main className={pageStyles.container}>
      <header className={pageStyles.hero}>
        <p className={styles.eyebrow}>POKEMON DAMAGE QUIZ</p>
        <h1>ダメージ計算クイズ</h1>
        <p>自分のバトルチームで、撃破ラインと最大打点を見抜こう！</p>
        <Link className={styles.backLink} href="/damage-calculator">← ダメージ計算へ</Link>
      </header>
      <DamageQuizLoader />
    </main>
  );
}
