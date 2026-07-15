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
      <div className={styles.statHeader}>
        <h2>能力値</h2>
        <span>能力ポイント {pointTotal} / 66</span>
      </div>
      <div className={styles.statTable}>
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
