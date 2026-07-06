"use client";

import type { TypeName } from "@/domain/type-matchup";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
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
  damageClass: "physical" | "special";
  power: number;
};

export async function getChampionsDamageCalculatorPokemon(): Promise<
  DamageCalculatorPokemon[]
> {
  const [baseRows, typeRows, statRows, moveRows] = await Promise.all([
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
        moves.damage_class_name AS damageClass,
        moves.power
      FROM latest_versions
      JOIN form_moves
        ON form_moves.form_id = latest_versions.moveSourceId
        AND form_moves.version_group_id = latest_versions.versionGroupId
      JOIN moves ON moves.id = form_moves.move_id
      WHERE
        moves.damage_class_name IN ('physical', 'special')
        AND moves.power > 0
      ORDER BY latest_versions.formId, moves.name_ja, moves.id
    `),
  ]);

  const typesByFormId = new Map<number, TypeName[]>();
  for (const row of typeRows) {
    const types = typesByFormId.get(row.id) ?? [];
    types.push(row.typeName);
    typesByFormId.set(row.id, types);
  }

  const statsByFormId = new Map<number, Record<string, number>>();
  for (const row of statRows) {
    const stats = statsByFormId.get(row.id) ?? {};
    stats[row.statId] = row.baseStat;
    statsByFormId.set(row.id, stats);
  }

  const movesByFormId = new Map<number, DamageCalculatorMove[]>();
  for (const { formId, ...move } of moveRows) {
    const moves = movesByFormId.get(formId) ?? [];
    moves.push(move);
    movesByFormId.set(formId, moves);
  }

  return baseRows.map((row) => ({
    id: row.id,
    name: row.name,
    nameJa: row.nameJa,
    imageUrl: row.imageUrl,
    weightKg: row.weight / 10,
    types: typesByFormId.get(row.id) ?? [],
    stats: statsByFormId.get(row.id) ?? {},
    moves: movesByFormId.get(row.id) ?? [],
  }));
}
