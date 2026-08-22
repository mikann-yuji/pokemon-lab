import assert from "node:assert/strict";
import test from "node:test";
import { getPoltergeistDefenderItem } from "../src/features/damage-calculator/domain/poltergeist.ts";

const heldItem = {
  id: "leftovers",
  name: "たべのこし",
  isMegaStone: false,
  damageModifier: null,
};

test("Poltergeist tells the calculator that the defender has an item", () => {
  assert.equal(
    getPoltergeistDefenderItem("poltergeist", heldItem),
    "Leftovers",
  );
});

test("Poltergeist remains unsuccessful when the defender has no item", () => {
  assert.equal(getPoltergeistDefenderItem("poltergeist", null), undefined);
});

test("other moves do not pass an item to the calculator", () => {
  assert.equal(getPoltergeistDefenderItem("shadow-claw", heldItem), undefined);
});
