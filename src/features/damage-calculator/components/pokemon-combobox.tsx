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
import styles from "../styles/damage-calculator.module.css";

type PokemonComboboxItem = {
  id: number;
  name: string;
  nameJa: string;
};

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

export function PokemonCombobox<TPokemon extends PokemonComboboxItem>({
  id,
  label,
  pokemonCatalog,
  selectedPokemon,
  inputValue,
  onInputValueChange,
  onSelect,
}: PokemonComboboxProps<TPokemon>) {
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
    // 選択解除によるDownshift内部の入力リセットより、親が保持する入力値を優先する。
    // 日本語IMEの変換途中もonInputValueChangeで受け取った文字列をそのまま戻す。
    inputValue,
    itemToString: (pokemon) => pokemon?.nameJa ?? "",
    // 入力途中でフォーカスが外れても、選択済み名称へ勝手に巻き戻さない。
    stateReducer: (state, { type, changes }) =>
      type === useCombobox.stateChangeTypes.InputBlur
        ? { ...changes, inputValue: state.inputValue }
        : changes,
    // 候補の絞り込みに使う検索文字列だけを親へ通知する。
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
          onFocus: (event) => {
            const input = event.currentTarget;
            window.setTimeout(() => input.select(), 0);
          },
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
                  </span>
                </li>
              );
            })
          : null}
      </ul>
    </div>
  );
}
