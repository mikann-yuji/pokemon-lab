"use client";

import { useState } from "react";
import type { TypeName } from "@/domain/type-matchup";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import type { Nature } from "@/features/training/infrastructure/training-catalog-repository";
import type { TrainingBuild } from "@/features/training/infrastructure/training-build-repository";

export type DamageSide = "attacker" | "defender";
export type UnknownSide = "attacker" | "defender";
export type StatId =
  | "hp"
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense";
export type NonHpStatId = Exclude<StatId, "hp">;
export type StatAdjustment = {
  point: number;
  rank: number;
  nature: boolean;
};
export type StatAdjustmentState = Record<
  DamageSide,
  Record<StatId, StatAdjustment>
>;
export type TeamSelectionState = Record<DamageSide, number | null>;
export type BuildSelectionState = Record<DamageSide, number | null>;
export type Candidate = {
  id: string;
  hpPoint: number | null;
  statPoint: number;
  statValue: number;
  hpValue: number;
  nature: boolean;
  rank: number;
  critical: boolean;
  minimum: number;
  maximum: number;
  minimumPercent: number;
  maximumPercent: number;
};

export const POINT_MIN = 0;
export const POINT_MAX = 32;
export const RANK_MIN = -6;
export const RANK_MAX = 6;
export const STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;
export const ADJUSTABLE_STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
] as const satisfies readonly StatId[];

export const STAT_LABELS: Record<NonHpStatId, string> = {
  attack: "こうげき",
  defense: "ぼうぎょ",
  "special-attack": "とくこう",
  "special-defense": "とくぼう",
};

export const BASE_STAT_LABELS: Record<(typeof STAT_IDS)[number], string> = {
  hp: "H",
  attack: "A",
  defense: "B",
  "special-attack": "C",
  "special-defense": "D",
  speed: "S",
};

export const TYPE_LABELS: Record<TypeName, string> = {
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

function createDefaultAdjustment(): StatAdjustment {
  return { point: 0, rank: 0, nature: false };
}

export function createDefaultAdjustmentState(): StatAdjustmentState {
  const createSide = () =>
    Object.fromEntries(
      ADJUSTABLE_STAT_IDS.map((statId) => [statId, createDefaultAdjustment()]),
    ) as Record<StatId, StatAdjustment>;
  return { attacker: createSide(), defender: createSide() };
}

export function calculateActualStat(
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

function createNeutralActualStats(pokemon: DamageCalculatorPokemon) {
  return Object.fromEntries(
    STAT_IDS.map((statId) => [statId, calculateActualStat(pokemon, statId)]),
  ) as Record<string, number>;
}

export function getRelevantStatIds(move: DamageCalculatorMove | null) {
  if (move?.damageClass === "physical") {
    return { attacker: "attack", defender: "defense" } as const;
  }
  return {
    attacker: "special-attack",
    defender: "special-defense",
  } as const;
}

export function applyBattleOptions({
  pokemon,
  heldItems,
  adjustments,
  relevantStat,
}: {
  pokemon: DamageCalculatorPokemon;
  heldItems: DamageCalculatorHeldItem[];
  adjustments: Record<StatId, StatAdjustment>;
  relevantStat: NonHpStatId;
}): DamageCalculatorPokemon {
  return {
    ...pokemon,
    actualStats: {
      ...createNeutralActualStats(pokemon),
      hp: calculateActualStat(pokemon, "hp", adjustments.hp.point),
      [relevantStat]: calculateActualStat(
        pokemon,
        relevantStat,
        adjustments[relevantStat].point,
        adjustments[relevantStat].nature,
      ),
    },
    boosts: { [relevantStat]: adjustments[relevantStat].rank },
    heldItem:
      heldItems.find((item) => item.id === pokemon.heldItem?.id) ?? null,
    selectedAbility: pokemon.selectedAbility ?? null,
  };
}

export function withCandidateAdjustment({
  pokemon,
  heldItems,
  baseAdjustments,
  statId,
  point,
  nature,
  rank,
  hpPoint,
}: {
  pokemon: DamageCalculatorPokemon;
  heldItems: DamageCalculatorHeldItem[];
  baseAdjustments: Record<StatId, StatAdjustment>;
  statId: NonHpStatId;
  point: number;
  nature: boolean;
  rank: number;
  hpPoint?: number;
}) {
  return applyBattleOptions({
    pokemon,
    heldItems,
    relevantStat: statId,
    adjustments: {
      ...baseAdjustments,
      hp:
        typeof hpPoint === "number"
          ? { ...baseAdjustments.hp, point: hpPoint }
          : baseAdjustments.hp,
      [statId]: { point, nature, rank },
    },
  });
}

function hasPositiveNatureForStat(
  build: TrainingBuild,
  statId: StatId,
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
): Record<StatId, StatAdjustment> {
  return Object.fromEntries(
    ADJUSTABLE_STAT_IDS.map((statId) => [
      statId,
      {
        point: build.abilityPoints[statId] ?? 0,
        rank: 0,
        nature: hasPositiveNatureForStat(build, statId, natures),
      },
    ]),
  ) as Record<StatId, StatAdjustment>;
}

export function applyTrainingBuildToPokemon(
  pokemon: DamageCalculatorPokemon,
  build: TrainingBuild,
  heldItems: DamageCalculatorHeldItem[],
) {
  const learnedMoveIds = new Set(build.moveIds.filter(Boolean));
  const learnedDamageMoves =
    learnedMoveIds.size === 0
      ? []
      : pokemon.moves.filter((move) => learnedMoveIds.has(move.id));

  return {
    ...pokemon,
    nameJa: build.name || pokemon.nameJa,
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

export function observedValueMatches({
  unknownSide,
  observedDamage,
  observedPercent,
  tolerance,
  candidate,
}: {
  unknownSide: UnknownSide;
  observedDamage: number;
  observedPercent: number;
  tolerance: number;
  candidate: Pick<
    Candidate,
    "minimum" | "maximum" | "minimumPercent" | "maximumPercent"
  >;
}) {
  if (unknownSide === "attacker") {
    return observedDamage >= candidate.minimum && observedDamage <= candidate.maximum;
  }
  return (
    observedPercent + tolerance >= candidate.minimumPercent &&
    observedPercent - tolerance <= candidate.maximumPercent
  );
}

export function formatRange(minimum: number, maximum: number, suffix = "") {
  return minimum === maximum
    ? `${minimum.toFixed(suffix ? 1 : 0)}${suffix}`
    : `${minimum.toFixed(suffix ? 1 : 0)}-${maximum.toFixed(suffix ? 1 : 0)}${suffix}`;
}

export function formatRank(rank: number) {
  return rank > 0 ? `+${rank}` : String(rank);
}

export function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function parseObservedInput(value: string) {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeObservedInput(value: string, maximum: number) {
  const parsed = parseObservedInput(value);
  return String(clampNumber(parsed, 0, maximum));
}
