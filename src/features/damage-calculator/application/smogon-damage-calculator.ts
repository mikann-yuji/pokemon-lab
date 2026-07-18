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
import {
  getTypeEffectiveness as calculateTypeEffectiveness,
  type TypeEffectivenessSource,
} from "@/domain/type-matchup";
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
  damageRolls: number[];
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
  oneHitProbability: number;
  twoHitProbability: number;
};

function flattenDamageRolls(damage: Result["damage"]): number[] {
  return Array.isArray(damage)
    ? damage.flatMap((value) =>
        Array.isArray(value)
          ? flattenDamageRolls(value as Result["damage"])
          : [Number(value)],
      )
    : [Number(damage)];
}

function hitProbability(rolls: number[], hp: number, hits: 1 | 2) {
  if (rolls.length === 0) return 0;
  if (hits === 1) {
    return rolls.filter((damage) => damage >= hp).length / rolls.length;
  }
  let successful = 0;
  for (const first of rolls) {
    for (const second of rolls) {
      if (first + second >= hp) successful += 1;
    }
  }
  return successful / (rolls.length * rolls.length);
}

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
  typeEffectivenessSource?: TypeEffectivenessSource | null;
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

/** PokeAPI/DB由来のIDを、Smogon lookup用の小文字英数字IDへ寄せる。 */
/**
 * ダメージ計算ページで、DB由来IDを@smogon/calc検索用IDへ正規化する。
 *
 * @param value - PokeAPIやcatalog.db由来のID。
 * @returns 英数字だけを残した小文字ID。
 */
function normalizeId(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/** DBのstat_idキーを、@smogon/calcが期待するatk/def/spa形式へ変換する。 */
/**
 * ダメージ計算ページで、基礎値から@smogon/calc基準の実数値を計算する。
 *
 * @param input - 能力ID、基礎値、ゲームルール。
 * @returns 指定能力の実数値。
 */
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

/**
 * ダメージ計算ページで、ユーザー指定の実数値に近い基礎値を逆算する。
 *
 * @param input - 能力ID、目標実数値、ゲームルール。
 * @returns @smogon/calcへ渡すための近似基礎値。
 */
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

/**
 * ダメージ計算ページで、アプリの能力表を@smogon/calcの基礎値表へ変換する。
 *
 * @param pokemon - 計算対象のポケモン。
 * @param ruleset - レベル、個体値、努力値相当を含むルールセット。
 * @returns @smogon/calcが読むStatsTable。
 */
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

/**
 * ダメージ計算ページで、指定済み実数値を@smogon/calcの能力表へ変換する。
 *
 * @param pokemon - 計算対象のポケモン。
 * @returns 実数値が設定されていればStatsTable、未設定ならnull。
 */
function toActualStats(pokemon: DamageCalculatorPokemon): StatsTable | null {
  if (!pokemon.actualStats) return null;
  return Object.fromEntries(
    Object.entries(STAT_IDS).map(([databaseId, calculatorId]) => [
      calculatorId,
      pokemon.actualStats?.[databaseId] ?? pokemon.stats[databaseId] ?? 1,
    ]),
  ) as StatsTable;
}

/**
 * ダメージ計算ページで、能力ランク補正を@smogon/calcのboost表へ変換する。
 *
 * @param pokemon - 計算対象のポケモン。
 * @returns 指定済み能力ランクだけを含むboost表。
 */
function toBoosts(pokemon: DamageCalculatorPokemon): Partial<StatsTable> {
  if (!pokemon.boosts) return {};
  return Object.fromEntries(
    Object.entries(STAT_IDS).flatMap(([databaseId, calculatorId]) => {
      const boost = pokemon.boosts?.[databaseId];
      return typeof boost === "number" ? [[calculatorId, boost]] : [];
    }),
  ) as Partial<StatsTable>;
}

/**
 * ダメージ計算ページで、選択技が防御側タイプに何倍で通るか計算する。
 *
 * @param input - 攻撃側、防御側、技、タイプ相性表を含む計算入力。
 * @returns タイプ相性倍率。
 */
function getTypeEffectiveness(input: DamageCalculationInput) {
  return calculateTypeEffectiveness(
    input.move.typeName,
    input.defender.types,
    input.typeEffectivenessSource,
  );
}

/**
 * ダメージ計算ページで、けたぐり/くさむすび系の体重依存威力を決める。
 *
 * @param weightKg - 防御側ポケモンの体重kg。
 * @returns 体重帯に応じた技威力。
 */
function getWeightBasedMovePower(weightKg: number) {
  if (weightKg >= 200) return 120;
  if (weightKg >= 100) return 100;
  if (weightKg >= 50) return 80;
  if (weightKg >= 25) return 60;
  if (weightKg >= 10) return 40;
  return 20;
}

/**
 * ダメージ計算ページで、計算に使う最終的な技威力を決める。
 *
 * @param input - 技、防御側体重、場の条件を含む計算入力。
 * @returns 0威力技も@smogon/calcへ渡せるように補正した技威力。
 */
function getEffectiveMovePower(input: DamageCalculationInput) {
  if (input.move.power > 0) return input.move.power;
  if (["grass-knot", "low-kick"].includes(input.move.id)) {
    return getWeightBasedMovePower(input.defender.weightKg);
  }
  return 1;
}

/**
 * ダメージ計算ページで、持ち物のダメージ補正条件を満たすか判定する。
 *
 * @param modifier - catalog.dbから読んだ持ち物補正定義。
 * @param input - 現在の計算入力。
 * @returns 補正を適用するならtrue。
 */
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

/**
 * ダメージ計算ページで、攻撃側持ち物による技威力倍率を計算する。
 *
 * @param input - 現在の計算入力。
 * @returns 持ち物補正を含む威力倍率。
 */
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

/**
 * ダメージ計算ページで、手動条件付き特性が有効化されているか確認する。
 *
 * @param side - 判定する側。
 * @param input - 現在の計算入力。
 * @returns 画面上で条件がONならtrue。
 */
function abilityManualConditionEnabled(
  side: BattleSide,
  input: DamageCalculationInput,
) {
  return side === "attacker"
    ? (input.abilityConditionEnabled?.attacker ?? false)
    : (input.abilityConditionEnabled?.defender ?? false);
}

/**
 * ダメージ計算ページで、特性のダメージ補正条件を満たすか判定する。
 *
 * @param side - 特性を判定する側。
 * @param modifier - catalog.dbから読んだ特性補正定義。
 * @param input - 現在の計算入力。
 * @returns 補正を適用するならtrue。
 */
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

/**
 * ダメージ計算ページで、現在有効な特性補正一覧を取り出す。
 *
 * @param side - 攻撃側または防御側。
 * @param input - 現在の計算入力。
 * @returns 条件を満たした特性補正一覧。
 */
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

/**
 * ダメージ計算ページで、攻撃側特性による技威力倍率を計算する。
 *
 * @param input - 現在の計算入力。
 * @returns 特性補正を含む威力倍率。
 */
function getAbilityPowerMultiplier(input: DamageCalculationInput) {
  return getAbilityModifiers("attacker", input)
    .filter(
      (modifier) =>
        modifier.modifierKind === "power" || modifier.modifierKind === "stab",
    )
    .reduce((multiplier, modifier) => multiplier * modifier.multiplier, 1);
}

/**
 * ダメージ計算ページで、攻撃側特性による攻撃/特攻実数値倍率を計算する。
 *
 * @param input - 現在の計算入力。
 * @returns 攻撃または特攻にかける倍率。
 */
function getAbilityAttackingStatMultiplier(input: DamageCalculationInput) {
  return getAbilityModifiers("attacker", input)
    .filter((modifier) => modifier.modifierKind === "attacking_stat")
    .reduce((multiplier, modifier) => multiplier * modifier.multiplier, 1);
}

/**
 * ダメージ計算ページで、防御側特性による被ダメージ倍率を計算する。
 *
 * @param input - 現在の計算入力。
 * @returns 最終ダメージにかける倍率。
 */
function getAbilityReceivedDamageMultiplier(input: DamageCalculationInput) {
  return getAbilityModifiers("defender", input)
    .filter((modifier) => modifier.modifierKind === "received_damage")
    .reduce((multiplier, modifier) => multiplier * modifier.multiplier, 1);
}

/**
 * ダメージ計算ページで、攻撃側持ち物による攻撃/特攻実数値倍率を計算する。
 *
 * @param input - 現在の計算入力。
 * @returns 攻撃または特攻にかける倍率。
 */
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

/**
 * ダメージ計算ページで、防御側持ち物による被ダメージ倍率を計算する。
 *
 * @param input - 現在の計算入力。
 * @returns 最終ダメージにかける倍率。
 */
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

/**
 * ダメージ計算ページで、@smogon/calcが返したダメージ配列へ倍率を後掛けする。
 *
 * @param damage - @smogon/calcのダメージ結果。
 * @param multiplier - ダメージへかける倍率。
 * @returns 倍率適用後のダメージ結果。
 */
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

/**
 * ダメージ計算ページで、攻撃/特攻補正を@smogon/calcのPokemonへ反映する。
 *
 * @param pokemon - @smogon/calc用に変換済みの攻撃側Pokemon。
 * @param move - 使用技。
 * @param multiplier - 攻撃または特攻へかける倍率。
 * @returns 戻り値なし。
 */
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

/**
 * ダメージ計算ページで、@smogon/calcのKO確率を日本語表示へ変換する。
 *
 * @param input - @smogon/calcのKO確率と必要攻撃回数。
 * @returns 画面表示用のKOラベル。
 */
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
 *
 * @remarks ダメージ計算ページと逆引き計算ページの両方から利用される。
 */
export class SmogonDamageCalculator {
  /**
   * ダメージ計算ページで、ゲーム別の計算ルールを持つ計算器を作る。
   *
   * @param ruleset - 世代、レベル、補正hookを含む計算ルール。
   */
  constructor(readonly ruleset: DamageCalculatorRuleset) {}

  /**
   * ダメージ計算ページで、攻撃側・防御側・技から画面表示用のダメージ範囲を計算する。
   *
   * @param input - 攻撃側、防御側、技、場、急所、特性条件を含む計算入力。
   * @returns 最小/最大ダメージ、割合、KO表示を含む計算結果。
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
    const damageRolls = flattenDamageRolls(sourceResult.damage);
    const koChance =
      maximum === 0
        ? { text: "ダメージなし", n: 0, chance: 0 }
        : sourceResult.kochance();
    const result: DamageCalculation = {
      damageRolls,
      minimum,
      maximum,
      defenderHp,
      minimumPercent: (minimum / defenderHp) * 100,
      maximumPercent: (maximum / defenderHp) * 100,
      koChance: koChance.text,
      koLabel: formatKoLabel(koChance),
      koHits: koChance.n,
      koProbability: koChance.chance,
      oneHitProbability: hitProbability(damageRolls, defenderHp, 1),
      twoHitProbability: hitProbability(damageRolls, defenderHp, 2),
    };

    return this.ruleset.transformResult?.(result, sourceResult, input) ?? result;
  }

  /**
   * ダメージ計算ページで、アプリ内ポケモンを@smogon/calcのPokemonへ変換する。
   *
   * @param side - 攻撃側または防御側。
   * @param pokemon - アプリ内の計算対象ポケモン。
   * @returns @smogon/calcで計算できるPokemonインスタンス。
   */
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

  /**
   * ダメージ計算ページで、アプリ内技データを@smogon/calcのMoveへ変換する。
   *
   * @param move - アプリ内の技データ。
   * @param isCritical - 急所として計算するか。
   * @param basePower - 補正前の実効威力。
   * @param powerMultiplier - 威力へかける補正倍率。
   * @returns @smogon/calcで計算できるMoveインスタンス。
   */
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
