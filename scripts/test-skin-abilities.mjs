import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAbilityMoveConversion,
  resolveAbilityMoveConversion,
} from "../src/features/damage-calculator/domain/ability-move-conversion.ts";

const normalSkinCases = [
  ["refrigerate", "Ice"],
  ["pixilate", "Fairy"],
  ["aerilate", "Flying"],
  ["galvanize", "Electric"],
  ["dragonize", "Dragon"],
];

for (const [abilityId, expectedType] of normalSkinCases) {
  test(`${abilityId} converts Normal moves to ${expectedType} at 1.2x power`, () => {
    const result = resolveAbilityMoveConversion(abilityId, "Normal");
    assert.deepEqual(result, {
      applies: true,
      effectiveType: expectedType,
      typeChanged: true,
      powerMultiplier: 1.2,
    });
    assert.equal(hasAbilityMoveConversion(abilityId), true);
  });

  test(`${abilityId} does not change non-Normal moves`, () => {
    assert.deepEqual(resolveAbilityMoveConversion(abilityId, "Fire"), {
      applies: false,
      effectiveType: "Fire",
      typeChanged: false,
      powerMultiplier: 1,
    });
  });
}

test("normalize converts damaging moves to Normal and boosts them", () => {
  assert.deepEqual(resolveAbilityMoveConversion("normalize", "Fire"), {
    applies: true,
    effectiveType: "Normal",
    typeChanged: true,
    powerMultiplier: 1.2,
  });
  assert.deepEqual(resolveAbilityMoveConversion("normalize", "Normal"), {
    applies: true,
    effectiveType: "Normal",
    typeChanged: false,
    powerMultiplier: 1.2,
  });
});

test("an unrelated ability leaves the move unchanged", () => {
  assert.deepEqual(resolveAbilityMoveConversion("huge-power", "Normal"), {
    applies: false,
    effectiveType: "Normal",
    typeChanged: false,
    powerMultiplier: 1,
  });
  assert.equal(hasAbilityMoveConversion("huge-power"), false);
});
