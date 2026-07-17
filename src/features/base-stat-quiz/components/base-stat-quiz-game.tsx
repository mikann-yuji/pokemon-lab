"use client";

import Image from "next/image";
import { useState } from "react";
import {
  createBaseStatQuestion,
  formatBaseStats,
  type BaseStatBattleFormat,
  type BaseStatPokemon,
  type BaseStatQuestion,
} from "../base-stat-quiz-logic";
import styles from "../styles/base-stat-quiz.module.css";

const QUESTION_COUNT = 10;

export default function BaseStatQuizGame({
  pokemonByFormat,
}: {
  pokemonByFormat: Record<BaseStatBattleFormat, BaseStatPokemon[]>;
}) {
  const [battleFormat, setBattleFormat] =
    useState<BaseStatBattleFormat>("single");
  const [question, setQuestion] = useState<BaseStatQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [score, setScore] = useState(0);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const makeQuestion = (previousKey?: string) =>
    createBaseStatQuestion(pokemonByFormat[battleFormat], previousKey);

  const startQuiz = () => {
    const next = makeQuestion();
    if (!next) return;
    setQuestion(next);
    setQuestionNumber(1);
    setScore(0);
    setSelectedFormId(null);
    setFinished(false);
  };

  const answer = (formId: number) => {
    if (selectedFormId !== null || !question) return;
    setSelectedFormId(formId);
    if (formId === question.target.formId) {
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
    setSelectedFormId(null);
  };

  if (!question || finished) {
    return (
      <section className={styles.card}>
        {finished ? (
          <div className={styles.result}>
            <span>RESULT</span>
            <h2>{score} / {QUESTION_COUNT} 問正解！</h2>
            <p>種族値からポケモンの得意な戦い方を見抜こう！</p>
            <button type="button" onClick={startQuiz}>もう一度チャレンジ</button>
          </div>
        ) : (
          <>
            <div className={styles.intro}>
              <span>BASE STATS QUIZ</span>
              <h2>このポケモンの種族値はどれ？</h2>
              <p>
                採用順位100位以内のポケモンから出題します。
                H-A-B-C-D-Sの並びを4択から選んでください。
              </p>
            </div>
            <label className={styles.formatSelect}>
              採用順位のルール
              <select
                value={battleFormat}
                onChange={(event) =>
                  setBattleFormat(
                    event.currentTarget.value as BaseStatBattleFormat,
                  )
                }
              >
                <option value="single">シングル</option>
                <option value="double">ダブル</option>
              </select>
            </label>
            <button className={styles.primaryButton} type="button" onClick={startQuiz}>
              10問チャレンジを始める
            </button>
          </>
        )}
      </section>
    );
  }

  const answered = selectedFormId !== null;
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
        <p>このポケモンの種族値はどれ？</p>
        <small>並び順：H - A - B - C - D - S</small>
      </div>
      <figure className={styles.target}>
        <span>採用順位 {question.target.usageRank}位</span>
        {question.target.imageUrl ? (
          <Image
            src={question.target.imageUrl}
            alt={question.target.nameJa}
            width={176}
            height={176}
            unoptimized
          />
        ) : null}
        <figcaption>{question.target.nameJa}</figcaption>
      </figure>
      <div className={styles.optionGrid}>
        {question.options.map((option) => {
          const selected = selectedFormId === option.pokemon.formId;
          return (
            <button
              key={option.pokemon.formId}
              type="button"
              disabled={answered}
              className={`${styles.optionButton} ${
                answered && option.isCorrect ? styles.correctOption : ""
              } ${answered && selected && !option.isCorrect ? styles.incorrectOption : ""}`}
              onClick={() => answer(option.pokemon.formId)}
            >
              <strong>{formatBaseStats(option.pokemon.stats)}</strong>
              {answered ? <span>{option.pokemon.nameJa}</span> : null}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className={`${styles.feedback} ${
          selectedFormId === question.target.formId
            ? styles.feedbackCorrect
            : styles.feedbackIncorrect
        }`}>
          <h3>{selectedFormId === question.target.formId ? "正解！" : "おしい！"}</h3>
          <p>4つの種族値がどのポケモンのものか表示しました。</p>
          <button type="button" onClick={advance}>
            {questionNumber >= QUESTION_COUNT ? "結果を見る" : "次の問題へ"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
