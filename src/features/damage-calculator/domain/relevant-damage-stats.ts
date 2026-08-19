import type { DamageCalculatorMove } from "./damage-calculator-types";

/** 選択技が実際に参照する攻撃側・防御側の能力を返す。 */
export function getRelevantStatIds(
  move: Pick<DamageCalculatorMove, "id" | "damageClass"> | undefined,
) {
  if (!move) return { attacker: null, defender: null } as const;
  if (move.id === "body-press") {
    return { attacker: "defense", defender: "defense" } as const;
  }
  return move.damageClass === "physical"
    ? ({ attacker: "attack", defender: "defense" } as const)
    : ({ attacker: "special-attack", defender: "special-defense" } as const);
}
