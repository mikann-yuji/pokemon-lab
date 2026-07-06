/**
 * Scrape the current Pokemon Champions held-item list and map it to PokeAPI.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const SOURCE_URL = "https://game8.jp/pokemon-champions/775655";
const ENGLISH_SOURCE_URL = "https://op.gg/pokemon-champions/items";
const seedDirectory = path.join(process.cwd(), "database", "seeds");

// PokeAPI does not yet contain these Champions/Legends Z-A Mega Stones.
// Values are the English slugs used by the English Champions item source.
const championsOnlyItemIds = new Map([
  ["ウツボットナイト", "victreebelite"],
  ["エアームドナイト", "skarmorite"],
  ["エンブオナイト", "emboarite"],
  ["オーダイルナイト", "feraligite"],
  ["カイリュナイト", "dragoninite"],
  ["カエンジシナイト", "pyroarite"],
  ["ガメノデスナイト", "barbaraclite"],
  ["カラマネナイト", "malamarite"],
  ["キラフロルナイト", "glimmoranite"],
  ["ケケンカニナイト", "crabominite"],
  ["ゲッコウガナイト", "greninjite"],
  ["ゴルーグナイト", "golurkite"],
  ["ジジーロナイト", "drampanite"],
  ["シビルドナイト", "eelektrossite"],
  ["シャンデラナイト", "chandelurite"],
  ["スコヴィラナイト", "scovillainite"],
  ["スターミナイト", "starminite"],
  ["ズルズキナイト", "scraftite"],
  ["タイレーツナイト", "falinksite"],
  ["チリーンナイト", "chimechite"],
  ["ドラミドナイト", "dragalgite"],
  ["ドリュウズナイト", "excadrite"],
  ["ニャオニクスナイト", "meowsticite"],
  ["ピクシナイト", "clefablite"],
  ["フラエッテナイト", "floettite"],
  ["ブリガロナイト", "chesnaughtite"],
  ["ペンドラナイト", "scolipedite"],
  ["マフォクシナイト", "delphoxite"],
  ["ムクホークナイト", "staraptorite"],
  ["メガニウムナイト", "meganiumite"],
  ["ユキメノコナイト", "froslassite"],
  ["ライチュウナイトX", "raichunite-x"],
  ["ライチュウナイトY", "raichunite-y"],
  ["ルチャブルナイト", "hawluchanite"],
]);

/** 既存items.csvを読み、スクレイピングした日本語名との照合に使う。 */
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

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((values) => values.some(Boolean))
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      ),
    );
}

/** 日本語名の全角/半角や空白差を吸収して、持ち物名の照合キーにする。 */
function normalize(value) {
  return value.normalize("NFKC").replaceAll(/\s+/g, "").toLowerCase();
}

/** champions_items.csvへ安全に書くため、CSVセルをエスケープする。 */
function csvValue(value) {
  const text = String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const items = parseCsv("items.csv");
const itemsByJapaneseName = new Map();
for (const item of items) {
  if (!item.name_ja) continue;
  const key = normalize(item.name_ja);
  const matches = itemsByJapaneseName.get(key) ?? [];
  matches.push(item);
  itemsByJapaneseName.set(key, matches);
}

const response = await fetch(SOURCE_URL, {
  headers: {
    "User-Agent": "PokemonLab/1.0 (personal, non-commercial data project)",
  },
});
if (!response.ok) {
  throw new Error(`Game8 returned HTTP ${response.status}.`);
}

const $ = load(await response.text());
const englishResponse = await fetch(ENGLISH_SOURCE_URL, {
  headers: {
    "User-Agent": "PokemonLab/1.0 (personal, non-commercial data project)",
  },
});
if (!englishResponse.ok) {
  throw new Error(`OP.GG returned HTTP ${englishResponse.status}.`);
}
const englishPage = load(await englishResponse.text());
const englishItemIds = new Set(
  englishPage('a[href^="/pokemon-champions/items/"]')
    .map((_, anchor) =>
      englishPage(anchor)
        .attr("href")
        ?.split("/")
        .filter(Boolean)
        .at(-1),
    )
    .get()
    .filter(Boolean),
);
const itemTable = $("table")
  .filter((_, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .children()
      .map((__, cell) => $(cell).text().trim())
      .get();
    return headers.join(",") === "アイテム,効果,大カテ,小カテ";
  })
  .first();

if (itemTable.length === 0) {
  throw new Error("Pokemon Champions item table was not found.");
}

const scraped = itemTable
  .find("tr")
  .slice(1)
  .map((_, tableRow) => {
    const cells = $(tableRow)
      .children()
      .map((__, cell) => $(cell).text().replaceAll(/\s+/g, " ").trim())
      .get();
    return {
      name_ja: cells[0],
      effect_ja: cells[1],
      major_category: cells[2],
      minor_category: cells[3],
    };
  })
  .get()
  .filter(({ name_ja }) => name_ja);

if (scraped.length < 50) {
  throw new Error(`Only ${scraped.length} Champions items were scraped.`);
}

const championsOnlyItems = [];
const mapped = [];
for (const record of scraped) {
  const matches = itemsByJapaneseName.get(normalize(record.name_ja)) ?? [];
  if (matches.length === 0) {
    const itemId = championsOnlyItemIds.get(record.name_ja);
    if (!itemId || !englishItemIds.has(itemId)) {
      throw new Error(
        `No verified English item ID for Champions item: ${record.name_ja}`,
      );
    }
    championsOnlyItems.push({
      id: itemId,
      pokeapi_id: "",
      name_ja: record.name_ja,
      category_name: "mega-stones",
      cost: 2000,
      fling_power: "",
      fling_effect_name: "",
      effect_en: "",
      effect_ja: record.effect_ja,
      sprite_default_url: "",
    });
    mapped.push({
      item_id: itemId,
      ...record,
      source_url: SOURCE_URL,
    });
    continue;
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous PokeAPI match for ${record.name_ja}: ${matches
        .map(({ id }) => id)
        .join(", ")}`,
    );
  }
  const [item] = matches;
  mapped.push({
    item_id: item.id,
    ...record,
    source_url: SOURCE_URL,
  });
}

const itemHeaders = [
  "id",
  "pokeapi_id",
  "name_ja",
  "category_name",
  "cost",
  "fling_power",
  "fling_effect_name",
  "effect_en",
  "effect_ja",
  "sprite_default_url",
];
const allItems = [...items, ...championsOnlyItems].sort(
  (left, right) =>
    Number(left.pokeapi_id || Number.MAX_SAFE_INTEGER) -
      Number(right.pokeapi_id || Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id),
);
writeFileSync(
  path.join(seedDirectory, "items.csv"),
  `${[
    itemHeaders.join(","),
    ...allItems.map((item) =>
      itemHeaders.map((header) => csvValue(item[header])).join(","),
    ),
  ].join("\n")}\n`,
  "utf8",
);

const headers = [
  "item_id",
  "name_ja",
  "effect_ja",
  "major_category",
  "minor_category",
  "source_url",
];
writeFileSync(
  path.join(seedDirectory, "champions_items.csv"),
  `${[
    headers.join(","),
    ...mapped
      .sort((left, right) => left.item_id.localeCompare(right.item_id))
      .map((record) =>
        headers.map((header) => csvValue(record[header])).join(","),
      ),
  ].join("\n")}\n`,
  "utf8",
);

console.log(
  `Generated champions_items.csv with all ${mapped.length} scraped items.`,
);
console.log(
  `Added ${championsOnlyItems.length} verified non-PokeAPI items to items.csv.`,
);
