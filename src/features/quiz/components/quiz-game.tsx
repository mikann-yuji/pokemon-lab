"use client";

/**
 * このファイルの役割: クイズ全体の状態管理、回答判定、問題遷移、リスタートを担当するクライアントコンポーネント。
 */

import { useEffect, useRef, useState } from "react";
import QuestionPanel from "./question-panel";
import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import {
  createQuestions,
  isExactAnswer,
  type PokemonImagesByType,
  type Question,
} from "../quiz-logic";
import ScoreSection from "./score-section";
import styles from "../styles/quiz-game.module.css";

type QuizGameProps = {
  initialQuestions: Question[];
  typeMatchups: TypeMatchup[];
  pokemonImagesByType: PokemonImagesByType;
};

function getScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/**
 * クイズの進行、回答、採点をブラウザ上で管理する。
 */
export default function QuizGame({
  initialQuestions,
  typeMatchups,
  pokemonImagesByType,
}: QuizGameProps) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Set<TypeName>>(
    new Set(),
  );
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [answerWasCorrect, setAnswerWasCorrect] = useState(false);
  const [includeDualTypes, setIncludeDualTypes] = useState(false);
  const questionTopRef = useRef<HTMLDivElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);

  // 回答結果が表示されたら、次へ進むボタンの下端まで見える位置へ移動する。
  useEffect(() => {
    if (!answered) return;

    const frame = requestAnimationFrame(() => {
      explanationRef.current?.scrollIntoView({
        behavior: getScrollBehavior(),
        block: "end",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [answered]);

  // 問題を再びシャッフルし、すべての進行状況を初期状態に戻す。
  function restart() {
    setQuestions(
      createQuestions(typeMatchups, {
        includeDualTypes,
        pokemonImagesByType,
      }),
    );
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowScore(false);
    resetAnswer();
  }

  // 次の問題へ進む前に、現在の回答状態だけを初期化する。
  function resetAnswer() {
    setSelectedAnswers(new Set());
    setAnswered(false);
    setFeedback("");
    setAnswerWasCorrect(false);
  }

  // 複合タイプ問題の有無を切り替え、クイズを最初から作り直す。
  function changeDualTypeSetting(checked: boolean) {
    setIncludeDualTypes(checked);
    setQuestions(
      createQuestions(typeMatchups, {
        includeDualTypes: checked,
        pokemonImagesByType,
      }),
    );
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowScore(false);
    resetAnswer();
  }

  // 同じタイプを再度押した場合は選択を解除する。
  function toggleType(typeName: TypeName) {
    setSelectedAnswers((current) => {
      const next = new Set(current);
      if (next.has(typeName)) {
        next.delete(typeName);
      } else {
        next.add(typeName);
      }
      return next;
    });
  }

  // 選択内容が正解と完全に一致するかを判定し、結果を表示する。
  function submitAnswer() {
    const question = questions[currentQuestionIndex];
    const isCorrect = isExactAnswer(
      selectedAnswers,
      question.correctAnswers,
    );

    if (isCorrect) {
      setScore((current) => current + 1);
      setFeedback("せいかい！ やったね！");
      setAnswerWasCorrect(true);
    } else {
      const answer = question.correctAnswers
        .map(
          (type) =>
            typeMatchups.find((matchup) => matchup.name === type)?.nameJa ??
            type,
        )
        .join("、");
      setFeedback(`ざんねん！ せいかいは「${answer}」だよ！`);
      setAnswerWasCorrect(false);
    }
    setAnswered(true);
  }

  // 最終問題の後は次の問題ではなく、スコア画面へ切り替える。
  function goToNextQuestion() {
    if (currentQuestionIndex === questions.length - 1) {
      setShowScore(true);
      return;
    }
    setCurrentQuestionIndex((current) => current + 1);
    resetAnswer();
    requestAnimationFrame(() => {
      questionTopRef.current?.scrollIntoView({
        behavior: getScrollBehavior(),
        block: "start",
      });
    });
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className={styles.quizContainer}>
      <label className={styles.quizOption}>
        <input
          type="checkbox"
          checked={includeDualTypes}
          onChange={(event) =>
            changeDualTypeSetting(event.currentTarget.checked)
          }
        />
        <span>
          ダブルタイプにも ちょうせん！
          <small>4ばい・1/4ばいの もんだいが ふえるよ</small>
        </span>
      </label>

      {showScore ? (
        <ScoreSection
          score={score}
          questionCount={questions.length}
          onRestart={restart}
        />
      ) : (
        <>
          <div ref={questionTopRef}>
            <QuestionPanel
              question={currentQuestion}
              questionNumber={currentQuestionIndex + 1}
              questionCount={questions.length}
              selectedAnswers={selectedAnswers}
              answered={answered}
              typeMatchups={typeMatchups}
              onTypeClick={toggleType}
            />
          </div>

          {!answered ? (
            <button
              type="button"
              onClick={submitAnswer}
              className={styles.button}
              disabled={selectedAnswers.size === 0}
            >
              これで こたえる！
            </button>
          ) : (
            <div ref={explanationRef} className={styles.explanation}>
              {answerWasCorrect ? (
                <div className={styles.correctCelebration} aria-live="polite">
                  <span
                    className={`${styles.partyPopper} ${styles.partyPopperLeft}`}
                    aria-hidden="true"
                  >
                    🎉
                  </span>
                  <strong>せいかい！</strong>
                  <span
                    className={`${styles.partyPopper} ${styles.partyPopperRight}`}
                    aria-hidden="true"
                  >
                    🎉
                  </span>
                </div>
              ) : null}
              <p className={styles.feedbackText}>{feedback}</p>
              <button
                type="button"
                onClick={goToNextQuestion}
                className={styles.button}
              >
                {currentQuestionIndex === questions.length - 1
                  ? "けっかを みる！"
                  : "つぎの もんだい！"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
