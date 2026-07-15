"use client";

import { useState } from "react";
import { useCombobox } from "downshift";
import { normalizePokemonSearchText } from "@/domain/pokemon-name-search";
import type { TrainingMatchupKind, TrainingMatchupNote } from "../infrastructure/training-build-repository";
import styles from "../styles/training-simulator.module.css";
import type { MatchupSearchOption } from "./training-simulator-model";

// 有利/不利メモを1種類ぶん編集するパネル。
// 検索候補の選択、メモ本文、保存済みメモ一覧をこの部品内で完結させる。
export function MatchupNotePanel({
  title,
  matchupKind,
  options,
  notes,
  disabled,
  saving,
  onSave,
  onDelete,
}: {
  title: string;
  matchupKind: TrainingMatchupKind;
  options: MatchupSearchOption[];
  notes: TrainingMatchupNote[];
  disabled: boolean;
  saving: boolean;
  onSave: (input: {
    matchupKind: TrainingMatchupKind;
    target: MatchupSearchOption | null;
    note: string;
  }) => Promise<boolean>;
  onDelete: (noteId: number) => void;
}) {
  const [selectedTarget, setSelectedTarget] =
    useState<MatchupSearchOption | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [note, setNote] = useState("");
  const normalizedInput = normalizePokemonSearchText(inputValue);
  const filteredOptions = normalizedInput
    ? options
        .filter((option) => option.searchName.includes(normalizedInput))
        .slice(0, 12)
    : options.slice(0, 12);
  // downshiftで候補のキーボード操作とハイライトを管理する。
  // 保存対象はselectedTargetで持ち、入力文字だけ変わった場合は選択解除する。
  const {
    getInputProps,
    getItemProps,
    getLabelProps,
    getMenuProps,
    highlightedIndex,
    isOpen,
  } = useCombobox({
    items: filteredOptions,
    inputValue,
    itemToString: (item) => item?.name ?? "",
    selectedItem: selectedTarget,
    onInputValueChange: ({ inputValue: nextInputValue = "" }) => {
      setInputValue(nextInputValue);
      if (selectedTarget && nextInputValue !== selectedTarget.name) {
        setSelectedTarget(null);
      }
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      setSelectedTarget(selectedItem);
      setInputValue(selectedItem.name);
    },
  });
  const showSuggestions = isOpen && filteredOptions.length > 0;

  async function submit() {
    // 保存が成功した時だけ入力欄を空にする。
    // バリデーション失敗時はユーザーが直せるよう入力内容を残す。
    const saved = await onSave({ matchupKind, target: selectedTarget, note });
    if (!saved) return;
    setSelectedTarget(null);
    setInputValue("");
    setNote("");
  }

  return (
    <section className={styles.matchupPanel}>
      <h3>{title}</h3>
      <label className={styles.matchupSearch}>
        <span {...getLabelProps()}>ポケモン・育成案</span>
        <input
          {...getInputProps({
            disabled,
            placeholder: disabled ? "先に育成案を保存" : "名前で検索",
          })}
        />
        <ul {...getMenuProps({ hidden: !showSuggestions })}>
          {showSuggestions
            ? filteredOptions.map((option, index) => (
                <li
                  {...getItemProps({ item: option, index })}
                  className={
                    highlightedIndex === index
                      ? styles.highlightedSuggestion
                      : undefined
                  }
                  key={option.key}
                >
                  <strong>{option.name}</strong>
                  <small>{option.subLabel}</small>
                </li>
              ))
            : null}
        </ul>
      </label>
      <label className={styles.matchupMemo}>
        メモ
        <textarea
          disabled={disabled}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button
        className={styles.matchupSaveButton}
        type="button"
        disabled={disabled || saving}
        onClick={() => void submit()}
      >
        {saving ? "保存中..." : "メモを保存"}
      </button>
      <div className={styles.matchupList}>
        {notes.length === 0 ? (
          <p>保存したメモはありません。</p>
        ) : (
          notes.map((savedNote) => (
            <article key={savedNote.id}>
              <div>
                <strong>{savedNote.targetName}</strong>
                <small>
                  {savedNote.targetKind === "build" ? "保存済み育成案" : "ポケモン"}
                </small>
              </div>
              <p>{savedNote.note}</p>
              {savedNote.id !== undefined ? (
                <button type="button" onClick={() => onDelete(savedNote.id!)}>
                  削除
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

