import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const types = [
  ["Normal", "ノーマル", [], ["Rock", "Steel"], ["Ghost"]],
  ["Fire", "ほのお", ["Grass", "Ice", "Bug", "Steel"], ["Fire", "Water", "Rock", "Dragon"], []],
  ["Water", "みず", ["Fire", "Ground", "Rock"], ["Water", "Grass", "Dragon"], []],
  ["Electric", "でんき", ["Water", "Flying"], ["Electric", "Grass", "Dragon"], ["Ground"]],
  ["Grass", "くさ", ["Water", "Ground", "Rock"], ["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"], []],
  ["Ice", "こおり", ["Flying", "Ground", "Grass", "Dragon"], ["Fire", "Water", "Ice", "Steel"], []],
  ["Fighting", "かくとう", ["Normal", "Ice", "Rock", "Dark", "Steel"], ["Poison", "Flying", "Psychic", "Bug", "Fairy"], ["Ghost"]],
  ["Poison", "どく", ["Grass", "Fairy"], ["Poison", "Ground", "Rock", "Ghost"], ["Steel"]],
  ["Ground", "じめん", ["Fire", "Electric", "Poison", "Rock", "Steel"], ["Grass", "Bug"], ["Flying"]],
  ["Flying", "ひこう", ["Fighting", "Bug", "Grass"], ["Rock", "Steel", "Electric"], []],
  ["Psychic", "エスパー", ["Fighting", "Poison"], ["Psychic", "Steel"], ["Dark"]],
  ["Bug", "むし", ["Grass", "Psychic", "Dark"], ["Fire", "Fighting", "Flying", "Poison", "Ghost", "Steel", "Fairy"], []],
  ["Rock", "いわ", ["Flying", "Bug", "Fire", "Ice"], ["Fighting", "Ground", "Steel"], []],
  ["Ghost", "ゴースト", ["Ghost", "Psychic"], ["Dark"], ["Normal"]],
  ["Dragon", "ドラゴン", ["Dragon"], ["Steel"], ["Fairy"]],
  ["Dark", "あく", ["Ghost", "Psychic"], ["Fighting", "Dark", "Fairy"], []],
  ["Steel", "はがね", ["Ice", "Rock", "Fairy"], ["Fire", "Water", "Electric", "Steel"], []],
  ["Fairy", "フェアリー", ["Fighting", "Dragon", "Dark"], ["Fire", "Poison", "Steel"], []],
];

const dataDirectory = path.join(process.cwd(), "data");
mkdirSync(dataDirectory, { recursive: true });

const databasePath =
  process.env.DATABASE_PATH ?? path.join(dataDirectory, "pokemon-lab.db");
const database = new Database(databasePath);
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS types (
    name TEXT PRIMARY KEY,
    name_ja TEXT NOT NULL,
    sort_order INTEGER NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS type_matchups (
    attacker_type TEXT NOT NULL REFERENCES types(name),
    defender_type TEXT NOT NULL REFERENCES types(name),
    effectiveness REAL NOT NULL CHECK (effectiveness IN (0, 0.5, 1, 2)),
    PRIMARY KEY (attacker_type, defender_type)
  );
`);

const insertType = database.prepare(
  "INSERT INTO types (name, name_ja, sort_order) VALUES (?, ?, ?)",
);
const insertMatchup = database.prepare(`
  INSERT INTO type_matchups (attacker_type, defender_type, effectiveness)
  VALUES (?, ?, ?)
`);

database.transaction(() => {
  database.exec("DELETE FROM type_matchups; DELETE FROM types;");

  types.forEach(([name, nameJa], index) => {
    insertType.run(name, nameJa, index);
  });

  for (const [attacker, , superEffective, notVeryEffective, noEffect] of types) {
    for (const [defender] of types) {
      const effectiveness = noEffect.includes(defender)
        ? 0
        : superEffective.includes(defender)
          ? 2
          : notVeryEffective.includes(defender)
            ? 0.5
            : 1;
      insertMatchup.run(attacker, defender, effectiveness);
    }
  }
})();

database.close();
console.log(`Initialized SQLite database: ${databasePath}`);
