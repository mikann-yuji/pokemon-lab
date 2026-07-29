"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { championsDamageCalculator } from "@/features/damage-calculator/config/champions-damage-ruleset";
import { useDamageCalculatorCatalogStore } from "@/features/damage-calculator/components/damage-calculator-catalog-store";
import {
  applyTrainingBuildToPokemon,
  calculateActualStat,
} from "@/features/damage-calculator/components/damage-calculator-state";
import {
  BASE_STAT_LABELS,
  STAT_IDS,
  TYPE_LABELS,
} from "@/features/damage-calculator/components/damage-calculator-display";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "@/features/damage-calculator/domain/damage-calculator-types";
import {
  getTopRankedPokemon,
  type RankedPokemon,
  type TypeCheckerBattleFormat,
} from "@/features/type-checker/infrastructure/type-checker-repository";
import type { Nature } from "../infrastructure/training-catalog-repository";
import styles from "../styles/training-simulator.module.css";

type DamagePreviewResult = {
  rank: number;
  defender: DamageCalculatorPokemon;
  move: DamageCalculatorMove;
  minimumPercent: number;
  maximumPercent: number;
  koLabel: string;
};

function applyRankedStats(
  pokemon: DamageCalculatorPokemon,
  ranking: RankedPokemon,
) {
  return {
    ...pokemon,
    actualStats: Object.fromEntries(
      STAT_IDS.map((statId) => [
        statId,
        calculateActualStat(
          pokemon,
          statId,
          ranking.abilityPoints[statId] ?? 0,
        ),
      ]),
    ),
  };
}

export function TrainingDamagePreview({
  pokemonId,
  nature,
  abilityPoints,
  moveIds,
  itemId,
  abilityId,
  natures,
}: {
  pokemonId: number;
  nature: string;
  abilityPoints: Record<string, number>;
  moveIds: string[];
  itemId: string;
  abilityId: string;
  natures: Nature[];
}) {
  const pokemonCatalog = useDamageCalculatorCatalogStore(
    (state) => state.pokemonCatalog,
  );
  const heldItems = useDamageCalculatorCatalogStore((state) => state.heldItems);
  const typeEffectivenessSource = useDamageCalculatorCatalogStore(
    (state) => state.typeEffectivenessSource,
  );
  const catalogStatus = useDamageCalculatorCatalogStore((state) => state.status);
  const ensureCatalogLoaded = useDamageCalculatorCatalogStore(
    (state) => state.ensureLoaded,
  );
  const [battleFormat, setBattleFormat] =
    useState<TypeCheckerBattleFormat>("single");
  const [rankingsByFormat, setRankingsByFormat] = useState<
    Record<TypeCheckerBattleFormat, RankedPokemon[]>
  >({ single: [], double: [] });
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      ensureCatalogLoaded(),
      getTopRankedPokemon("single"),
      getTopRankedPokemon("double"),
    ])
      .then(([, single, double]) => {
        if (!active) return;
        setRankingsByFormat({ single, double });
        setLoadError("");
      })
      .catch((error: unknown) => {
        console.error("採用率上位へのダメージを準備できませんでした。", error);
        if (active) {
          setLoadError("採用率上位へのダメージを読み込めませんでした。");
        }
      });
    return () => {
      active = false;
    };
  }, [ensureCatalogLoaded]);

  const results = useMemo(() => {
    if (!typeEffectivenessSource) return [];
    const attackerSource = pokemonCatalog.find(
      (candidate) => candidate.id === pokemonId,
    );
    if (!attackerSource) return [];
    const attacker = applyTrainingBuildToPokemon(
      attackerSource,
      {
        name: "",
        contentKey: "",
        pokemonId,
        nature,
        itemId,
        abilityId,
        abilityPoints,
        moveIds,
        updatedAt: 0,
      },
      natures,
      heldItems,
    );
    if (attacker.moves.length === 0) return [];
    const pokemonById = new Map(
      pokemonCatalog.map((candidate) => [candidate.id, candidate]),
    );
    return rankingsByFormat[battleFormat].flatMap(
      (ranking): DamagePreviewResult[] => {
        const defenderSource = pokemonById.get(ranking.formId);
        if (!defenderSource) return [];
        const defender = applyRankedStats(defenderSource, ranking);
        const best = attacker.moves
          .flatMap((move) => {
            try {
              const calculation = championsDamageCalculator.calculate({
                attacker,
                defender,
                move,
                typeEffectivenessSource,
              });
              return [{ move, calculation }];
            } catch {
              return [];
            }
          })
          .sort(
            (left, right) =>
              right.calculation.minimumPercent -
                left.calculation.minimumPercent ||
              right.calculation.maximumPercent -
                left.calculation.maximumPercent,
          )[0];
        return best
          ? [
              {
                rank: ranking.rank,
                defender,
                move: best.move,
                minimumPercent: best.calculation.minimumPercent,
                maximumPercent: best.calculation.maximumPercent,
                koLabel: best.calculation.koLabel,
              },
            ]
          : [];
      },
    );
  }, [
    abilityId,
    abilityPoints,
    battleFormat,
    heldItems,
    itemId,
    moveIds,
    nature,
    natures,
    pokemonCatalog,
    pokemonId,
    rankingsByFormat,
    typeEffectivenessSource,
  ]);

  return (
    <section className={styles.damagePreview}>
      <header className={styles.damagePreviewHeader}>
        <div>
          <h2>採用率上位30体へのダメージ</h2>
          <p>
            現在設定中の能力値・特性・持ち物・技を使用し、相手は採用率1位の能力ポイント配分で計算します。
          </p>
        </div>
        <label>
          ルール
          <select
            value={battleFormat}
            onChange={(event) =>
              setBattleFormat(event.target.value as TypeCheckerBattleFormat)
            }
          >
            <option value="single">シングル</option>
            <option value="double">ダブル</option>
          </select>
        </label>
      </header>
      {loadError ? <p className={styles.damagePreviewStatus}>{loadError}</p> : null}
      {!loadError && catalogStatus !== "loaded" ? (
        <p className={styles.damagePreviewStatus}>ダメージ計算を準備中…</p>
      ) : null}
      {!loadError && catalogStatus === "loaded" && results.length === 0 ? (
        <p className={styles.damagePreviewStatus}>
          ダメージ技を設定すると計算結果を表示します。
        </p>
      ) : null}
      {results.length > 0 ? (
        <div className={styles.damagePreviewScroller}>
          {results.map(({ rank, defender, move, minimumPercent, maximumPercent, koLabel }) => (
            <article className={styles.damagePreviewRow} key={defender.id}>
              {defender.imageUrl ?? defender.fallbackImageUrl ? (
                <Image
                  src={(defender.imageUrl ?? defender.fallbackImageUrl) as string}
                  alt={defender.nameJa}
                  width={38}
                  height={38}
                  unoptimized
                />
              ) : null}
              <div className={styles.damagePreviewPokemon}>
                <strong>
                  {rank}位 {defender.nameJa}
                </strong>
                <span>
                  {defender.types
                    .map((typeName) => TYPE_LABELS[typeName])
                    .join(" / ")}
                </span>
                <small>
                  {STAT_IDS.map(
                    (statId) =>
                      `${BASE_STAT_LABELS[statId]} ${defender.actualStats?.[statId] ?? "—"}`,
                  ).join(" / ")}
                </small>
              </div>
              <div className={styles.damagePreviewResult}>
                <strong>{move.name}</strong>
                <span>
                  {minimumPercent.toFixed(1)}〜{maximumPercent.toFixed(1)}%
                </span>
                <small>{koLabel}</small>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
