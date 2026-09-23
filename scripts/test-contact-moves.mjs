import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import ts from "typescript";
import { isContactMove, parseContactMoves, updateContactCsv } from "./fetch-move-contact-flags.mjs";

// Load the real calculator and its local TS imports without a test-only implementation.
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8").replaceAll('"@/', `"${path.resolve("src").replaceAll("\\", "/")}/`);
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const { championsDamageCalculator: calculator } = require("../src/features/damage-calculator/config/champions-damage-ruleset.ts");
const catalog = new Database(".tmp/sqlite-catalog.db", { readonly: true });
const modifier = catalog.prepare("SELECT modifier_kind AS modifierKind, multiplier, condition, move_type_name AS moveTypeName FROM champions_ability_damage_modifiers WHERE ability_id = 'tough-claws'").get();
const ability = { id: "tough-claws", name: "かたいツメ", effect: null, damageModifiers: [modifier] };
const pokemon = {
  id: 6, speciesId: 6, isMega: false, name: "charizard", nameJa: "リザードン", weightKg: 90.5,
  imageUrl: null, fallbackImageUrl: null, types: ["Fire", "Flying"],
  stats: { hp: 78, attack: 84, defense: 78, "special-attack": 109, "special-defense": 85, speed: 100 },
  abilities: [], moves: [], selectedAbility: ability,
};
const defender = { ...pokemon, selectedAbility: null };

for (const [id, contact] of [["dragon-claw", true], ["earthquake", false], ["grass-knot", true], ["low-kick", true], ["flamethrower", false]]) {
  test(`${id}: catalog contact flag and automatic 1.3x power agree`, () => {
    const row = catalog.prepare("SELECT id, name_ja AS name, type_name AS typeName, damage_class_name AS damageClass, power, accuracy, effect_chance AS effectChance, is_contact FROM moves WHERE id = ?").get(id);
    assert.equal(row.is_contact, Number(contact));
    const move = { ...row, isContact: row.is_contact === 1, power: 80, description: null, usageRate: null };
    // A neutral target makes the noncontact Ground test meaningful too.
    const target = { ...defender, types: ["Normal"] };
    const calculate = (attacker, move, manual) => calculator.calculate({ attacker, defender: target, move, abilityConditionEnabled: { attacker: manual, defender: false } });
    const automatic = calculate(pokemon, move, false);
    const manuallyChecked = calculate(pokemon, move, true);
    const expected = calculate({ ...pokemon, selectedAbility: null }, { ...move, power: contact ? 104 : 80 }, false);
    assert.deepEqual(automatic.damageRolls, expected.damageRolls);
    if (contact) assert.ok(automatic.maximum > calculate({ ...pokemon, selectedAbility: null }, move, false).maximum);
    assert.deepEqual(manuallyChecked.damageRolls, automatic.damageRolls);
    const defenderOnly = calculator.calculate({ attacker: { ...pokemon, selectedAbility: null }, defender: { ...target, selectedAbility: ability }, move });
    assert.deepEqual(defenderOnly.damageRolls, calculate({ ...pokemon, selectedAbility: null }, move, false).damageRolls);
  });
}

test("CSV enrichment preserves multiline/quoted fields and is idempotent", () => {
  const contacts = new Set(["grassknot", "visegrip"]);
  const csv = 'id,effect_ja\ngrass-knot,"line 1\nline ""2"""\nearthquake,ground\n';
  const expected = 'id,effect_ja,is_contact\ngrass-knot,"line 1\nline ""2""",1\nearthquake,ground,0\n';
  assert.equal(updateContactCsv(csv, contacts), expected);
  assert.equal(updateContactCsv(expected, contacts), expected);
  assert.equal(isContactMove("vice-grip", contacts), true);
});

test("scraper fails closed when the source page is missing its move list", () => {
  assert.throws(() => parseContactMoves("<html>Unavailable</html>"), /incomplete/);
});

test("contact modifier is automatic and keeps the requested 1.3 multiplier", () => {
  assert.equal(modifier.condition, "contact");
  assert.equal(modifier.multiplier, 1.3);
});

test.after(() => catalog.close());
