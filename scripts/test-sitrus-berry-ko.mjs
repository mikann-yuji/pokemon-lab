import assert from "node:assert/strict";
import test from "node:test";
import { calculateSitrusBerryKo } from "../src/features/training/domain/sitrus-berry-ko.ts";

test("オボンのみは残りHPが半分以下になった時に一度だけ回復する", () => {
  assert.deepEqual(calculateSitrusBerryKo([[60]], 100), {
    hits: 3,
    probability: 1,
    label: "確定3発（オボンのみ込み）",
  });
  assert.equal(calculateSitrusBerryKo([[50]], 100).hits, 3);
  assert.equal(calculateSitrusBerryKo([[25]], 100).hits, 5);
});

test("一撃で倒れた場合はオボンのみで回復しない", () => {
  assert.deepEqual(calculateSitrusBerryKo([[100]], 100), {
    hits: 1,
    probability: 1,
    label: "確定1発（オボンのみ込み）",
  });
});

test("ダメージ乱数からオボンのみ込みのKO確率を求める", () => {
  assert.deepEqual(calculateSitrusBerryKo([[40, 60]], 100), {
    hits: 2,
    probability: 0.25,
    label: "乱数2発（25%・オボンのみ込み）",
  });
});

test("連続技の途中でもオボンのみが発動する", () => {
  assert.deepEqual(calculateSitrusBerryKo([[60], [60]], 100), {
    hits: 2,
    probability: 1,
    label: "確定2発（オボンのみ込み）",
  });
});

test("ダメージがない場合を表示できる", () => {
  assert.deepEqual(calculateSitrusBerryKo([[0]], 100), {
    hits: 0,
    probability: 0,
    label: "ダメージなし（オボンのみ込み）",
  });
});
// オボンのみの回復を挟む瀕死判定が想定どおりになるかを回帰検証する。
