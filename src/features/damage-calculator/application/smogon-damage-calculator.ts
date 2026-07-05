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
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";

type BattleSide = "attacker" | "defender";
type PokemonOptions = ConstructorParameters<typeof Pokemon>[2];
type MoveOptions = ConstructorParameters<typeof Move>[2];
type FieldOptions = ConstructorParameters<typeof Field>[0];

export type DamageCalculation = {
  minimum: number;
  maximum: number;
  defenderHp: number;
  minimumPercent: number;
  maximumPercent: number;
  koChance: string;
};

export type DamageCalculationInput = {
  attacker: DamageCalculatorPokemon;
  defender: DamageCalculatorPokemon;
  move: DamageCalculatorMove;
  field?: FieldOptions;
};

export type DamageCalculatorRuleset = {
  id: string;
  generation: GenerationNum;
  level: number;
  nature: string;
  ability?: string;
  ivs: Partial<StatsTable>;
  evs: Partial<StatsTable>;
  resolveSpeciesId?: (pokemon: DamageCalculatorPokemon) => string;
  resolveMoveId?: (move: DamageCalculatorMove) => string;
  customizePokemon?: (
    side: BattleSide,
    source: DamageCalculatorPokemon,
    options: PokemonOptions,
  ) => PokemonOptions;
  customizeMove?: (
    source: DamageCalculatorMove,
    options: MoveOptions,
  ) => MoveOptions;
  createField?: (input: DamageCalculationInput) => FieldOptions;
  calculate?: (
    generation: ReturnType<typeof Generations.get>,
    attacker: Pokemon,
    defender: Pokemon,
    move: Move,
    field: Field,
  ) => Result;
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

function normalizeId(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function toBaseStats(pokemon: DamageCalculatorPokemon): StatsTable {
  return Object.fromEntries(
    Object.entries(STAT_IDS).map(([databaseId, calculatorId]) => [
      calculatorId,
      pokemon.stats[databaseId] ?? 1,
    ]),
  ) as StatsTable;
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
    const move = this.toMove(input.move);
    const field = new Field({
      ...this.ruleset.createField?.(input),
      ...input.field,
    });
    const sourceResult = this.ruleset.calculate
      ? this.ruleset.calculate(generation, attacker, defender, move, field)
      : calculate(generation, attacker, defender, move, field);
    const [minimum, maximum] = sourceResult.range();
    const defenderHp = sourceResult.defender.maxHP();
    const result: DamageCalculation = {
      minimum,
      maximum,
      defenderHp,
      minimumPercent: (minimum / defenderHp) * 100,
      maximumPercent: (maximum / defenderHp) * 100,
      koChance: sourceResult.kochance().text,
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
      overrides: {
        types,
        baseStats: toBaseStats(pokemon),
        weightkg: pokemon.weightKg,
      },
    };

    return new Pokemon(
      generation,
      calculatorSpecies,
      this.ruleset.customizePokemon?.(side, pokemon, options) ?? options,
    );
  }

  private toMove(move: DamageCalculatorMove): Move {
    // 技名がSmogon側に存在すれば固有効果を利用し、存在しない場合でも
    // DBの威力・タイプ・分類を上書きして基本ダメージを計算する。
    const generation = Generations.get(this.ruleset.generation);
    const sourceId =
      this.ruleset.resolveMoveId?.(move) ?? normalizeId(move.id);
    const calculatorMove =
      generation.moves.get(sourceId as never)?.name ?? "Pound";
    const options: MoveOptions = {
      overrides: {
        basePower: move.power,
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
