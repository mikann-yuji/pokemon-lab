"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { championsDamageCalculator } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import {
  getDamageHistory,
  saveDamageHistory,
  type DamageHistoryRecord,
  type DamageHistorySide,
} from "../infrastructure/damage-history-repository";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  getNatures,
  type Nature,
} from "@/features/training/infrastructure/training-catalog-repository";
import type { TypeName } from "@/domain/type-matchup";
import { getTypeBadgeStyle } from "@/presentation/pokemon-type-colors";
import { PokemonCombobox } from "./pokemon-combobox";
import damageStyles from "../styles/damage-calculator.module.css";
import styles from "../styles/reverse-damage-calculator.module.css";

type DamageSide = "attacker" | "defender";
type UnknownSide = "attacker" | "defender";
type StatId =
  | "hp"
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense";
type NonHpStatId = Exclude<StatId, "hp">;
type StatAdjustment = {
  point: number;
  rank: number;
  nature: boolean;
};
type StatAdjustmentState = Record<
  DamageSide,
  Record<StatId, StatAdjustment>
>;
type TeamSelectionState = Record<DamageSide, number | null>;
type BuildSelectionState = Record<DamageSide, number | null>;
type Candidate = {
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

const POINT_MIN = 0;
const POINT_MAX = 32;
const RANK_MIN = -6;
const RANK_MAX = 6;
const STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;
const ADJUSTABLE_STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
] as const satisfies readonly StatId[];

const STAT_LABELS: Record<NonHpStatId, string> = {
  attack: "こうげき",
  defense: "ぼうぎょ",
  "special-attack": "とくこう",
  "special-defense": "とくぼう",
};

const BASE_STAT_LABELS: Record<(typeof STAT_IDS)[number], string> = {
  hp: "H",
  attack: "A",
  defense: "B",
  "special-attack": "C",
  "special-defense": "D",
  speed: "S",
};

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

const TYPE_EFFECTIVENESS: Record<
  TypeName,
  Partial<Record<TypeName, 0 | 0.5 | 2>>
> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

function createDefaultAdjustment(): StatAdjustment {
  return { point: 0, rank: 0, nature: false };
}

function createDefaultAdjustmentState(): StatAdjustmentState {
  const createSide = () =>
    Object.fromEntries(
      ADJUSTABLE_STAT_IDS.map((statId) => [statId, createDefaultAdjustment()]),
    ) as Record<StatId, StatAdjustment>;
  return { attacker: createSide(), defender: createSide() };
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

function createNeutralActualStats(pokemon: DamageCalculatorPokemon) {
  return Object.fromEntries(
    STAT_IDS.map((statId) => [statId, calculateActualStat(pokemon, statId)]),
  ) as Record<string, number>;
}

function getRelevantStatIds(move: DamageCalculatorMove | null) {
  if (move?.damageClass === "physical") {
    return { attacker: "attack", defender: "defense" } as const;
  }
  return {
    attacker: "special-attack",
    defender: "special-defense",
  } as const;
}

function applyBattleOptions({
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
    boosts: {
      [relevantStat]: adjustments[relevantStat].rank,
    },
    heldItem:
      heldItems.find((item) => item.id === pokemon.heldItem?.id) ?? null,
    selectedAbility: pokemon.selectedAbility ?? null,
  };
}

function withCandidateAdjustment({
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

function createStatAdjustmentsFromBuild(
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

function applyTrainingBuildToPokemon(
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

function usePokemonSelection() {
  const [pokemon, setPokemon] = useState<DamageCalculatorPokemon | null>(null);
  const [query, setQuery] = useState("");

  function select(nextPokemon: DamageCalculatorPokemon | null) {
    setPokemon(nextPokemon);
    setQuery(nextPokemon?.nameJa ?? "");
  }

  return { pokemon, query, setQuery, select };
}

function observedValueMatches({
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

function formatRange(minimum: number, maximum: number, suffix = "") {
  return minimum === maximum
    ? `${minimum.toFixed(suffix ? 1 : 0)}${suffix}`
    : `${minimum.toFixed(suffix ? 1 : 0)}-${maximum.toFixed(suffix ? 1 : 0)}${suffix}`;
}

function formatRank(rank: number) {
  return rank > 0 ? `+${rank}` : String(rank);
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseObservedInput(value: string) {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeObservedInput(value: string, maximum: number) {
  const parsed = parseObservedInput(value);
  return String(clampNumber(parsed, 0, maximum));
}

export function ReverseDamageCalculator({
  pokemonCatalog,
  heldItems,
  weathers,
  terrains,
}: {
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
}) {
  const attackerSelection = usePokemonSelection();
  const defenderSelection = usePokemonSelection();
  const attacker = attackerSelection.pokemon;
  const defender = defenderSelection.pokemon;
  const [unknownSide, setUnknownSide] = useState<UnknownSide>("attacker");
  const [observedDamage, setObservedDamage] = useState("100");
  const [observedPercent, setObservedPercent] = useState("50");
  const [percentTolerance, setPercentTolerance] = useState(0.1);
  const [moveId, setMoveId] = useState("");
  const [weatherId, setWeatherId] = useState("");
  const [terrainId, setTerrainId] = useState("");
  const [attackerHistory, setAttackerHistory] = useState<DamageHistoryRecord[]>([]);
  const [defenderHistory, setDefenderHistory] = useState<DamageHistoryRecord[]>([]);
  const [battleTeams, setBattleTeams] = useState<BattleTeam[]>([]);
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const [natures, setNatures] = useState<Nature[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<TeamSelectionState>({
    attacker: null,
    defender: null,
  });
  const [selectedBuildIds, setSelectedBuildIds] = useState<BuildSelectionState>({
    attacker: null,
    defender: null,
  });
  const [teamModalSide, setTeamModalSide] = useState<DamageSide | null>(null);
  const [teamLoadError, setTeamLoadError] = useState("");
  const [statAdjustments, setStatAdjustments] =
    useState<StatAdjustmentState>(createDefaultAdjustmentState);

  const selectedMove = attacker?.moves.find(({ id }) => id === moveId) ?? null;
  const observedDamageValue = parseObservedInput(observedDamage);
  const observedPercentValue = parseObservedInput(observedPercent);
  const relevantStatIds = getRelevantStatIds(selectedMove);
  const selectedWeather = weathers.find(({ id }) => id === weatherId) ?? null;
  const selectedTerrain = terrains.find(({ id }) => id === terrainId) ?? null;
  const fieldOptions = useMemo(
    () => ({
      ...(selectedWeather ? { weather: selectedWeather.smogonWeather } : {}),
      ...(selectedTerrain ? { terrain: selectedTerrain.smogonTerrain } : {}),
    }),
    [selectedTerrain, selectedWeather],
  );

  const buildById = useMemo(
    () =>
      new Map(
        trainingBuilds.flatMap((build) =>
          build.id === undefined ? [] : [[build.id, build] as const],
        ),
      ),
    [trainingBuilds],
  );
  const selectedTeams = useMemo(
    () => ({
      attacker:
        battleTeams.find((team) => team.id === selectedTeamIds.attacker) ??
        null,
      defender:
        battleTeams.find((team) => team.id === selectedTeamIds.defender) ??
        null,
    }),
    [battleTeams, selectedTeamIds],
  );
  const selectedTeamMembers = useMemo(() => {
    const toMembers = (team: BattleTeam | null) =>
      team?.buildIds
        .map((buildId) => buildById.get(buildId))
        .filter((build): build is TrainingBuild => Boolean(build))
        .flatMap((build) => {
          const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
          return pokemon ? [{ build, pokemon }] : [];
        }) ?? [];

    return {
      attacker: toMembers(selectedTeams.attacker),
      defender: toMembers(selectedTeams.defender),
    };
  }, [buildById, pokemonCatalog, selectedTeams]);

  useEffect(() => {
    let active = true;
    Promise.all([getDamageHistory("attacker"), getDamageHistory("defender")])
      .then(([savedAttackers, savedDefenders]) => {
        if (!active) return;
        setAttackerHistory(savedAttackers);
        setDefenderHistory(savedDefenders);
      })
      .catch((caught: unknown) => {
        console.error("Failed to load damage history.", caught);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([getAllBattleTeams(), getAllTrainingBuilds(), getNatures()])
      .then(([teams, builds, loadedNatures]) => {
        if (!active) return;
        setBattleTeams(teams);
        setTrainingBuilds(builds);
        setNatures(loadedNatures);
      })
      .catch((caught: unknown) => {
        console.error("Failed to load battle teams.", caught);
        if (active) setTeamLoadError("バトルチームを読み込めませんでした。");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!attacker || !defender || !selectedMove) return;

    let active = true;
    void Promise.all([
      saveDamageHistory("attacker", attacker.id, selectedMove.id),
      saveDamageHistory("defender", defender.id),
    ])
      .then(([savedAttackers, savedDefenders]) => {
        if (!active) return;
        setAttackerHistory(savedAttackers);
        setDefenderHistory(savedDefenders);
      })
      .catch((caught: unknown) => {
        console.error("Failed to save damage history.", caught);
      });

    return () => {
      active = false;
    };
  }, [attacker, defender, selectedMove]);

  function selectPokemon(side: DamageSide, pokemon: DamageCalculatorPokemon | null) {
    if (side === "attacker") {
      attackerSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, attacker: null }));
      setStatAdjustments((current) => ({
        ...current,
        attacker: createDefaultAdjustmentState().attacker,
      }));
      setMoveId("");
    } else {
      defenderSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, defender: null }));
      setStatAdjustments((current) => ({
        ...current,
        defender: createDefaultAdjustmentState().defender,
      }));
    }
  }

  function changeHeldItem(side: DamageSide, itemId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const item = heldItems.find(({ id }) => id === itemId) ?? null;
    selection.select(
      selection.pokemon ? { ...selection.pokemon, heldItem: item } : null,
    );
  }

  function changeAbility(side: DamageSide, abilityId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const ability =
      selection.pokemon?.abilities.find(({ id }) => id === abilityId) ?? null;
    selection.select(
      selection.pokemon
        ? { ...selection.pokemon, selectedAbility: ability }
        : null,
    );
  }

  function changeStatAdjustment(
    side: DamageSide,
    statId: StatId,
    values: Partial<StatAdjustment>,
  ) {
    setStatAdjustments((current) => ({
      ...current,
      [side]: {
        ...current[side],
        [statId]: {
          ...current[side][statId],
          ...values,
        },
      },
    }));
  }

  function selectBattleTeam(side: DamageSide, team: BattleTeam) {
    setSelectedTeamIds((current) => ({ ...current, [side]: team.id ?? null }));
    setTeamModalSide(null);
  }

  function selectTeamMember(side: DamageSide, build: TrainingBuild) {
    const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
    if (!pokemon) return;

    const trainedPokemon = applyTrainingBuildToPokemon(pokemon, build, heldItems);
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    selection.select(trainedPokemon);
    setSelectedBuildIds((current) => ({ ...current, [side]: build.id ?? null }));
    setStatAdjustments((current) => ({
      ...current,
      [side]: createStatAdjustmentsFromBuild(build, natures),
    }));
    if (side === "attacker") setMoveId(trainedPokemon.moves[0]?.id ?? "");
  }

  function restoreHistory(
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) {
    const pokemon =
      pokemonCatalog.find(({ id }) => id === history.pokemonId) ?? null;
    if (!pokemon) return;

    selectPokemon(side, pokemon);
    if (side === "attacker") {
      setMoveId(
        pokemon.moves.some(({ id }) => id === history.moveId)
          ? (history.moveId ?? "")
          : "",
      );
    }
  }

  function changeUnknownSide(nextSide: UnknownSide) {
    setUnknownSide(nextSide);
  }

  const candidates = useMemo(() => {
    if (!attacker || !defender || !selectedMove) return [];

    const rows: Candidate[] = [];
    const criticalOptions = [false, true];

    if (unknownSide === "attacker") {
      const knownDefender = applyBattleOptions({
        pokemon: defender,
        heldItems,
        relevantStat: relevantStatIds.defender,
        adjustments: statAdjustments.defender,
      });

      for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
        for (const nature of [false, true]) {
          for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
            const candidateAttacker = withCandidateAdjustment({
              pokemon: attacker,
              heldItems,
              baseAdjustments: statAdjustments.attacker,
              statId: relevantStatIds.attacker,
              point,
              nature,
              rank,
            });

            for (const critical of criticalOptions) {
              const result = championsDamageCalculator.calculate({
                attacker: candidateAttacker,
                defender: knownDefender,
                move: selectedMove,
                isCritical: critical,
                field: fieldOptions,
              });
              const candidate = {
                minimum: result.minimum,
                maximum: result.maximum,
                minimumPercent: result.minimumPercent,
                maximumPercent: result.maximumPercent,
              };
              if (
                observedValueMatches({
                  unknownSide,
                  observedDamage: observedDamageValue,
                  observedPercent: observedPercentValue,
                  tolerance: percentTolerance,
                  candidate,
                })
              ) {
                rows.push({
                  id: `a-${point}-${nature}-${rank}-${critical}`,
                  hpPoint: null,
                  statPoint: point,
                  statValue: calculateActualStat(
                    attacker,
                    relevantStatIds.attacker,
                    point,
                    nature,
                  ),
                  hpValue: calculateActualStat(attacker, "hp"),
                  nature,
                  rank,
                  critical,
                  ...candidate,
                });
              }
            }
          }
        }
      }
    } else {
      const knownAttacker = applyBattleOptions({
        pokemon: attacker,
        heldItems,
        relevantStat: relevantStatIds.attacker,
        adjustments: statAdjustments.attacker,
      });

      for (let hpPoint = POINT_MIN; hpPoint <= POINT_MAX; hpPoint += 1) {
        for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
          for (const nature of [false, true]) {
            for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
              const candidateDefender = withCandidateAdjustment({
                pokemon: defender,
                heldItems,
                baseAdjustments: statAdjustments.defender,
                statId: relevantStatIds.defender,
                point,
                nature,
                rank,
                hpPoint,
              });

              for (const critical of criticalOptions) {
                const result = championsDamageCalculator.calculate({
                  attacker: knownAttacker,
                  defender: candidateDefender,
                  move: selectedMove,
                  isCritical: critical,
                  field: fieldOptions,
                });
                const candidate = {
                  minimum: result.minimum,
                  maximum: result.maximum,
                  minimumPercent: result.minimumPercent,
                  maximumPercent: result.maximumPercent,
                };
                if (
                  observedValueMatches({
                    unknownSide,
                    observedDamage: observedDamageValue,
                    observedPercent: observedPercentValue,
                    tolerance: percentTolerance,
                    candidate,
                  })
                ) {
                  rows.push({
                    id: `d-${hpPoint}-${point}-${nature}-${rank}-${critical}`,
                    hpPoint,
                    statPoint: point,
                    statValue: calculateActualStat(
                      defender,
                      relevantStatIds.defender,
                      point,
                      nature,
                    ),
                    hpValue: calculateActualStat(defender, "hp", hpPoint),
                    nature,
                    rank,
                    critical,
                    ...candidate,
                  });
                }
              }
            }
          }
        }
      }
    }

    return rows.sort((a, b) => {
      if (a.critical !== b.critical) return Number(a.critical) - Number(b.critical);
      if ((a.hpPoint ?? -1) !== (b.hpPoint ?? -1)) return (a.hpPoint ?? -1) - (b.hpPoint ?? -1);
      if (a.statPoint !== b.statPoint) return a.statPoint - b.statPoint;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return Number(a.nature) - Number(b.nature);
    });
  }, [
    attacker,
    defender,
    fieldOptions,
    heldItems,
    observedDamageValue,
    observedPercentValue,
    percentTolerance,
    relevantStatIds.attacker,
    relevantStatIds.defender,
    selectedMove,
    statAdjustments.attacker,
    statAdjustments.defender,
    unknownSide,
  ]);

  const visibleCandidates = candidates.slice(0, 120);
  const unknownStatLabel =
    unknownSide === "attacker"
      ? STAT_LABELS[relevantStatIds.attacker]
      : STAT_LABELS[relevantStatIds.defender];

  return (
    <form
      className={`${damageStyles.calculator} ${styles.reverseCalculator}`}
      onSubmit={(event) => event.preventDefault()}
    >
      <section className={damageStyles.fieldConditions}>
        <div>
          <p>REVERSE LOOKUP</p>
          <h2>観測値</h2>
        </div>
        <div className={styles.reverseTarget}>
          <button
            type="button"
            aria-pressed={unknownSide === "attacker"}
            onClick={() => changeUnknownSide("attacker")}
          >
            攻撃側を逆引き
          </button>
          <button
            type="button"
            aria-pressed={unknownSide === "defender"}
            onClick={() => changeUnknownSide("defender")}
          >
            防御側を逆引き
          </button>
        </div>
        {unknownSide === "attacker" ? (
          <label>
            ダメージ量
            <input
              type="number"
              min="0"
              max="400"
              step="1"
              value={observedDamage}
              onChange={(event) =>
                setObservedDamage(event.target.value)
              }
              onBlur={() =>
                setObservedDamage((current) => normalizeObservedInput(current, 400))
              }
            />
          </label>
        ) : (
          <label>
            HP割合
            <div className={styles.percentControl}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={observedPercent}
                onChange={(event) =>
                  setObservedPercent(event.target.value)
                }
                onBlur={() =>
                  setObservedPercent((current) =>
                    normalizeObservedInput(current, 100),
                  )
                }
              />
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={clampNumber(observedPercentValue, 0, 100)}
                onChange={(event) =>
                  setObservedPercent(event.target.value)
                }
              />
            </div>
          </label>
        )}
        {unknownSide === "defender" ? (
          <label>
            許容誤差
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={percentTolerance}
              onChange={(event) =>
                setPercentTolerance(Math.max(0, Number(event.target.value)))
              }
            />
          </label>
        ) : null}
      </section>

      <section className={damageStyles.side}>
        <SideContent
          side="attacker"
          title="攻撃側"
          unknownSide={unknownSide}
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          selection={attackerSelection}
          history={attackerHistory}
          selectedTeam={selectedTeams.attacker}
          selectedTeamMembers={selectedTeamMembers.attacker}
          selectedBuildId={selectedBuildIds.attacker}
          teamLoadError={teamLoadError}
          statAdjustment={statAdjustments.attacker[relevantStatIds.attacker]}
          statLabel={STAT_LABELS[relevantStatIds.attacker]}
          showControls={unknownSide !== "attacker"}
          onOpenTeam={() => setTeamModalSide("attacker")}
          onSelectTeamMember={(build) => selectTeamMember("attacker", build)}
          onSelectPokemon={(pokemon) => selectPokemon("attacker", pokemon)}
          onRestore={restoreHistory}
          onAbilityChange={(abilityId) => changeAbility("attacker", abilityId)}
          onHeldItemChange={(itemId) => changeHeldItem("attacker", itemId)}
          onStatChange={(values) =>
            changeStatAdjustment("attacker", relevantStatIds.attacker, values)
          }
        >
          <MoveSelect
            label="使用する技"
            moves={attacker?.moves ?? []}
            defenderTypes={defender?.types ?? []}
            selectedMoveId={moveId}
            disabled={!attacker}
            onChange={setMoveId}
          />
          {selectedMove ? <MoveSummary move={selectedMove} /> : null}
        </SideContent>
      </section>

      <div className={damageStyles.versus}>
        <span>VS</span>
      </div>

      <section className={damageStyles.side}>
        <SideContent
          side="defender"
          title="防御側"
          unknownSide={unknownSide}
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          selection={defenderSelection}
          history={defenderHistory}
          selectedTeam={selectedTeams.defender}
          selectedTeamMembers={selectedTeamMembers.defender}
          selectedBuildId={selectedBuildIds.defender}
          teamLoadError={teamLoadError}
          statAdjustment={statAdjustments.defender[relevantStatIds.defender]}
          hpAdjustment={statAdjustments.defender.hp}
          statLabel={STAT_LABELS[relevantStatIds.defender]}
          showControls={unknownSide !== "defender"}
          onOpenTeam={() => setTeamModalSide("defender")}
          onSelectTeamMember={(build) => selectTeamMember("defender", build)}
          onSelectPokemon={(pokemon) => selectPokemon("defender", pokemon)}
          onRestore={restoreHistory}
          onAbilityChange={(abilityId) => changeAbility("defender", abilityId)}
          onHeldItemChange={(itemId) => changeHeldItem("defender", itemId)}
          onStatChange={(values) =>
            changeStatAdjustment("defender", relevantStatIds.defender, values)
          }
          onHpChange={(values) => changeStatAdjustment("defender", "hp", values)}
        />
      </section>

      <section className={damageStyles.fieldConditions}>
        <div>
          <p>FIELD</p>
          <h2>場の条件</h2>
        </div>
        <label>
          天候
          <select
            value={weatherId}
            onChange={(event) => setWeatherId(event.target.value)}
          >
            <option value="">なし</option>
            {weathers.map((weather) => (
              <option value={weather.id} key={weather.id}>
                {weather.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          フィールド
          <select
            value={terrainId}
            onChange={(event) => setTerrainId(event.target.value)}
          >
            <option value="">なし</option>
            {terrains.map((terrain) => (
              <option value={terrain.id} key={terrain.id}>
                {terrain.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={`${damageStyles.result} ${styles.reverseResult}`} aria-live="polite">
        <div className={damageStyles.resultHeader}>
          <strong>
            {selectedMove
              ? `${unknownStatLabel}候補 ${candidates.length}件`
              : "条件を入力してください"}
          </strong>
          {candidates.length > visibleCandidates.length ? (
            <span className={damageStyles.resultMove}>
              先頭 {visibleCandidates.length} 件
            </span>
          ) : null}
        </div>
        {!attacker || !defender || !selectedMove ? (
          <p className={styles.resultNotice}>
            攻撃側、防御側、技、観測値を入れると候補を表示します。
          </p>
        ) : visibleCandidates.length === 0 ? (
          <p className={styles.resultNotice}>
            一致する候補がありません。急所、持ち物、特性、天候、割合の誤差を確認してください。
          </p>
        ) : (
          <ReverseResultTable
            unknownSide={unknownSide}
            unknownStatLabel={unknownStatLabel}
            candidates={visibleCandidates}
          />
        )}
      </section>

      {teamModalSide ? (
        <BattleTeamModal
          teams={battleTeams}
          selectedTeamId={selectedTeamIds[teamModalSide]}
          onSelect={(team) => selectBattleTeam(teamModalSide, team)}
          onClose={() => setTeamModalSide(null)}
        />
      ) : null}
    </form>
  );
}

function SideContent({
  side,
  title,
  unknownSide,
  pokemonCatalog,
  heldItems,
  selection,
  history,
  selectedTeam,
  selectedTeamMembers,
  selectedBuildId,
  teamLoadError,
  statAdjustment,
  hpAdjustment,
  statLabel,
  showControls,
  children,
  onOpenTeam,
  onSelectTeamMember,
  onSelectPokemon,
  onRestore,
  onAbilityChange,
  onHeldItemChange,
  onStatChange,
  onHpChange,
}: {
  side: DamageSide;
  title: string;
  unknownSide: UnknownSide;
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  selection: ReturnType<typeof usePokemonSelection>;
  history: DamageHistoryRecord[];
  selectedTeam: BattleTeam | null;
  selectedTeamMembers: { build: TrainingBuild; pokemon: DamageCalculatorPokemon }[];
  selectedBuildId: number | null;
  teamLoadError: string;
  statAdjustment: StatAdjustment;
  hpAdjustment?: StatAdjustment;
  statLabel: string;
  showControls: boolean;
  children?: React.ReactNode;
  onOpenTeam: () => void;
  onSelectTeamMember: (build: TrainingBuild) => void;
  onSelectPokemon: (pokemon: DamageCalculatorPokemon | null) => void;
  onRestore: (side: DamageHistorySide, history: DamageHistoryRecord) => void;
  onAbilityChange: (abilityId: string) => void;
  onHeldItemChange: (itemId: string) => void;
  onStatChange: (values: Partial<StatAdjustment>) => void;
  onHpChange?: (values: Partial<StatAdjustment>) => void;
}) {
  const pokemon = selection.pokemon;
  return (
    <>
      <h2>{title}</h2>
      <div className={damageStyles.teamPicker}>
        <button type="button" onClick={onOpenTeam}>
          バトルチームを選択
        </button>
        <span>{selectedTeam?.name ?? "未選択"}</span>
      </div>
      {teamLoadError ? (
        <p className={damageStyles.teamError} role="alert">
          {teamLoadError}
        </p>
      ) : null}
      {selectedTeamMembers.length > 0 ? (
        <div className={damageStyles.teamPokemon}>
          {selectedTeamMembers.map(({ build, pokemon: member }) => (
            <button
              type="button"
              title={`${build.name || member.nameJa}を反映`}
              aria-label={`${build.name || member.nameJa}を反映`}
              onClick={() => onSelectTeamMember(build)}
              key={build.id}
            >
              {member.imageUrl ? (
                <PokemonImage pokemon={member} alt="" size={48} preferFallback />
              ) : (
                <SmallPokemonName name={member.nameJa} />
              )}
            </button>
          ))}
        </div>
      ) : null}
      <PokemonCombobox
        id={`reverse-${side}`}
        label={`${title}ポケモン`}
        pokemonCatalog={pokemonCatalog}
        selectedPokemon={pokemon}
        inputValue={selection.query}
        onInputValueChange={selection.setQuery}
        onSelect={onSelectPokemon}
      />
      <RecentPokemonList
        side={side}
        history={history}
        pokemonCatalog={pokemonCatalog}
        onRestore={onRestore}
      />
      <PokemonSummary pokemon={pokemon} />
      <AbilityField pokemon={pokemon} onAbilityChange={onAbilityChange} />
      <HeldItemField
        pokemon={pokemon}
        heldItems={heldItems}
        onChange={onHeldItemChange}
      />
      {children}
      {showControls ? (
        <>
          {side === "defender" && hpAdjustment ? (
            <DamageStatControls
              title={`${title}のHP`}
              statLabel="HP"
              value={hpAdjustment}
              showRank={false}
              showNature={false}
              onChange={onHpChange ?? (() => undefined)}
            />
          ) : null}
          <DamageStatControls
            title={`${title}の補正`}
            statLabel={statLabel}
            value={statAdjustment}
            onChange={onStatChange}
          />
        </>
      ) : (
        <p className={styles.unknownHint}>
          {unknownSide === "attacker" && side === "attacker"
            ? "この攻撃側の能力ポイントを逆引きします。"
            : "この防御側のHPと防御能力ポイントを逆引きします。"}
        </p>
      )}
      {selectedBuildId ? null : null}
    </>
  );
}

function BattleTeamModal({
  teams,
  selectedTeamId,
  onSelect,
  onClose,
}: {
  teams: BattleTeam[];
  selectedTeamId: number | null;
  onSelect: (team: BattleTeam) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={damageStyles.teamModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reverse-battle-team-modal-title"
    >
      <button
        className={damageStyles.teamModalBackdrop}
        type="button"
        aria-label="バトルチーム一覧を閉じる"
        onClick={onClose}
      />
      <section className={damageStyles.teamModalPanel}>
        <div className={damageStyles.teamModalHeader}>
          <div>
            <p>BATTLE TEAMS</p>
            <h2 id="reverse-battle-team-modal-title">バトルチーム一覧</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {teams.length === 0 ? (
          <p className={damageStyles.teamModalEmpty}>
            保存したバトルチームはありません。
          </p>
        ) : (
          <div className={damageStyles.teamModalList}>
            {teams.map((team) => (
              <button
                className={
                  team.id === selectedTeamId ? damageStyles.selectedTeamButton : ""
                }
                type="button"
                onClick={() => onSelect(team)}
                key={team.id}
              >
                <strong>{team.name}</strong>
                <small>{team.buildIds.length}体</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RecentPokemonList({
  side,
  history,
  pokemonCatalog,
  onRestore,
}: {
  side: DamageHistorySide;
  history: DamageHistoryRecord[];
  pokemonCatalog: DamageCalculatorPokemon[];
  onRestore: (side: DamageHistorySide, history: DamageHistoryRecord) => void;
}) {
  const availableHistory = history.flatMap((record) => {
    const pokemon = pokemonCatalog.find(({ id }) => id === record.pokemonId);
    return pokemon ? [{ record, pokemon }] : [];
  });

  if (availableHistory.length === 0) return null;

  return (
    <div className={damageStyles.recentPokemon}>
      <small>最近使ったポケモン</small>
      <div className={damageStyles.recentPokemonList}>
        {availableHistory.map(({ record, pokemon }) => (
          <button
            type="button"
            title={`${pokemon.nameJa}を選択`}
            aria-label={`${pokemon.nameJa}を選択`}
            onClick={() => onRestore(side, record)}
            key={record.id}
          >
            {pokemon.imageUrl ? (
              <PokemonImage pokemon={pokemon} alt="" size={48} preferFallback />
            ) : (
              <SmallPokemonName name={pokemon.nameJa} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function SmallPokemonName({ name }: { name: string }) {
  return <span className={damageStyles.smallPokemonName}>{name}</span>;
}

function PokemonImage({
  pokemon,
  size,
  alt,
  preferFallback = false,
}: {
  pokemon: DamageCalculatorPokemon;
  size: number;
  alt: string;
  preferFallback?: boolean;
}) {
  const primaryUrl =
    preferFallback && pokemon.fallbackImageUrl
      ? pokemon.fallbackImageUrl
      : pokemon.imageUrl;
  const fallbackUrl =
    primaryUrl === pokemon.fallbackImageUrl
      ? pokemon.imageUrl
      : pokemon.fallbackImageUrl;
  const [failedPrimaryUrl, setFailedPrimaryUrl] = useState<string | null>(null);
  const src =
    primaryUrl && failedPrimaryUrl === primaryUrl && fallbackUrl
      ? fallbackUrl
      : primaryUrl;

  if (!src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="" alt={alt} width={size} height={size} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => {
        if (primaryUrl && fallbackUrl && src === primaryUrl) {
          setFailedPrimaryUrl(primaryUrl);
        }
      }}
    />
  );
}

function PokemonSummary({ pokemon }: { pokemon: DamageCalculatorPokemon | null }) {
  if (!pokemon) {
    return <div className={damageStyles.placeholder}>ポケモンを選択</div>;
  }

  return (
    <div className={damageStyles.pokemonSummary}>
      <div className={damageStyles.pokemonArtwork}>
        {pokemon.imageUrl ? (
          <PokemonImage pokemon={pokemon} alt={pokemon.nameJa} size={112} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="" alt={pokemon.nameJa} width={112} height={112} />
        )}
      </div>
      <div className={damageStyles.pokemonSummaryBody}>
        <div>
          <strong>{pokemon.nameJa}</strong>
          <small>{pokemon.name}</small>
        </div>
        <div className={damageStyles.typeBadges} aria-label={`${pokemon.nameJa}のタイプ`}>
          {pokemon.types.map((typeName) => (
            <TypeBadge typeName={typeName} key={typeName} />
          ))}
        </div>
        <dl className={damageStyles.baseStats}>
          {STAT_IDS.map((statId) => (
            <div key={statId}>
              <dt>{BASE_STAT_LABELS[statId]}</dt>
              <dd>{pokemon.stats[statId] ?? "-"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function TypeBadge({
  typeName,
}: {
  typeName: DamageCalculatorPokemon["types"][number];
}) {
  return (
    <span className={damageStyles.typeBadge} style={getTypeBadgeStyle(typeName)}>
      {TYPE_LABELS[typeName]}
    </span>
  );
}

function formatItemModifier(item: DamageCalculatorHeldItem) {
  const modifier = item.damageModifier;
  return modifier ? ` x${modifier.multiplier}` : "";
}

function formatMoveUsageRate(move: DamageCalculatorMove) {
  return move.usageRate === null ? "" : ` / 採用率 ${move.usageRate.toFixed(1)}%`;
}

function formatMovePower(move: DamageCalculatorMove) {
  return move.power > 0 ? String(move.power) : "変動";
}

function formatMoveAccuracy(move: DamageCalculatorMove) {
  return move.accuracy === null ? "必中" : `${move.accuracy}`;
}

function getTypeEffectiveness(
  moveType: TypeName,
  defenderTypes: DamageCalculatorPokemon["types"],
) {
  return defenderTypes.reduce(
    (multiplier, defenderType) =>
      multiplier * (TYPE_EFFECTIVENESS[moveType][defenderType] ?? 1),
    1,
  );
}

function getEffectivenessLabel(effectiveness: number) {
  if (effectiveness >= 4) return "かなりばつぐん";
  if (effectiveness === 2) return "ばつぐん";
  if (effectiveness === 0.5) return "いまひとつ";
  if (effectiveness > 0 && effectiveness <= 0.25) return "かなりいまひとつ";
  if (effectiveness === 0) return "効果なし";
  return "";
}

function MoveEffectivenessBadge({ effectiveness }: { effectiveness: number }) {
  const label = getEffectivenessLabel(effectiveness);
  if (!label) return null;

  return (
    <span
      className={`${damageStyles.effectivenessBadge} ${
        effectiveness >= 2
          ? damageStyles.effectivenessStrong
          : effectiveness === 0
            ? damageStyles.effectivenessNone
            : damageStyles.effectivenessWeak
      }`}
    >
      {label}
    </span>
  );
}

function MoveOptionContent({
  move,
  defenderTypes,
}: {
  move: DamageCalculatorMove;
  defenderTypes: DamageCalculatorPokemon["types"];
}) {
  const effectiveness =
    defenderTypes.length === 0
      ? 1
      : getTypeEffectiveness(move.typeName, defenderTypes);

  return (
    <span className={damageStyles.moveOptionContent}>
      <TypeBadge typeName={move.typeName} />
      <strong>{move.name}</strong>
      <MoveEffectivenessBadge effectiveness={effectiveness} />
      <small>
        威力 {formatMovePower(move)}
        {" / "}命中 {formatMoveAccuracy(move)}
        {formatMoveUsageRate(move)}
      </small>
      {move.description ? (
        <span className={damageStyles.moveDescription}>{move.description}</span>
      ) : null}
    </span>
  );
}

function MoveSelect({
  label,
  moves,
  defenderTypes,
  selectedMoveId,
  disabled,
  onChange,
}: {
  label: string;
  moves: DamageCalculatorMove[];
  defenderTypes: DamageCalculatorPokemon["types"];
  selectedMoveId: string;
  disabled: boolean;
  onChange: (moveId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedMove = moves.find((move) => move.id === selectedMoveId) ?? null;

  function selectMove(moveId: string) {
    onChange(moveId);
    setOpen(false);
  }

  return (
    <div className={damageStyles.moveSelectField}>
      <span>{label}</span>
      <div
        className={damageStyles.moveSelect}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={damageStyles.moveSelectButton}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {selectedMove ? (
            <MoveOptionContent move={selectedMove} defenderTypes={defenderTypes} />
          ) : (
            <span className={damageStyles.movePlaceholder}>技を選択</span>
          )}
        </button>
        {open && !disabled ? (
          <div className={damageStyles.moveOptions} role="listbox" aria-label={label}>
            <button
              type="button"
              role="option"
              aria-selected={selectedMoveId === ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMove("")}
            >
              <span className={damageStyles.movePlaceholder}>技を選択</span>
            </button>
            {moves.map((move) => (
              <button
                type="button"
                role="option"
                aria-selected={move.id === selectedMoveId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMove(move.id)}
                key={move.id}
              >
                <MoveOptionContent move={move} defenderTypes={defenderTypes} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MoveSummary({ move }: { move: DamageCalculatorMove }) {
  return (
    <p className={damageStyles.moveSummary}>
      {TYPE_LABELS[move.typeName]} / {move.damageClass === "physical" ? "物理" : "特殊"} /
      威力 {formatMovePower(move)} / 命中 {formatMoveAccuracy(move)}
    </p>
  );
}

function AbilityField({
  pokemon,
  onAbilityChange,
}: {
  pokemon: DamageCalculatorPokemon | null;
  onAbilityChange: (abilityId: string) => void;
}) {
  return (
    <label className={damageStyles.moveField}>
      特性
      <select
        value={pokemon?.selectedAbility?.id ?? ""}
        disabled={!pokemon}
        onChange={(event) => onAbilityChange(event.target.value)}
      >
        <option value="">なし</option>
        {pokemon?.abilities.map((ability: DamageCalculatorAbility) => (
          <option value={ability.id} key={ability.id}>
            {ability.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function HeldItemField({
  pokemon,
  heldItems,
  onChange,
}: {
  pokemon: DamageCalculatorPokemon | null;
  heldItems: DamageCalculatorHeldItem[];
  onChange: (itemId: string) => void;
}) {
  return (
    <label className={damageStyles.moveField}>
      持ち物
      <select
        value={pokemon?.heldItem?.id ?? ""}
        disabled={!pokemon}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">なし</option>
        {heldItems.map((item) => (
          <option value={item.id} key={item.id}>
            {item.name}
            {formatItemModifier(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DamageStatControls({
  title,
  statLabel,
  value,
  showRank = true,
  showNature = true,
  onChange,
}: {
  title: string;
  statLabel: string;
  value: StatAdjustment;
  showRank?: boolean;
  showNature?: boolean;
  onChange: (values: Partial<StatAdjustment>) => void;
}) {
  const changePoint = (point: number) => {
    onChange({ point: Math.min(POINT_MAX, Math.max(POINT_MIN, Math.trunc(point))) });
  };
  const changeRank = (rank: number) => {
    onChange({ rank: Math.min(RANK_MAX, Math.max(RANK_MIN, Math.trunc(rank))) });
  };

  return (
    <div className={damageStyles.statControls}>
      <div className={damageStyles.statControlsHeader}>
        <strong>{title}</strong>
        <span>{statLabel}</span>
      </div>
      <label>
        能力ポイント
        <div className={damageStyles.pointControl}>
          <input
            type="number"
            min={POINT_MIN}
            max={POINT_MAX}
            value={value.point}
            onChange={(event) => changePoint(Number(event.target.value))}
          />
          <button type="button" onClick={() => changePoint(POINT_MAX)}>
            32
          </button>
        </div>
        <input
          type="range"
          min={POINT_MIN}
          max={POINT_MAX}
          step="1"
          value={value.point}
          onChange={(event) => changePoint(Number(event.target.value))}
        />
      </label>
      {showRank ? (
        <label>
          能力ランク
          <div className={damageStyles.rankStepper}>
            <button type="button" onClick={() => changeRank(value.rank - 1)}>
              -
            </button>
            <span className={damageStyles.rankValue}>{formatRank(value.rank)}</span>
            <button type="button" onClick={() => changeRank(value.rank + 1)}>
              +
            </button>
          </div>
          <input
            type="range"
            min={RANK_MIN}
            max={RANK_MAX}
            step="1"
            value={value.rank}
            onChange={(event) => changeRank(Number(event.target.value))}
          />
        </label>
      ) : null}
      {showNature ? (
        <label className={damageStyles.natureToggle}>
          <input
            type="checkbox"
            checked={value.nature}
            onChange={(event) => onChange({ nature: event.target.checked })}
          />
          性格補正あり
        </label>
      ) : null}
    </div>
  );
}

function ReverseResultTable({
  unknownSide,
  unknownStatLabel,
  candidates,
}: {
  unknownSide: UnknownSide;
  unknownStatLabel: string;
  candidates: Candidate[];
}) {
  return (
    <div className={styles.resultTable}>
      <div
        className={`${styles.resultHead} ${
          unknownSide === "attacker" ? styles.fiveColumns : ""
        }`}
      >
        {unknownSide === "defender" ? <span>HP</span> : null}
        <span>{unknownStatLabel}</span>
        <span>補正</span>
        <span>ランク</span>
        <span>判定</span>
        <span>ダメージ</span>
      </div>
      {candidates.map((candidate) => (
        <div
          className={`${styles.resultRow} ${
            unknownSide === "attacker" ? styles.fiveColumns : ""
          }`}
          key={candidate.id}
        >
          {unknownSide === "defender" ? (
            <span>
              {candidate.hpPoint}pt
              <small>実数値 {candidate.hpValue}</small>
            </span>
          ) : null}
          <span>
            {candidate.statPoint}pt
            <small>実数値 {candidate.statValue}</small>
          </span>
          <span>{candidate.nature ? "あり" : "なし"}</span>
          <span>{formatRank(candidate.rank)}</span>
          <span>{candidate.critical ? "急所" : "通常"}</span>
          <span>
            {formatRange(candidate.minimum, candidate.maximum)}
            <small>
              {formatRange(candidate.minimumPercent, candidate.maximumPercent, "%")}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}
