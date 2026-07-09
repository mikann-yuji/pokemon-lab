"use client";

/**
 * このファイルの役割:
 * ダメージ計算ページの入力状態を管理し、検索欄・技選択・計算結果を組み立てる。
 *
 * 実際の計算式やDBアクセスはこのコンポーネントへ書かず、
 * application層の計算機と、Server Componentから渡されたカタログを利用する。
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CHAMPIONS_DAMAGE_RULESET,
  championsDamageCalculator,
} from "../config/champions-damage-ruleset";
import type { DamageCalculation } from "../application/smogon-damage-calculator";
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import { PokemonCombobox } from "./pokemon-combobox";
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
import styles from "../styles/damage-calculator.module.css";

type CalculationResult = {
  /** 通常ヒット時のダメージ範囲。 */
  normal: DamageCalculation;
  /** 急所ヒット時のダメージ範囲。通常結果と並べて比較表示する。 */
  critical: DamageCalculation;
  attackerName: string;
  defenderName: string;
  moveName: string;
  moveEffectiveness: number;
};

const STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;

type AdjustableStatId =
  | "hp"
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense";
type DamageSide = "attacker" | "defender";
type StatAdjustment = {
  point: number;
  rank: number;
  nature: boolean;
};
type StatAdjustmentState = Record<
  DamageSide,
  Record<AdjustableStatId, StatAdjustment>
>;
type TeamSelectionState = Record<DamageSide, number | null>;
type BuildSelectionState = Record<DamageSide, number | null>;
type SpeedComparisonRow = {
  id: string;
  label: string;
  attacker: number | null;
  defender: number | null;
};

const STAT_LABELS: Record<AdjustableStatId, string> = {
  hp: "HP",
  attack: "こうげき",
  defense: "ぼうぎょ",
  "special-attack": "とくこう",
  "special-defense": "とくぼう",
};

const ADJUSTABLE_STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
] as const satisfies readonly AdjustableStatId[];

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
  Fire: {
    Fire: 0.5,
    Water: 0.5,
    Grass: 2,
    Ice: 2,
    Bug: 2,
    Rock: 0.5,
    Dragon: 0.5,
    Steel: 2,
  },
  Water: {
    Fire: 2,
    Water: 0.5,
    Grass: 0.5,
    Ground: 2,
    Rock: 2,
    Dragon: 0.5,
  },
  Electric: {
    Water: 2,
    Electric: 0.5,
    Grass: 0.5,
    Ground: 0,
    Flying: 2,
    Dragon: 0.5,
  },
  Grass: {
    Fire: 0.5,
    Water: 2,
    Grass: 0.5,
    Poison: 0.5,
    Ground: 2,
    Flying: 0.5,
    Bug: 0.5,
    Rock: 2,
    Dragon: 0.5,
    Steel: 0.5,
  },
  Ice: {
    Fire: 0.5,
    Water: 0.5,
    Grass: 2,
    Ice: 0.5,
    Ground: 2,
    Flying: 2,
    Dragon: 2,
    Steel: 0.5,
  },
  Fighting: {
    Normal: 2,
    Ice: 2,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 0.5,
    Bug: 0.5,
    Rock: 2,
    Ghost: 0,
    Dark: 2,
    Steel: 2,
    Fairy: 0.5,
  },
  Poison: {
    Grass: 2,
    Poison: 0.5,
    Ground: 0.5,
    Rock: 0.5,
    Ghost: 0.5,
    Steel: 0,
    Fairy: 2,
  },
  Ground: {
    Fire: 2,
    Electric: 2,
    Grass: 0.5,
    Poison: 2,
    Flying: 0,
    Bug: 0.5,
    Rock: 2,
    Steel: 2,
  },
  Flying: {
    Electric: 0.5,
    Grass: 2,
    Fighting: 2,
    Bug: 2,
    Rock: 0.5,
    Steel: 0.5,
  },
  Psychic: {
    Fighting: 2,
    Poison: 2,
    Psychic: 0.5,
    Dark: 0,
    Steel: 0.5,
  },
  Bug: {
    Fire: 0.5,
    Grass: 2,
    Fighting: 0.5,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 2,
    Ghost: 0.5,
    Dark: 2,
    Steel: 0.5,
    Fairy: 0.5,
  },
  Rock: {
    Fire: 2,
    Ice: 2,
    Fighting: 0.5,
    Ground: 0.5,
    Flying: 2,
    Bug: 2,
    Steel: 0.5,
  },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: {
    Fire: 0.5,
    Water: 0.5,
    Electric: 0.5,
    Ice: 2,
    Rock: 2,
    Steel: 0.5,
    Fairy: 2,
  },
  Fairy: {
    Fire: 0.5,
    Fighting: 2,
    Poison: 0.5,
    Dragon: 2,
    Dark: 2,
    Steel: 0.5,
  },
};

function createDefaultAdjustment(): StatAdjustment {
  return { point: 0, rank: 0, nature: false };
}

function createDefaultAdjustmentState(): StatAdjustmentState {
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

function createSpeedComparisonRows(
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

function applyStatAdjustment(
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
        : {
            ...pokemon.boosts,
            [statId]: adjustment.rank,
          },
  };
}

function applyHeldItem(
  pokemon: DamageCalculatorPokemon | null,
  item: DamageCalculatorHeldItem | null,
): DamageCalculatorPokemon | null {
  return pokemon ? { ...pokemon, heldItem: item } : pokemon;
}

function applyAbility(
  pokemon: DamageCalculatorPokemon | null,
  ability: DamageCalculatorAbility | null,
): DamageCalculatorPokemon | null {
  return pokemon ? { ...pokemon, selectedAbility: ability } : pokemon;
}

function getRelevantStatIds(move: DamageCalculatorMove | undefined) {
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

function createStatAdjustmentsFromBuild(
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

const DEFAULT_NATURE: Nature = {
  id: "serious",
  name: "まじめ",
  increasedStatId: "attack",
  decreasedStatId: "attack",
};

function toActualStats(
  pokemon: DamageCalculatorPokemon,
  build: TrainingBuild,
  natures: Nature[],
) {
  const selectedNature =
    natures.find(({ id }) => id === build.nature) ??
    natures.find(({ id }) => id === "serious") ??
    DEFAULT_NATURE;
  const hasNatureModifier =
    selectedNature.increasedStatId !== selectedNature.decreasedStatId;

  return Object.fromEntries(
    STAT_IDS.map((id) => {
      const baseStat = pokemon.stats[id] ?? 1;
      const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
      const point = build.abilityPoints[id] ?? 0;
      if (id === "hp") {
        return [id, baseStat === 1 ? 1 : base + 50 + 10 + point];
      }
      const modifier =
        hasNatureModifier && selectedNature.increasedStatId === id
          ? 1.1
          : hasNatureModifier && selectedNature.decreasedStatId === id
            ? 0.9
            : 1;
      return [id, Math.floor((base + 5 + point) * modifier)];
    }),
  );
}

function applyTrainingBuildToPokemon(
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

/**
 * ポケモン選択欄1つ分の状態をまとめる小さなhook。
 * 選択済みポケモンと入力中テキストを常に同期させる。
 */
function usePokemonSelection() {
  const [pokemon, setPokemon] = useState<DamageCalculatorPokemon | null>(null);
  const [query, setQuery] = useState("");

  function select(nextPokemon: DamageCalculatorPokemon | null) {
    setPokemon(nextPokemon);
    setQuery(nextPokemon?.nameJa ?? "");
  }

  return { pokemon, query, setQuery, select };
}

/**
 * ダメージ計算画面の本体。
 *
 * pokemonCatalogはページ生成時にSQLiteから読み込まれている。
 * ブラウザ内では通信せず、この配列だけで検索・技選択・計算を完結させる。
 */
export function DamageCalculator({
  pokemonCatalog,
  heldItems,
  weathers,
  terrains,
}: {
  /** Server Component側でcatalog.dbから読み込んだ、計算対象ポケモンの全データ。 */
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
}) {
  const attackerSelection = usePokemonSelection();
  const defenderSelection = usePokemonSelection();
  const attacker = attackerSelection.pokemon;
  const defender = defenderSelection.pokemon;
  const [moveId, setMoveId] = useState("");
  const [weatherId, setWeatherId] = useState("");
  const [terrainId, setTerrainId] = useState("");
  const [attackerHistory, setAttackerHistory] = useState<
    DamageHistoryRecord[]
  >([]);
  const [defenderHistory, setDefenderHistory] = useState<
    DamageHistoryRecord[]
  >([]);
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
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState("");
  const [metronomeConsecutiveUseCount, setMetronomeConsecutiveUseCount] =
    useState(1);
  const [abilityConditionEnabled, setAbilityConditionEnabled] = useState({
    attacker: false,
    defender: false,
  });
  const [statAdjustments, setStatAdjustments] =
    useState<StatAdjustmentState>(() => createDefaultAdjustmentState());
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
          const pokemon = pokemonCatalog.find(
            ({ id }) => id === build.pokemonId,
          );
          return pokemon ? [{ build, pokemon }] : [];
        }) ?? [];

    return {
      attacker: toMembers(selectedTeams.attacker),
      defender: toMembers(selectedTeams.defender),
    };
  }, [buildById, pokemonCatalog, selectedTeams]);
  const getTrainingDetailHref = (
    pokemon: DamageCalculatorPokemon | null,
    buildId: number | null,
  ) => {
    if (!pokemon) return undefined;
    const linkedBuildId =
      buildId ??
      trainingBuilds.find((build) => build.pokemonId === pokemon.id)?.id ??
      null;
    return linkedBuildId
      ? `/training/${pokemon.id}?build=${linkedBuildId}`
      : `/training/${pokemon.id}`;
  };

  // user.dbはブラウザ専用なので、初回表示後に最近使った履歴を読み込む。
  useEffect(() => {
    let active = true;

    Promise.all([
      getDamageHistory("attacker"),
      getDamageHistory("defender"),
    ])
      .then(([savedAttackers, savedDefenders]) => {
        if (!active) return;
        setAttackerHistory(savedAttackers);
        setDefenderHistory(savedDefenders);
      })
      .catch((caught: unknown) => {
        console.error("ダメージ計算履歴を読み込めませんでした。", caught);
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
        console.error("バトルチームを読み込めませんでした。", caught);
        if (active) {
          setTeamLoadError("バトルチームを読み込めませんでした。");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // 攻撃側を変更したら、前のポケモンの技や計算結果を残さない。
  function selectAttacker(pokemon: DamageCalculatorPokemon | null) {
    attackerSelection.select(pokemon);
    setSelectedBuildIds((current) => ({ ...current, attacker: null }));
    setStatAdjustments((current) => ({
      ...current,
      attacker: createDefaultAdjustmentState().attacker,
    }));
    setAbilityConditionEnabled((current) => ({ ...current, attacker: false }));
    setMetronomeConsecutiveUseCount(1);
    setMoveId("");
  }

  // 防御側を変更した場合も、古い相手に対する結果を消す。
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    defenderSelection.select(pokemon);
    setSelectedBuildIds((current) => ({ ...current, defender: null }));
    setStatAdjustments((current) => ({
      ...current,
      defender: createDefaultAdjustmentState().defender,
    }));
    setAbilityConditionEnabled((current) => ({ ...current, defender: false }));
  }

  function changeHeldItem(side: DamageSide, itemId: string) {
    const item = heldItems.find(({ id }) => id === itemId) ?? null;
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    selection.select(applyHeldItem(selection.pokemon, item));
    if (side === "attacker" && item?.id !== "metronome") {
      setMetronomeConsecutiveUseCount(1);
    }
  }

  function changeAbility(side: DamageSide, abilityId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const ability =
      selection.pokemon?.abilities.find(({ id }) => id === abilityId) ?? null;
    selection.select(applyAbility(selection.pokemon, ability));
    setAbilityConditionEnabled((current) => ({ ...current, [side]: false }));
  }

  function changeStatAdjustment(
    side: DamageSide,
    statId: AdjustableStatId,
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
    setSelectedTeamIds((current) => ({
      ...current,
      [side]: team.id ?? null,
    }));
    setTeamModalSide(null);
  }

  function selectTeamMember(side: DamageSide, build: TrainingBuild) {
    const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
    if (!pokemon) return;

    const trainedPokemon = applyTrainingBuildToPokemon(
      pokemon,
      build,
      natures,
      heldItems,
    );
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    selection.select(trainedPokemon);
    setSelectedBuildIds((current) => ({
      ...current,
      [side]: build.id ?? null,
    }));
    setStatAdjustments((current) => ({
      ...current,
      [side]: createStatAdjustmentsFromBuild(build, natures),
    }));
    setAbilityConditionEnabled((current) => ({ ...current, [side]: false }));
    if (side === "attacker") {
      setMoveId(trainedPokemon.moves[0]?.id ?? "");
      if (trainedPokemon.heldItem?.id !== "metronome") {
        setMetronomeConsecutiveUseCount(1);
      }
    }
  }

  function swapBattleSides() {
    attackerSelection.select(defender);
    defenderSelection.select(attacker);
    setStatAdjustments((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
    setAbilityConditionEnabled((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
    setSelectedTeamIds((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
    setSelectedBuildIds((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
    setMoveId(
      defender?.moves.some(({ id }) => id === moveId)
        ? moveId
        : (defender?.moves[0]?.id ?? ""),
    );
    if (defender?.heldItem?.id !== "metronome") {
      setMetronomeConsecutiveUseCount(1);
    }
  }

  /**
   * 履歴画像からポケモンを復元する。
   * SQLite由来の最新カタログに存在しない古いIDは何もせず無視する。
   */
  function restoreHistory(
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) {
    const pokemon =
      pokemonCatalog.find(({ id }) => id === history.pokemonId) ?? null;
    if (!pokemon) return;

    if (side === "attacker") {
      attackerSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, attacker: null }));
      setMoveId(
        pokemon.moves.some(({ id }) => id === history.moveId)
          ? (history.moveId ?? "")
          : "",
      );
    } else {
      defenderSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, defender: null }));
    }
  }

  const selectedMove = attacker?.moves.find(({ id }) => id === moveId);
  const selectedWeather =
    weathers.find(({ id }) => id === weatherId) ?? null;
  const selectedTerrain =
    terrains.find(({ id }) => id === terrainId) ?? null;
  const fieldOptions = useMemo(
    () => ({
      ...(selectedWeather ? { weather: selectedWeather.smogonWeather } : {}),
      ...(selectedTerrain ? { terrain: selectedTerrain.smogonTerrain } : {}),
    }),
    [selectedTerrain, selectedWeather],
  );
  const relevantStatIds = getRelevantStatIds(selectedMove);
  const adjustedAttacker = useMemo(
    () =>
      applyStatAdjustment(
        attacker,
        relevantStatIds.attacker,
        relevantStatIds.attacker
          ? statAdjustments.attacker[relevantStatIds.attacker]
          : null,
      ),
    [attacker, relevantStatIds.attacker, statAdjustments.attacker],
  );
  const adjustedDefender = useMemo(
    () => {
      const statAdjustedDefender = applyStatAdjustment(
        defender,
        relevantStatIds.defender,
        relevantStatIds.defender
          ? statAdjustments.defender[relevantStatIds.defender]
          : null,
      );
      return applyStatAdjustment(
        statAdjustedDefender,
        "hp",
        statAdjustments.defender.hp,
      );
    },
    [defender, relevantStatIds.defender, statAdjustments.defender],
  );
  const speedComparisonRows = useMemo(
    () => createSpeedComparisonRows(attacker, defender),
    [attacker, defender],
  );

  const { result, error } = useMemo(() => {
    if (!attacker || !defender || !selectedMove) {
      return { result: null, error: null };
    }
    if (!adjustedAttacker || !adjustedDefender) {
      return { result: null, error: null };
    }

    try {
      return {
        result: {
          normal: championsDamageCalculator.calculate({
            attacker: adjustedAttacker,
            defender: adjustedDefender,
            move: selectedMove,
            metronomeConsecutiveUseCount,
            abilityConditionEnabled,
            field: fieldOptions,
          }),
          critical: championsDamageCalculator.calculate({
            attacker: adjustedAttacker,
            defender: adjustedDefender,
            move: selectedMove,
            metronomeConsecutiveUseCount,
            abilityConditionEnabled,
            isCritical: true,
            field: fieldOptions,
          }),
          attackerName: attacker.nameJa,
          defenderName: defender.nameJa,
          moveName: selectedMove.name,
          moveEffectiveness: getTypeEffectiveness(
            selectedMove.typeName,
            defender.types,
          ),
        },
        error: null,
      };
    } catch (caught) {
      return {
        result: null,
        error: caught instanceof Error ? caught.message : "計算に失敗しました。",
      };
    }
  }, [
    adjustedAttacker,
    adjustedDefender,
    abilityConditionEnabled,
    attacker,
    defender,
    fieldOptions,
    metronomeConsecutiveUseCount,
    selectedMove,
  ]);
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
        console.error("ダメージ計算履歴を保存できませんでした。", caught);
      });

    return () => {
      active = false;
    };
  }, [attacker, defender, selectedMove]);

  return (
    <form
      className={styles.calculator}
      onSubmit={(event) => event.preventDefault()}
    >
      <section className={styles.side}>
        <h2>攻撃側</h2>
        <div className={styles.teamPicker}>
          <button type="button" onClick={() => setTeamModalSide("attacker")}>
            バトルチームを選択
          </button>
          <span>{selectedTeams.attacker?.name ?? "未選択"}</span>
        </div>
        {teamLoadError ? (
          <p className={styles.teamError} role="alert">
            {teamLoadError}
          </p>
        ) : null}
        {selectedTeamMembers.attacker.length > 0 ? (
          <div className={styles.teamPokemon}>
            {selectedTeamMembers.attacker.map(({ build, pokemon }) => (
              <button
                type="button"
                title={`${build.name || pokemon.nameJa}を攻撃側に反映`}
                aria-label={`${build.name || pokemon.nameJa}を攻撃側に反映`}
                onClick={() => selectTeamMember("attacker", build)}
                key={build.id}
              >
                {pokemon.imageUrl ? (
                  <Image
                    src={pokemon.imageUrl}
                    alt=""
                    width={48}
                    height={48}
                  />
                ) : (
                  <SmallPokemonName name={pokemon.nameJa} />
                )}
              </button>
            ))}
          </div>
        ) : null}
        <PokemonCombobox
          id="attacker"
          label="攻撃するポケモン"
          pokemonCatalog={pokemonCatalog}
          selectedPokemon={attacker}
          inputValue={attackerSelection.query}
          onInputValueChange={attackerSelection.setQuery}
          onSelect={selectAttacker}
        />
        <RecentPokemonList
          side="attacker"
          history={attackerHistory}
          pokemonCatalog={pokemonCatalog}
          onRestore={restoreHistory}
        />
        <PokemonSummary
          pokemon={attacker}
          href={getTrainingDetailHref(attacker, selectedBuildIds.attacker)}
        />
        <AbilityField
          pokemon={attacker}
          conditionEnabled={abilityConditionEnabled.attacker}
          onAbilityChange={(abilityId) => changeAbility("attacker", abilityId)}
          onConditionChange={(enabled) =>
            setAbilityConditionEnabled((current) => ({
              ...current,
              attacker: enabled,
            }))
          }
        />
        <HeldItemField
          pokemon={attacker}
          heldItems={heldItems}
          onChange={(itemId) => changeHeldItem("attacker", itemId)}
        />
        {attacker?.heldItem?.id === "metronome" ? (
          <MetronomeUseControl
            value={metronomeConsecutiveUseCount}
            onChange={setMetronomeConsecutiveUseCount}
          />
        ) : null}
        <MoveSelect
          label="使用する技"
          moves={attacker?.moves ?? []}
          defenderTypes={defender?.types ?? []}
          selectedMoveId={moveId}
          disabled={!attacker}
          onChange={setMoveId}
        />
        {selectedMove ? <MoveSummary move={selectedMove} /> : null}
        {selectedMove && relevantStatIds.attacker ? (
          <DamageStatControls
            title="攻撃側の補正"
            statLabel={STAT_LABELS[relevantStatIds.attacker]}
            value={statAdjustments.attacker[relevantStatIds.attacker]}
            onChange={(values) =>
              changeStatAdjustment(
                "attacker",
                relevantStatIds.attacker,
                values,
              )
            }
          />
        ) : null}
      </section>

      <div className={styles.versus}>
        <span>VS</span>
        <button
          type="button"
          onClick={swapBattleSides}
          disabled={!attacker && !defender}
        >
          攻守交代
        </button>
      </div>

      <section className={styles.side}>
        <h2>防御側</h2>
        <div className={styles.teamPicker}>
          <button type="button" onClick={() => setTeamModalSide("defender")}>
            バトルチームを選択
          </button>
          <span>{selectedTeams.defender?.name ?? "未選択"}</span>
        </div>
        {teamLoadError ? (
          <p className={styles.teamError} role="alert">
            {teamLoadError}
          </p>
        ) : null}
        {selectedTeamMembers.defender.length > 0 ? (
          <div className={styles.teamPokemon}>
            {selectedTeamMembers.defender.map(({ build, pokemon }) => (
              <button
                type="button"
                title={`${build.name || pokemon.nameJa}を防御側に反映`}
                aria-label={`${build.name || pokemon.nameJa}を防御側に反映`}
                onClick={() => selectTeamMember("defender", build)}
                key={build.id}
              >
                {pokemon.imageUrl ? (
                  <Image
                    src={pokemon.imageUrl}
                    alt=""
                    width={48}
                    height={48}
                  />
                ) : (
                  <SmallPokemonName name={pokemon.nameJa} />
                )}
              </button>
            ))}
          </div>
        ) : null}
        <PokemonCombobox
          id="defender"
          label="攻撃を受けるポケモン"
          pokemonCatalog={pokemonCatalog}
          selectedPokemon={defender}
          inputValue={defenderSelection.query}
          onInputValueChange={defenderSelection.setQuery}
          onSelect={selectDefender}
        />
        <RecentPokemonList
          side="defender"
          history={defenderHistory}
          pokemonCatalog={pokemonCatalog}
          onRestore={restoreHistory}
        />
        <PokemonSummary
          pokemon={defender}
          href={getTrainingDetailHref(defender, selectedBuildIds.defender)}
        />
        <AbilityField
          pokemon={defender}
          conditionEnabled={abilityConditionEnabled.defender}
          onAbilityChange={(abilityId) => changeAbility("defender", abilityId)}
          onConditionChange={(enabled) =>
            setAbilityConditionEnabled((current) => ({
              ...current,
              defender: enabled,
            }))
          }
        />
        <HeldItemField
          pokemon={defender}
          heldItems={heldItems}
          onChange={(itemId) => changeHeldItem("defender", itemId)}
        />
        {selectedMove ? (
          <DamageStatControls
            title="髦ｲ蠕｡蛛ｴ縺ｮHP"
            statLabel={STAT_LABELS.hp}
            value={statAdjustments.defender.hp}
            showRank={false}
            showNature={false}
            onChange={(values) =>
              changeStatAdjustment("defender", "hp", values)
            }
          />
        ) : null}
        {selectedMove && relevantStatIds.defender ? (
          <DamageStatControls
            title="防御側の補正"
            statLabel={STAT_LABELS[relevantStatIds.defender]}
            value={statAdjustments.defender[relevantStatIds.defender]}
            onChange={(values) =>
              changeStatAdjustment(
                "defender",
                relevantStatIds.defender,
                values,
              )
            }
          />
        ) : null}
      </section>

      <section className={styles.fieldConditions}>
        <div>
          <p>BATTLE CONDITIONS</p>
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
                {weather.normallyAvailable ? "" : " (特殊)"}
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
                {terrain.normallyAvailable ? "" : " (特殊)"}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className={styles.conditions}>
        基準式 第{CHAMPIONS_DAMAGE_RULESET.generation}世代・レベル
        {CHAMPIONS_DAMAGE_RULESET.level}
        ・個体値31・努力値0・性格補正なし・HP満タン
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {result ? <DamageResult result={result} /> : null}
      <button
        className={styles.speedCompareButton}
        type="button"
        disabled={!attacker && !defender}
        onClick={() => setSpeedModalOpen(true)}
      >
        かんたん素早さ比較
      </button>
      {speedModalOpen ? (
        <SpeedComparisonModal
          attackerName={attacker?.nameJa ?? "攻撃側未選択"}
          defenderName={defender?.nameJa ?? "防御側未選択"}
          rows={speedComparisonRows}
          onClose={() => setSpeedModalOpen(false)}
        />
      ) : null}
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

function SpeedComparisonModal({
  attackerName,
  defenderName,
  rows,
  onClose,
}: {
  attackerName: string;
  defenderName: string;
  rows: SpeedComparisonRow[];
  onClose: () => void;
}) {
  return (
    <div
      className={styles.speedModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="speed-comparison-modal-title"
    >
      <button
        className={styles.speedModalBackdrop}
        type="button"
        aria-label="素早さ比較を閉じる"
        onClick={onClose}
      />
      <section className={styles.speedModalPanel}>
        <div className={styles.speedModalHeader}>
          <div>
            <p>SPEED CHECK</p>
            <h2 id="speed-comparison-modal-title">かんたん素早さ比較</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className={styles.speedTable} role="table">
          <div className={styles.speedTableHead} role="row">
            <span role="columnheader">条件</span>
            <strong role="columnheader">{attackerName}</strong>
            <strong role="columnheader">{defenderName}</strong>
          </div>
          {rows.map((row) => (
            <div className={styles.speedTableRow} role="row" key={row.id}>
              <span role="rowheader">{row.label}</span>
              <SpeedValue
                value={row.attacker}
                comparedValue={row.defender}
                sideLabel="攻撃側"
              />
              <SpeedValue
                value={row.defender}
                comparedValue={row.attacker}
                sideLabel="防御側"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SpeedValue({
  value,
  comparedValue,
  sideLabel,
}: {
  value: number | null;
  comparedValue: number | null;
  sideLabel: string;
}) {
  const comparison =
    value === null || comparedValue === null
      ? ""
      : value === comparedValue
        ? "同速"
        : value > comparedValue
          ? `${sideLabel}が速い`
          : "";

  return (
    <span
      className={`${styles.speedValue} ${
        comparison && comparison !== "同速" ? styles.fasterSpeedValue : ""
      }`}
      role="cell"
    >
      <strong>{value ?? "-"}</strong>
      {comparison ? <small>{comparison}</small> : null}
    </span>
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
      className={styles.teamModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-team-modal-title"
    >
      <button
        className={styles.teamModalBackdrop}
        type="button"
        aria-label="バトルチーム一覧を閉じる"
        onClick={onClose}
      />
      <section className={styles.teamModalPanel}>
        <div className={styles.teamModalHeader}>
          <div>
            <p>BATTLE TEAMS</p>
            <h2 id="battle-team-modal-title">バトルチーム一覧</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {teams.length === 0 ? (
          <p className={styles.teamModalEmpty}>
            保存したバトルチームはありません。
          </p>
        ) : (
          <div className={styles.teamModalList}>
            {teams.map((team) => (
              <button
                className={
                  team.id === selectedTeamId ? styles.selectedTeamButton : ""
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
  /** 攻撃側/防御側のどちらの履歴を復元するか。 */
  side: DamageHistorySide;
  /** user.dbから読み込んだ最近使った履歴。 */
  history: DamageHistoryRecord[];
  /** 履歴のpokemonIdを現在のカタログ情報へ解決するために使う。 */
  pokemonCatalog: DamageCalculatorPokemon[];
  /** 履歴ボタンを押した時、親コンポーネントの選択状態へ反映する。 */
  onRestore: (
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) => void;
}) {
  // 履歴に残っていても現在のcatalog.dbに存在しないフォームは表示しない。
  const availableHistory = history.flatMap((record) => {
    const pokemon = pokemonCatalog.find(({ id }) => id === record.pokemonId);
    return pokemon ? [{ record, pokemon }] : [];
  });

  if (availableHistory.length === 0) return null;

  return (
    <div className={styles.recentPokemon}>
      <small>最近使ったポケモン</small>
      <div className={styles.recentPokemonList}>
        {availableHistory.map(({ record, pokemon }) => (
          <button
            type="button"
            title={`${pokemon.nameJa}を選択`}
            aria-label={`${pokemon.nameJa}を選択`}
            onClick={() => onRestore(side, record)}
            key={record.id}
          >
            {pokemon.imageUrl ? (
              <Image
                src={pokemon.imageUrl}
                alt=""
                width={48}
                height={48}
              />
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
  return <span className={styles.smallPokemonName}>{name}</span>;
}

/** 選択中ポケモンの画像と名前を表示し、未選択時は同じ高さのプレースホルダーを出す。 */
function PokemonSummary({
  pokemon,
  href,
}: {
  pokemon: DamageCalculatorPokemon | null;
  href?: string;
}) {
  // 未選択時も同じ高さの枠を出し、左右のレイアウトが跳ねないようにする。
  if (!pokemon) return <div className={styles.placeholder}>ポケモンを選択</div>;

  const content = (
    <>
      <div className={styles.pokemonArtwork}>
        {pokemon.imageUrl ? (
          <Image
            src={pokemon.imageUrl}
            alt={pokemon.nameJa}
            width={112}
            height={112}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="" alt={pokemon.nameJa} width={112} height={112} />
        )}
      </div>
      <div className={styles.pokemonSummaryBody}>
        <div>
          <strong>{pokemon.nameJa}</strong>
          <small>{pokemon.name}</small>
        </div>
        <div className={styles.typeBadges} aria-label={`${pokemon.nameJa}のタイプ`}>
          {pokemon.types.map((typeName) => (
            <TypeBadge typeName={typeName} key={typeName} />
          ))}
        </div>
        <dl className={styles.baseStats}>
          {STAT_IDS.map((statId) => (
            <div key={statId}>
              <dt>{BASE_STAT_LABELS[statId]}</dt>
              <dd>{pokemon.stats[statId] ?? "-"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );

  return href ? (
    <Link className={styles.pokemonSummary} href={href}>
      {content}
    </Link>
  ) : (
    <div className={styles.pokemonSummary}>
      {content}
    </div>
  );
}

function TypeBadge({ typeName }: { typeName: DamageCalculatorPokemon["types"][number] }) {
  return (
    <span className={styles.typeBadge} style={getTypeBadgeStyle(typeName)}>
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

function MoveDescription({ description }: { description: string | null }) {
  return description ? (
    <span className={styles.moveDescription}>{description}</span>
  ) : null;
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
  const selectedMove =
    moves.find((move) => move.id === selectedMoveId) ?? null;
  const buttonLabel = selectedMove
    ? `${selectedMove.name} 威力 ${formatMovePower(selectedMove)}`
    : "技を選択";

  function selectMove(moveId: string) {
    onChange(moveId);
    setOpen(false);
  }

  return (
    <div className={styles.moveSelectField}>
      <span>{label}</span>
      <div
        className={styles.moveSelect}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={styles.moveSelectButton}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {selectedMove ? (
            <MoveOptionContent move={selectedMove} defenderTypes={defenderTypes} />
          ) : (
            <span className={styles.movePlaceholder}>{buttonLabel}</span>
          )}
        </button>
        {open && !disabled ? (
          <div className={styles.moveOptions} role="listbox" aria-label={label}>
            <button
              type="button"
              role="option"
              aria-selected={selectedMoveId === ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMove("")}
            >
              <span className={styles.movePlaceholder}>技を選択</span>
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
  if (effectiveness >= 4) return "ちょうばつぐん";
  if (effectiveness === 2) return "ばつぐん";
  if (effectiveness === 0.5) return "いまひとつ";
  if (effectiveness > 0 && effectiveness <= 0.25) return "かなりいまひとつ";
  if (effectiveness === 0) return "効果なし";
  return "";
}

function MoveEffectivenessBadge({
  effectiveness,
}: {
  effectiveness: number;
}) {
  const label = getEffectivenessLabel(effectiveness);
  if (!label) return null;

  return (
    <span
      className={`${styles.effectivenessBadge} ${
        effectiveness >= 2
          ? styles.effectivenessStrong
          : effectiveness === 0
            ? styles.effectivenessNone
            : styles.effectivenessWeak
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
    <span className={styles.moveOptionContent}>
      <TypeBadge typeName={move.typeName} />
      <strong>{move.name}</strong>
      <MoveEffectivenessBadge effectiveness={effectiveness} />
      <small>
        威力 {formatMovePower(move)}
        {" / "}命中 {formatMoveAccuracy(move)}
        {formatMoveUsageRate(move)}
      </small>
      <MoveDescription description={move.description} />
    </span>
  );
}

function hasManualAbilityCondition(ability: DamageCalculatorAbility | null) {
  return Boolean(
    ability?.damageModifiers.some((modifier) =>
      [
        "low_power_move",
        "not_very_effective",
        "manual",
        "manual_type_match",
        "manual_physical",
        "manual_special",
      ].includes(modifier.condition),
    ),
  );
}

function formatAbilityModifier(ability: DamageCalculatorAbility) {
  if (ability.damageModifiers.length === 0) return "";
  const strongestMultiplier = ability.damageModifiers.reduce(
    (maximum, modifier) => Math.max(maximum, modifier.multiplier),
    1,
  );
  return strongestMultiplier === 1 ? "" : ` x${strongestMultiplier}`;
}

function AbilityField({
  pokemon,
  conditionEnabled,
  onAbilityChange,
  onConditionChange,
}: {
  pokemon: DamageCalculatorPokemon | null;
  conditionEnabled: boolean;
  onAbilityChange: (abilityId: string) => void;
  onConditionChange: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedAbility = pokemon?.selectedAbility ?? null;
  const showCondition = hasManualAbilityCondition(selectedAbility);

  function selectAbility(abilityId: string) {
    onAbilityChange(abilityId);
    setOpen(false);
  }

  return (
    <div className={styles.abilityField}>
      <div className={styles.moveSelectField}>
        <span>特性</span>
        <div
          className={styles.moveSelect}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setOpen(false);
            }
          }}
        >
          <button
            type="button"
            className={styles.moveSelectButton}
            disabled={!pokemon}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {selectedAbility ? (
              <AbilityOptionContent ability={selectedAbility} />
            ) : (
              <span className={styles.movePlaceholder}>特性なし</span>
            )}
          </button>
          {open ? (
            <div className={styles.moveOptions} role="listbox" aria-label="特性">
              <button
                type="button"
                role="option"
                aria-selected={!selectedAbility}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectAbility("")}
              >
                <span className={styles.movePlaceholder}>特性なし</span>
              </button>
              {pokemon?.abilities.map((ability) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedAbility?.id === ability.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectAbility(ability.id)}
                  key={ability.id}
                >
                  <AbilityOptionContent ability={ability} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {showCondition ? (
        <label className={styles.conditionToggle}>
          <input
            type="checkbox"
            checked={conditionEnabled}
            onChange={(event) => onConditionChange(event.target.checked)}
          />
          条件を適用
        </label>
      ) : null}
    </div>
  );
}

function AbilityOptionContent({
  ability,
}: {
  ability: DamageCalculatorAbility;
}) {
  return (
    <span className={styles.abilityOptionContent}>
      <strong>
        {ability.name}
        {formatAbilityModifier(ability)}
      </strong>
      {ability.effect ? <small>{ability.effect}</small> : null}
    </span>
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
    <label className={styles.moveField}>
      持ち物
      <select
        value={pokemon?.heldItem?.id ?? ""}
        disabled={!pokemon}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">持ち物なし</option>
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

/** 技のタイプ、分類、威力を選択欄の直下に確認用として表示する。 */
function MoveSummary({ move }: { move: DamageCalculatorMove }) {
  return (
    <p className={styles.moveSummary}>
      {move.typeName} / {move.damageClass === "physical" ? "物理" : "特殊"} /
      威力 {formatMovePower(move)} / 命中 {formatMoveAccuracy(move)}
    </p>
  );
}

function MetronomeUseControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const changeValue = (nextValue: number) => {
    onChange(Math.min(6, Math.max(1, nextValue)));
  };

  return (
    <label className={styles.moveField}>
      メトロノーム連続使用回数
      <input
        type="number"
        min="1"
        max="6"
        value={value}
        onChange={(event) => changeValue(Number(event.target.value))}
      />
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
    onChange({ point: Math.min(32, Math.max(0, point)) });
  };
  const changeRank = (rank: number) => {
    onChange({ rank: Math.min(6, Math.max(-6, rank)) });
  };

  return (
    <div className={styles.statControls}>
      <div className={styles.statControlsHeader}>
        <strong>{title}</strong>
        <span>{statLabel}</span>
      </div>
      <label>
        能力ポイント
        <div className={styles.pointControl}>
          <input
            type="number"
            min="0"
            max="32"
            value={value.point}
            onChange={(event) => changePoint(Number(event.target.value))}
          />
          <button type="button" onClick={() => changePoint(32)}>
            32
          </button>
        </div>
        <input
          type="range"
          min="0"
          max="32"
          step="1"
          value={value.point}
          onChange={(event) => changePoint(Number(event.target.value))}
        />
      </label>
      {showRank ? (
        <label>
          能力ランク
          <div className={styles.rankStepper}>
            <button type="button" onClick={() => changeRank(value.rank - 1)}>
              -
            </button>
            <span className={styles.rankValue}>
              {value.rank > 0 ? `+${value.rank}` : value.rank}
            </span>
            <button type="button" onClick={() => changeRank(value.rank + 1)}>
              +
            </button>
          </div>
          <input
            type="range"
            min="-6"
            max="6"
            step="1"
            value={value.rank}
            onChange={(event) => changeRank(Number(event.target.value))}
          />
        </label>
      ) : null}
      {showNature ? (
        <label className={styles.natureToggle}>
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
/** 通常ダメージと急所ダメージをまとめて表示する結果パネル。 */
function DamageResult({ result }: { result: CalculationResult }) {
  const moveEffectivenessLabel = getEffectivenessLabel(result.moveEffectiveness);

  return (
    <section className={styles.result} aria-live="polite">
      <div className={styles.resultHeader}>
        <strong>
          {result.attackerName}→{result.defenderName}
        </strong>
        <span className={styles.resultMove}>
          {result.moveName}
          {moveEffectivenessLabel ? <small>{moveEffectivenessLabel}</small> : null}
        </span>
      </div>
      <div className={styles.outcomeGrid}>
        <DamageOutcome title="通常" calculation={result.normal} />
        <DamageOutcome title="急所" calculation={result.critical} critical />
      </div>
    </section>
  );
}

function DamageOutcome({
  title,
  calculation,
  critical = false,
}: {
  title: string;
  calculation: DamageCalculation;
  critical?: boolean;
}) {
  const minimumRemainingPercent = Math.max(
    0,
    Math.min(100, 100 - calculation.maximumPercent),
  );
  const maximumRemainingPercent = Math.max(
    0,
    Math.min(100, 100 - calculation.minimumPercent),
  );

  return (
    <article
      className={`${styles.outcome} ${critical ? styles.criticalOutcome : ""}`}
    >
      <span className={styles.outcomeTitle}>{title}</span>
      <strong className={styles.damagePercent}>
        {minimumRemainingPercent.toFixed(1)}~
        {maximumRemainingPercent.toFixed(1)}%
      </strong>
      <span className={styles.koLabel}>{calculation.koLabel}</span>
      <div
        className={styles.damageBar}
        role="img"
        aria-label={`防御側の残りHP ${minimumRemainingPercent.toFixed(1)}から${maximumRemainingPercent.toFixed(1)}%`}
      >
        <span
          className={styles.maximumDamageBar}
          style={{ width: `${maximumRemainingPercent}%` }}
        />
        <span
          className={styles.minimumDamageBar}
          style={{ width: `${minimumRemainingPercent}%` }}
        />
      </div>
    </article>
  );
}
