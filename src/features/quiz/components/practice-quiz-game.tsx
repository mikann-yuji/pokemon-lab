"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { TypeMatchup } from "@/domain/type-matchup";
import type {
  BattleTeam,
  TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  createPracticeQuestion,
  isExactPracticeAnswer,
  PRACTICE_MULTIPLIER_LABELS,
  type PracticeBattleFormat,
  type PracticeQuestion,
  type PracticeTarget,
  type PracticeTeamMember,
} from "../practice-quiz-logic";
import styles from "../styles/practice-quiz.module.css";

const QUESTION_COUNT = 10;

type Props = {
  teams: BattleTeam[];
  builds: TrainingBuild[];
  membersByBuildId: Map<number, PracticeTeamMember>;
  typeMatchups: TypeMatchup[];
  targetsByFormat: Record<PracticeBattleFormat, PracticeTarget[]>;
};

export default function PracticeQuizGame({
  teams,
  builds,
  membersByBuildId,
  typeMatchups,
  targetsByFormat,
}: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | "">("");
  const [battleFormat, setBattleFormat] =
    useState<PracticeBattleFormat>("single");
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [score, setScore] = useState(0);
  const [selectedBuildIds, setSelectedBuildIds] = useState<Set<number>>(
    new Set(),
  );
  const [answerNone, setAnswerNone] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [finished, setFinished] = useState(false);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const members = useMemo(
    () =>
      selectedTeam?.buildIds.flatMap((buildId) => {
        const member = membersByBuildId.get(buildId);
        return member ? [member] : [];
      }) ?? [],
    [membersByBuildId, selectedTeam],
  );
  const buildsById = useMemo(
    () =>
      new Map(
        builds.flatMap((build) =>
          build.id === undefined ? [] : [[build.id, build] as const],
        ),
      ),
    [builds],
  );

  function makeQuestion(previousKey = "") {
    return createPracticeQuestion(
      targetsByFormat[battleFormat],
      members,
      typeMatchups,
      previousKey,
    );
  }

  function startQuiz() {
    setQuestion(makeQuestion());
    setQuestionNumber(1);
    setScore(0);
    setSelectedBuildIds(new Set());
    setAnswerNone(false);
    setAnswered(false);
    setFinished(false);
  }

  function toggleMember(buildId: number) {
    if (answered) return;
    setAnswerNone(false);
    setSelectedBuildIds((current) => {
      const next = new Set(current);
      if (next.has(buildId)) next.delete(buildId);
      else next.add(buildId);
      return next;
    });
  }

  function submitAnswer() {
    if (!question) return;
    const correct =
      answerNone
        ? question.correctBuildIds.length === 0
        : isExactPracticeAnswer(
            selectedBuildIds,
            question.correctBuildIds,
          );
    setLastCorrect(correct);
    if (correct) setScore((current) => current + 1);
    setAnswered(true);
  }

  function nextQuestion() {
    if (!question) return;
    if (questionNumber >= QUESTION_COUNT) {
      setFinished(true);
      return;
    }
    setQuestion(makeQuestion(question.key));
    setQuestionNumber((current) => current + 1);
    setSelectedBuildIds(new Set());
    setAnswerNone(false);
    setAnswered(false);
  }

  if (!question || finished) {
    return (
      <section className={styles.card}>
        {finished ? (
          <div className={styles.result}>
            <span>RESULT</span>
            <h2>{score} / {QUESTION_COUNT} 問正解！</h2>
            <p>同じチームで、相手と倍率を変えてもう一度挑戦できます。</p>
            <button type="button" onClick={startQuiz}>
              もう一度挑戦する
            </button>
          </div>
        ) : (
          <>
            <div className={styles.intro}>
              <span>PRACTICE MODE</span>
              <h2>チームを選んで実戦チェック</h2>
              <p>
                採用順位100位以内の相手に対して、指定された倍率の技を持つ味方をすべて選びます。
              </p>
            </div>

            <div className={styles.setupGrid}>
              <label>
                採用順位のルール
                <select
                  value={battleFormat}
                  onChange={(event) =>
                    setBattleFormat(
                      event.currentTarget.value as PracticeBattleFormat,
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
                  value={selectedTeamId}
                  onChange={(event) =>
                    setSelectedTeamId(
                      event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : "",
                    )
                  }
                >
                  <option value="">選択してください</option>
                  {teams.map((team) => (
                    <option value={team.id} key={team.id}>
                      {team.name}（{team.buildIds.length}体）
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {teams.length === 0 ? (
              <p className={styles.empty}>
                保存済みバトルチームがありません。
                <Link href="/battle-team/new">バトルチームを作る</Link>
              </p>
            ) : selectedTeam && members.length > 0 ? (
              <div className={styles.teamPreview}>
                {members.map((member) => (
                  <div key={member.buildId}>
                    {member.imageUrl ? (
                      <Image
                        src={member.imageUrl}
                        alt=""
                        width={72}
                        height={72}
                      />
                    ) : null}
                    <strong>{member.pokemonName}</strong>
                    <small>{member.moves.length}個の攻撃技</small>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              className={styles.primaryButton}
              type="button"
              disabled={!selectedTeam || members.length === 0}
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
        <span>
          問題 {questionNumber} / {QUESTION_COUNT}
        </span>
        <strong>{score}問正解</strong>
      </div>
      <div className={styles.progressTrack}>
        <div style={{ width: `${(questionNumber / QUESTION_COUNT) * 100}%` }} />
      </div>

      <div className={styles.prompt}>
        <p>
          このポケモンに
          <strong>{PRACTICE_MULTIPLIER_LABELS[question.multiplier]}</strong>
          の技を持つ味方は？
        </p>
        <small>当てはまるポケモンをすべて選択</small>
      </div>

      <figure className={styles.target}>
        <span>採用順位 #{question.target.usageRank}</span>
        {question.target.imageUrl ? (
          <Image
            src={question.target.imageUrl}
            alt={question.target.nameJa}
            width={180}
            height={180}
            priority
          />
        ) : null}
        <figcaption>{question.target.nameJa}</figcaption>
      </figure>

      <div className={styles.memberGrid}>
        {members.map((member) => {
          const selected = selectedBuildIds.has(member.buildId);
          const correct = question.correctBuildIds.includes(member.buildId);
          const resultClass = answered
            ? correct
              ? styles.correct
              : selected
                ? styles.incorrect
                : ""
            : selected
              ? styles.selected
              : "";
          return (
            <button
              type="button"
              className={`${styles.memberButton} ${resultClass}`}
              key={member.buildId}
              disabled={answered}
              aria-pressed={selected}
              onClick={() => toggleMember(member.buildId)}
            >
              {member.imageUrl ? (
                <Image
                  src={member.imageUrl}
                  alt=""
                  width={84}
                  height={84}
                />
              ) : null}
              <strong>{member.pokemonName}</strong>
              <small>{buildsById.get(member.buildId)?.name ?? member.buildName}</small>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`${styles.noneButton} ${
          answerNone ? styles.noneButtonSelected : ""
        } ${
          answered && question.correctBuildIds.length === 0
            ? styles.noneButtonCorrect
            : answered && answerNone
              ? styles.noneButtonIncorrect
              : ""
        }`}
        disabled={answered}
        aria-pressed={answerNone}
        onClick={() => {
          setSelectedBuildIds(new Set());
          setAnswerNone((current) => !current);
        }}
      >
        答えなし
        <small>当てはまるポケモンがいない</small>
      </button>

      {!answered ? (
        <button
          className={styles.primaryButton}
          type="button"
          disabled={selectedBuildIds.size === 0 && !answerNone}
          onClick={submitAnswer}
        >
          これで答える
        </button>
      ) : (
        <div
          className={`${styles.feedback} ${
            lastCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect
          }`}
        >
          <h3>{lastCorrect ? "正解！" : "ざんねん！"}</h3>
          <p>
            正解：
            {question.correctBuildIds.length === 0
              ? "答えなし"
              : members
                  .filter((member) =>
                    question.correctBuildIds.includes(member.buildId),
                  )
                  .map((member) => member.pokemonName)
                  .join("、")}
          </p>
          {question.correctBuildIds.length > 0 ? (
            <ul>
              {members
                .filter((member) =>
                  question.correctBuildIds.includes(member.buildId),
                )
                .map((member) => (
                  <li key={member.buildId}>
                    <strong>{member.pokemonName}</strong>
                    {"："}
                    {question.matchingMovesByBuildId[member.buildId]
                      .map((move) => move.name)
                      .join("、")}
                  </li>
                ))}
            </ul>
          ) : null}
          <button type="button" onClick={nextQuestion}>
            {questionNumber >= QUESTION_COUNT
              ? "結果を見る"
              : "次の問題へ"}
          </button>
        </div>
      )}
    </section>
  );
}
