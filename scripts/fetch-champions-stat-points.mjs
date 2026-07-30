/**
 * OP.GG Pokémon Championsから、採用率上位100体の最頻能力ポイント配分を取得する。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const SOURCE_ORIGIN = "https://op.gg";
const FORMATS = ["single", "double"];
const RANK_LIMIT = 100;
const seedDirectory = path.join(process.cwd(), "database", "seeds");
const slugOverrides = new Map([
  ["pyroar-male", "pyroar"],
  ["aegislash-shield", "aegislash"],
  ["lycanroc-midday", "lycanroc"],
  ["mimikyu-disguised", "mimikyu"],
  ["morpeko-full-belly", "morpeko"],
  ["palafin-zero", "palafin"],
  ["floette-eternal", "floette-eternal-flower"],
  ["mr-rime", "mr.-rime"],
  ["tauros-paldea-combat-breed", "tauros-paldean-combat"],
  ["tauros-paldea-blaze-breed", "tauros-paldean-blaze"],
  ["tauros-paldea-aqua-breed", "tauros-paldean-aqua"],
]);

function opggSlugs(formName) {
  return [
    ...new Set([
      slugOverrides.get(formName),
      formName,
      formName.replace(/-alola$/, "-alolan"),
      formName.replace(/-galar$/, "-galarian"),
      formName.replace(/-hisui$/, "-hisuian"),
    ].filter(Boolean)),
  ];
}

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
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field || row.length) rows.push([...row, field]);
  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((values) => values.some(Boolean))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

function csvValue(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const formsById = new Map(
  parseCsv("forms.csv").map((record) => [record.id, record]),
);
const rankings = parseCsv("champions_form_usage_rankings.csv")
  .filter((record) => Number(record.usage_rank) <= RANK_LIMIT)
  .sort(
    (left, right) =>
      left.battle_format.localeCompare(right.battle_format) ||
      Number(left.usage_rank) - Number(right.usage_rank),
  );
const scrapedAt = new Date().toISOString();
const output = [];

for (const ranking of rankings) {
  if (!FORMATS.includes(ranking.battle_format)) continue;
  const form = formsById.get(ranking.form_id);
  if (!form) throw new Error(`Unknown form_id ${ranking.form_id}.`);
  let sourceUrl = "";
  let response;
  for (const slug of opggSlugs(form.name)) {
    sourceUrl = `${SOURCE_ORIGIN}/pokemon-champions/pokedex/${slug}?format=${ranking.battle_format}`;
    response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "PokemonLab/1.0 (personal, non-commercial data project)",
      },
    });
    if (response.ok) break;
  }
  if (!response?.ok) throw new Error(`OP.GG returned HTTP ${response?.status} for ${sourceUrl}.`);

  const $ = load(await response.text());
  const firstCardText = $("div.relative.grid.min-h-16")
    .toArray()
    .map((card) => $(card).text().replaceAll(/\s+/g, ""))
    .find(
      (text) =>
        text.startsWith("1") &&
        text.includes("HP") &&
        text.includes("Attack") &&
        text.includes("Sp.Atk") &&
        text.includes("Sp.Def") &&
        text.includes("Speed"),
    );
  const match = firstCardText.match(
    /^1([\d.]+)%HP(\d+)Attack(\d+)Defense(\d+)Sp\.Atk(\d+)Sp\.Def(\d+)Speed(\d+)$/,
  );
  if (!match) {
    throw new Error(`Could not parse the top stat points for ${form.name} (${ranking.battle_format}).`);
  }
  const [, usageRate, hp, attack, defense, specialAttack, specialDefense, speed] = match;
  output.push({
    form_id: ranking.form_id,
    battle_format: ranking.battle_format,
    hp,
    attack,
    defense,
    special_attack: specialAttack,
    special_defense: specialDefense,
    speed,
    usage_rate: usageRate,
    season: ranking.season,
    source_url: sourceUrl,
    scraped_at: scrapedAt,
  });
  console.log(
    `${ranking.battle_format} #${ranking.usage_rank} ${form.name}: ${hp}-${attack}-${defense}-${specialAttack}-${specialDefense}-${speed}`,
  );
}

const expectedRecordCount = FORMATS.length * RANK_LIMIT;
if (output.length !== expectedRecordCount) {
  throw new Error(
    `Expected ${expectedRecordCount} stat point records, found ${output.length}.`,
  );
}

const headers = [
  "form_id",
  "battle_format",
  "hp",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
  "usage_rate",
  "season",
  "source_url",
  "scraped_at",
];
const csv = [
  headers.join(","),
  ...output.map((record) =>
    headers.map((header) => csvValue(record[header])).join(","),
  ),
].join("\n");
writeFileSync(
  path.join(seedDirectory, "champions_form_stat_points.csv"),
  `${csv}\n`,
  "utf8",
);
console.log(`Generated champions_form_stat_points.csv with ${output.length} rows.`);
