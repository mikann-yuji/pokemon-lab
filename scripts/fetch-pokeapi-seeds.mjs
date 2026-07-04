/**
 * このファイルの役割: PokeAPIからポケモン・技・特性などのマスターデータを取得し、アプリ用CSVシードへ変換するスクリプト。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const apiBaseUrl = "https://pokeapi.co/api/v2";
const outputDirectory = path.join(process.cwd(), "database", "seeds");
const speciesLimit = process.env.POKEAPI_SPECIES_LIMIT
  ? Number(process.env.POKEAPI_SPECIES_LIMIT)
  : null;
const maxAttempts = 3;
// 同じURLを何度も取得しないよう、Promise自体をキャッシュする。
const responseCache = new Map();

function resourceId(resource) {
  if (!resource?.url) return null;
  const match = resource.url.match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function booleanToInteger(value) {
  return value ? 1 : 0;
}

function typeName(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function localizedName(names, fallback = null) {
  return (
    names?.find(({ language }) => language.name === "ja-Hrkt")?.name ??
    names?.find(({ language }) => language.name === "ja")?.name ??
    fallback
  );
}

function localizedText(entries, language, property) {
  return (
    entries?.find((entry) => entry.language.name === language)?.[property] ??
    null
  );
}

function masterText(resource, language) {
  return (
    localizedText(resource.effect_entries, language, "effect") ??
    localizedText(resource.flavor_text_entries, language, "flavor_text")
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// PokeAPIへの一時的な失敗に備え、短い待機を挟んでリトライする。
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

async function getJson(url) {
  if (!responseCache.has(url)) {
    responseCache.set(url, fetchJson(url));
  }
  return responseCache.get(url);
}

// APIへ負荷をかけすぎないよう、同時実行数を制限して配列を非同期処理する。
async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

function uniqueResources(resources) {
  return [
    ...new Map(
      resources.filter(Boolean).map((resource) => [resource.url, resource]),
    ).values(),
  ];
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// オブジェクト配列を指定カラム順のCSVとして書き出す。
function writeCsv(filename, columns, rows) {
  const lines = [
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => csvValue(row[column])).join(","),
    ),
  ];
  writeFileSync(
    path.join(outputDirectory, filename),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

mkdirSync(outputDirectory, { recursive: true });

const speciesList = await getJson(
  `${apiBaseUrl}/pokemon-species?limit=${speciesLimit ?? 100000}&offset=0`,
);
const speciesResources = (
  await mapWithConcurrency(speciesList.results, 12, ({ url }) => getJson(url))
).sort((left, right) => left.id - right.id);
const pokemonReferences = uniqueResources(
  speciesResources.flatMap((species) =>
    species.varieties.map(({ pokemon }) => pokemon),
  ),
);
const pokemonResources = await mapWithConcurrency(
  pokemonReferences,
  12,
  ({ url }) => getJson(url),
);
const pokemonFormReferences = uniqueResources(
  pokemonResources.flatMap((pokemon) => pokemon.forms),
);
const pokemonFormResources = await mapWithConcurrency(
  pokemonFormReferences,
  6,
  ({ url }) => getJson(url),
);
const pokemonFormByPokemonName = new Map(
  pokemonFormResources.map((form) => [form.pokemon.name, form]),
);

const abilityReferences = uniqueResources(
  pokemonResources.flatMap((pokemon) =>
    pokemon.abilities.map(({ ability }) => ability),
  ),
);
const statReferences = uniqueResources(
  pokemonResources.flatMap((pokemon) => pokemon.stats.map(({ stat }) => stat)),
);
const moveReferences = uniqueResources(
  pokemonResources.flatMap((pokemon) => pokemon.moves.map(({ move }) => move)),
);
const [abilityResources, statResources, moveResources] = await Promise.all([
  mapWithConcurrency(abilityReferences, 6, ({ url }) => getJson(url)),
  mapWithConcurrency(statReferences, 6, ({ url }) => getJson(url)),
  mapWithConcurrency(moveReferences, 6, ({ url }) => getJson(url)),
]);

const versionGroupReferences = uniqueResources(
  pokemonResources.flatMap((pokemon) =>
    pokemon.moves.flatMap(({ version_group_details: details }) =>
      details.map(({ version_group: versionGroup }) => versionGroup),
    ),
  ),
);
const learnMethodReferences = uniqueResources(
  pokemonResources.flatMap((pokemon) =>
    pokemon.moves.flatMap(({ version_group_details: details }) =>
      details.map(({ move_learn_method: learnMethod }) => learnMethod),
    ),
  ),
);
const [versionGroupResources, learnMethodResources] = await Promise.all([
  mapWithConcurrency(versionGroupReferences, 6, ({ url }) => getJson(url)),
  mapWithConcurrency(learnMethodReferences, 6, ({ url }) => getJson(url)),
]);

const speciesRows = speciesResources.map((species) => ({
  id: species.id,
  name: species.name,
  name_ja: localizedName(species.names),
  sort_order: species.order,
  generation_id: resourceId(species.generation),
  evolution_chain_id: resourceId(species.evolution_chain),
  gender_rate: species.gender_rate,
  capture_rate: species.capture_rate,
  base_happiness: species.base_happiness,
  hatch_counter: species.hatch_counter,
  growth_rate_name: species.growth_rate?.name,
  color_name: species.color?.name,
  shape_name: species.shape?.name,
  habitat_name: species.habitat?.name,
  is_baby: booleanToInteger(species.is_baby),
  is_legendary: booleanToInteger(species.is_legendary),
  is_mythical: booleanToInteger(species.is_mythical),
  has_gender_differences: booleanToInteger(species.has_gender_differences),
  forms_switchable: booleanToInteger(species.forms_switchable),
}));

const speciesNameById = new Map(
  speciesResources.map((species) => [
    species.id,
    localizedName(species.names, species.name),
  ]),
);
const formRows = pokemonResources.map((pokemon) => {
  const form = pokemonFormByPokemonName.get(pokemon.name);
  const speciesId = resourceId(pokemon.species);
  const speciesNameJa = speciesNameById.get(speciesId);
  const formNameJa = localizedName(form?.form_names);
  const nameJa = form?.is_mega
    ? formNameJa
    : form?.form_name === "gmax" && formNameJa
      ? `${speciesNameJa} ${formNameJa}`
      : localizedName(form?.names, speciesNameJa);

  return {
    id: pokemon.id,
    species_id: speciesId,
    name: pokemon.name,
    name_ja: nameJa,
    form_name: form?.form_name,
    form_name_ja: formNameJa,
    pokeapi_form_id: form?.id,
    sort_order: pokemon.order,
    form_order: form?.form_order,
    height: pokemon.height,
    weight: pokemon.weight,
    base_experience: pokemon.base_experience,
    is_default: booleanToInteger(pokemon.is_default),
    is_battle_only: booleanToInteger(form?.is_battle_only),
    is_mega: booleanToInteger(form?.is_mega),
    sprite_default_url: pokemon.sprites.front_default,
    sprite_shiny_url: pokemon.sprites.front_shiny,
    artwork_default_url:
      pokemon.sprites.other?.["official-artwork"]?.front_default,
    artwork_shiny_url: pokemon.sprites.other?.["official-artwork"]?.front_shiny,
    cry_latest_url: pokemon.cries?.latest,
    cry_legacy_url: pokemon.cries?.legacy,
  };
});

const abilityRows = abilityResources.map((ability) => ({
  id: ability.name,
  pokeapi_id: ability.id,
  name_ja: localizedName(ability.names),
  generation_id: resourceId(ability.generation),
  is_main_series: booleanToInteger(ability.is_main_series),
  effect_en: masterText(ability, "en"),
  effect_ja: masterText(ability, "ja-Hrkt") ?? masterText(ability, "ja"),
}));
const formAbilityRows = pokemonResources.flatMap((pokemon) =>
  pokemon.abilities.map(({ ability, is_hidden: isHidden, slot }) => ({
    form_id: pokemon.id,
    ability_id: ability.name,
    slot,
    is_hidden: booleanToInteger(isHidden),
  })),
);

const statRows = statResources.map((stat) => ({
  id: stat.name,
  pokeapi_id: stat.id,
  name_ja: localizedName(stat.names),
  game_index: stat.game_index,
  is_battle_only: booleanToInteger(stat.is_battle_only),
}));
const formStatRows = pokemonResources.flatMap((pokemon) =>
  pokemon.stats.map(({ base_stat: baseStat, effort, stat }) => ({
    form_id: pokemon.id,
    stat_id: stat.name,
    base_stat: baseStat,
    effort,
  })),
);

const formTypeRows = pokemonResources.flatMap((pokemon) =>
  pokemon.types.map(({ slot, type }) => ({
    form_id: pokemon.id,
    type_name: typeName(type.name),
    slot,
  })),
);

const moveRows = moveResources.map((move) => ({
  id: move.name,
  pokeapi_id: move.id,
  name_ja: localizedName(move.names),
  generation_id: resourceId(move.generation),
  type_name: typeName(move.type.name),
  damage_class_name: move.damage_class?.name,
  target_name: move.target?.name,
  ailment_name: move.meta?.ailment?.name,
  power: move.power,
  pp: move.pp,
  accuracy: move.accuracy,
  priority: move.priority,
  effect_chance: move.effect_chance,
  effect_en: masterText(move, "en"),
  effect_ja: masterText(move, "ja-Hrkt") ?? masterText(move, "ja"),
}));

const versionGroupRows = versionGroupResources
  .map((versionGroup) => ({
    id: versionGroup.id,
    name: versionGroup.name,
    sort_order: versionGroup.order,
    generation_id: resourceId(versionGroup.generation),
  }))
  .sort((left, right) => left.id - right.id);
const learnMethodRows = learnMethodResources
  .map((method) => ({
    id: method.id,
    name: method.name,
    name_ja: localizedName(method.names),
  }))
  .sort((left, right) => left.id - right.id);
const formMoveRows = pokemonResources.flatMap((pokemon) =>
  pokemon.moves.flatMap(({ move, version_group_details: details }, moveIndex) =>
    details.map((detail) => ({
      form_id: pokemon.id,
      move_id: move.name,
      version_group_id: resourceId(detail.version_group),
      learn_method_id: resourceId(detail.move_learn_method),
      level_learned_at: detail.level_learned_at,
      move_order: moveIndex + 1,
    })),
  ),
);

writeCsv(
  "species.csv",
  [
    "id",
    "name",
    "name_ja",
    "sort_order",
    "generation_id",
    "evolution_chain_id",
    "gender_rate",
    "capture_rate",
    "base_happiness",
    "hatch_counter",
    "growth_rate_name",
    "color_name",
    "shape_name",
    "habitat_name",
    "is_baby",
    "is_legendary",
    "is_mythical",
    "has_gender_differences",
    "forms_switchable",
  ],
  speciesRows,
);
writeCsv(
  "forms.csv",
  [
    "id",
    "species_id",
    "name",
    "name_ja",
    "form_name",
    "form_name_ja",
    "pokeapi_form_id",
    "sort_order",
    "form_order",
    "height",
    "weight",
    "base_experience",
    "is_default",
    "is_battle_only",
    "is_mega",
    "sprite_default_url",
    "sprite_shiny_url",
    "artwork_default_url",
    "artwork_shiny_url",
    "cry_latest_url",
    "cry_legacy_url",
  ],
  formRows,
);
writeCsv(
  "abilities.csv",
  [
    "id",
    "pokeapi_id",
    "name_ja",
    "generation_id",
    "is_main_series",
    "effect_en",
    "effect_ja",
  ],
  abilityRows,
);
writeCsv(
  "form_abilities.csv",
  ["form_id", "ability_id", "slot", "is_hidden"],
  formAbilityRows,
);
writeCsv(
  "stats.csv",
  ["id", "pokeapi_id", "name_ja", "game_index", "is_battle_only"],
  statRows,
);
writeCsv(
  "form_stats.csv",
  ["form_id", "stat_id", "base_stat", "effort"],
  formStatRows,
);
writeCsv("form_types.csv", ["form_id", "type_name", "slot"], formTypeRows);
writeCsv(
  "moves.csv",
  [
    "id",
    "pokeapi_id",
    "name_ja",
    "generation_id",
    "type_name",
    "damage_class_name",
    "target_name",
    "ailment_name",
    "power",
    "pp",
    "accuracy",
    "priority",
    "effect_chance",
    "effect_en",
    "effect_ja",
  ],
  moveRows,
);
writeCsv(
  "version_groups.csv",
  ["id", "name", "sort_order", "generation_id"],
  versionGroupRows,
);
writeCsv("move_learn_methods.csv", ["id", "name", "name_ja"], learnMethodRows);
writeCsv(
  "form_moves.csv",
  [
    "form_id",
    "move_id",
    "version_group_id",
    "learn_method_id",
    "level_learned_at",
    "move_order",
  ],
  formMoveRows,
);

console.log(
  JSON.stringify(
    {
      species: speciesRows.length,
      forms: formRows.length,
      abilities: abilityRows.length,
      formAbilities: formAbilityRows.length,
      stats: statRows.length,
      formStats: formStatRows.length,
      formTypes: formTypeRows.length,
      moves: moveRows.length,
      versionGroups: versionGroupRows.length,
      moveLearnMethods: learnMethodRows.length,
      formMoves: formMoveRows.length,
    },
    null,
    2,
  ),
);
