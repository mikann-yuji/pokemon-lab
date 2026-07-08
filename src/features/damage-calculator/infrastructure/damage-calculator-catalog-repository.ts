"use client";

import type { TypeName } from "@/domain/type-matchup";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";

type PokemonBaseRow = SqliteRow & {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  weight: number;
};

type PokemonTypeRow = SqliteRow & {
  id: number;
  typeName: TypeName;
};

type PokemonStatRow = SqliteRow & {
  id: number;
  statId: string;
  baseStat: number;
};

type PokemonMoveRow = SqliteRow & {
  formId: number;
  id: string;
  name: string;
  typeName: TypeName;
  description: string | null;
  damageClass: "physical" | "special";
  power: number;
  usageRate: number | null;
};

type PokemonAbilityRow = SqliteRow & {
  formId: number;
  id: string;
  name: string;
  effect: string | null;
  slot: number;
};

type AbilityModifierRow = SqliteRow & {
  abilityId: string;
  modifierKind: "power" | "attacking_stat" | "received_damage" | "stab";
  multiplier: number;
  condition:
    | "always"
    | "type_match"
    | "physical"
    | "special"
    | "low_power_move"
    | "critical_hit"
    | "not_very_effective"
    | "super_effective"
    | "super_effective_received"
    | "manual"
    | "manual_type_match"
    | "manual_physical"
    | "manual_special";
  moveTypeName: TypeName | null;
};

type HeldItemRow = SqliteRow & {
  id: string;
  name: string;
  modifierKind: "power" | "attacking_stat" | "received_damage" | null;
  multiplier: number | null;
  maxMultiplier: number | null;
  condition:
    | "always"
    | "type_match"
    | "physical"
    | "special"
    | "super_effective"
    | "super_effective_type_match"
    | "consecutive_use"
    | "pokemon_match"
    | null;
  moveTypeName: TypeName | null;
  pokemonName: string | null;
};

type WeatherRow = SqliteRow & {
  id: string;
  name: string;
  smogonWeather: DamageCalculatorWeather["smogonWeather"];
  normallyAvailable: number;
};

type TerrainRow = SqliteRow & {
  id: string;
  name: string;
  smogonTerrain: DamageCalculatorTerrain["smogonTerrain"];
  normallyAvailable: number;
};

/**
 * ダメージ計算に必要なChampions対象ポケモンだけをcatalog.dbから読み込む。
 * 画面側で検索・選択を即時に行えるよう、種族値・タイプ・物理/特殊技をまとめた配列へ変換する。
 */
export async function getChampionsDamageCalculatorPokemon(): Promise<
  DamageCalculatorPokemon[]
> {
  // ベース情報、タイプ、種族値、技は行の粒度が違うため、別々に取得してフォームIDで結合する。
  const [baseRows, typeRows, statRows, moveRows, abilityRows, modifierRows] =
    await Promise.all([
    sqliteWorkerClient.catalogQuery<PokemonBaseRow>(`
      SELECT
        forms.id,
        forms.name,
        COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
        COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
        forms.weight
      FROM champions_forms
      JOIN forms ON forms.id = champions_forms.form_id
      ORDER BY forms.id
    `),
    sqliteWorkerClient.catalogQuery<PokemonTypeRow>(`
      SELECT
        forms.id,
        form_types.type_name AS typeName
      FROM champions_forms
      JOIN forms ON forms.id = champions_forms.form_id
      JOIN form_types ON form_types.form_id = forms.id
      ORDER BY forms.id, form_types.slot
    `),
    sqliteWorkerClient.catalogQuery<PokemonStatRow>(`
      SELECT
        forms.id,
        form_stats.stat_id AS statId,
        form_stats.base_stat AS baseStat
      FROM champions_forms
      JOIN forms ON forms.id = champions_forms.form_id
      JOIN form_stats ON form_stats.form_id = forms.id
      JOIN stats ON stats.id = form_stats.stat_id
      WHERE stats.is_battle_only = 0
      ORDER BY forms.id, stats.game_index
    `),
    sqliteWorkerClient.catalogQuery<PokemonMoveRow>(`
      WITH move_sources AS (
        SELECT
          forms.id AS formId,
          CASE
            WHEN forms.is_mega = 1 THEN COALESCE(default_forms.id, forms.id)
            ELSE forms.id
          END AS moveSourceId
        FROM champions_forms
        JOIN forms ON forms.id = champions_forms.form_id
        LEFT JOIN forms AS default_forms
          ON default_forms.species_id = forms.species_id
          AND default_forms.is_default = 1
      ),
      latest_versions AS (
        SELECT
          move_sources.formId,
          move_sources.moveSourceId,
          (
            SELECT form_moves.version_group_id
            FROM form_moves
            JOIN version_groups
              ON version_groups.id = form_moves.version_group_id
            WHERE form_moves.form_id = move_sources.moveSourceId
            ORDER BY version_groups.sort_order DESC
            LIMIT 1
          ) AS versionGroupId
        FROM move_sources
      )
      SELECT DISTINCT
        latest_versions.formId,
        moves.id,
        COALESCE(moves.name_ja, moves.id) AS name,
        moves.type_name AS typeName,
        COALESCE(moves.effect_ja, moves.effect_en) AS description,
        moves.damage_class_name AS damageClass,
        COALESCE(moves.power, 0) AS power,
        champions_form_move_usage.usage_rate AS usageRate
      FROM latest_versions
      JOIN form_moves
        ON form_moves.form_id = latest_versions.moveSourceId
        AND form_moves.version_group_id = latest_versions.versionGroupId
      JOIN moves ON moves.id = form_moves.move_id
      LEFT JOIN champions_form_move_usage
        ON champions_form_move_usage.form_id = latest_versions.formId
        AND champions_form_move_usage.move_id = moves.id
      WHERE
        moves.damage_class_name IN ('physical', 'special')
        AND (
          moves.power > 0
          OR champions_form_move_usage.move_id IS NOT NULL
        )
      ORDER BY
        latest_versions.formId,
        champions_form_move_usage.usage_rate IS NULL,
        champions_form_move_usage.usage_rate DESC,
        moves.name_ja,
        moves.id
    `),
      sqliteWorkerClient.catalogQuery<PokemonAbilityRow>(`
      SELECT
        forms.id AS formId,
        abilities.id,
        COALESCE(abilities.name_ja, abilities.id) AS name,
        COALESCE(abilities.effect_ja, abilities.effect_en) AS effect,
        form_abilities.slot
      FROM champions_forms
      JOIN forms ON forms.id = champions_forms.form_id
      JOIN form_abilities ON form_abilities.form_id = forms.id
      JOIN abilities ON abilities.id = form_abilities.ability_id
      ORDER BY forms.id, form_abilities.slot
    `),
      sqliteWorkerClient.catalogQuery<AbilityModifierRow>(`
      SELECT
        ability_id AS abilityId,
        modifier_kind AS modifierKind,
        multiplier,
        condition,
        move_type_name AS moveTypeName
      FROM champions_ability_damage_modifiers
      ORDER BY id
    `),
    ]);

  // フォームIDごとにタイプ配列を作る。複合タイプはslot順のまま保持する。
  const typesByFormId = new Map<number, TypeName[]>();
  for (const row of typeRows) {
    const types = typesByFormId.get(row.id) ?? [];
    types.push(row.typeName);
    typesByFormId.set(row.id, types);
  }

  // Smogon計算に渡すため、stat_idをキーにした種族値オブジェクトへ変換する。
  const statsByFormId = new Map<number, Record<string, number>>();
  for (const row of statRows) {
    const stats = statsByFormId.get(row.id) ?? {};
    stats[row.statId] = row.baseStat;
    statsByFormId.set(row.id, stats);
  }

  // ダメージ計算に使える「威力ありの物理/特殊技」だけをフォームIDごとに束ねる。
  const movesByFormId = new Map<number, DamageCalculatorMove[]>();
  for (const { formId, ...move } of moveRows) {
    const moves = movesByFormId.get(formId) ?? [];
    moves.push(move);
    movesByFormId.set(formId, moves);
  }

  const modifiersByAbilityId = new Map<
    string,
    DamageCalculatorAbility["damageModifiers"]
  >();
  for (const { abilityId, ...modifier } of modifierRows) {
    const modifiers = modifiersByAbilityId.get(abilityId) ?? [];
    modifiers.push(modifier);
    modifiersByAbilityId.set(abilityId, modifiers);
  }

  const abilitiesByFormId = new Map<number, DamageCalculatorAbility[]>();
  for (const row of abilityRows) {
    const abilities = abilitiesByFormId.get(row.formId) ?? [];
    const ability = { id: row.id, name: row.name, effect: row.effect };
    abilities.push({
      ...ability,
      damageModifiers: modifiersByAbilityId.get(ability.id) ?? [],
    });
    abilitiesByFormId.set(row.formId, abilities);
  }

  // DBのweightはhectogramなので、@smogon/calcが期待するkgへ変換する。
  return baseRows.map((row) => ({
    id: row.id,
    name: row.name,
    nameJa: row.nameJa,
    imageUrl: row.imageUrl,
    weightKg: row.weight / 10,
    types: typesByFormId.get(row.id) ?? [],
    stats: statsByFormId.get(row.id) ?? {},
    moves: movesByFormId.get(row.id) ?? [],
    abilities: abilitiesByFormId.get(row.id) ?? [],
  }));
}

export async function getChampionsDamageCalculatorHeldItems(): Promise<
  DamageCalculatorHeldItem[]
> {
  const rows = await sqliteWorkerClient.catalogQuery<HeldItemRow>(`
    SELECT
      items.id,
      COALESCE(champions_items.name_ja, items.name_ja, items.id) AS name,
      champions_item_damage_modifiers.modifier_kind AS modifierKind,
      champions_item_damage_modifiers.multiplier,
      champions_item_damage_modifiers.max_multiplier AS maxMultiplier,
      champions_item_damage_modifiers.condition,
      champions_item_damage_modifiers.move_type_name AS moveTypeName,
      champions_item_damage_modifiers.pokemon_name AS pokemonName
    FROM champions_items
    JOIN items ON items.id = champions_items.item_id
    LEFT JOIN champions_item_damage_modifiers
      ON champions_item_damage_modifiers.item_id = champions_items.item_id
    ORDER BY name COLLATE NOCASE, items.id
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    damageModifier:
      row.multiplier === null || row.condition === null
        ? null
        : {
            modifierKind: row.modifierKind ?? "power",
            multiplier: row.multiplier,
            maxMultiplier: row.maxMultiplier,
            condition: row.condition,
            moveTypeName: row.moveTypeName,
            pokemonName: row.pokemonName,
          },
  }));
}

export async function getChampionsDamageFieldConditions(): Promise<{
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
}> {
  const [weatherRows, terrainRows] = await Promise.all([
    sqliteWorkerClient.catalogQuery<WeatherRow>(`
      SELECT
        id,
        name_ja AS name,
        smogon_weather AS smogonWeather,
        normally_available AS normallyAvailable
      FROM champions_damage_weathers
      ORDER BY sort_order, id
    `),
    sqliteWorkerClient.catalogQuery<TerrainRow>(`
      SELECT
        id,
        name_ja AS name,
        smogon_terrain AS smogonTerrain,
        normally_available AS normallyAvailable
      FROM champions_damage_terrains
      ORDER BY sort_order, id
    `),
  ]);

  return {
    weathers: weatherRows.map((row) => ({
      id: row.id,
      name: row.name,
      smogonWeather: row.smogonWeather,
      normallyAvailable: row.normallyAvailable === 1,
    })),
    terrains: terrainRows.map((row) => ({
      id: row.id,
      name: row.name,
      smogonTerrain: row.smogonTerrain,
      normallyAvailable: row.normallyAvailable === 1,
    })),
  };
}
