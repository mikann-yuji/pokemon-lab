/**
 * Fetch every item exposed by PokeAPI and write the item master seed.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const API_URL = "https://pokeapi.co/api/v2";
const outputDirectory = path.join(process.cwd(), "database", "seeds");
const maxAttempts = 3;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "PokemonLab seed generator",
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await wait(500 * attempt);
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(items[index]);
      completed += 1;
      if (completed === items.length || completed % 100 === 0) {
        console.log(`items: ${completed}/${items.length}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return output;
}

function localized(entries, language, property) {
  return (
    entries?.find((entry) => entry.language.name === language)?.[property] ??
    null
  );
}

function localizedName(item) {
  return (
    localized(item.names, "ja-Hrkt", "name") ??
    localized(item.names, "ja", "name")
  );
}

function effectText(item, language) {
  return (
    localized(item.effect_entries, language, "effect") ??
    localized(item.flavor_text_entries, language, "text")
  );
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const list = await fetchJson(`${API_URL}/item?limit=100000&offset=0`);
const items = (
  await mapWithConcurrency(list.results, 12, ({ url }) => fetchJson(url))
).sort((left, right) => left.id - right.id);

const columns = [
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
const rows = items.map((item) => ({
  id: item.name,
  pokeapi_id: item.id,
  name_ja: localizedName(item),
  category_name: item.category.name,
  cost: item.cost,
  fling_power: item.fling_power,
  fling_effect_name: item.fling_effect?.name,
  effect_en: effectText(item, "en"),
  effect_ja:
    effectText(item, "ja-Hrkt") ?? effectText(item, "ja"),
  sprite_default_url: item.sprites.default,
}));

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  path.join(outputDirectory, "items.csv"),
  `${[
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => csvValue(row[column])).join(","),
    ),
  ].join("\n")}\n`,
  "utf8",
);

console.log(`Generated items.csv with ${rows.length} PokeAPI items.`);
