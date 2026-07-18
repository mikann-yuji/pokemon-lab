import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDamageZone,
  durabilityIndex,
  firepowerIndex,
} from "../src/features/damage-adjustment-map/damage-adjustment-map-model.ts";

test("撃破区分を正式計算の範囲と確率から分類する", () => {
  assert.equal(classifyDamageZone({
    minimum: 180, maximum: 210, defenderHp: 180,
    oneHitProbability: 1, twoHitProbability: 1,
  }), "certain-one");
  assert.equal(classifyDamageZone({
    minimum: 160, maximum: 190, defenderHp: 180,
    oneHitProbability: 0.6875, twoHitProbability: 1,
  }), "random-one-mid");
  assert.equal(classifyDamageZone({
    minimum: 91, maximum: 105, defenderHp: 180,
    oneHitProbability: 0, twoHitProbability: 1,
  }), "certain-two");
});

test("物理・特殊で選んだ実数値が指数へ反映される", () => {
  assert.equal(firepowerIndex(170, 100, 0), 17000);
  assert.equal(firepowerIndex(200, 100, 0), 20000);
  assert.equal(durabilityIndex(180, 150, 0), 27000);
});

test("能力ポイント相当の実数値増加とランクで座標が移動する", () => {
  assert.ok(firepowerIndex(172, 100, 0) > firepowerIndex(170, 100, 0));
  assert.ok(durabilityIndex(181, 150, 0) > durabilityIndex(180, 150, 0));
  assert.ok(firepowerIndex(170, 100, 1) > firepowerIndex(170, 100, 0));
  assert.ok(durabilityIndex(180, 150, 1) > durabilityIndex(180, 150, 0));
});

test("同じ耐久指数でもHPと防御の内訳は保持され、正式計算へ別入力できる", () => {
  assert.equal(durabilityIndex(150, 180, 0), durabilityIndex(180, 150, 0));
  assert.notDeepEqual({ hp: 150, defense: 180 }, { hp: 180, defense: 150 });
});
