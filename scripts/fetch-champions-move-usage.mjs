/**
 * Scrape OP.GG Pokemon Champions move usage rates per Champions form.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const SOURCE_ORIGIN = "https://op.gg";
const seedDirectory = path.join(process.cwd(), "database", "seeds");
const slugOverrides = new Map([
  ["pyroar-male", ["pyroar"]],
  ["aegislash-shield", ["aegislash"]],
  ["lycanroc-midday", ["lycanroc"]],
  ["mimikyu-disguised", ["mimikyu"]],
  ["morpeko-full-belly", ["morpeko"]],
  ["morpeko-hangry", ["morpeko"]],
  ["palafin-zero", ["palafin"]],
  ["castform-sunny", ["castform"]],
  ["castform-rainy", ["castform"]],
  ["castform-snowy", ["castform"]],
  ["floette-eternal", ["floette"]],
  ["tauros-paldea-combat-breed", ["tauros-paldean-combat"]],
  ["tauros-paldea-blaze-breed", ["tauros-paldean-blaze"]],
  ["tauros-paldea-aqua-breed", ["tauros-paldean-aqua"]],
  ["meowstic-male-mega", ["mega-meowstic"]],
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

  if (field.length > 0 || row.length > 0) row.push(field);
  if (row.length > 0) rows.push(row);

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
  const text = String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toOpggSlug(formName) {
  const candidates = [...(slugOverrides.get(formName) ?? []), formName];
  const megaMatch = formName.match(/^(.+)-mega(-x|-y)?$/);
  if (megaMatch) candidates.push(`mega-${megaMatch[1]}${megaMatch[2] ?? ""}`);
  candidates.push(formName.replace(/-alola$/, "-alolan"));
  candidates.push(formName.replace(/-galar$/, "-galarian"));
  candidates.push(formName.replace(/-hisui$/, "-hisuian"));
  candidates.push(formName.replace(/^basculin-/, "basculin-"));
  return unique(candidates);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PokemonLab/1.0 (personal, non-commercial data project)",
    },
  });
  if (!response.ok) return null;
  return response.text();
}

async function fetchFormPage(formName) {
  for (const slug of toOpggSlug(formName)) {
    const url = `${SOURCE_ORIGIN}/pokemon-champions/pokedex/${slug}`;
    const html = await fetchText(url);
    if (html) return { slug, url, html };
  }
  return null;
}

function scrapeMoveUsage(html) {
  const $ = load(html);
  const moveSection = $("section")
    .filter((_, section) => $(section).children("div").first().text().trim() === "Moves")
    .first();
  if (moveSection.length === 0) return [];

  const moveIds = moveSection
    .find('a[href^="/pokemon-champions/moves/"]')
    .map((_, anchor) =>
      $(anchor).attr("href")?.split("/").filter(Boolean).at(-1),
    )
    .get()
    .filter(Boolean);
  const usageRates = moveSection
    .find("span")
    .map((_, span) => $(span).text().trim())
    .get()
    .filter((text) => /^[0-9]+(?:\.[0-9]+)?%$/.test(text))
    .map((text) => Number(text.replace("%", "")));

  return moveIds.flatMap((moveId, index) =>
    usageRates[index] === undefined
      ? []
      : [{ move_id: moveId, usage_rate: usageRates[index] }],
  );
}

const forms = new Map(parseCsv("forms.csv").map((record) => [record.id, record]));
const moveIds = new Set(parseCsv("moves.csv").map((record) => record.id));
const championForms = parseCsv("champions_forms.csv")
  .map((record) => forms.get(record.form_id))
  .filter(Boolean);
const scrapedAt = new Date().toISOString();
const output = [];
const missingPages = [];
const missingMoves = [];

for (const [index, form] of championForms.entries()) {
  const page = await fetchFormPage(form.name);
  if (!page) {
    missingPages.push(form.name);
    continue;
  }

  const rows = scrapeMoveUsage(page.html);
  for (const row of rows) {
    if (!moveIds.has(row.move_id)) {
      missingMoves.push(`${form.name}: ${row.move_id}`);
      continue;
    }
    output.push({
      form_id: form.id,
      move_id: row.move_id,
      usage_rate: row.usage_rate,
      source_url: page.url,
      scraped_at: scrapedAt,
    });
  }

  if ((index + 1) % 25 === 0) {
    console.log(`Scraped ${index + 1}/${championForms.length} forms...`);
  }
}

if (missingPages.length > 0) {
  console.warn(`Missing OP.GG pages:\n${missingPages.join("\n")}`);
}
if (missingMoves.length > 0) {
  throw new Error(`Unknown move IDs from OP.GG:\n${missingMoves.join("\n")}`);
}
if (output.length < championForms.length) {
  throw new Error(
    `Only ${output.length} move usage rows were scraped for ${championForms.length} forms.`,
  );
}

const headers = ["form_id", "move_id", "usage_rate", "source_url", "scraped_at"];
const csv = [
  headers.join(","),
  ...output
    .sort(
      (left, right) =>
        Number(left.form_id) - Number(right.form_id) ||
        Number(right.usage_rate) - Number(left.usage_rate) ||
        left.move_id.localeCompare(right.move_id),
    )
    .map((record) =>
      headers.map((header) => csvValue(record[header])).join(","),
    ),
].join("\n");

writeFileSync(
  path.join(seedDirectory, "champions_form_move_usage.csv"),
  `${csv}\n`,
  "utf8",
);

console.log(
  `Generated champions_form_move_usage.csv with ${output.length} rows for ${championForms.length} forms.`,
);
