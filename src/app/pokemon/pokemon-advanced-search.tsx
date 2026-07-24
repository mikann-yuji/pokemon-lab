"use client";

import { useCombobox } from "downshift";
import { useEffect, useId, useState } from "react";
import { TYPE_NAMES, type TypeName } from "@/domain/type-matchup";
import {
  searchMoves,
  type MoveSearchResult,
  type PokemonAdvancedSearchFilters,
} from "@/infrastructure/database/pokemon-search-repository";
import styles from "./pokemon-search.module.css";

const TYPE_LABELS: Record<TypeName, string> = {
  Normal: "ノーマル",
  Fire: "ほのお",
  Water: "みず",
  Electric: "でんき",
  Grass: "くさ",
  Ice: "こおり",
  Fighting: "かくとう",
  Poison: "どく",
  Ground: "じめん",
  Flying: "ひこう",
  Psychic: "エスパー",
  Bug: "むし",
  Rock: "いわ",
  Ghost: "ゴースト",
  Dragon: "ドラゴン",
  Dark: "あく",
  Steel: "はがね",
  Fairy: "フェアリー",
};

const STAT_DEFINITIONS = [
  { id: "hp", label: "HP", parameter: "h" },
  { id: "attack", label: "こうげき", parameter: "a" },
  { id: "defense", label: "ぼうぎょ", parameter: "b" },
  { id: "special-attack", label: "とくこう", parameter: "c" },
  { id: "special-defense", label: "とくぼう", parameter: "d" },
  { id: "speed", label: "すばやさ", parameter: "s" },
] as const;

type PokemonAdvancedSearchProps = {
  initialFilters: PokemonAdvancedSearchFilters;
  initialMoveName?: string;
};

export function PokemonAdvancedSearch({
  initialFilters,
  initialMoveName = "",
}: PokemonAdvancedSearchProps) {
  const moveInputId = useId();
  const [moveQuery, setMoveQuery] = useState(initialMoveName);
  const [selectedMove, setSelectedMove] = useState<MoveSearchResult | null>(
    initialFilters.moveId
      ? { id: initialFilters.moveId, name: initialMoveName }
      : null,
  );
  const [moveSuggestions, setMoveSuggestions] = useState<MoveSearchResult[]>([]);
  const {
    isOpen,
    highlightedIndex,
    getInputProps,
    getItemProps,
    getMenuProps,
  } = useCombobox({
    items: moveSuggestions,
    initialInputValue: initialMoveName,
    itemToString: (move) => move?.name ?? "",
    onInputValueChange: ({ inputValue }) => {
      const nextValue = inputValue ?? "";
      setMoveQuery(nextValue);
      if (selectedMove && nextValue !== selectedMove.name) {
        setSelectedMove(null);
      }
      if (!nextValue.trim()) setMoveSuggestions([]);
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        setSelectedMove(selectedItem);
        setMoveQuery(selectedItem.name);
        setMoveSuggestions([]);
      }
    },
  });

  useEffect(() => {
    const normalizedQuery = moveQuery.trim();
    if (!normalizedQuery || normalizedQuery === selectedMove?.name) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void searchMoves(normalizedQuery)
        .then((moves) => {
          if (active) setMoveSuggestions(moves);
        })
        .catch((error: unknown) => {
          console.error("技候補を読み込めませんでした。", error);
          if (active) setMoveSuggestions([]);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [moveQuery, selectedMove?.name]);

  const selectedTypes = initialFilters.types ?? [];

  return (
    <div className={styles.advancedSearch}>
      <fieldset className={styles.typeFilters}>
        <legend>タイプ</legend>
        {[0, 1].map((slot) => (
          <label key={slot}>
            タイプ{slot + 1}
            <select
              name={`type${slot + 1}`}
              defaultValue={selectedTypes[slot] ?? ""}
            >
              <option value="">指定なし</option>
              {TYPE_NAMES.map((typeName) => (
                <option key={typeName} value={typeName}>
                  {TYPE_LABELS[typeName]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.statFilters}>
        <legend>種族値</legend>
        {STAT_DEFINITIONS.map(({ id, label, parameter }) => (
          <StatRange
            key={id}
            label={label}
            parameter={parameter}
            initialMin={initialFilters.stats?.[id]?.min}
            initialMax={initialFilters.stats?.[id]?.max}
          />
        ))}
      </fieldset>

      <fieldset className={styles.moveFilter}>
        <legend>覚える技</legend>
        <div className={styles.moveCombobox}>
          <label htmlFor={moveInputId}>技名</label>
          <input
            {...getInputProps({
              id: moveInputId,
              type: "search",
              placeholder: "技名を入力",
              autoComplete: "off",
            })}
          />
          <input type="hidden" name="move" value={selectedMove?.id ?? ""} />
          <input
            type="hidden"
            name="moveName"
            value={selectedMove?.name ?? ""}
          />
          <ul
            {...getMenuProps({
              className: styles.moveSuggestionList,
              "aria-label": "技の候補",
            })}
            hidden={
              !isOpen || !moveQuery.trim() || moveSuggestions.length === 0
            }
          >
            {isOpen
              ? moveSuggestions.map((move, index) => (
                  <li
                    key={move.id}
                    {...getItemProps({ item: move, index })}
                    className={
                      highlightedIndex === index
                        ? styles.suggestionHighlighted
                        : ""
                    }
                  >
                    {move.name}
                  </li>
                ))
              : null}
          </ul>
          {moveQuery && !selectedMove ? (
            <small>候補から技を選んでください</small>
          ) : null}
        </div>
      </fieldset>
    </div>
  );
}

function StatRange({
  label,
  parameter,
  initialMin,
  initialMax,
}: {
  label: string;
  parameter: string;
  initialMin?: number;
  initialMax?: number;
}) {
  const [hasMin, setHasMin] = useState(initialMin !== undefined);
  const [hasMax, setHasMax] = useState(initialMax !== undefined);
  const [min, setMin] = useState(initialMin ?? 0);
  const [max, setMax] = useState(initialMax ?? 255);
  const effectiveMin = Math.min(min, max);
  const effectiveMax = Math.max(min, max);

  return (
    <div className={styles.statRange}>
      <div className={styles.statRangeHeader}>
        <strong>{label}</strong>
        <span>
          {hasMin ? effectiveMin : "下限なし"} ～{" "}
          {hasMax ? effectiveMax : "上限なし"}
        </span>
      </div>
      <div className={styles.rangeTrack}>
        <input
          aria-label={`${label}の下限`}
          type="range"
          min="0"
          max="255"
          value={effectiveMin}
          disabled={!hasMin}
          onChange={(event) =>
            setMin(Math.min(Number(event.target.value), effectiveMax))
          }
        />
        <input
          aria-label={`${label}の上限`}
          type="range"
          min="0"
          max="255"
          value={effectiveMax}
          disabled={!hasMax}
          onChange={(event) =>
            setMax(Math.max(Number(event.target.value), effectiveMin))
          }
        />
      </div>
      <div className={styles.rangeOptions}>
        <label>
          <input
            type="checkbox"
            checked={!hasMin}
            onChange={(event) => setHasMin(!event.target.checked)}
          />
          下限なし
        </label>
        <label>
          <input
            type="checkbox"
            checked={!hasMax}
            onChange={(event) => setHasMax(!event.target.checked)}
          />
          上限なし
        </label>
      </div>
      {hasMin ? (
        <input type="hidden" name={`${parameter}Min`} value={effectiveMin} />
      ) : null}
      {hasMax ? (
        <input type="hidden" name={`${parameter}Max`} value={effectiveMax} />
      ) : null}
    </div>
  );
}
