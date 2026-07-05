"use client";

/**
 * このファイルの役割: クイズ全体の状態管理、回答判定、問題遷移、リスタートを担当するクライアントコンポーネント。
 */

import { useEffect, useRef, useState } from "react";
import QuestionPanel from "./question-panel";
import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import {
  createQuestions,
  getQuestionKey,
  isExactAnswer,
  type PokemonImagesByType,
  type Question,
} from "../quiz-logic";
import {
  getMistakeKeys,
  removeMistake,
  saveMistake,
} from "../storage/mistake-repository";
import ScoreSection from "./score-section";
import styles from "../styles/quiz-game.module.css";

type QuizGameProps = {
  initialQuestions: Question[];
  typeMatchups: TypeMatchup[];
  pokemonImagesByType: PokemonImagesByType;
};

type QuizMode = "all" | "mistakes";

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
  const [showCorrectCelebration, setShowCorrectCelebration] = useState(false);
  const [showIncorrectCelebration, setShowIncorrectCelebration] =
    useState(false);
  const [includeDualTypes, setIncludeDualTypes] = useState(false);
  const [quizMode, setQuizMode] = useState<QuizMode>("all");
  const [mistakeKeys, setMistakeKeys] = useState<Set<string>>(new Set());
  const [mistakesLoaded, setMistakesLoaded] = useState(false);
  const questionTopRef = useRef<HTMLDivElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    getMistakeKeys()
      .then((keys) => {
        if (active) setMistakeKeys(new Set(keys));
      })
      .catch((error: unknown) => {
        console.error("間違えた問題を読み込めませんでした。", error);
      })
      .finally(() => {
        if (active) setMistakesLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  function createModeQuestions(
    mode: QuizMode,
    dualTypes: boolean,
    savedMistakeKeys = mistakeKeys,
  ): Question[] {
    const nextQuestions = createQuestions(typeMatchups, {
      includeDualTypes: dualTypes,
      pokemonImagesByType,
    });

    return mode === "mistakes"
      ? nextQuestions.filter((question) =>
          savedMistakeKeys.has(getQuestionKey(question)),
        )
      : nextQuestions;
  }

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

  // 正解演出はタイプボタンエリア上に短時間だけ重ねて表示する。
  useEffect(() => {
    if (!showCorrectCelebration) return;

    const timeoutId = window.setTimeout(() => {
      setShowCorrectCelebration(false);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [showCorrectCelebration]);

  // 不正解演出も正解演出と同じ余韻を残してから閉じる。
  useEffect(() => {
    if (!showIncorrectCelebration) return;

    const timeoutId = window.setTimeout(() => {
      setShowIncorrectCelebration(false);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [showIncorrectCelebration]);

  // 問題を再びシャッフルし、すべての進行状況を初期状態に戻す。
  function restart() {
    setQuestions(createModeQuestions(quizMode, includeDualTypes));
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
    setShowCorrectCelebration(false);
    setShowIncorrectCelebration(false);
  }

  // 複合タイプ問題の有無を切り替え、クイズを最初から作り直す。
  function changeDualTypeSetting(checked: boolean) {
    setIncludeDualTypes(checked);
    setQuestions(createModeQuestions(quizMode, checked));
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowScore(false);
    resetAnswer();
  }

  function changeQuizMode(mode: QuizMode) {
    setQuizMode(mode);
    setQuestions(createModeQuestions(mode, includeDualTypes));
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
      const questionKey = getQuestionKey(question);
      if (mistakeKeys.has(questionKey)) {
        const nextMistakeKeys = new Set(mistakeKeys);
        nextMistakeKeys.delete(questionKey);
        setMistakeKeys(nextMistakeKeys);
        void removeMistake(questionKey).catch((error: unknown) => {
          console.error("復習済みの問題を更新できませんでした。", error);
        });
      }
      setScore((current) => current + 1);
      setFeedback("せいかい！ やったね！");
      setShowIncorrectCelebration(false);
      setShowCorrectCelebration(false);
      requestAnimationFrame(() => setShowCorrectCelebration(true));
    } else {
      const questionKey = getQuestionKey(question);
      setMistakeKeys((current) => new Set(current).add(questionKey));
      void saveMistake(questionKey).catch((error: unknown) => {
        console.error("間違えた問題を保存できませんでした。", error);
      });
      const answer = question.correctAnswers
        .map(
          (type) =>
            typeMatchups.find((matchup) => matchup.name === type)?.nameJa ??
            type,
        )
        .join("、");
      setFeedback(`ざんねん！ せいかいは「${answer}」だよ！`);
      setShowCorrectCelebration(false);
      setShowIncorrectCelebration(false);
      requestAnimationFrame(() => setShowIncorrectCelebration(true));
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
      <fieldset className={styles.modeSelector}>
        <legend>出題モード</legend>
        <label>
          <input
            type="radio"
            name="quiz-mode"
            checked={quizMode === "all"}
            onChange={() => changeQuizMode("all")}
          />
          すべての問題
        </label>
        <label>
          <input
            type="radio"
            name="quiz-mode"
            checked={quizMode === "mistakes"}
            disabled={!mistakesLoaded}
            onChange={() => changeQuizMode("mistakes")}
          />
          間違えた問題だけ
          <span className={styles.mistakeCount}>{mistakeKeys.size}問</span>
        </label>
      </fieldset>

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

      {questions.length === 0 ? (
        <div className={styles.emptyMistakes}>
          <p>復習する問題はありません。</p>
          <small>通常モードで間違えた問題がここに保存されます。</small>
        </div>
      ) : showScore ? (
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
              showCorrectCelebration={showCorrectCelebration}
              showIncorrectCelebration={showIncorrectCelebration}
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
