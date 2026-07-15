"use client";

import { useState } from "react";
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import type { Nature } from "@/features/training/infrastructure/training-catalog-repository";
import type { TrainingBuild } from "@/features/training/infrastructure/training-build-repository";
import { ADJUSTABLE_STAT_IDS, STAT_IDS } from "./damage-calculator-display";
import type {
  AdjustableStatId,
  DamageSide,
  SpeedComparisonRow,
  StatAdjustment,
} from "./damage-calculator-types";

export type StatAdjustmentState = Record<
  DamageSide,
  Record<AdjustableStatId, StatAdjustment>
>;

function createDefaultAdjustment(): StatAdjustment {
  return { point: 0, rank: 0, nature: false };
}

export function createDefaultAdjustmentState(): StatAdjustmentState {
  return {
    attacker: {
      hp: createDefaultAdjustment(),
      attack: createDefaultAdjustment(),
      defense: createDefaultAdjustment(),
      "special-attack": createDefaultAdjustment(),
      "special-defense": createDefaultAdjustment(),
    },
    defender: {
      hp: createDefaultAdjustment(),
      attack: createDefaultAdjustment(),
      defense: createDefaultAdjustment(),
      "special-attack": createDefaultAdjustment(),
      "special-defense": createDefaultAdjustment(),
    },
  };
}

function calculateActualStat(
  pokemon: DamageCalculatorPokemon,
  statId: (typeof STAT_IDS)[number],
  point = 0,
  nature = false,
) {
  const baseStat = pokemon.stats[statId] ?? 1;
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * (nature ? 1.1 : 1));
}

function calculateSpeedValue(
  pokemon: DamageCalculatorPokemon | null,
  point: number,
  nature: boolean,
  scarf = false,
) {
  if (!pokemon) return null;
  const speed = calculateActualStat(pokemon, "speed", point, nature);
  return scarf ? Math.floor(speed * 1.5) : speed;
}

export function createSpeedComparisonRows(
  attacker: DamageCalculatorPokemon | null,
  defender: DamageCalculatorPokemon | null,
): SpeedComparisonRow[] {
  return [
    {
      id: "scarf-fastest",
      label: "スカーフ最速",
      attacker: calculateSpeedValue(attacker, 32, true, true),
      defender: calculateSpeedValue(defender, 32, true, true),
    },
    {
      id: "fastest",
      label: "最速",
      attacker: calculateSpeedValue(attacker, 32, true),
      defender: calculateSpeedValue(defender, 32, true),
    },
    {
      id: "semi-fast",
      label: "準速",
      attacker: calculateSpeedValue(attacker, 32, false),
      defender: calculateSpeedValue(defender, 32, false),
    },
    {
      id: "uninvested",
      label: "無振",
      attacker: calculateSpeedValue(attacker, 0, false),
      defender: calculateSpeedValue(defender, 0, false),
    },
  ];
}

function createNeutralActualStats(pokemon: DamageCalculatorPokemon) {
  return Object.fromEntries(
    STAT_IDS.map((statId) => [statId, calculateActualStat(pokemon, statId)]),
  );
}

export function applyStatAdjustment(
  pokemon: DamageCalculatorPokemon | null,
  statId: AdjustableStatId | null,
  adjustment: StatAdjustment | null,
): DamageCalculatorPokemon | null {
  if (!pokemon || !statId || !adjustment) return pokemon;
  return {
    ...pokemon,
    actualStats: {
      ...createNeutralActualStats(pokemon),
      ...pokemon.actualStats,
      [statId]: calculateActualStat(
        pokemon,
        statId,
        adjustment.point,
        adjustment.nature,
      ),
    },
    boosts:
      statId === "hp"
        ? pokemon.boosts
        : { ...pokemon.boosts, [statId]: adjustment.rank },
  };
}

export function applyHeldItem(
  pokemon: DamageCalculatorPokemon | null,
  item: DamageCalculatorHeldItem | null,
): DamageCalculatorPokemon | null {
  return pokemon ? { ...pokemon, heldItem: item } : pokemon;
}

export function applyAbility(
  pokemon: DamageCalculatorPokemon | null,
  ability: DamageCalculatorAbility | null,
): DamageCalculatorPokemon | null {
  return pokemon ? { ...pokemon, selectedAbility: ability } : pokemon;
}

export function getRelevantStatIds(move: DamageCalculatorMove | undefined) {
  if (!move) return { attacker: null, defender: null };
  return move.damageClass === "physical"
    ? ({ attacker: "attack", defender: "defense" } as const)
    : ({ attacker: "special-attack", defender: "special-defense" } as const);
}

function hasPositiveNatureForStat(
  build: TrainingBuild,
  statId: AdjustableStatId,
  natures: Nature[],
) {
  const selectedNature = natures.find(({ id }) => id === build.nature);
  return (
    selectedNature?.increasedStatId === statId &&
    selectedNature.increasedStatId !== selectedNature.decreasedStatId
  );
}

export function createStatAdjustmentsFromBuild(
  build: TrainingBuild,
  natures: Nature[],
): Record<AdjustableStatId, StatAdjustment> {
  return Object.fromEntries(
    ADJUSTABLE_STAT_IDS.map((statId) => [
      statId,
      {
        point: build.abilityPoints[statId] ?? 0,
        rank: 0,
        nature: hasPositiveNatureForStat(build, statId, natures),
      },
    ]),
  ) as Record<AdjustableStatId, StatAdjustment>;
}

function toActualStats(
  pokemon: DamageCalculatorPokemon,
  build: TrainingBuild,
  natures: Nature[],
) {
  const selectedNature = natures.find(({ id }) => id === build.nature) ?? null;
  const hasNatureModifier = Boolean(
    selectedNature &&
      selectedNature.increasedStatId !== selectedNature.decreasedStatId,
  );

  return Object.fromEntries(
    STAT_IDS.map((id) => {
      const baseStat = pokemon.stats[id] ?? 1;
      const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
      const point = build.abilityPoints[id] ?? 0;
      if (id === "hp") return [id, baseStat === 1 ? 1 : base + 50 + 10 + point];
      const modifier =
        hasNatureModifier && selectedNature?.increasedStatId === id
          ? 1.1
          : hasNatureModifier && selectedNature?.decreasedStatId === id
            ? 0.9
            : 1;
      return [id, Math.floor((base + 5 + point) * modifier)];
    }),
  );
}

export function applyTrainingBuildToPokemon(
  pokemon: DamageCalculatorPokemon,
  build: TrainingBuild,
  natures: Nature[],
  heldItems: DamageCalculatorHeldItem[],
): DamageCalculatorPokemon {
  const learnedMoveIds = new Set(build.moveIds.filter(Boolean));
  const learnedDamageMoves =
    learnedMoveIds.size === 0
      ? []
      : pokemon.moves.filter((move) => learnedMoveIds.has(move.id));

  return {
    ...pokemon,
    nameJa: build.name || pokemon.nameJa,
    actualStats: toActualStats(pokemon, build, natures),
    heldItem: heldItems.find(({ id }) => id === build.itemId) ?? null,
    selectedAbility:
      pokemon.abilities.find(({ id }) => id === build.abilityId) ?? null,
    moves: learnedDamageMoves,
  };
}

export function usePokemonSelection() {
  const [pokemon, setPokemon] = useState<DamageCalculatorPokemon | null>(null);
  const [query, setQuery] = useState("");

  function select(nextPokemon: DamageCalculatorPokemon | null) {
    setPokemon(nextPokemon);
    setQuery(nextPokemon?.nameJa ?? "");
  }

  return { pokemon, query, setQuery, select };
}
