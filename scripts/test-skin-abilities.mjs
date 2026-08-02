import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAbilityMoveConversion,
  hasMoveTypeChangingAbility,
  resolveAbilityAttackerTypes,
  resolveAbilityMoveConversion,
} from "../src/features/damage-calculator/domain/ability-move-conversion.ts";
import { getTypeEffectiveness } from "../src/domain/type-matchup.ts";

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

test("dragonize Double-Edge is neutral against Rock and Dark", () => {
  const source = {
    Normal: { Rock: 0.5, Dark: 1 },
    Dragon: { Rock: 1, Dark: 1 },
  };
  const conversion = resolveAbilityMoveConversion("dragonize", "Normal");

  assert.equal(getTypeEffectiveness("Normal", ["Rock", "Dark"], source), 0.5);
  assert.equal(
    getTypeEffectiveness(conversion.effectiveType, ["Rock", "Dark"], source),
    1,
  );
});

for (const abilityId of ["protean", "libero"]) {
  test(`${abilityId} changes the attacker to the selected move type`, () => {
    assert.deepEqual(
      resolveAbilityAttackerTypes(abilityId, "Ice", true, ["Water", "Dark"]),
      ["Ice"],
    );
    assert.equal(hasMoveTypeChangingAbility(abilityId), true);
  });

  test(`${abilityId} keeps the original types when disabled`, () => {
    assert.deepEqual(
      resolveAbilityAttackerTypes(abilityId, "Ice", false, ["Water", "Dark"]),
      ["Water", "Dark"],
    );
  });
}
