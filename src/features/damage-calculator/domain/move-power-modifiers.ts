import type { DamageCalculatorHeldItem } from "./damage-calculator-types";

/** はたきおとすは、相手がメガストーン以外の持ち物を持つ場合だけ威力が1.5倍になる。 */
export function getDefenderItemMovePowerMultiplier(
  moveId: string,
  defenderItem: Pick<DamageCalculatorHeldItem, "isMegaStone"> | null | undefined,
) {
  return moveId === "knock-off" && defenderItem && !defenderItem.isMegaStone
    ? 1.5
    : 1;
}
