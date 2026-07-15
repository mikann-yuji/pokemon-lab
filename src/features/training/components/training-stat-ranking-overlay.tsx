"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCombobox } from "downshift";
import { normalizePokemonSearchText } from "@/domain/pokemon-name-search";
import styles from "../styles/training-simulator.module.css";
import { rankCurrentValue, type DisplayStatRankingRow, type StatCompareMode, type StatRankingRow } from "./training-simulator-model";

export function StatRankingOverlay({
  pokemonName,
  statName,
  actualValue,
  abilityPoint,
  pointTotal,
  rows,
  onPointChange,
  onClose,
}: {
  pokemonName: string;
  statName: string;
  actualValue: number;
  abilityPoint: number;
  pointTotal: number;
  rows: StatRankingRow[];
  onPointChange: (value: number) => void;
  onClose: () => void;
}) {
  const [compareMode, setCompareMode] =
    useState<StatCompareMode>("uninvested");
  const [selectedRankRowId, setSelectedRankRowId] = useState("training-target");
  const rankRowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const sortedRows = useMemo(
    () => {
      const displayRows: DisplayStatRankingRow[] = [
        ...rows.map((row) => ({
          id: String(row.profile.id),
          name: row.profile.nameJa,
          searchName: `${row.profile.nameJa} ${row.profile.name}`,
          uninvested: row.uninvested,
          maximum: row.maximum,
          isTrainingTarget: false,
        })),
        {
          id: "training-target",
          name: `${pokemonName}（育成中）`,
          searchName: pokemonName,
          uninvested: actualValue,
          maximum: actualValue,
          isTrainingTarget: true,
        },
      ];
      return displayRows.sort(
        (left, right) =>
          right[compareMode] - left[compareMode] ||
          right.maximum - left.maximum ||
          right.uninvested - left.uninvested ||
          (right.isTrainingTarget ? 1 : 0) -
            (left.isTrainingTarget ? 1 : 0) ||
          left.name.localeCompare(right.name, "ja"),
      );
    },
    [actualValue, compareMode, pokemonName, rows],
  );
  const selectedRankRow = sortedRows.find((row) => row.id === selectedRankRowId);
  const actualRank =
    sortedRows.length > 0
      ? rankCurrentValue(
          sortedRows.map((row) => row[compareMode]),
          actualValue,
        )
      : null;

  useEffect(() => {
    rankRowRefs.current.get(selectedRankRowId)?.scrollIntoView({ block: "center" });
  }, [selectedRankRowId, sortedRows]);

  return (
    <div className={styles.statRankingOverlay} role="dialog" aria-modal="true" aria-labelledby="stat-ranking-title">
      <button className={styles.statRankingBackdrop} type="button" aria-label="実数値順位表を閉じる" onClick={onClose} />
      <section className={styles.statRankingPanel}>
        <div className={styles.statRankingHeader}>
          <div>
            <p>LV.50 / IV31</p>
            <h2 id="stat-ranking-title">実数値順位表</h2>
          </div>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        <div className={styles.statRankingControls}>
          <div className={styles.statRankingSummary}>
            <strong>{pokemonName}</strong>
            <span>{statName}: {actualValue}</span>
            {actualRank ? (
              <small>
                {compareMode === "uninvested" ? "無振り" : "最大値"}基準 {actualRank}位
              </small>
            ) : null}
          </div>
          <RankingPokemonSearch
            rows={sortedRows}
            selectedRow={selectedRankRow ?? null}
            onSelect={(row) => setSelectedRankRowId(row.id)}
          />
          <label className={styles.statRankingPointControl}>
            <span>{statName} 能力P</span>
            <input
              aria-label={`${statName}の能力ポイント`}
              type="number"
              min="0"
              max="32"
              value={abilityPoint}
              onChange={(event) => onPointChange(Number(event.target.value))}
            />
            <input
              aria-label={`${statName}の能力ポイントスライダー`}
              type="range"
              min="0"
              max="32"
              value={abilityPoint}
              onChange={(event) => onPointChange(Number(event.target.value))}
            />
            <small>合計 {pointTotal} / 66</small>
          </label>
          <div className={styles.statCompareToggle} role="group" aria-label="比較基準">
            <button
              className={compareMode === "uninvested" ? styles.activeCompareMode : undefined}
              type="button"
              onClick={() => setCompareMode("uninvested")}
            >
              無振りで比較
            </button>
            <button
              className={compareMode === "maximum" ? styles.activeCompareMode : undefined}
              type="button"
              onClick={() => setCompareMode("maximum")}
            >
              最大値で比較
            </button>
          </div>
        </div>
        <div className={styles.statRankingTableWrap}>
          <table className={styles.statRankingTable}>
            <thead>
              <tr>
                <th scope="col">順位</th>
                <th scope="col">ポケモン</th>
                <th scope="col">無振り</th>
                <th scope="col">最大</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  className={
                    row.id === selectedRankRowId
                      ? `${styles.selectedRankRow} ${row.isTrainingTarget ? styles.targetRankRow : ""}`
                      : row.isTrainingTarget
                        ? styles.targetRankRow
                        : undefined
                  }
                  key={row.id}
                  ref={(element) => {
                    if (element) {
                      rankRowRefs.current.set(row.id, element);
                    } else {
                      rankRowRefs.current.delete(row.id);
                    }
                  }}
                >
                  <td>{rankCurrentValue(sortedRows.map((item) => item[compareMode]), row[compareMode])}位</td>
                  <th scope="row">{row.name}</th>
                  <td>{row.uninvested}</td>
                  <td>{row.maximum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RankingPokemonSearch({
  rows,
  selectedRow,
  onSelect,
}: {
  rows: DisplayStatRankingRow[];
  selectedRow: DisplayStatRankingRow | null;
  onSelect: (row: DisplayStatRankingRow) => void;
}) {
  const [inputValue, setInputValue] = useState(selectedRow?.name ?? "");
  const suggestions = useMemo(() => {
    const normalizedQuery = normalizePokemonSearchText(inputValue);
    if (!normalizedQuery) return rows.slice(0, 8);
    return rows
      .filter((row) =>
        normalizePokemonSearchText(row.searchName).includes(normalizedQuery),
      )
      .slice(0, 8);
  }, [inputValue, rows]);
  const {
    getInputProps,
    getItemProps,
    getLabelProps,
    getMenuProps,
    highlightedIndex,
    isOpen,
  } = useCombobox({
    inputValue,
    items: suggestions,
    itemToString: (item) => item?.name ?? "",
    onInputValueChange: ({ inputValue: nextInputValue }) => {
      setInputValue(nextInputValue ?? "");
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      setInputValue(selectedItem.name);
      onSelect(selectedItem);
    },
  });
  const showSuggestions = isOpen && suggestions.length > 0;

  return (
    <div className={styles.statRankingSearch}>
      <label {...getLabelProps()}>ポケモン検索</label>
      <input
        {...getInputProps({
          placeholder: "ポケモン名を入力",
        })}
      />
      <ul {...getMenuProps()} hidden={!showSuggestions}>
        {showSuggestions
          ? suggestions.map((row, index) => (
              <li
                className={
                  highlightedIndex === index ? styles.highlightedSuggestion : undefined
                }
                key={row.id}
                {...getItemProps({ item: row, index })}
              >
                <span>{row.name}</span>
                <small>{row.isTrainingTarget ? "育成中" : row.searchName}</small>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}

/** 性格補正の上昇/下降を小さな矢印アイコンとして表示する。 */

