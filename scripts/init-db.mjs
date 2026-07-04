import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const rootDirectory = process.cwd();
const migrationsDirectory = path.join(rootDirectory, "database", "migrations");
const seedsDirectory = path.join(rootDirectory, "database", "seeds");
const dataDirectory = path.join(rootDirectory, "data");
const databasePath =
  process.env.DATABASE_PATH ?? path.join(dataDirectory, "pokemon-lab.db");

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

  if (quoted) {
    throw new Error(`${filename} contains an unclosed quoted field.`);
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    throw new Error(`${filename} is empty.`);
  }

  const headers = headerRow.map((header) => header.trim());
  const records = dataRows
    .filter((record) => record.some((value) => value.trim() !== ""))
    .map((record, rowIndex) => {
      if (record.length !== headers.length) {
        throw new Error(
          `${filename}:${rowIndex + 2} has ${record.length} columns; expected ${headers.length}.`,
        );
      }

      return Object.fromEntries(
        headers.map((header, columnIndex) => [
          header,
          record[columnIndex].trim(),
        ]),
      );
    });

  return { headers, records };
}

const seedTableOrder = [
  "types",
  "type_matchups",
  "species",
  "forms",
  "abilities",
  "stats",
  "moves",
  "version_groups",
  "move_learn_methods",
  "form_abilities",
  "form_stats",
  "form_types",
  "form_moves",
];

function loadTableSeed(database, tableName) {
  const filename = `${tableName}.csv`;
  const csv = parseCsv(
    readFileSync(path.join(seedsDirectory, filename), "utf8"),
    filename,
  );
  const columns = database
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all();
  const expectedColumns = columns.map(({ name }) => name);

  if (
    csv.headers.length !== expectedColumns.length ||
    csv.headers.some((header, index) => header !== expectedColumns[index])
  ) {
    throw new Error(
      `${filename} columns must exactly match: ${expectedColumns.join(", ")}`,
    );
  }

  const columnTypes = new Map(
    columns.map(({ name, type }) => [name, type.toUpperCase()]),
  );
  return csv.records.map((record) =>
    Object.fromEntries(
      Object.entries(record).map(([column, value]) => {
        if (value === "") return [column, null];
        const type = columnTypes.get(column);
        return type === "INTEGER" || type === "REAL"
          ? [column, Number(value)]
          : [column, value];
      }),
    ),
  );
}

function validateTypeSeeds(seeds) {
  const types = seeds.get("types");
  const matchups = seeds.get("type_matchups");
  const typeNames = new Set(types.map(({ name }) => name));
  const validEffectiveness = new Set([0, 0.5, 1, 2]);

  if (typeNames.size !== types.length) {
    throw new Error("types.csv contains a duplicate name.");
  }
  if (
    matchups.some(
      ({ attacker_type: attacker, defender_type: defender, effectiveness }) =>
        !typeNames.has(attacker) ||
        !typeNames.has(defender) ||
        !validEffectiveness.has(effectiveness),
    )
  ) {
    throw new Error("type_matchups.csv contains an invalid matchup.");
  }
  if (matchups.length !== types.length ** 2) {
    throw new Error(
      `type_matchups.csv must contain ${types.length ** 2} rows; found ${matchups.length}.`,
    );
  }
}

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = database.prepare(
    "SELECT 1 FROM schema_migrations WHERE filename = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations (filename) VALUES (?)",
  );

  for (const filename of readdirSync(migrationsDirectory)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()) {
    if (applied.get(filename)) continue;

    const sql = readFileSync(path.join(migrationsDirectory, filename), "utf8");
    database.transaction(() => {
      database.exec(sql);
      recordMigration.run(filename);
    })();
  }
}

function seedDatabase(database) {
  const seeds = new Map(
    seedTableOrder.map((tableName) => [
      tableName,
      loadTableSeed(database, tableName),
    ]),
  );
  validateTypeSeeds(seeds);

  database.transaction(() => {
    for (const tableName of [...seedTableOrder].reverse()) {
      database.exec(`DELETE FROM "${tableName}"`);
    }

    for (const tableName of seedTableOrder) {
      const records = seeds.get(tableName);
      if (records.length === 0) continue;

      const columns = Object.keys(records[0]);
      const insert = database.prepare(
        `INSERT INTO "${tableName}" (${columns
          .map((column) => `"${column}"`)
          .join(", ")}) VALUES (${columns
          .map((column) => `@${column}`)
          .join(", ")})`,
      );
      records.forEach((record) => insert.run(record));
    }
  })();
}

mkdirSync(dataDirectory, { recursive: true });

const database = new Database(databasePath);
database.pragma("foreign_keys = ON");

try {
  runMigrations(database);
  seedDatabase(database);
} finally {
  database.close();
}

console.log(`Initialized SQLite database: ${databasePath}`);
