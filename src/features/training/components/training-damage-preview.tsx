"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { championsDamageCalculator } from "@/features/damage-calculator/config/champions-damage-ruleset";
import { DamageSurvivalCheck } from "@/features/damage-calculator/components/damage-survival-check";
import { useDamageCalculatorCatalogStore } from "@/features/damage-calculator/components/damage-calculator-catalog-store";
import {
  applyHeldItemSpeedModifier,
  applyPopularStatPointsToPokemon,
  applyTrainingBuildToPokemon,
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
import { calculateSitrusBerryKo } from "../domain/sitrus-berry-ko";
import styles from "../styles/training-simulator.module.css";

type DamagePreviewResult = {
  rank: number;
  defender: DamageCalculatorPokemon;
  move: DamageCalculatorMove;
  minimumPercent: number;
  maximumPercent: number;
  koLabel: string;
  attackerSpeed: number;
  defenderSpeed: number;
  turnOrder: "先攻" | "後攻" | "同速";
};

type ReceivedDamagePreviewResult = {
  rank: number;
  attacker: DamageCalculatorPokemon;
  move: DamageCalculatorMove | null;
  minimumPercent: number | null;
  maximumPercent: number | null;
  koLabel: string;
  attackerSpeed: number;
  defenderSpeed: number;
  turnOrder: "先攻" | "後攻" | "同速";
};

export function TrainingDamagePreview({
  pokemonId,
  nature,
  abilityPoints,
  moveIds,
  itemId,
  abilityId,
  natures,
  buildName,
}: {
  pokemonId: number;
  nature: string;
  abilityPoints: Record<string, number>;
  moveIds: string[];
  itemId: string;
  abilityId: string;
  natures: Nature[];
  buildName: string;
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
  const [rankingsLoaded, setRankingsLoaded] = useState(false);
  const [considerSitrusBerry, setConsiderSitrusBerry] = useState(false);
  const canConsiderSitrusBerry = itemId === "sitrus-berry";
  const sitrusBerryEnabled = canConsiderSitrusBerry && considerSitrusBerry;

  useEffect(() => {
    let active = true;
    void Promise.all([
      ensureCatalogLoaded(),
      getTopRankedPokemon("single", 100),
      getTopRankedPokemon("double", 100),
    ])
      .then(([, single, double]) => {
        if (!active) return;
        setRankingsByFormat({ single, double });
        setLoadError("");
        setRankingsLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("採用率上位へのダメージを準備できませんでした。", error);
        if (active) {
          setLoadError("採用率上位へのダメージを読み込めませんでした。");
          setRankingsLoaded(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ensureCatalogLoaded]);

  const trainedPokemon = useMemo(() => {
    const pokemonSource = pokemonCatalog.find(
      (candidate) => candidate.id === pokemonId,
    );
    if (!pokemonSource) return null;
    return applyTrainingBuildToPokemon(
      pokemonSource,
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
  }, [
    abilityId,
    abilityPoints,
    heldItems,
    itemId,
    moveIds,
    nature,
    natures,
    pokemonCatalog,
    pokemonId,
  ]);

  const survivalMembers = useMemo(
    () =>
      trainedPokemon
        ? [
            {
              build: {
                name: buildName.trim() || `${trainedPokemon.nameJa}の育成案`,
              },
              pokemon: trainedPokemon,
            },
          ]
        : [],
    [buildName, trainedPokemon],
  );

  const results = useMemo(() => {
    if (!typeEffectivenessSource || !trainedPokemon) return [];
    const attacker = trainedPokemon;
    if (attacker.moves.length === 0) return [];
    const attackerSpeed = applyHeldItemSpeedModifier(
      attacker,
      attacker.actualStats?.speed ?? attacker.stats.speed ?? 0,
      attacker.heldItem?.id ?? "",
    );
    const pokemonById = new Map(
      pokemonCatalog.map((candidate) => [candidate.id, candidate]),
    );
    return rankingsByFormat[battleFormat].flatMap(
      (ranking): DamagePreviewResult[] => {
        const defenderSource = pokemonById.get(ranking.formId);
        if (!defenderSource) return [];
        const defender = applyPopularStatPointsToPokemon(
          defenderSource,
          ranking.abilityPoints,
          ranking.nature,
        );
        const defenderSpeed =
          defender.actualStats?.speed ?? defender.stats.speed ?? 0;
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
                attackerSpeed,
                defenderSpeed,
                turnOrder:
                  attackerSpeed > defenderSpeed
                    ? "先攻"
                    : attackerSpeed < defenderSpeed
                      ? "後攻"
                      : "同速",
              },
            ]
          : [];
      },
    );
  }, [
    battleFormat,
    pokemonCatalog,
    rankingsByFormat,
    trainedPokemon,
    typeEffectivenessSource,
  ]);

  const receivedResults = useMemo(() => {
    if (!typeEffectivenessSource || !trainedPokemon) return [];
    const defender = trainedPokemon;
    const defenderSpeed = applyHeldItemSpeedModifier(
      defender,
      defender.actualStats?.speed ?? defender.stats.speed ?? 0,
      defender.heldItem?.id ?? "",
    );
    const pokemonById = new Map(
      pokemonCatalog.map((candidate) => [candidate.id, candidate]),
    );

    return rankingsByFormat[battleFormat].flatMap(
      (ranking): ReceivedDamagePreviewResult[] => {
        const attackerSource = pokemonById.get(ranking.formId);
        if (!attackerSource) return [];
        const attacker = applyPopularStatPointsToPokemon(
          attackerSource,
          ranking.abilityPoints,
          ranking.nature,
        );
        const attackerSpeed =
          attacker.actualStats?.speed ?? attacker.stats.speed ?? 0;
        const turnOrder =
          defenderSpeed > attackerSpeed
            ? "先攻"
            : defenderSpeed < attackerSpeed
              ? "後攻"
              : "同速";
        const best = attacker.moves
          .filter(
            (move) =>
              move.usageRank !== null &&
              move.usageRank !== undefined &&
              move.usageRank <= 4,
          )
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

        return [
          {
            rank: ranking.rank,
            attacker,
            move: best?.move ?? null,
            minimumPercent: best?.calculation.minimumPercent ?? null,
            maximumPercent: best?.calculation.maximumPercent ?? null,
            koLabel: best
              ? sitrusBerryEnabled
                ? calculateSitrusBerryKo(
                    best.calculation.damageRollGroups,
                    best.calculation.defenderHp,
                  ).label
                : best.calculation.koLabel
              : "採用率上位4位以内に攻撃技なし",
            attackerSpeed,
            defenderSpeed,
            turnOrder,
          },
        ];
      },
    );
  }, [
    battleFormat,
    pokemonCatalog,
    rankingsByFormat,
    sitrusBerryEnabled,
    trainedPokemon,
    typeEffectivenessSource,
  ]);

  return (
    <>
      {typeEffectivenessSource && trainedPokemon ? (
        <DamageSurvivalCheck
          team={null}
          members={survivalMembers}
          pokemonCatalog={pokemonCatalog}
          typeEffectivenessSource={typeEffectivenessSource}
          scope="single-pokemon"
          subjectName={
            buildName.trim() || `${trainedPokemon.nameJa}の育成案`
          }
        />
      ) : null}
      <section className={styles.damagePreview}>
        <header className={styles.damagePreviewHeader}>
          <div>
            <h2>採用率上位100体＋メガシンカへのダメージ</h2>
            <p>
              メガシンカできる相手はメガシンカ後も含め、現在設定中の能力値・特性・持ち物・技で計算します。相手の能力ポイントと性格は採用率1位の構成です。
            </p>
          </div>
          <BattleFormatSelect
            value={battleFormat}
            onChange={setBattleFormat}
          />
        </header>
        {loadError ? (
          <p className={styles.damagePreviewStatus}>{loadError}</p>
        ) : null}
        {!loadError &&
        (catalogStatus !== "loaded" || !rankingsLoaded) ? (
          <p className={styles.damagePreviewStatus}>ダメージ計算を準備中…</p>
        ) : null}
        {!loadError &&
        catalogStatus === "loaded" &&
        rankingsLoaded &&
        results.length === 0 ? (
          <p className={styles.damagePreviewStatus}>
            ダメージ技を設定すると計算結果を表示します。
          </p>
        ) : null}
        {results.length > 0 ? (
          <div className={styles.damagePreviewScroller}>
            {results.map(
              ({
                rank,
                defender,
                move,
                minimumPercent,
                maximumPercent,
                koLabel,
                attackerSpeed,
                defenderSpeed,
                turnOrder,
              }) => (
                <article className={styles.damagePreviewRow} key={defender.id}>
                  <PokemonPreviewImage pokemon={defender} />
                  <PreviewPokemonSummary rank={rank} pokemon={defender} />
                  <div className={styles.damagePreviewResult}>
                    <strong>{move.name}</strong>
                    <span>
                      {minimumPercent.toFixed(1)}〜
                      {maximumPercent.toFixed(1)}%
                    </span>
                    <small>{koLabel}</small>
                    <small className={styles[`turnOrder${turnOrder}`]}>
                      {turnOrder}（{attackerSpeed} / 相手 {defenderSpeed}）
                    </small>
                  </div>
                </article>
              ),
            )}
          </div>
        ) : null}
      </section>

      <section className={styles.damagePreview}>
        <header className={styles.damagePreviewHeader}>
          <div>
            <h2>採用率上位100体＋メガシンカから受けるダメージ</h2>
            <p>
              相手の攻撃技を採用率順に並べた上位4技を比較し、現在設定中の能力値・特性・持ち物に最も大きなダメージを与える技で計算します。
            </p>
          </div>
          <div className={styles.damagePreviewControls}>
            {canConsiderSitrusBerry ? (
              <label className={styles.sitrusBerryToggle}>
                <input
                  type="checkbox"
                  checked={sitrusBerryEnabled}
                  onChange={(event) =>
                    setConsiderSitrusBerry(event.target.checked)
                  }
                />
                <span>
                  オボンのみ考慮
                  <small>残りHPが半分以下で1/4回復</small>
                </span>
              </label>
            ) : null}
            <BattleFormatSelect
              value={battleFormat}
              onChange={setBattleFormat}
            />
          </div>
        </header>
        {loadError ? (
          <p className={styles.damagePreviewStatus}>{loadError}</p>
        ) : null}
        {!loadError &&
        (catalogStatus !== "loaded" || !rankingsLoaded) ? (
          <p className={styles.damagePreviewStatus}>
            受けるダメージを準備中…
          </p>
        ) : null}
        {!loadError &&
        catalogStatus === "loaded" &&
        rankingsLoaded &&
        receivedResults.length === 0 ? (
          <p className={styles.damagePreviewStatus}>
            受けるダメージを計算できませんでした。
          </p>
        ) : null}
        {receivedResults.length > 0 ? (
          <div className={styles.damagePreviewScroller}>
            {receivedResults.map(
              ({
                rank,
                attacker,
                move,
                minimumPercent,
                maximumPercent,
                koLabel,
                attackerSpeed,
                defenderSpeed,
                turnOrder,
              }) => (
                <article className={styles.damagePreviewRow} key={attacker.id}>
                  <PokemonPreviewImage pokemon={attacker} />
                  <PreviewPokemonSummary rank={rank} pokemon={attacker} />
                  <div className={styles.damagePreviewResult}>
                    <strong>
                      {move
                        ? `${move.name}（採用率${move.usageRank}位）`
                        : "対象攻撃技なし"}
                    </strong>
                    {minimumPercent !== null && maximumPercent !== null ? (
                      <span>
                        {minimumPercent.toFixed(1)}〜
                        {maximumPercent.toFixed(1)}%
                      </span>
                    ) : null}
                    <small>{koLabel}</small>
                    <small className={styles[`turnOrder${turnOrder}`]}>
                      こちら{turnOrder}（{defenderSpeed} / 相手{" "}
                      {attackerSpeed}）
                    </small>
                  </div>
                </article>
              ),
            )}
          </div>
        ) : null}
      </section>
    </>
  );
}

function BattleFormatSelect({
  value,
  onChange,
}: {
  value: TypeCheckerBattleFormat;
  onChange: (value: TypeCheckerBattleFormat) => void;
}) {
  return (
    <label>
      ルール
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as TypeCheckerBattleFormat)
        }
      >
        <option value="single">シングル</option>
        <option value="double">ダブル</option>
      </select>
    </label>
  );
}

function PokemonPreviewImage({
  pokemon,
}: {
  pokemon: DamageCalculatorPokemon;
}) {
  const imageUrl = pokemon.imageUrl ?? pokemon.fallbackImageUrl;
  return imageUrl ? (
    <Image
      src={imageUrl}
      alt={pokemon.nameJa}
      width={38}
      height={38}
      unoptimized
    />
  ) : null;
}

function PreviewPokemonSummary({
  rank,
  pokemon,
}: {
  rank: number;
  pokemon: DamageCalculatorPokemon;
}) {
  return (
    <div className={styles.damagePreviewPokemon}>
      <strong>
        {rank}位 {pokemon.nameJa}
      </strong>
      <span>
        {pokemon.types.map((typeName) => TYPE_LABELS[typeName]).join(" / ")}
      </span>
      <small>
        {STAT_IDS.map(
          (statId) =>
            `${BASE_STAT_LABELS[statId]} ${pokemon.actualStats?.[statId] ?? "—"}`,
        ).join(" / ")}
      </small>
    </div>
  );
}
