import assert from "node:assert/strict";
import test from "node:test";
import { getRelevantStatIds } from "../src/features/damage-calculator/domain/relevant-damage-stats.ts";

test("Body Press uses the attacker's Defense", () => {
  assert.deepEqual(
    getRelevantStatIds({ id: "body-press", damageClass: "physical" }),
    { attacker: "defense", defender: "defense" },
  );
});

test("ordinary physical and special moves keep their normal stats", () => {
  assert.deepEqual(
    getRelevantStatIds({ id: "bullet-punch", damageClass: "physical" }),
    { attacker: "attack", defender: "defense" },
  );
  assert.deepEqual(
    getRelevantStatIds({ id: "moonblast", damageClass: "special" }),
    { attacker: "special-attack", defender: "special-defense" },
  );
});
