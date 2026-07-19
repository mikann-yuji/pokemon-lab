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
  NatureCorrection,
  SpeedComparisonRow,
  StatAdjustment,
} from "./damage-calculator-types";

export type StatAdjustmentState = Record<
  DamageSide,
  Record<AdjustableStatId, StatAdjustment>
>;

/**
 * ダメージ計算ページで、能力補正入力の初期値を作る。
 *
 * @returns 能力ポイント、能力ランク、性格補正をすべて未補正にした入力値。
 */
function createDefaultAdjustment(): StatAdjustment {
  return { point: 0, rank: 0, nature: "neutral" };
}

/**
 * ダメージ計算ページで、三択の性格補正を実数値計算用の倍率へ変換する。
 *
 * @param nature - 上昇補正、下降補正、補正なしのいずれか。
 * @returns 実数値へ掛ける性格倍率。
 */
function getNatureMultiplier(nature: NatureCorrection) {
  if (nature === "up") return 1.1;
  if (nature === "down") return 0.9;
  return 1;
}

/**
 * ダメージ計算ページで、攻撃側と防御側の能力補正入力テーブルを初期化する。
 *
 * @returns 攻撃側/防御側それぞれに未補正の能力補正を持つ状態。
 */
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

/**
 * ダメージ計算ページで、Lv.50・個体値31前提の実数値を計算する。
 *
 * @param pokemon - 実数値を計算する対象ポケモン。
 * @param statId - HP、攻撃、防御など計算対象の能力ID。
 * @param point - 能力ポイント補正。
 * @param nature - 性格補正の向き。HPでは無視する。
 * @returns 指定能力の実数値。
 */
function calculateActualStat(
  pokemon: DamageCalculatorPokemon,
  statId: (typeof STAT_IDS)[number],
  point = 0,
  nature: NatureCorrection = "neutral",
) {
  const baseStat = pokemon.stats[statId] ?? 1;
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * getNatureMultiplier(nature));
}

/**
 * ダメージ計算ページの素早さ比較モーダルで、代表条件の素早さを計算する。
 *
 * @param pokemon - 素早さを計算する対象ポケモン。未選択ならnull。
 * @param point - 素早さに振る能力ポイント。
 * @param nature - 素早さの性格補正。
 * @param scarf - こだわりスカーフ補正を適用するか。
 * @returns 表示用の素早さ実数値。ポケモン未選択時はnull。
 */
function calculateSpeedValue(
  pokemon: DamageCalculatorPokemon | null,
  point: number,
  nature: NatureCorrection,
  scarf = false,
) {
  if (!pokemon) return null;
  const speed = calculateActualStat(pokemon, "speed", point, nature);
  return scarf ? Math.floor(speed * 1.5) : speed;
}

export function calculateDetailedSpeedValue(
  pokemon: DamageCalculatorPokemon | null,
  point: number,
  nature: NatureCorrection,
  rank: number,
  itemId: string,
) {
  if (!pokemon) return null;
  const baseSpeed = calculateActualStat(pokemon, "speed", point, nature);
  const rankedSpeed = Math.floor(
    baseSpeed * (rank >= 0 ? (2 + rank) / 2 : 2 / (2 - rank)),
  );
  const halfSpeedItems = [
    "iron-ball",
    "macho-brace",
    "power-weight",
    "power-bracer",
    "power-belt",
    "power-lens",
    "power-band",
    "power-anklet",
  ];
  const itemMultiplier =
    itemId === "choice-scarf"
      ? 1.5
      : itemId === "quick-powder" && pokemon.name === "ditto"
        ? 2
        : halfSpeedItems.includes(itemId)
          ? 0.5
          : 1;
  return Math.floor(rankedSpeed * itemMultiplier);
}

/**
 * ダメージ計算ページの素早さ比較モーダルに表示する代表行を作る。
 *
 * @param attacker - 攻撃側に選ばれているポケモン。
 * @param defender - 防御側に選ばれているポケモン。
 * @returns スカーフ最速、最速、準速、無振りの比較行。
 */
export function createSpeedComparisonRows(
  attacker: DamageCalculatorPokemon | null,
  defender: DamageCalculatorPokemon | null,
): SpeedComparisonRow[] {
  return [
    {
      id: "scarf-fastest",
      label: "スカーフ最速",
      attacker: calculateSpeedValue(attacker, 32, "up", true),
      defender: calculateSpeedValue(defender, 32, "up", true),
    },
    {
      id: "fastest",
      label: "最速",
      attacker: calculateSpeedValue(attacker, 32, "up"),
      defender: calculateSpeedValue(defender, 32, "up"),
    },
    {
      id: "semi-fast",
      label: "準速",
      attacker: calculateSpeedValue(attacker, 32, "neutral"),
      defender: calculateSpeedValue(defender, 32, "neutral"),
    },
    {
      id: "uninvested",
      label: "無振り",
      attacker: calculateSpeedValue(attacker, 0, "neutral"),
      defender: calculateSpeedValue(defender, 0, "neutral"),
    },
  ];
}

/**
 * ダメージ計算ページで、能力補正を重ねる前の無補正実数値表を作る。
 *
 * @param pokemon - 実数値表を作る対象ポケモン。
 * @returns 全能力IDをキーにした無補正の実数値表。
 */
function createNeutralActualStats(pokemon: DamageCalculatorPokemon) {
  return Object.fromEntries(
    STAT_IDS.map((statId) => [statId, calculateActualStat(pokemon, statId)]),
  );
}

/**
 * ダメージ計算ページで、能力ポイント・ランク・性格補正を選択ポケモンへ反映する。
 *
 * @param pokemon - 補正を反映するポケモン。未選択ならnull。
 * @param statId - 補正対象の能力ID。対象なしならnull。
 * @param adjustment - 画面入力された補正値。対象なしならnull。
 * @returns 補正済みポケモン。入力が不足している場合は元の値。
 */
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

/**
 * ダメージ計算ページで、持ち物選択をポケモン状態へ反映する。
 *
 * @param pokemon - 持ち物を差し替えるポケモン。未選択ならnull。
 * @param item - 選択された持ち物。持ち物なしならnull。
 * @returns 持ち物を反映したポケモン。未選択時はnull。
 */
export function applyHeldItem(
  pokemon: DamageCalculatorPokemon | null,
  item: DamageCalculatorHeldItem | null,
): DamageCalculatorPokemon | null {
  return pokemon ? { ...pokemon, heldItem: item } : pokemon;
}

/**
 * ダメージ計算ページで、特性選択をポケモン状態へ反映する。
 *
 * @param pokemon - 特性を差し替えるポケモン。未選択ならnull。
 * @param ability - 選択された特性。特性なしならnull。
 * @returns 特性を反映したポケモン。未選択時はnull。
 */
export function applyAbility(
  pokemon: DamageCalculatorPokemon | null,
  ability: DamageCalculatorAbility | null,
): DamageCalculatorPokemon | null {
  return pokemon ? { ...pokemon, selectedAbility: ability } : pokemon;
}

/**
 * ダメージ計算ページで、選択技から攻撃側/防御側に必要な補正能力を決める。
 *
 * @param move - 選択されている技。未選択ならundefined。
 * @returns 物理ならA/B、特殊ならC/D、未選択なら両側null。
 */
export function getRelevantStatIds(move: DamageCalculatorMove | undefined) {
  if (!move) return { attacker: null, defender: null };
  return move.damageClass === "physical"
    ? ({ attacker: "attack", defender: "defense" } as const)
    : ({ attacker: "special-attack", defender: "special-defense" } as const);
}

/**
 * ダメージ計算ページで、保存済み育成案の性格が指定能力を上げるか判定する。
 *
 * @param build - 反映元の育成案。
 * @param statId - 判定対象の能力ID。
 * @param natures - catalog.dbから読んだ性格一覧。
 * @returns 指定能力にかかる性格補正の向き。
 */
function getNatureCorrectionForStat(
  build: TrainingBuild,
  statId: AdjustableStatId,
  natures: Nature[],
): NatureCorrection {
  const selectedNature = natures.find(({ id }) => id === build.nature);
  if (
    !selectedNature ||
    selectedNature.increasedStatId === selectedNature.decreasedStatId
  ) {
    return "neutral";
  }
  if (selectedNature.increasedStatId === statId) return "up";
  if (selectedNature.decreasedStatId === statId) return "down";
  return "neutral";
}

/**
 * ダメージ計算ページで、育成案から能力補正入力欄へ復元する値を作る。
 *
 * @param build - 選択された保存済み育成案。
 * @param natures - catalog.dbから読んだ性格一覧。
 * @returns 能力IDごとの能力ポイント、ランク、性格補正。
 */
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
        nature: getNatureCorrectionForStat(build, statId, natures),
      },
    ]),
  ) as Record<AdjustableStatId, StatAdjustment>;
}

/**
 * ダメージ計算ページで、育成案の能力ポイントと性格から実数値表を作る。
 *
 * @param pokemon - catalog.db由来の基礎ポケモン。
 * @param build - 反映元の育成案。
 * @param natures - catalog.dbから読んだ性格一覧。
 * @returns ダメージ計算エンジンへ渡す実数値表。
 */
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

/**
 * ダメージ計算ページで、バトルチーム内の育成案を計算用ポケモンへ反映する。
 *
 * @param pokemon - catalog.db由来の基礎ポケモン。
 * @param build - 選択された保存済み育成案。
 * @param natures - catalog.dbから読んだ性格一覧。
 * @param heldItems - catalog.dbから読んだ持ち物一覧。
 * @returns 名前、実数値、持ち物、特性、技を育成案で上書きしたポケモン。
 */
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

/**
 * ダメージ計算ページで、ポケモン検索欄の入力文字列と選択結果をまとめて扱う。
 *
 * @returns 選択中ポケモン、検索文字列、検索文字列setter、選択更新関数。
 */
export function usePokemonSelection() {
  const [pokemon, setPokemon] = useState<DamageCalculatorPokemon | null>(null);
  const [query, setQuery] = useState("");

  /**
   * ダメージ計算ページのポケモン検索欄で、選択結果と検索文字列を同期する。
   *
   * @param nextPokemon - 新しく選択するポケモン。選択解除ならnull。
   * @returns 戻り値なし。
   */
  function select(nextPokemon: DamageCalculatorPokemon | null) {
    setPokemon(nextPokemon);
    setQuery(nextPokemon?.nameJa ?? "");
  }

  return { pokemon, query, setQuery, select };
}
