import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import { getQuestionText, type Question } from "../quiz-logic";
import styles from "../styles/quiz-game.module.css";

type QuestionPanelProps = {
  question: Question;
  questionNumber: number;
  questionCount: number;
  selectedAnswers: Set<TypeName>;
  answered: boolean;
  typeMatchups: TypeMatchup[];
  onTypeClick: (type: TypeName) => void;
};

/**
 * 現在の問題、進捗、回答用のタイプボタンを表示する。
 */
export default function QuestionPanel({
  question,
  questionNumber,
  questionCount,
  selectedAnswers,
  answered,
  typeMatchups,
  onTypeClick,
}: QuestionPanelProps) {
  return (
    <>
      <div className={styles.questionHeader}>
        <span className={styles.progress}>
          問題 {questionNumber} / {questionCount}
        </span>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${(questionNumber / questionCount) * 100}%` }}
          />
        </div>
      </div>

      <h2 className={styles.question}>
        {getQuestionText(question)}
        <span className={styles.hint}>
          （{question.correctAnswers.length}個選択）
        </span>
      </h2>

      <div className={styles.typeGrid}>
        {typeMatchups.map((type) => {
          // 回答後は、正解とユーザーが誤って選んだタイプを色分けする。
          const isSelected = selectedAnswers.has(type.name);
          const isCorrect = question.correctAnswers.includes(type.name);
          const stateClass = answered
            ? isCorrect
              ? styles.correct
              : isSelected
                ? styles.incorrect
                : ""
            : isSelected
              ? styles.selected
              : "";

          return (
            <button
              key={type.name}
              type="button"
              onClick={() => onTypeClick(type.name)}
              className={`${styles.typeButton} ${stateClass}`}
              disabled={answered}
              aria-pressed={isSelected}
            >
              {type.nameJa}
            </button>
          );
        })}
      </div>
    </>
  );
}
