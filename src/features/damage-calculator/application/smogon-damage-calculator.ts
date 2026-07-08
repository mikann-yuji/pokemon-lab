/**
 * このファイルの役割:
 * アプリ内のポケモンデータを @smogon/calc が理解できる形式へ変換し、
 * ダメージ計算結果を画面で使いやすい形式に戻す。
 *
 * applicationフォルダには「アプリが何をするか」を表す処理を置く。
 * SQLiteの読み込み方やReactの表示方法には依存させない。
 */

import {
  calculate,
  Field,
  Generations,
  Move,
  Pokemon,
  type GenerationNum,
  type Result,
  type StatsTable,
} from "@smogon/calc";
import type {
  DamageCalculatorAbilityDamageModifier,
  DamageCalculatorItemDamageModifier,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";

type BattleSide = "attacker" | "defender";
/** @smogon/calcのPokemonコンストラクター第3引数。rulesetのフックで部分上書きする。 */
type PokemonOptions = ConstructorParameters<typeof Pokemon>[2];
/** @smogon/calcのMoveコンストラクター第3引数。技威力や急所指定を入れる。 */
type MoveOptions = ConstructorParameters<typeof Move>[2];
/** @smogon/calcのFieldコンストラクター第1引数。天候やフィールドなどの条件を入れる。 */
type FieldOptions = ConstructorParameters<typeof Field>[0];

export type DamageCalculation = {
  minimum: number;
  maximum: number;
  defenderHp: number;
  minimumPercent: number;
  maximumPercent: number;
  /** @smogon/calcが返す、デバッグにも利用できる元の確定数テキスト。 */
  koChance: string;
  /** 「確定2発」「乱数1発（62.5%）」のような画面表示用テキスト。 */
  koLabel: string;
  /** 相手を倒すまでに必要な攻撃回数。 */
  koHits: number;
  /** その回数で倒せる確率。計算不能な場合はundefined。 */
  koProbability?: number;
};

export type DamageCalculationInput = {
  attacker: DamageCalculatorPokemon;
  defender: DamageCalculatorPokemon;
  move: DamageCalculatorMove;
  metronomeConsecutiveUseCount?: number;
  abilityConditionEnabled?: {
    attacker?: boolean;
    defender?: boolean;
  };
  /** trueの場合、技を急所に当たったものとして計算する。 */
  isCritical?: boolean;
  /** 画面から一時的な場の条件を追加したい時に渡す。 */
  field?: FieldOptions;
};

/**
 * ダメージ計算のゲーム別ルール。
 * DB由来の標準データを、Pokémon Champions仕様やSmogon側のID差分に合わせて補正する。
 */
export type DamageCalculatorRuleset = {
  id: string;
  generation: GenerationNum;
  level: number;
  nature: string;
  ability?: string;
  /** 全ポケモン共通で使う個体値。Championsでは31固定として扱う。 */
  ivs: Partial<StatsTable>;
  /** 全ポケモン共通で使う努力値。Championsでは0固定として扱う。 */
  evs: Partial<StatsTable>;
  /** DBのフォーム名とSmogonのspecies IDがずれる場合の変換口。 */
  resolveSpeciesId?: (pokemon: DamageCalculatorPokemon) => string;
  /** DBの技IDとSmogonのmove IDがずれる場合の変換口。 */
  resolveMoveId?: (move: DamageCalculatorMove) => string;
  /** 攻撃側/防御側ごとに、能力や特性などPokemonオプションを補正する。 */
  customizePokemon?: (
    side: BattleSide,
    source: DamageCalculatorPokemon,
    options: PokemonOptions,
  ) => PokemonOptions;
  /** 技ごとに、威力・分類・特殊効果などMoveオプションを補正する。 */
  customizeMove?: (
    source: DamageCalculatorMove,
    options: MoveOptions,
  ) => MoveOptions;
  /** 天候、壁、フィールドなど、場の条件を入力から作る。 */
  createField?: (input: DamageCalculationInput) => FieldOptions;
  /** @smogon/calcのcalculate自体を差し替えるための最終フック。 */
  calculate?: (
    generation: ReturnType<typeof Generations.get>,
    attacker: Pokemon,
    defender: Pokemon,
    move: Move,
    field: Field,
  ) => Result;
  /** Smogonの生結果から、画面用のDamageCalculationを最後に補正する。 */
  transformResult?: (
    result: DamageCalculation,
    source: Result,
    input: DamageCalculationInput,
  ) => DamageCalculation;
};

const STAT_IDS = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
} as const;

const TYPE_EFFECTIVENESS: Record<
  string,
  Partial<Record<string, number>>
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
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
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
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

/** PokeAPI/DB由来のIDを、Smogon lookup用の小文字英数字IDへ寄せる。 */
function normalizeId(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/** DBのstat_idキーを、@smogon/calcが期待するatk/def/spa形式へ変換する。 */
function calculateStatFromBaseStat({
  stat,
  baseStat,
  ruleset,
}: {
  stat: keyof typeof STAT_IDS;
  baseStat: number;
  ruleset: DamageCalculatorRuleset;
}) {
  const iv = ruleset.ivs[STAT_IDS[stat]] ?? 31;
  const ev = ruleset.evs[STAT_IDS[stat]] ?? 0;
  const base = Math.floor(
    ((2 * baseStat + iv + Math.floor(ev / 4)) * ruleset.level) / 100,
  );
  return stat === "hp" ? base + ruleset.level + 10 : base + 5;
}

function findBaseStatForActualStat({
  stat,
  actualStat,
  ruleset,
}: {
  stat: keyof typeof STAT_IDS;
  actualStat: number;
  ruleset: DamageCalculatorRuleset;
}) {
  if (stat === "hp" && actualStat <= 1) return 1;

  let closestBaseStat = 1;
  let closestDiff = Number.POSITIVE_INFINITY;
  for (let baseStat = 1; baseStat <= 999; baseStat += 1) {
    const calculated = calculateStatFromBaseStat({ stat, baseStat, ruleset });
    const diff = Math.abs(calculated - actualStat);
    if (diff < closestDiff) {
      closestBaseStat = baseStat;
      closestDiff = diff;
    }
    if (diff === 0) break;
  }
  return closestBaseStat;
}

function toBaseStats(
  pokemon: DamageCalculatorPokemon,
  ruleset: DamageCalculatorRuleset,
): StatsTable {
  return Object.fromEntries(
    Object.entries(STAT_IDS).map(([databaseId, calculatorId]) => [
      calculatorId,
      typeof pokemon.actualStats?.[databaseId] === "number"
        ? findBaseStatForActualStat({
            stat: databaseId as keyof typeof STAT_IDS,
            actualStat: pokemon.actualStats[databaseId],
            ruleset,
          })
        : (pokemon.stats[databaseId] ?? 1),
    ]),
  ) as StatsTable;
}

function toActualStats(pokemon: DamageCalculatorPokemon): StatsTable | null {
  if (!pokemon.actualStats) return null;
  return Object.fromEntries(
    Object.entries(STAT_IDS).map(([databaseId, calculatorId]) => [
      calculatorId,
      pokemon.actualStats?.[databaseId] ?? pokemon.stats[databaseId] ?? 1,
    ]),
  ) as StatsTable;
}

function toBoosts(pokemon: DamageCalculatorPokemon): Partial<StatsTable> {
  if (!pokemon.boosts) return {};
  return Object.fromEntries(
    Object.entries(STAT_IDS).flatMap(([databaseId, calculatorId]) => {
      const boost = pokemon.boosts?.[databaseId];
      return typeof boost === "number" ? [[calculatorId, boost]] : [];
    }),
  ) as Partial<StatsTable>;
}

function getTypeEffectiveness(input: DamageCalculationInput) {
  return input.defender.types.reduce((multiplier, defenderType) => {
    const typeMultiplier =
      TYPE_EFFECTIVENESS[input.move.typeName]?.[defenderType] ?? 1;
    return multiplier * typeMultiplier;
  }, 1);
}

function getWeightBasedMovePower(weightKg: number) {
  if (weightKg >= 200) return 120;
  if (weightKg >= 100) return 100;
  if (weightKg >= 50) return 80;
  if (weightKg >= 25) return 60;
  if (weightKg >= 10) return 40;
  return 20;
}

function getEffectiveMovePower(input: DamageCalculationInput) {
  if (input.move.power > 0) return input.move.power;
  if (["grass-knot", "low-kick"].includes(input.move.id)) {
    return getWeightBasedMovePower(input.defender.weightKg);
  }
  return 1;
}

function itemModifierApplies(
  modifier: DamageCalculatorItemDamageModifier,
  input: DamageCalculationInput,
) {
  switch (modifier.condition) {
    case "always":
      return true;
    case "type_match":
      return modifier.moveTypeName === input.move.typeName;
    case "physical":
      return input.move.damageClass === "physical";
    case "special":
      return input.move.damageClass === "special";
    case "super_effective":
      return getTypeEffectiveness(input) > 1;
    case "super_effective_type_match":
      return (
        modifier.moveTypeName === input.move.typeName &&
        getTypeEffectiveness(input) > 1
      );
    case "consecutive_use":
      return (input.metronomeConsecutiveUseCount ?? 1) > 1;
    case "pokemon_match":
      return Boolean(
        modifier.pokemonName &&
          input.attacker.name.toLowerCase().startsWith(modifier.pokemonName),
      );
  }
}

function getHeldItemPowerMultiplier(input: DamageCalculationInput) {
  const modifier = input.attacker.heldItem?.damageModifier;
  if (
    !modifier ||
    modifier.modifierKind !== "power" ||
    !itemModifierApplies(modifier, input)
  ) {
    return 1;
  }
  if (modifier.condition === "consecutive_use") {
    const count = Math.max(1, input.metronomeConsecutiveUseCount ?? 1);
    const multiplier = 1 + (modifier.multiplier - 1) * (count - 1);
    return Math.min(modifier.maxMultiplier ?? multiplier, multiplier);
  }
  return modifier.multiplier;
}

function abilityManualConditionEnabled(
  side: BattleSide,
  input: DamageCalculationInput,
) {
  return side === "attacker"
    ? (input.abilityConditionEnabled?.attacker ?? false)
    : (input.abilityConditionEnabled?.defender ?? false);
}

function abilityModifierApplies(
  side: BattleSide,
  modifier: DamageCalculatorAbilityDamageModifier,
  input: DamageCalculationInput,
) {
  const manualEnabled = abilityManualConditionEnabled(side, input);
  switch (modifier.condition) {
    case "always":
      return true;
    case "type_match":
      return modifier.moveTypeName === input.move.typeName;
    case "physical":
      return input.move.damageClass === "physical";
    case "special":
      return input.move.damageClass === "special";
    case "low_power_move":
      return manualEnabled && getEffectiveMovePower(input) <= 60;
    case "critical_hit":
      return input.isCritical === true;
    case "not_very_effective":
      return manualEnabled && getTypeEffectiveness(input) > 0 && getTypeEffectiveness(input) < 1;
    case "super_effective":
    case "super_effective_received":
      return getTypeEffectiveness(input) > 1;
    case "manual":
      return manualEnabled;
    case "manual_type_match":
      return manualEnabled && modifier.moveTypeName === input.move.typeName;
    case "manual_physical":
      return manualEnabled && input.move.damageClass === "physical";
    case "manual_special":
      return manualEnabled && input.move.damageClass === "special";
  }
}

function getAbilityModifiers(
  side: BattleSide,
  input: DamageCalculationInput,
) {
  const ability =
    side === "attacker"
      ? input.attacker.selectedAbility
      : input.defender.selectedAbility;
  return (
    ability?.damageModifiers.filter((modifier) =>
      abilityModifierApplies(side, modifier, input),
    ) ?? []
  );
}

function getAbilityPowerMultiplier(input: DamageCalculationInput) {
  return getAbilityModifiers("attacker", input)
    .filter(
      (modifier) =>
        modifier.modifierKind === "power" || modifier.modifierKind === "stab",
    )
    .reduce((multiplier, modifier) => multiplier * modifier.multiplier, 1);
}

function getAbilityAttackingStatMultiplier(input: DamageCalculationInput) {
  return getAbilityModifiers("attacker", input)
    .filter((modifier) => modifier.modifierKind === "attacking_stat")
    .reduce((multiplier, modifier) => multiplier * modifier.multiplier, 1);
}

function getAbilityReceivedDamageMultiplier(input: DamageCalculationInput) {
  return getAbilityModifiers("defender", input)
    .filter((modifier) => modifier.modifierKind === "received_damage")
    .reduce((multiplier, modifier) => multiplier * modifier.multiplier, 1);
}

function getAttackingStatItemMultiplier(input: DamageCalculationInput) {
  const modifier = input.attacker.heldItem?.damageModifier;
  if (
    !modifier ||
    modifier.modifierKind !== "attacking_stat" ||
    !itemModifierApplies(modifier, input)
  ) {
    return 1;
  }
  return modifier.multiplier;
}

function getReceivedDamageItemMultiplier(input: DamageCalculationInput) {
  const modifier = input.defender.heldItem?.damageModifier;
  if (
    !modifier ||
    modifier.modifierKind !== "received_damage" ||
    !itemModifierApplies(modifier, input)
  ) {
    return 1;
  }
  return modifier.multiplier;
}

function scaleDamage(
  damage: Result["damage"],
  multiplier: number,
): Result["damage"] {
  const scale = (value: number) => Math.max(1, Math.floor(value * multiplier));
  if (typeof damage === "number") {
    return scale(damage);
  }
  if (Array.isArray(damage[0])) {
    return (damage as number[][]).map((entry) => entry.map(scale));
  }
  return (damage as number[]).map(scale);
}

function applyAttackingStatMultiplier(
  pokemon: Pokemon,
  move: DamageCalculatorMove,
  multiplier: number,
) {
  if (multiplier === 1) return;

  const stat = move.damageClass === "physical" ? "atk" : "spa";
  pokemon.rawStats[stat] = Math.max(
    1,
    Math.floor(pokemon.rawStats[stat] * multiplier),
  );
  pokemon.stats[stat] = Math.max(
    1,
    Math.floor(pokemon.stats[stat] * multiplier),
  );
}

/** SmogonのKO chanceから、日本語の「確定n発/乱数n発」表示を作る。 */
function formatKoLabel({
  chance,
  n,
}: {
  chance: number | undefined;
  n: number;
}) {
  if (n <= 0 || chance === 0) return "この技では倒せません";
  if (chance === 1) return `確定${n}発`;
  if (chance === undefined) return `乱数${n}発`;

  const percentage = Math.round(chance * 1000) / 10;
  return `乱数${n}発（${percentage}%）`;
}

/**
 * DB側の名前・タイプ・種族値を正とし、@smogon/calcの計算モデルへ変換する。
 * ゲーム固有仕様はrulesetのフックで上書きできる。
 */
export class SmogonDamageCalculator {
  // ルールセットをコンストラクターで受け取るため、別ゲームの仕様も差し替えられる。
  constructor(readonly ruleset: DamageCalculatorRuleset) {}

  /**
   * 攻撃側・防御側・技を受け取り、画面表示用のダメージ範囲を返す。
   */
  calculate(input: DamageCalculationInput): DamageCalculation {
    const generation = Generations.get(this.ruleset.generation);
    const attacker = this.toPokemon("attacker", input.attacker);
    const defender = this.toPokemon("defender", input.defender);
    const move = this.toMove(
      input.move,
      input.isCritical ?? false,
      getEffectiveMovePower(input),
      getHeldItemPowerMultiplier(input) * getAbilityPowerMultiplier(input),
    );
    applyAttackingStatMultiplier(
      attacker,
      input.move,
      getAttackingStatItemMultiplier(input) *
        getAbilityAttackingStatMultiplier(input),
    );
    const field = new Field({
      ...this.ruleset.createField?.(input),
      ...input.field,
    });
    const sourceResult = this.ruleset.calculate
      ? this.ruleset.calculate(generation, attacker, defender, move, field)
      : calculate(generation, attacker, defender, move, field);
    const receivedDamageMultiplier =
      getReceivedDamageItemMultiplier(input) *
      getAbilityReceivedDamageMultiplier(input);
    if (receivedDamageMultiplier !== 1) {
      sourceResult.damage = scaleDamage(
        sourceResult.damage,
        receivedDamageMultiplier,
      );
    }
    const [minimum, maximum] = sourceResult.range();
    const defenderHp = sourceResult.defender.maxHP();
    const koChance = sourceResult.kochance();
    const result: DamageCalculation = {
      minimum,
      maximum,
      defenderHp,
      minimumPercent: (minimum / defenderHp) * 100,
      maximumPercent: (maximum / defenderHp) * 100,
      koChance: koChance.text,
      koLabel: formatKoLabel(koChance),
      koHits: koChance.n,
      koProbability: koChance.chance,
    };

    return this.ruleset.transformResult?.(result, sourceResult, input) ?? result;
  }

  private toPokemon(
    side: BattleSide,
    pokemon: DamageCalculatorPokemon,
  ): Pokemon {
    // DBの英語名をSmogonの内部IDへ寄せる。見つからないフォームでも、
    // overridesにDBの種族値とタイプを渡すため計算自体は継続できる。
    const generation = Generations.get(this.ruleset.generation);
    const sourceId =
      this.ruleset.resolveSpeciesId?.(pokemon) ?? normalizeId(pokemon.name);
    const calculatorSpecies =
      generation.species.get(sourceId as never)?.name ?? "Bulbasaur";
    const types = (
      pokemon.types.length > 1
        ? [pokemon.types[0], pokemon.types[1]]
        : [pokemon.types[0]]
    ) as never;
    const options: PokemonOptions = {
      level: this.ruleset.level,
      ability: this.ruleset.ability ?? "None",
      nature: this.ruleset.nature,
      ivs: { ...this.ruleset.ivs },
      evs: { ...this.ruleset.evs },
      boosts: toBoosts(pokemon),
      overrides: {
        types,
        baseStats: toBaseStats(pokemon, this.ruleset),
        weightkg: pokemon.weightKg,
      },
    };

    const result = new Pokemon(
      generation,
      calculatorSpecies,
      this.ruleset.customizePokemon?.(side, pokemon, options) ?? options,
    );
    const actualStats = toActualStats(pokemon);
    if (actualStats) {
      result.rawStats = { ...actualStats };
      result.stats = { ...actualStats };
      result.originalCurHP = actualStats.hp;
    }
    return result;
  }

  private toMove(
    move: DamageCalculatorMove,
    isCritical: boolean,
    basePower: number,
    powerMultiplier: number,
  ): Move {
    // 技名がSmogon側に存在すれば固有効果を利用し、存在しない場合でも
    // DBの威力・タイプ・分類を上書きして基本ダメージを計算する。
    const generation = Generations.get(this.ruleset.generation);
    const sourceId =
      this.ruleset.resolveMoveId?.(move) ?? normalizeId(move.id);
    const calculatorMove =
      generation.moves.get(sourceId as never)?.name ?? "Pound";
    const options: MoveOptions = {
      isCrit: isCritical,
      overrides: {
        basePower: Math.max(1, Math.floor(basePower * powerMultiplier)),
        type: move.typeName,
        category: move.damageClass === "physical" ? "Physical" : "Special",
      },
    };

    return new Move(
      generation,
      calculatorMove,
      this.ruleset.customizeMove?.(move, options) ?? options,
    );
  }
}

export type { FieldOptions, MoveOptions, PokemonOptions };
