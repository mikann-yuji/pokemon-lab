"use client";

import { useCombobox } from "downshift";
import { useEffect, useId, useState } from "react";
import { TYPE_NAMES, type TypeName } from "@/domain/type-matchup";
import {
  searchAbilities,
  searchMoves,
  type AbilitySearchResult,
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
  initialMoveNames?: string[];
  initialAbilityName?: string;
};

export function PokemonAdvancedSearch({
  initialFilters,
  initialMoveNames = [],
  initialAbilityName = "",
}: PokemonAdvancedSearchProps) {
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
        {[0, 1].map((slot) => (
          <MoveFilter
            key={slot}
            slot={slot}
            initialMoveId={initialFilters.moveIds?.[slot] ?? ""}
            initialMoveName={initialMoveNames[slot] ?? ""}
          />
        ))}
      </fieldset>

      <fieldset className={styles.abilityFilter}>
        <legend>とくせい</legend>
        <AbilityFilter
          initialAbilityId={initialFilters.abilityIds?.[0] ?? ""}
          initialAbilityName={initialAbilityName}
        />
      </fieldset>
    </div>
  );
}

/** 特性条件を候補検索付きで編集し、確定したIDと表示名をURLへ送る。 */
function AbilityFilter({
  initialAbilityId,
  initialAbilityName,
}: {
  initialAbilityId: string;
  initialAbilityName: string;
}) {
  const inputId = useId();
  const [query, setQuery] = useState(initialAbilityName);
  const [selectedAbility, setSelectedAbility] =
    useState<AbilitySearchResult | null>(
      initialAbilityId
        ? { id: initialAbilityId, name: initialAbilityName }
        : null,
    );
  const [suggestions, setSuggestions] = useState<AbilitySearchResult[]>([]);
  const {
    isOpen,
    highlightedIndex,
    getInputProps,
    getItemProps,
    getMenuProps,
  } = useCombobox({
    items: suggestions,
    initialInputValue: initialAbilityName,
    itemToString: (ability) => ability?.name ?? "",
    onInputValueChange: ({ inputValue }) => {
      const nextValue = inputValue ?? "";
      setQuery(nextValue);
      if (selectedAbility && nextValue !== selectedAbility.name) {
        setSelectedAbility(null);
      }
      if (!nextValue.trim()) setSuggestions([]);
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      setSelectedAbility(selectedItem);
      setQuery(selectedItem.name);
      setSuggestions([]);
    },
  });

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery === selectedAbility?.name) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void searchAbilities(normalizedQuery)
        .then((abilities) => {
          if (active) setSuggestions(abilities);
        })
        .catch((error: unknown) => {
          console.error("特性候補を読み込めませんでした。", error);
          if (active) setSuggestions([]);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, selectedAbility?.name]);

  return (
    <div className={styles.moveCombobox}>
      <label htmlFor={inputId}>特性名</label>
      <input
        {...getInputProps({
          id: inputId,
          type: "search",
          placeholder: "特性名を入力",
          autoComplete: "off",
        })}
      />
      <input type="hidden" name="ability" value={selectedAbility?.id ?? ""} />
      <input
        type="hidden"
        name="abilityName"
        value={selectedAbility?.name ?? ""}
      />
      <ul
        {...getMenuProps({
          className: styles.moveSuggestionList,
          "aria-label": "特性の候補",
        })}
        hidden={!isOpen || !query.trim() || suggestions.length === 0}
      >
        {isOpen
          ? suggestions.map((ability, index) => (
              <li
                key={ability.id}
                {...getItemProps({ item: ability, index })}
                className={
                  highlightedIndex === index
                    ? styles.suggestionHighlighted
                    : ""
                }
              >
                {ability.name}
              </li>
            ))
          : null}
      </ul>
      {query && !selectedAbility ? (
        <small>候補から特性を選んでください</small>
      ) : null}
    </div>
  );
}

/** 1つの技条件を候補検索付きで編集し、確定したIDと表示名をURLへ送る。 */
function MoveFilter({
  slot,
  initialMoveId,
  initialMoveName,
}: {
  slot: number;
  initialMoveId: string;
  initialMoveName: string;
}) {
  const moveInputId = useId();
  const [moveQuery, setMoveQuery] = useState(initialMoveName);
  const [selectedMove, setSelectedMove] = useState<MoveSearchResult | null>(
    initialMoveId ? { id: initialMoveId, name: initialMoveName } : null,
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
      if (selectedMove && nextValue !== selectedMove.name) setSelectedMove(null);
      if (!nextValue.trim()) setMoveSuggestions([]);
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      setSelectedMove(selectedItem);
      setMoveQuery(selectedItem.name);
      setMoveSuggestions([]);
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

  const parameterSuffix = slot === 0 ? "" : "2";
  return (
    <div className={styles.moveCombobox}>
      <label htmlFor={moveInputId}>技名 {slot + 1}</label>
      <input
        {...getInputProps({
          id: moveInputId,
          type: "search",
          placeholder: "技名を入力",
          autoComplete: "off",
        })}
      />
      <input
        type="hidden"
        name={`move${parameterSuffix}`}
        value={selectedMove?.id ?? ""}
      />
      <input
        type="hidden"
        name={`moveName${parameterSuffix}`}
        value={selectedMove?.name ?? ""}
      />
      <ul
        {...getMenuProps({
          className: styles.moveSuggestionList,
          "aria-label": `技${slot + 1}の候補`,
        })}
        hidden={!isOpen || !moveQuery.trim() || moveSuggestions.length === 0}
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
// 複数条件を組み合わせるポケモン詳細検索フォームと結果更新を担当する。
