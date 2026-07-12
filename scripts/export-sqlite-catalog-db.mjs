/**
 * ブラウザ側user.dbへbulkInsertするための配布用カタログDBを生成する。
 * 生成物はpublic/sqlite-catalog.db.gzとして配布し、ブラウザ側で解凍する。
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const rootDirectory = process.cwd();
const seedsDirectory = path.join(rootDirectory, "database", "seeds");
const publicDirectory = path.join(rootDirectory, "public");
const temporaryDirectory = path.join(rootDirectory, ".tmp");
const databasePath = path.join(temporaryDirectory, "sqlite-catalog.db");
const outputPath = path.join(publicDirectory, "sqlite-catalog.db.gz");

const seedVersion = 7;

// publicへ配布するcatalog.dbにも、通常DBと同じ親子関係順でCSVを投入する。
const seedTableOrder = [
  "types",
  "type_matchups",
  "species",
  "forms",
  "abilities",
  "stats",
  "natures",
  "items",
  "moves",
  "version_groups",
  "move_learn_methods",
  "form_abilities",
  "form_stats",
  "form_types",
  "form_moves",
  "champions_forms",
  "champions_form_move_usage",
  "champions_items",
  "champions_item_damage_modifiers",
  "champions_ability_damage_modifiers",
  "champions_damage_weathers",
  "champions_damage_terrains",
];

const numericColumns = new Map([
  ["types", new Set(["sort_order"])],
  ["type_matchups", new Set(["effectiveness"])],
  [
    "species",
    new Set([
      "id",
      "sort_order",
      "generation_id",
      "evolution_chain_id",
      "gender_rate",
      "capture_rate",
      "base_happiness",
      "hatch_counter",
      "is_baby",
      "is_legendary",
      "is_mythical",
      "has_gender_differences",
      "forms_switchable",
    ]),
  ],
  [
    "forms",
    new Set([
      "id",
      "species_id",
      "pokeapi_form_id",
      "sort_order",
      "form_order",
      "height",
      "weight",
      "base_experience",
      "is_default",
      "is_battle_only",
      "is_mega",
    ]),
  ],
  ["abilities", new Set(["pokeapi_id", "generation_id", "is_main_series"])],
  ["form_abilities", new Set(["form_id", "slot", "is_hidden"])],
  ["stats", new Set(["pokeapi_id", "game_index", "is_battle_only"])],
  ["form_stats", new Set(["form_id", "base_stat", "effort"])],
  ["form_types", new Set(["form_id", "slot"])],
  [
    "moves",
    new Set([
      "pokeapi_id",
      "generation_id",
      "power",
      "pp",
      "accuracy",
      "priority",
      "effect_chance",
    ]),
  ],
  ["version_groups", new Set(["id", "sort_order", "generation_id"])],
  ["move_learn_methods", new Set(["id"])],
  [
    "form_moves",
    new Set([
      "form_id",
      "version_group_id",
      "learn_method_id",
      "level_learned_at",
      "move_order",
    ]),
  ],
  ["champions_forms", new Set(["form_id", "normally_available"])],
  ["champions_form_move_usage", new Set(["form_id", "usage_rate"])],
  [
    "champions_item_damage_modifiers",
    new Set(["multiplier", "max_multiplier"]),
  ],
  ["champions_ability_damage_modifiers", new Set(["id", "multiplier"])],
  [
    "champions_damage_weathers",
    new Set(["sort_order", "normally_available"]),
  ],
  [
    "champions_damage_terrains",
    new Set(["sort_order", "normally_available"]),
  ],
]);

/** CSVを読み、catalog.db投入用に空文字をnull、数値列をNumberへ変換する。 */
function parseCsv(source, filename) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error(`${filename} contains an unclosed quoted field.`);
  if (field.length > 0 || row.length > 0) rows.push([...row, field]);

  const [headers, ...dataRows] = rows;
  if (!headers) throw new Error(`${filename} is empty.`);
  const tableName = filename.replace(".csv", "");
  const numberColumns = numericColumns.get(tableName);

  return {
    columns: headers,
    rows: dataRows
      .filter((record) => record.some((value) => value.trim() !== ""))
      .map((record, rowIndex) => {
        if (record.length !== headers.length) {
          throw new Error(
            `${filename}:${rowIndex + 2} has ${record.length} columns; expected ${headers.length}.`,
          );
        }
        return record.map((value, columnIndex) => {
          const trimmed = value.trim();
          if (trimmed === "") return null;
          return numberColumns?.has(headers[columnIndex])
            ? Number(trimmed)
            : trimmed;
        });
      }),
  };
}

const tables = Object.fromEntries(
  seedTableOrder.map((tableName) => [
    tableName,
    parseCsv(
      readFileSync(path.join(seedsDirectory, `${tableName}.csv`), "utf8"),
      `${tableName}.csv`,
    ),
  ]),
);

/** テーブルごとに列番号を名前で引けるようにする小ヘルパー。 */
function columnIndex(tableName, columnName) {
  return tables[tableName].columns.indexOf(columnName);
}

/** 依存関係に合わせて、不要になった行をテーブル単位で間引く。 */
function filterRows(tableName, predicate) {
  tables[tableName].rows = tables[tableName].rows.filter(predicate);
}

const championsFormIdIndex = columnIndex("champions_forms", "form_id");
const championFormIds = new Set(
  tables.champions_forms.rows.map((row) => row[championsFormIdIndex]),
);

const formsIdIndex = columnIndex("forms", "id");
const formsSpeciesIndex = columnIndex("forms", "species_id");
const formsIsDefaultIndex = columnIndex("forms", "is_default");
const formsIsMegaIndex = columnIndex("forms", "is_mega");

const defaultFormIdBySpeciesId = new Map(
  tables.forms.rows
    .filter((row) => row[formsIsDefaultIndex] === 1)
    .map((row) => [row[formsSpeciesIndex], row[formsIdIndex]]),
);

const selectedFormRows = tables.forms.rows.filter((row) =>
  championFormIds.has(row[formsIdIndex]),
);
const selectedSpeciesIds = new Set(
  selectedFormRows.map((row) => row[formsSpeciesIndex]),
);
const moveSourceFormIds = new Set(
  selectedFormRows.map((row) =>
    row[formsIsMegaIndex] === 1
      ? defaultFormIdBySpeciesId.get(row[formsSpeciesIndex])
      : row[formsIdIndex],
  ),
);
const catalogFormIds = new Set([...championFormIds, ...moveSourceFormIds]);
const catalogFormRows = tables.forms.rows.filter((row) =>
  catalogFormIds.has(row[formsIdIndex]),
);

for (const row of catalogFormRows) {
  selectedSpeciesIds.add(row[formsSpeciesIndex]);
}

filterRows("species", (row) =>
  selectedSpeciesIds.has(row[columnIndex("species", "id")]),
);
filterRows("forms", (row) => catalogFormIds.has(row[formsIdIndex]));
filterRows("form_abilities", (row) =>
  championFormIds.has(row[columnIndex("form_abilities", "form_id")]),
);
filterRows("form_stats", (row) =>
  championFormIds.has(row[columnIndex("form_stats", "form_id")]),
);
filterRows("form_types", (row) =>
  championFormIds.has(row[columnIndex("form_types", "form_id")]),
);

const formMovesFormIndex = columnIndex("form_moves", "form_id");
const formMovesMoveIndex = columnIndex("form_moves", "move_id");
const formMovesVersionGroupIndex = columnIndex("form_moves", "version_group_id");
const versionGroupIdIndex = columnIndex("version_groups", "id");
const versionGroupSortOrderIndex = columnIndex("version_groups", "sort_order");
const versionGroupSortOrderById = new Map(
  tables.version_groups.rows.map((row) => [
    row[versionGroupIdIndex],
    row[versionGroupSortOrderIndex],
  ]),
);
const latestVersionGroupByFormId = new Map();
for (const row of tables.form_moves.rows) {
  const formId = row[formMovesFormIndex];
  if (!moveSourceFormIds.has(formId)) continue;
  const versionGroupId = row[formMovesVersionGroupIndex];
  const sortOrder = versionGroupSortOrderById.get(versionGroupId) ?? 0;
  const current = latestVersionGroupByFormId.get(formId);
  if (!current || sortOrder > current.sortOrder) {
    latestVersionGroupByFormId.set(formId, { id: versionGroupId, sortOrder });
  }
}
filterRows(
  "form_moves",
  (row) =>
    moveSourceFormIds.has(row[formMovesFormIndex]) &&
    latestVersionGroupByFormId.get(row[formMovesFormIndex])?.id ===
      row[formMovesVersionGroupIndex],
);

const selectedMoveIds = new Set(
  tables.form_moves.rows.map((row) => row[formMovesMoveIndex]),
);
filterRows("moves", (row) => selectedMoveIds.has(row[columnIndex("moves", "id")]));
filterRows(
  "champions_form_move_usage",
  (row) =>
    championFormIds.has(row[columnIndex("champions_form_move_usage", "form_id")]) &&
    selectedMoveIds.has(row[columnIndex("champions_form_move_usage", "move_id")]),
);

const selectedAbilityIds = new Set(
  tables.form_abilities.rows.map(
    (row) => row[columnIndex("form_abilities", "ability_id")],
  ),
);
filterRows("abilities", (row) =>
  selectedAbilityIds.has(row[columnIndex("abilities", "id")]),
);

mkdirSync(publicDirectory, { recursive: true });
mkdirSync(temporaryDirectory, { recursive: true });
if (existsSync(databasePath)) rmSync(databasePath);
if (existsSync(outputPath)) rmSync(outputPath);

const database = new Database(databasePath);
database.pragma("journal_mode = OFF");
database.pragma("synchronous = OFF");

try {
  database.exec(`
    CREATE TABLE catalog_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  database
    .prepare("INSERT INTO catalog_metadata (key, value) VALUES (?, ?)")
    .run("catalog_seed_version", String(seedVersion));

  const insertTables = database.transaction(() => {
    for (const tableName of seedTableOrder) {
      const table = tables[tableName];
      database.exec(
        `CREATE TABLE "${tableName}" (${table.columns
          .map((column) => `"${column}"`)
          .join(", ")})`,
      );
      if (table.rows.length === 0) continue;

      const placeholders = table.columns.map(() => "?").join(", ");
      const insert = database.prepare(
        `INSERT INTO "${tableName}" (${table.columns
          .map((column) => `"${column}"`)
          .join(", ")}) VALUES (${placeholders})`,
      );
      for (const row of table.rows) insert.run(row);
    }
  });
  insertTables();
} finally {
  database.close();
}

const rawDatabase = readFileSync(databasePath);
writeFileSync(outputPath, gzipSync(rawDatabase, { level: 9 }));

console.log(
  `Exported compressed SQLite catalog DB to ${outputPath} (${rawDatabase.length} bytes -> ${readFileSync(outputPath).length} bytes)`,
);
