import styles from "../styles/quiz-game.module.css";

type ScoreSectionProps = {
  score: number;
  questionCount: number;
  onRestart: () => void;
};

/**
 * 全問題終了後の得点、正答率、再挑戦ボタンを表示する。
 */
export default function ScoreSection({
  score,
  questionCount,
  onRestart,
}: ScoreSectionProps) {
  return (
    <div className={styles.scoreSection}>
      <h1>クイズ完了！</h1>
      <div className={styles.score}>
        <span className={styles.scoreText}>
          {score} / {questionCount}
        </span>
        <span className={styles.percentage}>
          {Math.round((score / questionCount) * 100)}%
        </span>
      </div>
      <button type="button" onClick={onRestart} className={styles.button}>
        もう一度やる
      </button>
    </div>
  );
}
