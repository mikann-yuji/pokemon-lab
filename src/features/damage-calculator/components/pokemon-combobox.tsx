"use client";

/**
 * このファイルの役割:
 * Pokémon Champions対象ポケモンを、キーボードでも操作できる候補リストから選ぶ。
 *
 * Downshiftは候補リストのフォーカス移動やARIA属性を担当する。
 * 候補の絞り込みはローカル配列に対して行うため、API通信は発生しない。
 */

import { useCombobox } from "downshift";
import { useMemo, useState } from "react";
import {
  normalizePokemonSearchText,
  pokemonNameIncludes,
} from "@/domain/pokemon-name-search";
import styles from "../styles/damage-calculator.module.css";

// ダメージ計算と対戦記録の両方で扱える、候補の最小データ構造。
// 画面固有の画像や能力値を要求しないことで、共通部品として利用できる。
type PokemonComboboxItem = {
  // 数値IDは候補リストの識別と、選択結果の保存に使用する。
  id: number;
  // 英語名も検索対象に含め、日本語名が分からない場合に対応する。
  name: string;
  // 日本語名は入力欄と候補リストへ表示する。
  nameJa: string;
};

// 親側で入力文字列と選択結果を管理する、制御コンポーネント用のprops。
type PokemonComboboxProps<TPokemon extends PokemonComboboxItem> = {
  /** inputと候補キーを区別するための一意なID。 */
  id: string;
  /** 入力欄の目的を伝えるラベル。 */
  label: string;
  /** SQLiteから事前に読み込んだチャンピオンズ対象一覧。 */
  pokemonCatalog: TPokemon[];
  /** 親コンポーネントで現在選ばれているポケモン。 */
  selectedPokemon: TPokemon | null;
  /** 検索欄へ現在表示する文字列。 */
  inputValue: string;
  /** 入力中の文字列が変わったときに親へ通知する。 */
  onInputValueChange: (value: string) => void;
  /** 新しい候補が確定したときに親へ通知する。 */
  onSelect: (pokemon: TPokemon | null) => void;
};

/**
 * ポケモン名を部分一致で検索し、候補から1匹を選択する入力欄。
 * 入力値を親状態へ保存するため、再レンダーや日本語変換中も文字列を維持できる。
 */
export function PokemonCombobox<TPokemon extends PokemonComboboxItem>({
  id,
  label,
  pokemonCatalog,
  selectedPokemon,
  inputValue,
  onInputValueChange,
  onSelect,
}: PokemonComboboxProps<TPokemon>) {
  const [draftValue, setDraftValue] = useState(inputValue);
  // 入力またはカタログが変わった場合だけ候補を再計算する。
  // 共通関数を使うことで「ふしぎだね」と「フシギダネ」を同一視する。
  const suggestions = useMemo(() => {
    // ひらがな・カタカナ・大文字小文字などの表記差を検索前にそろえる。
    const normalizedQuery = normalizePokemonSearchText(draftValue);
    // 空欄または選択確定済みの名称なら、不要な候補一覧を閉じる。
    if (
      !normalizedQuery ||
      normalizedQuery ===
        normalizePokemonSearchText(selectedPokemon?.nameJa ?? "")
    ) {
      return [];
    }

    // 日本語名と英語名のどちらかに一致するポケモンを候補に残す。
    // モバイル画面を候補で埋めないよう、表示件数は先頭8件に制限する。
    return pokemonCatalog
      .filter(
        ({ name, nameJa }) =>
          pokemonNameIncludes(name, normalizedQuery) ||
          pokemonNameIncludes(nameJa, normalizedQuery),
      )
      .slice(0, 8);
  }, [draftValue, pokemonCatalog, selectedPokemon?.nameJa]);

  // Downshiftから、ARIA対応済みの状態と各要素へ渡すprops生成関数を受け取る。
  const {
    isOpen,
    highlightedIndex,
    getInputProps,
    getItemProps,
    getLabelProps,
    getMenuProps,
  } = useCombobox({
    // 絞り込み済みの配列だけを渡し、Downshiftには選択操作を担当させる。
    items: suggestions,
    selectedItem: selectedPokemon,
    // iOSのかな入力を壊さないよう、表示中の文字列はDownshiftに管理させる。
    // Reactの制御入力にすると「か→が」の合成途中に再描画され、文字が重複する。
    initialInputValue: inputValue,
    // 選択確定時に入力欄へ表示する文字列は日本語名に統一する。
    itemToString: (pokemon) => pokemon?.nameJa ?? "",
    // 入力途中でフォーカスが外れても、選択済み名称へ勝手に巻き戻さない。
    stateReducer: (state, { type, changes }) =>
      type === useCombobox.stateChangeTypes.InputBlur
        ? { ...changes, inputValue: state.inputValue }
        : changes,
    // 候補の絞り込みに使う検索文字列だけを親へ通知する。
    onInputValueChange: ({ inputValue }) => {
      const nextValue = inputValue ?? "";
      setDraftValue(nextValue);
      onInputValueChange(nextValue);
    },
    // Enter、クリック、タップのいずれでも同じ選択処理を呼ぶ。
    onSelectedItemChange: ({ selectedItem }) => {
      const nextPokemon = selectedItem ?? null;
      setDraftValue(nextPokemon?.nameJa ?? "");
      onSelect(nextPokemon);
    },
  });

  // 候補が0件の場合は空のメニュー領域を表示しない。
  const showSuggestions = isOpen && suggestions.length > 0;

  return (
    <div className={styles.combobox}>
      {/* Downshiftが生成するhtmlForなどを付け、ラベルと入力欄を関連付ける。 */}
      <label {...getLabelProps()}>{label}</label>
      <input
        {...getInputProps({
          // 複数の入力欄を同じ画面に置いてもARIA属性が衝突しないIDを使う。
          id,
          type: "search",
          placeholder: "ポケモン名を入力",
          // ブラウザ履歴の候補とポケモン候補が重ならないよう自動補完を止める。
          autoComplete: "off",
          onFocus: (event) => {
            // 既存のポケモン名をすぐ置き換えられるよう、フォーカス時に全選択する。
            // iOSでフォーカス処理が完了した後に選択するため、次のタスクへ遅延する。
            const input = event.currentTarget;
            window.setTimeout(() => input.select(), 0);
          },
        })}
      />
      <ul
        {...getMenuProps({
          // 見た目だけでなく、読み上げ時にも何の候補か分かる名前を付ける。
          className: styles.suggestions,
          "aria-label": `${label}の候補`,
        })}
        hidden={!showSuggestions}
      >
        {showSuggestions
          ? suggestions.map((pokemon, index) => {
              // キーボード移動、クリック、タップに必要なイベントを候補ごとに生成する。
              const itemProps = getItemProps({ item: pokemon, index });

              return (
                <li
                  // 攻撃側と防御側に同じポケモンが出ても衝突しない複合キー。
                  key={`${id}-${pokemon.id}-${index}`}
                  {...itemProps}
                  className={
                    // 現在キーボードで指している候補だけを視覚的に強調する。
                    highlightedIndex === index
                      ? styles.highlighted
                      : undefined
                  }
                >
                  <span>
                    {pokemon.nameJa}
                  </span>
                </li>
              );
            })
          : null}
      </ul>
    </div>
  );
}
