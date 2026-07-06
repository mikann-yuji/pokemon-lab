/**
 * このファイルの役割: BulbapediaのPokémon Champions登場一覧を取得し、
 * PokeAPI由来のforms.csvと照合してchampions_forms.csvを生成する。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const SOURCE_URL =
  "https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_in_Pok%C3%A9mon_Champions";
const seedDirectory = path.join(process.cwd(), "database", "seeds");

/** 既存のPokeAPIシードCSVを読み、Bulbapediaの表と照合できるオブジェクト配列へ変換する。 */
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

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((values) => values.some(Boolean))
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      ),
    );
}

/** 表記差、性別記号、forme/styleなどの差を吸収して照合用キーにする。 */
function normalize(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/♀/g, "f")
    .replaceAll(/♂/g, "m")
    .replaceAll(/\b(form|forme|mode|style)\b/g, "")
    .replaceAll(/[^a-z0-9]/g, "");
}

/** champions_forms.csvへ安全に書けるよう、CSVセルをエスケープする。 */
function csvEscape(value) {
  const stringValue = String(value);
  return /[",\n\r]/.test(stringValue)
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}

/** Bulbapedia側の候補とPokeAPI側フォームのタイプ構成が一致するかを確認する。 */
function sameTypes(left, right) {
  return (
    left.length === right.length &&
    [...left].sort().every((type, index) => type === [...right].sort()[index])
  );
}

const species = new Map(
  parseCsv("species.csv").map((record) => [Number(record.id), record]),
);
const forms = parseCsv("forms.csv");
const typesByForm = new Map();

for (const record of parseCsv("form_types.csv")) {
  const formId = Number(record.form_id);
  const types = typesByForm.get(formId) ?? [];
  types.push(record.type_name);
  typesByForm.set(formId, types);
}

const response = await fetch(SOURCE_URL, {
  headers: {
    "User-Agent": "PokemonLab/1.0 (personal, non-commercial data project)",
  },
});
if (!response.ok) {
  throw new Error(`Bulbapedia returned HTTP ${response.status}.`);
}

const $ = load(await response.text());
const rosterTables = $("table")
  .filter((_, table) =>
    $(table).find("tr").first().text().includes("Normally available?"),
  )
  .slice(0, 3)
  .toArray();

if (rosterTables.length !== 3) {
  throw new Error(
    `Expected three Champions roster tables; found ${rosterTables.length}.`,
  );
}

const sections = ["base", "mega", "other"];
const formOverrides = new Map([
  ["711:mediumvariety", "gourgeist-average"],
  ["711:jumbovariety", "gourgeist-super"],
]);
const output = [];
const errors = [];

for (const [tableIndex, table] of rosterTables.entries()) {
  const sourceSection = sections[tableIndex];

  $(table)
    .find("tr")
    .slice(1)
    .each((_, row) => {
      const cells = $(row)
        .find("td")
        .map((__, cell) => $(cell).text().replaceAll(/\s+/g, " ").trim())
        .get();
      if (cells.length < 6) return;

      const speciesId = Number(cells[0].replace(/\D/g, ""));
      const speciesRecord = species.get(speciesId);
      if (!speciesRecord) {
        errors.push(`Unknown species #${speciesId}: ${cells[1]}`);
        return;
      }

      const descriptor = cells[1]
        .replace(new RegExp(`^${speciesRecord.name}`, "i"), "")
        .trim();
      const rowTypes = cells.slice(2, -3);
      const normallyAvailable = cells.at(-3).startsWith("Yes") ? 1 : 0;
      const versionAdded = cells.at(-2);
      let candidates = forms.filter(
        (form) =>
          Number(form.species_id) === speciesId &&
          sameTypes(typesByForm.get(Number(form.id)) ?? [], rowTypes),
      );

      if (sourceSection === "base" && descriptor === "") {
        candidates = candidates.filter((form) => form.is_default === "1");
      } else if (sourceSection === "mega") {
        candidates = candidates.filter((form) => form.is_mega === "1");
      } else {
        candidates = candidates.filter((form) => form.is_mega === "0");
      }

      if (candidates.length > 1) {
        const normalizedDescriptor = normalize(descriptor).replaceAll(
          normalize(speciesRecord.name),
          "",
        );
        const overrideName =
          formOverrides.get(`${speciesId}:${normalizedDescriptor}`) ??
          (speciesId === 869 ? "alcremie" : undefined);
        if (overrideName) {
          candidates = candidates.filter((form) => form.name === overrideName);
        } else {
          const candidateAliases = candidates.map((form) => ({
            form,
            aliases: [
            form.form_name,
            form.name.replace(`${speciesRecord.name}-`, ""),
            ]
              .map(normalize)
              .filter(Boolean),
          }));
          const exactMatches = candidateAliases.filter(({ aliases }) =>
            aliases.includes(normalizedDescriptor),
          );
          const matches =
            exactMatches.length > 0
              ? exactMatches
              : candidateAliases.filter(({ aliases }) =>
                  aliases.some(
                    (alias) =>
                      normalizedDescriptor.includes(alias) ||
                      alias.includes(normalizedDescriptor),
                  ),
                );
          candidates = matches.map(({ form }) => form);
        }
      } else if (candidates.length === 1 && speciesId === 869) {
        candidates = candidates.filter((form) => form.name === "alcremie");
      }

      if (candidates.length !== 1) {
        errors.push(
          `Could not map #${speciesId} ${cells[1]} [${rowTypes.join(
            "/",
          )}] (${sourceSection}); candidates: ${candidates
            .map((form) => form.name)
            .join(", ")}`,
        );
        return;
      }

      output.push({
        form_id: Number(candidates[0].id),
        version_added: versionAdded,
        normally_available: normallyAvailable,
        source_section: sourceSection,
      });
    });
}

if (errors.length > 0) {
  throw new Error(`Champions form mapping failed:\n${errors.join("\n")}`);
}

// 「その他フォーム」表には比較用の通常フォームも再掲されるため、
// 最初に現れるbase/mega側の区分を優先してform_idごとに1件へまとめる。
const uniqueForms = new Map();
for (const record of output) {
  if (!uniqueForms.has(record.form_id)) {
    uniqueForms.set(record.form_id, record);
  }
}

const headers = [
  "form_id",
  "version_added",
  "normally_available",
  "source_section",
];
const csv = [
  headers.join(","),
  ...[...uniqueForms.values()]
    .sort((left, right) => left.form_id - right.form_id)
    .map((record) =>
      headers.map((header) => csvEscape(record[header])).join(","),
    ),
].join("\n");

writeFileSync(
  path.join(seedDirectory, "champions_forms.csv"),
  `${csv}\n`,
  "utf8",
);
console.log(
  `Generated champions_forms.csv with ${uniqueForms.size} forms from ${SOURCE_URL}`,
);
