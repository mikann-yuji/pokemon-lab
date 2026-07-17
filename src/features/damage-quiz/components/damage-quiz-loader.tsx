"use client";

import { useEffect, useState } from "react";
import { useDamageCalculatorCatalogStore } from "@/features/damage-calculator/components/damage-calculator-catalog-store";
import { applyTrainingBuildToPokemon } from "@/features/damage-calculator/components/damage-calculator-state";
import type { DamageCalculatorPokemon } from "@/features/damage-calculator/domain/damage-calculator-types";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
} from "@/features/training/infrastructure/training-build-repository";
import { getNatures } from "@/features/training/infrastructure/training-catalog-repository";
import { getDamageQuizTargetIds } from "../infrastructure/damage-quiz-repository";
import type { DamageQuizBattleFormat } from "../damage-quiz-logic";
import DamageQuizGame, { type DamageQuizTeam } from "./damage-quiz-game";
import styles from "../styles/damage-quiz.module.css";

export default function DamageQuizLoader() {
  const catalog = useDamageCalculatorCatalogStore((state) => state.pokemonCatalog);
  const heldItems = useDamageCalculatorCatalogStore((state) => state.heldItems);
  const typeSource = useDamageCalculatorCatalogStore(
    (state) => state.typeEffectivenessSource,
  );
  const catalogStatus = useDamageCalculatorCatalogStore((state) => state.status);
  const catalogError = useDamageCalculatorCatalogStore((state) => state.error);
  const ensureLoaded = useDamageCalculatorCatalogStore(
    (state) => state.ensureLoaded,
  );
  const [teams, setTeams] = useState<DamageQuizTeam[]>([]);
  const [targetIds, setTargetIds] = useState<
    Record<DamageQuizBattleFormat, number[]>
  >({ single: [], double: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void ensureLoaded().catch(() => undefined);
  }, [ensureLoaded]);

  useEffect(() => {
    if (catalogStatus !== "loaded") return;
    let active = true;
    void Promise.all([
      getAllBattleTeams(),
      getAllTrainingBuilds(),
      getNatures(),
      getDamageQuizTargetIds("single"),
      getDamageQuizTargetIds("double"),
    ])
      .then(([battleTeams, builds, natures, single, double]) => {
        if (!active) return;
        const pokemonById = new Map(catalog.map((pokemon) => [pokemon.id, pokemon]));
        const buildById = new Map(
          builds.flatMap((build) => (build.id === undefined ? [] : [[build.id, build] as const])),
        );
        const preparedTeams = battleTeams.flatMap((team: BattleTeam) => {
          if (team.id === undefined) return [];
          const members = team.buildIds.flatMap((buildId) => {
            const build = buildById.get(buildId);
            const pokemon = build ? pokemonById.get(build.pokemonId) : undefined;
            if (!build || !pokemon) return [];
            const trained = applyTrainingBuildToPokemon(
              pokemon,
              build,
              natures,
              heldItems,
            );
            return trained.moves.length > 0 ? [trained] : [];
          });
          return members.length > 0
            ? [{ id: team.id, name: team.name, members }]
            : [];
        });
        setTeams(preparedTeams);
        setTargetIds({ single, double });
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        console.error("ダメージ計算クイズのデータを読み込めませんでした。", cause);
        if (!active) return;
        setError("ダメージ計算クイズのデータを読み込めませんでした。");
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [catalog, catalogStatus, heldItems]);

  if (catalogStatus === "error" || error) {
    return <p className={styles.status} role="alert">{error || catalogError}</p>;
  }
  if (!loaded || !typeSource) {
    return <p className={styles.status}>クイズデータを読み込んでいます…</p>;
  }

  const pokemonById = new Map<number, DamageCalculatorPokemon>(
    catalog.map((pokemon) => [pokemon.id, pokemon]),
  );
  return (
    <DamageQuizGame
      teams={teams}
      defendersByFormat={{
        single: targetIds.single.flatMap((id) => {
          const pokemon = pokemonById.get(id);
          return pokemon ? [pokemon] : [];
        }),
        double: targetIds.double.flatMap((id) => {
          const pokemon = pokemonById.get(id);
          return pokemon ? [pokemon] : [];
        }),
      }}
      typeEffectivenessSource={typeSource}
    />
  );
}
