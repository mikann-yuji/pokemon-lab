// 皮膚系特性とへんげんじざい系特性のタイプ変換・威力補正を回帰検証する。
import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAbilityMoveConversion,
  hasMoveTypeChangingAbility,
  resolveAbilityAttackerTypes,
  resolveAbilityMoveConversion,
  resolveMoveTypeChangingAbilityStabMultiplier,
} from "../src/features/damage-calculator/domain/ability-move-conversion.ts";
import { getTypeEffectiveness } from "../src/domain/type-matchup.ts";

// 同じ規則を持つ特性は表形式にし、追加時にも同じ期待値を必ず検証する。
const normalSkinCases = [
  ["refrigerate", "Ice"],
  ["pixilate", "Fairy"],
  ["aerilate", "Flying"],
  ["galvanize", "Electric"],
  ["dragonize", "Dragon"],
];

for (const [abilityId, expectedType] of normalSkinCases) {
  // 対象となるノーマル技では、タイプ変換と1.2倍補正の両方が必要になる。
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

  // 変換対象外の技まで変わる回帰を、各特性について個別に防止する。
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

// へんげんじざいとリベロは同じ計算経路を通るため、共通ケースで保証する。
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

  // マスカーニャのトリプルアクセルのような元タイプ外の技が主な回帰対象。
  test(`${abilityId} explicitly applies STAB to a different-type move`, () => {
    assert.equal(
      resolveMoveTypeChangingAbilityStabMultiplier(
        abilityId,
        "Ice",
        true,
        ["Grass", "Dark"],
      ),
      1.5,
    );
    assert.equal(
      resolveMoveTypeChangingAbilityStabMultiplier(
        abilityId,
        "Ice",
        false,
        ["Grass", "Dark"],
      ),
      1,
    );
  });

  // 元から一致する技へ1.5倍を二重適用しないことも同時に確認する。
  test(`${abilityId} does not duplicate existing STAB`, () => {
    assert.equal(
      resolveMoveTypeChangingAbilityStabMultiplier(
        abilityId,
        "Grass",
        true,
        ["Grass", "Dark"],
      ),
      1,
    );
  });
}
