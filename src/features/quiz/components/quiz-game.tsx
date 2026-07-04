"use client";

import { useState } from "react";
import QuestionPanel from "./question-panel";
import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import {
  createQuestions,
  isExactAnswer,
  type Question,
} from "../quiz-logic";
import ScoreSection from "./score-section";
import styles from "../styles/quiz-game.module.css";

type QuizGameProps = {
  initialQuestions: Question[];
  typeMatchups: TypeMatchup[];
};

/**
 * クイズの進行、回答、採点をブラウザ上で管理する。
 */
export default function QuizGame({
  initialQuestions,
  typeMatchups,
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

  // 問題を再びシャッフルし、すべての進行状況を初期状態に戻す。
  function restart() {
    setQuestions(createQuestions(typeMatchups));
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
      setFeedback("正解です！");
    } else {
      const answer = question.correctAnswers
        .map(
          (type) =>
            typeMatchups.find((matchup) => matchup.name === type)?.nameJa ??
            type,
        )
        .join("、");
      setFeedback(`不正解です。正解は：${answer}`);
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
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className={styles.quizContainer}>
      {showScore ? (
        <ScoreSection
          score={score}
          questionCount={questions.length}
          onRestart={restart}
        />
      ) : (
        <>
          <QuestionPanel
            question={currentQuestion}
            questionNumber={currentQuestionIndex + 1}
            questionCount={questions.length}
            selectedAnswers={selectedAnswers}
            answered={answered}
            typeMatchups={typeMatchups}
            onTypeClick={toggleType}
          />

          {!answered ? (
            <button
              type="button"
              onClick={submitAnswer}
              className={styles.button}
              disabled={selectedAnswers.size === 0}
            >
              回答する
            </button>
          ) : (
            <div className={styles.explanation}>
              <p className={styles.feedbackText}>{feedback}</p>
              <button
                type="button"
                onClick={goToNextQuestion}
                className={styles.button}
              >
                {currentQuestionIndex === questions.length - 1
                  ? "結果を見る"
                  : "次の問題へ"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
