"use client";

import { useState } from "react";
import Image from "next/image";
import {
  createMoveComparisonQuestion,
  createMoveQuizQuestion,
  isMoveQuizAnswerCorrect,
  type MoveQuizBattleFormat,
  type MoveQuizPokemon,
  type MoveQuizQuestion,
  type MoveComparisonQuestion,
} from "../move-quiz-logic";
import styles from "../styles/move-quiz.module.css";

const QUESTION_COUNT = 10;

type Props = {
  pokemonByFormat: Record<MoveQuizBattleFormat, MoveQuizPokemon[]>;
};

export default function MoveQuizGame(props: Props) {
  const [mode, setMode] = useState<"top-four" | "comparison">("top-four");
  return (
    <>
      <div className={styles.modeTabs} role="tablist" aria-label="技クイズのモード">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "top-four"}
          className={mode === "top-four" ? styles.activeModeTab : ""}
          onClick={() => setMode("top-four")}
        >
          トップ4
          <small>上位4つをすべて選択</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "comparison"}
          className={mode === "comparison" ? styles.activeModeTab : ""}
          onClick={() => setMode("comparison")}
        >
          採用率比較
          <small>高い方の技を選択</small>
        </button>
      </div>
      {mode === "top-four" ? (
        <TopFourMoveQuizGame {...props} />
      ) : (
        <MoveComparisonGame {...props} />
      )}
    </>
  );
}

function TopFourMoveQuizGame({ pokemonByFormat }: Props) {
  const [battleFormat, setBattleFormat] =
    useState<MoveQuizBattleFormat>("single");
  const [question, setQuestion] = useState<MoveQuizQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [score, setScore] = useState(0);
  const [selectedMoveIds, setSelectedMoveIds] = useState<string[]>([]);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [finished, setFinished] = useState(false);

  const nextQuestion = (previousKey?: string) =>
    createMoveQuizQuestion(pokemonByFormat[battleFormat], previousKey);

  const startQuiz = () => {
    const next = nextQuestion();
    if (!next) return;
    setQuestion(next);
    setQuestionNumber(1);
    setScore(0);
    setSelectedMoveIds([]);
    setAnswered(false);
    setCorrect(false);
    setFinished(false);
  };

  const toggleMove = (moveId: string) => {
    if (answered) return;
    setSelectedMoveIds((current) =>
      current.includes(moveId)
        ? current.filter((id) => id !== moveId)
        : current.length < 4
          ? [...current, moveId]
          : current,
    );
  };

  const submitAnswer = () => {
    if (!question || selectedMoveIds.length === 0) return;
    const nextCorrect = isMoveQuizAnswerCorrect(
      selectedMoveIds,
      question.correctMoveIds,
    );
    setCorrect(nextCorrect);
    setAnswered(true);
    if (nextCorrect) setScore((current) => current + 1);
  };

  const advance = () => {
    if (!question) return;
    if (questionNumber >= QUESTION_COUNT) {
      setFinished(true);
      return;
    }
    const next = nextQuestion(question.key);
    if (!next) return;
    setQuestion(next);
    setQuestionNumber((current) => current + 1);
    setSelectedMoveIds([]);
    setAnswered(false);
    setCorrect(false);
  };

  if (!question || finished) {
    return (
      <section className={styles.card}>
        {finished ? (
          <div className={styles.result}>
            <span>RESULT</span>
            <h2>{score} / {QUESTION_COUNT} 問正解！</h2>
            <p>よく使われる技を覚えて、選出や立ち回りに活かそう！</p>
            <button type="button" onClick={startQuiz}>
              もう一度チャレンジ
            </button>
          </div>
        ) : (
          <>
            <div className={styles.intro}>
              <span>MOVE QUIZ</span>
              <h2>採用率トップ4の技を当てよう</h2>
              <p>
                採用順位100位以内のポケモンに表示される10個の技から、
                採用率上位4つをすべて選びます。
              </p>
            </div>
            <label className={styles.formatSelect}>
              採用順位のルール
              <select
                value={battleFormat}
                onChange={(event) =>
                  setBattleFormat(
                    event.currentTarget.value as MoveQuizBattleFormat,
                  )
                }
              >
                <option value="single">シングル</option>
                <option value="double">ダブル</option>
              </select>
            </label>
            {pokemonByFormat[battleFormat].length === 0 ? (
              <p className={styles.empty}>
                技データが10件そろったポケモンがいません。
              </p>
            ) : (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={startQuiz}
              >
                10問チャレンジを始める
              </button>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.progressHeader}>
        <span>第 {questionNumber} 問 / {QUESTION_COUNT}</span>
        <span>SCORE {score}</span>
      </div>
      <div className={styles.progressTrack}>
        <div style={{ width: `${(questionNumber / QUESTION_COUNT) * 100}%` }} />
      </div>

      <div className={styles.prompt}>
        <p>採用率上位4つの技をすべて選ぼう！</p>
        <small>複数選択・4つすべて一致で正解</small>
      </div>
      <figure className={styles.target}>
        <span>採用順位 {question.pokemon.usageRank}位</span>
        {question.pokemon.imageUrl ? (
          <Image
            src={question.pokemon.imageUrl}
            alt={question.pokemon.nameJa}
            width={160}
            height={160}
            unoptimized
          />
        ) : null}
        <figcaption>{question.pokemon.nameJa}</figcaption>
      </figure>

      <div className={styles.moveGrid}>
        {question.pokemon.moves.map((move) => {
          const selected = selectedMoveIds.includes(move.id);
          const isCorrectMove = question.correctMoveIds.includes(move.id);
          const resultClass = answered
            ? isCorrectMove
              ? styles.correctMove
              : selected
                ? styles.incorrectMove
                : ""
            : "";
          return (
            <button
              key={move.id}
              type="button"
              disabled={answered}
              aria-pressed={selected}
              className={`${styles.moveButton} ${
                selected ? styles.selectedMove : ""
              } ${resultClass}`}
              onClick={() => toggleMove(move.id)}
            >
              {move.name}
              {answered && isCorrectMove ? (
                <small>採用率 {move.usageRate.toFixed(1)}%</small>
              ) : null}
            </button>
          );
        })}
      </div>

      {answered ? (
        <div
          className={`${styles.feedback} ${
            correct ? styles.feedbackCorrect : styles.feedbackIncorrect
          }`}
        >
          <h3>{correct ? "正解！" : "おしい！"}</h3>
          <p>
            正解は「
            {question.pokemon.moves
              .slice(0, 4)
              .map((move) => move.name)
              .join("・")}
            」です。
          </p>
          <button type="button" onClick={advance}>
            {questionNumber >= QUESTION_COUNT ? "結果を見る" : "次の問題へ"}
          </button>
        </div>
      ) : (
        <button
          className={styles.primaryButton}
          type="button"
          disabled={selectedMoveIds.length === 0}
          onClick={submitAnswer}
        >
          回答する（{selectedMoveIds.length} / 4）
        </button>
      )}
    </section>
  );
}

function MoveComparisonGame({ pokemonByFormat }: Props) {
  const [battleFormat, setBattleFormat] =
    useState<MoveQuizBattleFormat>("single");
  const [question, setQuestion] = useState<MoveComparisonQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [score, setScore] = useState(0);
  const [selectedMoveId, setSelectedMoveId] = useState("");
  const [answered, setAnswered] = useState(false);
  const [finished, setFinished] = useState(false);

  const makeQuestion = (previousKey?: string) =>
    createMoveComparisonQuestion(
      pokemonByFormat[battleFormat],
      previousKey,
    );

  const startQuiz = () => {
    const next = makeQuestion();
    if (!next) return;
    setQuestion(next);
    setQuestionNumber(1);
    setScore(0);
    setSelectedMoveId("");
    setAnswered(false);
    setFinished(false);
  };

  const answer = (moveId: string) => {
    if (answered || !question) return;
    setSelectedMoveId(moveId);
    setAnswered(true);
    if (moveId === question.correctMoveId) {
      setScore((current) => current + 1);
    }
  };

  const advance = () => {
    if (!question) return;
    if (questionNumber >= QUESTION_COUNT) {
      setFinished(true);
      return;
    }
    const next = makeQuestion(question.key);
    if (!next) return;
    setQuestion(next);
    setQuestionNumber((current) => current + 1);
    setSelectedMoveId("");
    setAnswered(false);
  };

  if (!question || finished) {
    return (
      <section className={styles.card}>
        {finished ? (
          <div className={styles.result}>
            <span>RESULT</span>
            <h2>{score} / {QUESTION_COUNT} 問正解！</h2>
            <p>技の採用傾向をつかんで、相手の型を予想しよう！</p>
            <button type="button" onClick={startQuiz}>
              もう一度チャレンジ
            </button>
          </div>
        ) : (
          <>
            <div className={styles.intro}>
              <span>USAGE COMPARISON</span>
              <h2>どちらの技がよく採用されている？</h2>
              <p>
                採用率上位15位以内から2つの技が出ます。
                採用率が高い方を選んでください。
              </p>
            </div>
            <label className={styles.formatSelect}>
              採用順位のルール
              <select
                value={battleFormat}
                onChange={(event) =>
                  setBattleFormat(
                    event.currentTarget.value as MoveQuizBattleFormat,
                  )
                }
              >
                <option value="single">シングル</option>
                <option value="double">ダブル</option>
              </select>
            </label>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={startQuiz}
            >
              10問チャレンジを始める
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.progressHeader}>
        <span>第 {questionNumber} 問 / {QUESTION_COUNT}</span>
        <span>SCORE {score}</span>
      </div>
      <div className={styles.progressTrack}>
        <div style={{ width: `${(questionNumber / QUESTION_COUNT) * 100}%` }} />
      </div>
      <div className={styles.prompt}>
        <p>採用率が高い技はどっち？</p>
      </div>
      <figure className={styles.target}>
        <span>採用順位 {question.pokemon.usageRank}位</span>
        {question.pokemon.imageUrl ? (
          <Image
            src={question.pokemon.imageUrl}
            alt={question.pokemon.nameJa}
            width={160}
            height={160}
            unoptimized
          />
        ) : null}
        <figcaption>{question.pokemon.nameJa}</figcaption>
      </figure>
      <div className={styles.comparisonGrid}>
        {question.moves.map((move) => {
          const isCorrect = move.id === question.correctMoveId;
          const isSelected = move.id === selectedMoveId;
          return (
            <button
              key={move.id}
              type="button"
              disabled={answered}
              className={`${styles.comparisonButton} ${
                answered && isCorrect ? styles.correctMove : ""
              } ${
                answered && isSelected && !isCorrect
                  ? styles.incorrectMove
                  : ""
              }`}
              onClick={() => answer(move.id)}
            >
              <strong>{move.name}</strong>
              {answered ? <span>採用率 {move.usageRate.toFixed(1)}%</span> : null}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div
          className={`${styles.feedback} ${
            selectedMoveId === question.correctMoveId
              ? styles.feedbackCorrect
              : styles.feedbackIncorrect
          }`}
        >
          <h3>
            {selectedMoveId === question.correctMoveId ? "正解！" : "おしい！"}
          </h3>
          <button type="button" onClick={advance}>
            {questionNumber >= QUESTION_COUNT ? "結果を見る" : "次の問題へ"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
