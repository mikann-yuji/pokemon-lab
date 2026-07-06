/**
 * このファイルの役割: 現在のクイズ問題、選択肢、解説、進捗を表示するプレゼンテーションコンポーネント。
 */

"use client";

import Image from "next/image";
import { useState } from "react";
import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import { getTypeBadgeStyle } from "@/presentation/pokemon-type-colors";
import {
  getQuestionKey,
  getQuestionText,
  type Question,
} from "../quiz-logic";
import { getHint, saveHint } from "../storage/mistake-repository";
import styles from "../styles/quiz-game.module.css";

type QuestionPanelProps = {
  /** 現在表示する1問分のデータ。 */
  question: Question;
  /** 1始まりの現在問題番号。 */
  questionNumber: number;
  /** 出題リスト全体の問題数。 */
  questionCount: number;
  /** 現在選択されているタイプ。親のQuizGameが正解判定に使う。 */
  selectedAnswers: Set<TypeName>;
  /** trueなら選択肢を結果表示状態にする。 */
  answered: boolean;
  /** タイプボタンの表示名と色を作るための相性一覧。 */
  typeMatchups: TypeMatchup[];
  /** タイプボタンを押した時、親の選択状態を切り替える。 */
  onTypeClick: (type: TypeName) => void;
  /** 正解演出を表示するか。 */
  showCorrectCelebration: boolean;
  /** 不正解演出を表示するか。 */
  showIncorrectCelebration: boolean;
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
  showCorrectCelebration,
  showIncorrectCelebration,
}: QuestionPanelProps) {
  const [isHintDialogOpen, setHintDialogOpen] = useState(false);
  const [hintText, setHintText] = useState("");
  const [isHintLoading, setHintLoading] = useState(false);
  const [isHintSaving, setHintSaving] = useState(false);
  const [hintError, setHintError] = useState("");

  /** ヒントダイアログを開き、問題キーに紐づく保存済みメモをuser.dbから読む。 */
  async function openHintDialog() {
    setHintDialogOpen(true);
    setHintLoading(true);
    setHintError("");
    try {
      setHintText(await getHint(getQuestionKey(question)));
    } catch (error: unknown) {
      console.error("ヒントを読み込めませんでした。", error);
      setHintError("ヒントを読み込めませんでした。");
    } finally {
      setHintLoading(false);
    }
  }

  /** ヒント入力欄の内容をuser.dbへ保存する。空文字ならrepository側で削除される。 */
  async function persistHint() {
    setHintSaving(true);
    setHintError("");
    try {
      await saveHint(getQuestionKey(question), hintText);
      setHintText(hintText.trim());
      setHintDialogOpen(false);
    } catch (error: unknown) {
      console.error("ヒントを保存できませんでした。", error);
      setHintError("ヒントを保存できませんでした。");
    } finally {
      setHintSaving(false);
    }
  }

  return (
    <>
      <div className={styles.questionHeader}>
        <span className={styles.progress}>
          チャレンジ {questionNumber} / {questionCount}
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
        <span className={styles.answerCountHint}>
          こたえは {question.correctAnswers.length}こ！
        </span>
      </h2>
      <button
        className={styles.hintButton}
        type="button"
        onClick={() => void openHintDialog()}
      >
        💡 ヒント
      </button>

      {isHintDialogOpen ? (
        <div
          className={styles.hintOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hint-dialog-title"
        >
          <button
            className={styles.hintBackdrop}
            type="button"
            aria-label="ヒントを閉じる"
            onClick={() => setHintDialogOpen(false)}
          />
          <form
            className={styles.hintDialog}
            onSubmit={(event) => {
              event.preventDefault();
              void persistHint();
            }}
          >
            <div>
              <p>この問題だけのメモ</p>
              <h3 id="hint-dialog-title">ヒント</h3>
            </div>
            {isHintLoading ? (
              <p className={styles.hintStatus}>読み込み中...</p>
            ) : (
              <label>
                ヒントの内容
                <textarea
                  autoFocus
                  maxLength={500}
                  rows={5}
                  placeholder="覚え方や考え方を書いてください"
                  value={hintText}
                  onChange={(event) => setHintText(event.target.value)}
                />
              </label>
            )}
            {hintError ? <p className={styles.hintError} role="alert">{hintError}</p> : null}
            <small>空欄で保存すると、この問題のヒントを削除します。</small>
            <div className={styles.hintActions}>
              <button type="button" onClick={() => setHintDialogOpen(false)}>
                キャンセル
              </button>
              <button type="submit" disabled={isHintLoading || isHintSaving}>
                {isHintSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {question.pokemonImage ? (
        <figure className={styles.pokemonImage}>
          <Image
            src={question.pokemonImage.url}
            alt={question.pokemonImage.nameJa}
            width={180}
            height={180}
            sizes="(max-width: 480px) 130px, 180px"
          />
          <figcaption>{question.pokemonImage.nameJa}</figcaption>
        </figure>
      ) : null}

      <div className={styles.typeButtonArea}>
        {showCorrectCelebration ? (
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
        {showIncorrectCelebration ? (
          <div
            className={`${styles.correctCelebration} ${styles.incorrectCelebration}`}
            aria-live="polite"
          >
            <span className={styles.sadFace} aria-hidden="true">
              😢
            </span>
            <strong>ざんねん…</strong>
            <span className={styles.sadFace} aria-hidden="true">
              😢
            </span>
          </div>
        ) : null}
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
                style={getTypeBadgeStyle(type.name)}
                disabled={answered}
                aria-pressed={isSelected}
              >
                {type.nameJa}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
