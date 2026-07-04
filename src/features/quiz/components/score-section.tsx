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
  const percentage = Math.round((score / questionCount) * 100);
  const message =
    percentage === 100
      ? "パーフェクト！ きみこそ タイプマスター！"
      : percentage >= 80
        ? "すごい！ あとすこしで タイプマスター！"
        : percentage >= 50
          ? "いいちょうし！ どんどん つよくなってる！"
          : "ナイスチャレンジ！ もういちど ちょうせんだ！";

  return (
    <div className={styles.scoreSection}>
      <span className={styles.resultLabel}>RESULT</span>
      <h1>チャレンジ クリア！</h1>
      <div className={styles.score}>
        <span className={styles.scoreText}>
          {score} / {questionCount}
        </span>
        <span className={styles.percentage}>
          {percentage}%
        </span>
      </div>
      <p className={styles.scoreMessage}>{message}</p>
      <button type="button" onClick={onRestart} className={styles.button}>
        もういちど ちょうせん！
      </button>
    </div>
  );
}
