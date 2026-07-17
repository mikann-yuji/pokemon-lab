/**
 * OP.GG Pokémon Champions からシングル・ダブル別のポケモン採用順位を取得する。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const SOURCE_URL = "https://op.gg/pokemon-champions/tier";
const FORMATS = ["single", "double"];
const seedDirectory = path.join(process.cwd(), "database", "seeds");
const slugOverrides = new Map([
  ["pyroar-male", ["pyroar"]],
  ["aegislash-shield", ["aegislash"]],
  ["lycanroc-midday", ["lycanroc"]],
  ["mimikyu-disguised", ["mimikyu"]],
  ["morpeko-full-belly", ["morpeko"]],
  ["palafin-zero", ["palafin"]],
  ["floette-eternal", ["floette-eternal-flower"]],
  ["mr-rime", ["mr.-rime"]],
  ["tauros-paldea-combat-breed", ["tauros-paldean-combat"]],
  ["tauros-paldea-blaze-breed", ["tauros-paldean-blaze"]],
  ["tauros-paldea-aqua-breed", ["tauros-paldean-aqua"]],
]);

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
  if (field.length > 0 || row.length > 0) rows.push([...row, field]);

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((values) => values.some(Boolean))
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      ),
    );
}

function csvValue(value) {
  const text = String(value);
  return /[",\n\r]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function opggSlugs(formName) {
  const slugs = [...(slugOverrides.get(formName) ?? []), formName];
  slugs.push(formName.replace(/-alola$/, "-alolan"));
  slugs.push(formName.replace(/-galar$/, "-galarian"));
  slugs.push(formName.replace(/-hisui$/, "-hisuian"));
  return [...new Set(slugs)];
}

const formsById = new Map(
  parseCsv("forms.csv").map((record) => [record.id, record]),
);
const championForms = parseCsv("champions_forms.csv")
  .map((record) => formsById.get(record.form_id))
  .filter(Boolean)
  .filter((form) => form.is_mega === "0");
const formBySlug = new Map();
const duplicateSlugs = new Set();

for (const form of championForms) {
  for (const slug of opggSlugs(form.name)) {
    if (formBySlug.has(slug) && formBySlug.get(slug).id !== form.id) {
      duplicateSlugs.add(slug);
    } else {
      formBySlug.set(slug, form);
    }
  }
}
for (const slug of duplicateSlugs) formBySlug.delete(slug);

const scrapedAt = new Date().toISOString();
const output = [];

for (const battleFormat of FORMATS) {
  const sourceUrl = `${SOURCE_URL}?format=${battleFormat}`;
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "PokemonLab/1.0 (personal, non-commercial data project)",
    },
  });
  if (!response.ok) {
    throw new Error(`OP.GG returned HTTP ${response.status} for ${sourceUrl}.`);
  }

  const $ = load(await response.text());
  const pageText = $("body").text().replaceAll(/\s+/g, " ");
  const season = [...pageText.matchAll(/\bM-(\d+)\b/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isInteger)
    .sort((left, right) => right - left)
    .map((number) => `M-${number}`)
    .at(0);
  if (!season) throw new Error(`Could not find the season in ${sourceUrl}.`);

  const rankings = [];
  const unknownSlugs = [];
  $('a[href^="/pokemon-champions/pokedex/"]').each((_, anchor) => {
    const href = $(anchor).attr("href");
    const slug = href?.split("/").filter(Boolean).at(-1);
    const rank = Number(
      $(anchor)
        .find("span")
        .first()
        .text()
        .replace(/\D/g, ""),
    );
    if (!slug || !Number.isInteger(rank) || rank < 1) return;

    const form = formBySlug.get(slug);
    if (!form) {
      unknownSlugs.push(slug);
      return;
    }
    rankings.push({
      form_id: form.id,
      battle_format: battleFormat,
      usage_rank: rank,
      season,
      source_url: sourceUrl,
      scraped_at: scrapedAt,
    });
  });

  const uniqueRankings = new Map(
    rankings.map((record) => [record.usage_rank, record]),
  );
  if (unknownSlugs.length > 0) {
    throw new Error(
      `Unknown OP.GG slugs for ${battleFormat}:\n${[...new Set(unknownSlugs)].join("\n")}`,
    );
  }
  if (uniqueRankings.size < 200) {
    throw new Error(
      `Only ${uniqueRankings.size} ${battleFormat} rankings were scraped.`,
    );
  }
  output.push(...uniqueRankings.values());
  console.log(`Scraped ${uniqueRankings.size} ${battleFormat} rankings.`);
}

const headers = [
  "form_id",
  "battle_format",
  "usage_rank",
  "season",
  "source_url",
  "scraped_at",
];
const csv = [
  headers.join(","),
  ...output
    .sort(
      (left, right) =>
        left.battle_format.localeCompare(right.battle_format) ||
        left.usage_rank - right.usage_rank,
    )
    .map((record) =>
      headers.map((header) => csvValue(record[header])).join(","),
    ),
].join("\n");

writeFileSync(
  path.join(seedDirectory, "champions_form_usage_rankings.csv"),
  `${csv}\n`,
  "utf8",
);
console.log(`Generated champions_form_usage_rankings.csv with ${output.length} rows.`);
