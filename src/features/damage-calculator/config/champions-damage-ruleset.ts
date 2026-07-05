/**
 * このファイルの役割:
 * Pokémon Champions向けの計算条件を一箇所にまとめる。
 *
 * Championsのレベル上限や計算式が変わった場合は、画面や変換処理ではなく
 * 原則としてこのルールセットを変更する。
 */

import {
  SmogonDamageCalculator,
  type DamageCalculatorRuleset,
} from "../application/smogon-damage-calculator";

export const CHAMPIONS_DAMAGE_RULESET = {
  id: "pokemon-champions-current",
  // 現時点では既存の第9世代式を基準にする。Champions固有仕様は
  // customizePokemon / customizeMove / createField / calculateで局所的に差し替える。
  generation: 9,
  level: 50,
  nature: "Serious",
  ability: "None",
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
} satisfies DamageCalculatorRuleset;

export const championsDamageCalculator = new SmogonDamageCalculator(
  CHAMPIONS_DAMAGE_RULESET,
);
