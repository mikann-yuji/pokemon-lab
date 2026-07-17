"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { TypeEffectivenessSource } from "@/domain/type-matchup";
import type { DamageCalculatorPokemon } from "@/features/damage-calculator/domain/damage-calculator-types";
import {
  createDamageQuizQuestion,
  type DamageQuizBattleFormat,
  type DamageQuizMode,
  type DamageQuizQuestion,
} from "../damage-quiz-logic";
import styles from "../styles/damage-quiz.module.css";

const QUESTION_COUNT = 10;

export type DamageQuizTeam = {
  id: number;
  name: string;
  members: DamageCalculatorPokemon[];
};

export default function DamageQuizGame({
  teams,
  defendersByFormat,
  typeEffectivenessSource,
}: {
  teams: DamageQuizTeam[];
  defendersByFormat: Record<DamageQuizBattleFormat, DamageCalculatorPokemon[]>;
  typeEffectivenessSource: TypeEffectivenessSource;
}) {
  const [mode, setMode] = useState<DamageQuizMode>("knockout");
  const [battleFormat, setBattleFormat] =
    useState<DamageQuizBattleFormat>("single");
  const [teamId, setTeamId] = useState<number | null>(teams[0]?.id ?? null);
  const [question, setQuestion] = useState<DamageQuizQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [finished, setFinished] = useState(false);

  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const answered = selectedAnswer !== "";
  const answerIsCorrect =
    question &&
    (mode === "knockout"
      ? selectedAnswer === question.correctKnockoutAnswer
      : question.bestMoveIds.includes(selectedAnswer));

  const makeQuestion = (previousKey?: string) =>
    selectedTeam
      ? createDamageQuizQuestion({
          attackers: selectedTeam.members,
          defenders: defendersByFormat[battleFormat],
          typeEffectivenessSource,
          previousKey,
        })
      : null;

  const startQuiz = () => {
    const next = makeQuestion();
    if (!next) return;
    setQuestion(next);
    setQuestionNumber(1);
    setScore(0);
    setSelectedAnswer("");
    setFinished(false);
  };

  const answer = (value: string) => {
    if (answered || !question) return;
    setSelectedAnswer(value);
    const correct =
      mode === "knockout"
        ? value === question.correctKnockoutAnswer
        : question.bestMoveIds.includes(value);
    if (correct) setScore((current) => current + 1);
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
    setSelectedAnswer("");
  };

  const changeMode = (nextMode: DamageQuizMode) => {
    setMode(nextMode);
    setQuestion(null);
    setFinished(false);
    setSelectedAnswer("");
  };

  if (!question || finished) {
    return (
      <>
        <div className={styles.modeTabs} role="tablist" aria-label="ダメージクイズのモード">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "knockout"}
            className={mode === "knockout" ? styles.activeTab : ""}
            onClick={() => changeMode("knockout")}
          >
            撃破判定
            <small>何発で倒せるか</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "best-move"}
            className={mode === "best-move" ? styles.activeTab : ""}
            onClick={() => changeMode("best-move")}
          >
            最大打点
            <small>一番削れる技を選ぶ</small>
          </button>
        </div>
        <section className={styles.card}>
          {finished ? (
            <div className={styles.result}>
              <span>RESULT</span>
              <h2>{score} / {QUESTION_COUNT} 問正解！</h2>
              <p>ダメージ感覚を身につけて、技選択に活かそう！</p>
              <button type="button" onClick={startQuiz}>もう一度チャレンジ</button>
            </div>
          ) : (
            <>
              <div className={styles.intro}>
                <span>DAMAGE QUIZ</span>
                <h2>{mode === "knockout" ? "何発で倒せる？" : "最大打点はどの技？"}</h2>
                <p>
                  攻撃側は保存済み育成データを使用。防御側はLv.50・個体値31・
                  無振り・性格補正なし・持ち物なしです。
                </p>
              </div>
              <div className={styles.setupGrid}>
                <label>
                  採用順位のルール
                  <select
                    value={battleFormat}
                    onChange={(event) =>
                      setBattleFormat(
                        event.currentTarget.value as DamageQuizBattleFormat,
                      )
                    }
                  >
                    <option value="single">シングル</option>
                    <option value="double">ダブル</option>
                  </select>
                </label>
                <label>
                  バトルチーム
                  <select
                    value={teamId ?? ""}
                    onChange={(event) =>
                      setTeamId(
                        event.currentTarget.value
                          ? Number(event.currentTarget.value)
                          : null,
                      )
                    }
                  >
                    <option value="">選択してください</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {teams.length === 0 ? (
                <p className={styles.empty}>
                  攻撃技を持つ保存済みチームがありません。
                  <Link href="/battle-team/new">バトルチームを作る</Link>
                </p>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!selectedTeam}
                  onClick={startQuiz}
                >
                  10問チャレンジを始める
                </button>
              )}
            </>
          )}
        </section>
      </>
    );
  }

  const shownMove =
    mode === "knockout" ? question.selectedMoveResult.move : null;
  const shownResult =
    mode === "knockout" ? question.selectedMoveResult.result : null;

  return (
    <section className={styles.card}>
      <div className={styles.progressHeader}>
        <span>第 {questionNumber} 問 / {QUESTION_COUNT}</span>
        <span>SCORE {score}</span>
      </div>
      <div className={styles.progressTrack}>
        <div style={{ width: `${(questionNumber / QUESTION_COUNT) * 100}%` }} />
      </div>
      <div className={styles.battle}>
        <PokemonCard pokemon={question.attacker} label="攻撃側" />
        <span className={styles.versus}>VS</span>
        <PokemonCard pokemon={question.defender} label="防御側" />
      </div>
      <div className={styles.prompt}>
        {mode === "knockout" ? (
          <p>
            <strong>{shownMove?.name}</strong>で何発？
          </p>
        ) : (
          <p>最もダメージが高い技はどれ？</p>
        )}
      </div>
      <div className={styles.answerGrid}>
        {mode === "knockout"
          ? question.knockoutOptions.map((option) => (
              <AnswerButton
                key={option.id}
                value={option.id}
                label={option.label}
                selectedAnswer={selectedAnswer}
                answered={answered}
                correct={option.id === question.correctKnockoutAnswer}
                onAnswer={answer}
              />
            ))
          : question.moveResults.map(({ move }) => (
              <AnswerButton
                key={move.id}
                value={move.id}
                label={move.name}
                selectedAnswer={selectedAnswer}
                answered={answered}
                correct={question.bestMoveIds.includes(move.id)}
                onAnswer={answer}
              />
            ))}
      </div>
      {answered ? (
        <div className={`${styles.feedback} ${
          answerIsCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect
        }`}>
          <h3>{answerIsCorrect ? "正解！" : "おしい！"}</h3>
          {mode === "knockout" && shownResult ? (
            <p>
              {shownResult.minimum}〜{shownResult.maximum}ダメージ（
              {shownResult.minimumPercent.toFixed(1)}〜
              {shownResult.maximumPercent.toFixed(1)}%）・{shownResult.koLabel}
            </p>
          ) : (
            <ul>
              {question.moveResults
                .slice()
                .sort((a, b) => b.result.maximumPercent - a.result.maximumPercent)
                .map(({ move, result }) => (
                  <li key={move.id}>
                    {move.name}：{result.minimumPercent.toFixed(1)}〜
                    {result.maximumPercent.toFixed(1)}%（{result.koLabel}）
                  </li>
                ))}
            </ul>
          )}
          <button type="button" onClick={advance}>
            {questionNumber >= QUESTION_COUNT ? "結果を見る" : "次の問題へ"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PokemonCard({
  pokemon,
  label,
}: {
  pokemon: DamageCalculatorPokemon;
  label: string;
}) {
  return (
    <figure className={styles.pokemonCard}>
      <span>{label}</span>
      {pokemon.imageUrl ? (
        <Image src={pokemon.imageUrl} alt={pokemon.nameJa} width={128} height={128} unoptimized />
      ) : null}
      <figcaption>{pokemon.nameJa}</figcaption>
    </figure>
  );
}

function AnswerButton({
  value,
  label,
  selectedAnswer,
  answered,
  correct,
  onAnswer,
}: {
  value: string;
  label: string;
  selectedAnswer: string;
  answered: boolean;
  correct: boolean;
  onAnswer: (value: string) => void;
}) {
  const selected = selectedAnswer === value;
  return (
    <button
      type="button"
      disabled={answered}
      className={`${styles.answerButton} ${
        answered && correct ? styles.correctAnswer : ""
      } ${answered && selected && !correct ? styles.incorrectAnswer : ""}`}
      onClick={() => onAnswer(value)}
    >
      {label}
    </button>
  );
}
