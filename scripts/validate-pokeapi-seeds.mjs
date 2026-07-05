/**
 * このファイルの役割: PokeAPI由来のCSVシードが、重複キーや外部キー参照の欠落を含まないか検証するためのNode.jsスクリプト。
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const seedDirectory = path.join(process.cwd(), "database", "seeds");

function parseCsv(filename) {
  const source = readFileSync(path.join(seedDirectory, filename), "utf8");
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

  if (quoted) throw new Error(`${filename} has an unclosed quote.`);
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  const records = dataRows
    .filter((values) => values.some((value) => value !== ""))
    .map((values, index) => {
      if (values.length !== headers.length) {
        throw new Error(`${filename}:${index + 2} has an invalid column count.`);
      }
      return Object.fromEntries(
        headers.map((header, columnIndex) => [
          header,
          values[columnIndex],
        ]),
      );
    });
  return { headers, records };
}

function unique(records, columns, filename) {
  const keys = new Set();
  for (const record of records) {
    const key = columns.map((column) => record[column]).join("\0");
    if (keys.has(key)) {
      throw new Error(`${filename} has duplicate key: ${key}`);
    }
    keys.add(key);
  }
}

function reference(records, column, targetValues, filename) {
  for (const record of records) {
    if (!targetValues.has(record[column])) {
      throw new Error(
        `${filename}.${column} references missing value: ${record[column]}`,
      );
    }
  }
}

const tables = Object.fromEntries(
  [
    "species",
    "forms",
    "abilities",
    "form_abilities",
    "stats",
    "natures",
    "items",
    "form_stats",
    "form_types",
    "moves",
    "version_groups",
    "move_learn_methods",
    "form_moves",
    "champions_forms",
    "champions_items",
    "types",
  ].map((table) => [table, parseCsv(`${table}.csv`)]),
);

unique(tables.species.records, ["id"], "species.csv");
unique(tables.forms.records, ["id"], "forms.csv");
unique(tables.abilities.records, ["id"], "abilities.csv");
unique(tables.stats.records, ["id"], "stats.csv");
unique(tables.natures.records, ["id"], "natures.csv");
unique(tables.natures.records, ["sort_order"], "natures.csv");
unique(tables.items.records, ["id"], "items.csv");
unique(
  tables.items.records.filter(({ pokeapi_id: pokeapiId }) => pokeapiId),
  ["pokeapi_id"],
  "items.csv",
);
unique(tables.moves.records, ["id"], "moves.csv");
unique(tables.version_groups.records, ["id"], "version_groups.csv");
unique(tables.champions_forms.records, ["form_id"], "champions_forms.csv");
unique(
  tables.champions_items.records,
  ["item_id"],
  "champions_items.csv",
);
unique(
  tables.move_learn_methods.records,
  ["id"],
  "move_learn_methods.csv",
);
unique(
  tables.form_abilities.records,
  ["form_id", "ability_id", "slot"],
  "form_abilities.csv",
);
unique(
  tables.form_stats.records,
  ["form_id", "stat_id"],
  "form_stats.csv",
);
unique(tables.form_types.records, ["form_id", "slot"], "form_types.csv");
unique(
  tables.form_moves.records,
  [
    "form_id",
    "move_id",
    "version_group_id",
    "learn_method_id",
    "level_learned_at",
  ],
  "form_moves.csv",
);

const ids = (table) =>
  new Set(tables[table].records.map((record) => record.id));
reference(tables.forms.records, "species_id", ids("species"), "forms.csv");
reference(
  tables.form_abilities.records,
  "form_id",
  ids("forms"),
  "form_abilities.csv",
);
reference(
  tables.form_abilities.records,
  "ability_id",
  ids("abilities"),
  "form_abilities.csv",
);
reference(
  tables.form_stats.records,
  "form_id",
  ids("forms"),
  "form_stats.csv",
);
reference(
  tables.form_stats.records,
  "stat_id",
  ids("stats"),
  "form_stats.csv",
);
reference(
  tables.form_types.records,
  "form_id",
  ids("forms"),
  "form_types.csv",
);
reference(
  tables.form_types.records,
  "type_name",
  new Set(tables.types.records.map(({ name }) => name)),
  "form_types.csv",
);
reference(tables.moves.records, "type_name", new Set(
  tables.types.records.map(({ name }) => name),
), "moves.csv");
reference(
  tables.form_moves.records,
  "form_id",
  ids("forms"),
  "form_moves.csv",
);
reference(
  tables.champions_forms.records,
  "form_id",
  new Set(tables.forms.records.map(({ id }) => id)),
  "champions_forms.csv",
);
reference(
  tables.champions_items.records,
  "item_id",
  ids("items"),
  "champions_items.csv",
);
reference(
  tables.form_moves.records,
  "move_id",
  ids("moves"),
  "form_moves.csv",
);
reference(
  tables.form_moves.records,
  "version_group_id",
  ids("version_groups"),
  "form_moves.csv",
);
reference(
  tables.form_moves.records,
  "learn_method_id",
  ids("move_learn_methods"),
  "form_moves.csv",
);

console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(tables)
        .filter(([name]) => name !== "types")
        .map(([name, table]) => [name, table.records.length]),
    ),
    null,
    2,
  ),
);
