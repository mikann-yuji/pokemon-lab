import type { DamageCalculatorHeldItem } from "./damage-calculator-types";

/**
 * @smogon/calcへ、ポルターガイストの成否判定に必要な持ち物の有無だけを伝える。
 * 実際の持ち物名を渡すとライブラリ側でも補正される可能性があるため、補正のない持ち物を使う。
 */
export function getPoltergeistDefenderItem(
  moveId: string,
  heldItem: DamageCalculatorHeldItem | null | undefined,
) {
  return moveId === "poltergeist" && heldItem ? "Leftovers" : undefined;
}
