"use client";

/**
 * このファイルの役割:
 * Pokémon Champions対象ポケモンを、キーボードでも操作できる候補リストから選ぶ。
 *
 * Downshiftは候補リストのフォーカス移動やARIA属性を担当する。
 * 候補の絞り込みはローカル配列に対して行うため、API通信は発生しない。
 */

import { useCombobox } from "downshift";
import { useMemo } from "react";
import {
  normalizePokemonSearchText,
  pokemonNameIncludes,
} from "@/domain/pokemon-name-search";
import type { DamageCalculatorPokemon } from "../domain/damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

type PokemonComboboxProps = {
  /** inputと候補キーを区別するための一意なID。 */
  id: string;
  /** 入力欄の目的を伝えるラベル。 */
  label: string;
  /** SQLiteから事前に読み込んだチャンピオンズ対象一覧。 */
  pokemonCatalog: DamageCalculatorPokemon[];
  /** 親コンポーネントで現在選ばれているポケモン。 */
  selectedPokemon: DamageCalculatorPokemon | null;
  /** 検索欄へ現在表示する文字列。 */
  inputValue: string;
  /** 入力中の文字列が変わったときに親へ通知する。 */
  onInputValueChange: (value: string) => void;
  /** 新しい候補が確定したときに親へ通知する。 */
  onSelect: (pokemon: DamageCalculatorPokemon | null) => void;
};

export function PokemonCombobox({
  id,
  label,
  pokemonCatalog,
  selectedPokemon,
  inputValue,
  onInputValueChange,
  onSelect,
}: PokemonComboboxProps) {
  // 入力またはカタログが変わった場合だけ候補を再計算する。
  // 共通関数を使うことで「ふしぎだね」と「フシギダネ」を同一視する。
  const suggestions = useMemo(() => {
    const normalizedQuery = normalizePokemonSearchText(inputValue);
    if (
      !normalizedQuery ||
      normalizedQuery ===
        normalizePokemonSearchText(selectedPokemon?.nameJa ?? "")
    ) {
      return [];
    }

    return pokemonCatalog
      .filter(
        ({ name, nameJa }) =>
          pokemonNameIncludes(name, normalizedQuery) ||
          pokemonNameIncludes(nameJa, normalizedQuery),
      )
      .slice(0, 8);
  }, [inputValue, pokemonCatalog, selectedPokemon?.nameJa]);
  const {
    isOpen,
    highlightedIndex,
    getInputProps,
    getItemProps,
    getLabelProps,
    getMenuProps,
  } = useCombobox({
    items: suggestions,
    selectedItem: selectedPokemon,
    inputValue,
    itemToString: (pokemon) => pokemon?.nameJa ?? "",
    // 入力途中でフォーカスが外れても、選択済み名称へ勝手に巻き戻さない。
    stateReducer: (state, { type, changes }) =>
      type === useCombobox.stateChangeTypes.InputBlur
        ? { ...changes, inputValue: state.inputValue }
        : changes,
    // 日本語IMEの変換中もDownshift側の入力値を尊重し、検索文字列だけを更新する。
    onInputValueChange: ({ inputValue }) => {
      onInputValueChange(inputValue ?? "");
    },
    // Enter、クリック、タップのいずれでも同じ選択処理を呼ぶ。
    onSelectedItemChange: ({ selectedItem }) => {
      const nextPokemon = selectedItem ?? null;
      onSelect(nextPokemon);
    },
  });

  const showSuggestions = isOpen && suggestions.length > 0;

  return (
    <div className={styles.combobox}>
      <label {...getLabelProps()}>{label}</label>
      <input
        {...getInputProps({
          id,
          type: "search",
          placeholder: "ポケモン名を入力",
          autoComplete: "off",
        })}
      />
      <ul
        {...getMenuProps({
          className: styles.suggestions,
          "aria-label": `${label}の候補`,
        })}
        hidden={!showSuggestions}
      >
        {showSuggestions
          ? suggestions.map((pokemon, index) => {
              const itemProps = getItemProps({ item: pokemon, index });

              return (
                <li
                  // 攻撃側と防御側に同じポケモンが出ても衝突しない複合キー。
                  key={`${id}-${pokemon.id}-${index}`}
                  {...itemProps}
                  className={
                    highlightedIndex === index
                      ? styles.highlighted
                      : undefined
                  }
                >
                  <span>
                    {pokemon.nameJa}
                    <small>{pokemon.name}</small>
                  </span>
                </li>
              );
            })
          : null}
      </ul>
    </div>
  );
}
