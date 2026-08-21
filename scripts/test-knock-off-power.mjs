import assert from "node:assert/strict";
import test from "node:test";
import { getDefenderItemMovePowerMultiplier } from "../src/features/damage-calculator/domain/move-power-modifiers.ts";

test("Knock Off is boosted against a removable held item", () => {
  assert.equal(
    getDefenderItemMovePowerMultiplier("knock-off", { isMegaStone: false }),
    1.5,
  );
});

test("Knock Off is not boosted without an item or against a Mega Stone", () => {
  assert.equal(getDefenderItemMovePowerMultiplier("knock-off", null), 1);
  assert.equal(
    getDefenderItemMovePowerMultiplier("knock-off", { isMegaStone: true }),
    1,
  );
});

test("other moves are not boosted by the defender's item", () => {
  assert.equal(
    getDefenderItemMovePowerMultiplier("sucker-punch", {
      isMegaStone: false,
    }),
    1,
  );
});
