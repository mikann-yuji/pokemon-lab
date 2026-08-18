import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seed = await readFile(
  new URL("../database/seeds/champions_item_damage_modifiers.csv", import.meta.url),
  "utf8",
);
const modifiers = new Map(
  seed
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [itemId, modifierKind] = line.split(",");
      return [itemId, modifierKind];
    }),
);

test("library-supported held items remain app-managed", async () => {
  const calculatorSource = await readFile(
    new URL(
      "../src/features/damage-calculator/application/smogon-damage-calculator.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(calculatorSource, /item:\s*calculatorItem/);
});

test("final-damage items are not folded into move base power", () => {
  assert.equal(modifiers.get("life-orb"), "final_damage");
  assert.equal(modifiers.get("expert-belt"), "final_damage");
  assert.equal(modifiers.get("metronome"), "final_damage");
  assert.equal(modifiers.get("muscle-band"), "power");
  assert.equal(modifiers.get("wise-glasses"), "power");
});
