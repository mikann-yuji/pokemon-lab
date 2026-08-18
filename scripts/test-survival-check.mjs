import assert from "node:assert/strict";
import test from "node:test";
import { isSurvivalAdvantage } from "../src/features/damage-calculator/domain/survival-check-logic.ts";
import {
  getDefaultVariableMovePower,
  getVariableMovePowers,
} from "../src/features/damage-calculator/domain/variable-move-power.ts";

test("a slower guaranteed OHKO is favorable below high-random incoming damage", () => {
  assert.equal(
    isSurvivalAdvantage({
      movesFirst: false,
      outgoingMinimumPercent: 100,
      incomingOneHitProbabilities: [0, 0.125, 0.5, 0.6875],
    }),
    true,
  );
});

test("a slower guaranteed OHKO is not favorable against a high-random OHKO", () => {
  assert.equal(
    isSurvivalAdvantage({
      movesFirst: false,
      outgoingMinimumPercent: 100,
      incomingOneHitProbabilities: [0.75, 0, 0, 0],
    }),
    false,
  );
});

test("Last Respects defaults to 150 power", () => {
  const move = { id: "last-respects", power: 50 };
  const options = getVariableMovePowers(move);
  assert.ok(options);
  assert.equal(getDefaultVariableMovePower(move, options), 150);
});
