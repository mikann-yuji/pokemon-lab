"use client";

import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import type { Nature } from "../infrastructure/training-catalog-repository";
import styles from "../styles/training-simulator.module.css";
import { NatureCaret } from "./training-nature-matrix-overlay";
import {
  STAT_NAMES,
  type StatRankingRow,
} from "./training-simulator-model";
import { StatRankingOverlay } from "./training-stat-ranking-overlay";

type DetailStat = PokemonDetail["stats"][number];

// 育成シミュレータの能力値編集エリア。
// 本体から切り出して、能力ポイント入力・実数値表示・ランキング起動を1か所にまとめる。
export function TrainingStatEditor({
  pokemonName,
  orderedStats,
  selectedNature,
  hasNatureModifier,
  abilityPoints,
  actualStats,
  baseStatRanks,
  pointTotal,
  rankingStatId,
  selectedRankingStat,
  statRankingRows,
  onAbilityPointChange,
  onRankingStatChange,
}: {
  pokemonName: string;
  orderedStats: DetailStat[];
  selectedNature: Nature | null;
  hasNatureModifier: boolean;
  abilityPoints: Record<string, number>;
  actualStats: Record<string, number>;
  baseStatRanks: Record<string, number | null>;
  pointTotal: number;
  rankingStatId: string | null;
  selectedRankingStat: DetailStat | null;
  statRankingRows: StatRankingRow[];
  onAbilityPointChange: (statId: string, value: number) => void;
  onRankingStatChange: (statId: string | null) => void;
}) {
  return (
    <>
      {/* 現在の能力ポイント合計。66上限の調整状況を常に見せる。 */}
      <div className={styles.statHeader}>
        <h2>能力値</h2>
        <span>能力ポイント {pointTotal} / 66</span>
      </div>
      <div className={styles.statTable}>
        {/* 6能力を固定順で並べ、種族値・順位・入力・実数値を横に比較できるようにする。 */}
        <div className={styles.statLabels}>
          <b>能力</b>
          <b>種族値</b>
          <b>順位</b>
          <b>能力P</b>
          <b>実数値</b>
          <b>ランキング</b>
        </div>
        {orderedStats.map((stat) => (
          <div className={styles.statRow} key={stat.id}>
            <strong>
              {STAT_NAMES[stat.id] ?? stat.name}
              {/* 性格で上がる/下がる能力だけ、小さな矢印で補正方向を示す。 */}
              {hasNatureModifier && selectedNature?.increasedStatId === stat.id ? (
                <NatureCaret direction="up" />
              ) : hasNatureModifier && selectedNature?.decreasedStatId === stat.id ? (
                <NatureCaret direction="down" />
              ) : null}
            </strong>
            <span>{stat.baseStat}</span>
            <span className={styles.rankBadge}>
              {baseStatRanks[stat.id] ? `${baseStatRanks[stat.id]}位` : "-"}
            </span>
            <div className={styles.pointControl}>
              {/* number入力とrange入力は同じ値を編集する。細かい入力と素早い調整の両方に対応する。 */}
              <input
                aria-label={`${stat.name}の能力ポイント`}
                type="number"
                min="0"
                max="32"
                value={abilityPoints[stat.id] ?? 0}
                onChange={(event) =>
                  onAbilityPointChange(stat.id, Number(event.target.value))
                }
              />
              <input
                aria-label={`${stat.name}の能力ポイントスライダー`}
                type="range"
                min="0"
                max="32"
                value={abilityPoints[stat.id] ?? 0}
                onChange={(event) =>
                  onAbilityPointChange(stat.id, Number(event.target.value))
                }
              />
            </div>
            <b>{actualStats[stat.id]}</b>
            <button
              className={styles.statRankingButton}
              type="button"
              onClick={() => onRankingStatChange(stat.id)}
            >
              {STAT_NAMES[stat.id] ?? stat.name}ランキング
            </button>
          </div>
        ))}
      </div>
      {rankingStatId && selectedRankingStat ? (
        // ランキングはモーダルで開き、閉じると選択中statIdをnullへ戻す。
        <StatRankingOverlay
          pokemonName={pokemonName}
          statName={STAT_NAMES[rankingStatId] ?? selectedRankingStat.name}
          actualValue={actualStats[rankingStatId] as number}
          abilityPoint={abilityPoints[rankingStatId] ?? 0}
          pointTotal={pointTotal}
          rows={statRankingRows}
          onPointChange={(value) => onAbilityPointChange(rankingStatId, value)}
          onClose={() => onRankingStatChange(null)}
        />
      ) : null}
      <p className={styles.formulaNote}>
        能力ポイントは1ポイントごとに実数値へ+1されます。HP以外は能力ポイントを
        加えた後に、性格の上昇補正（x1.1）または下降補正（x0.9）を掛け、
        小数点以下を切り捨てます。
      </p>
    </>
  );
}
