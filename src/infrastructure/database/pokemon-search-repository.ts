import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import type { TypeName } from "@/domain/type-matchup";

type PokemonSearchRow = {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  typeName: TypeName;
};

type PokemonDetailRow = PokemonSearchRow & {
  height: number;
  weight: number;
};

type PokemonAbilityRow = {
  id: string;
  nameJa: string | null;
  slot: number;
  isHidden: number;
  effectJa: string | null;
  effectEn: string | null;
};

type PokemonStatRow = {
  id: string;
  nameJa: string | null;
  baseStat: number;
  gameIndex: number | null;
};

type PokemonMoveRow = {
  id: string;
  nameJa: string | null;
  typeName: TypeName;
  damageClassName: string | null;
  power: number | null;
  pp: number | null;
  accuracy: number | null;
  learnMethodName: string;
  learnMethodNameJa: string | null;
  levelLearnedAt: number;
  moveOrder: number | null;
};

type LatestVersionGroupRow = {
  id: number;
  name: string;
};

export type PokemonSearchResult = {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  types: TypeName[];
};

export type PokemonAbility = {
  id: string;
  name: string;
  isHidden: boolean;
  effect: string | null;
};

export type PokemonStat = {
  id: string;
  name: string;
  baseStat: number;
};

export type PokemonMove = {
  id: string;
  name: string;
  typeName: TypeName;
  damageClassName: string | null;
  power: number | null;
  pp: number | null;
  accuracy: number | null;
  learnMethod: string;
  levelLearnedAt: number;
};

export type PokemonDetail = PokemonSearchResult & {
  height: number;
  weight: number;
  abilities: PokemonAbility[];
  stats: PokemonStat[];
  statTotal: number;
  moves: PokemonMove[];
  moveVersionGroup: string | null;
};

/**
 * 日本語名・英語名・フォーム名からポケモンを検索する。
 */
export function searchPokemon(query: string): PokemonSearchResult[] {
  const databasePath =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "pokemon-lab.db");
  const database = new Database(databasePath, { readonly: true });
  const normalizedQuery = query.trim();
  const escapedQuery = normalizedQuery.replaceAll(
    /([%_\\])/g,
    "\\$1",
  );
  const searchPattern = `%${escapedQuery}%`;

  try {
    const rows = database
      .prepare(`
        SELECT
          forms.id,
          forms.name,
          COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
          COALESCE(
            forms.artwork_default_url,
            forms.sprite_default_url
          ) AS imageUrl,
          form_types.type_name AS typeName
        FROM forms
        JOIN form_types ON form_types.form_id = forms.id
        WHERE
          @query = ''
          OR forms.name LIKE @pattern ESCAPE '\\'
          OR forms.name_ja LIKE @pattern ESCAPE '\\'
          OR forms.form_name LIKE @pattern ESCAPE '\\'
          OR forms.form_name_ja LIKE @pattern ESCAPE '\\'
        ORDER BY
          forms.species_id,
          forms.is_default DESC,
          forms.form_order,
          form_types.slot
        LIMIT 100
      `)
      .all({ query: normalizedQuery, pattern: searchPattern }) as PokemonSearchRow[];
    const results = new Map<number, PokemonSearchResult>();

    for (const row of rows) {
      const result = results.get(row.id) ?? {
        id: row.id,
        name: row.name,
        nameJa: row.nameJa,
        imageUrl: row.imageUrl,
        types: [],
      };
      result.types.push(row.typeName);
      results.set(row.id, result);
    }

    return [...results.values()];
  } finally {
    database.close();
  }
}

/**
 * 検索結果で選択されたポケモンの対戦向け詳細を取得する。
 */
export function getPokemonDetail(id: number): PokemonDetail | null {
  const databasePath =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "pokemon-lab.db");
  const database = new Database(databasePath, { readonly: true });

  try {
    const rows = database
      .prepare(`
        SELECT
          forms.id,
          forms.name,
          COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
          COALESCE(
            forms.artwork_default_url,
            forms.sprite_default_url
          ) AS imageUrl,
          forms.height,
          forms.weight,
          form_types.type_name AS typeName
        FROM forms
        JOIN form_types ON form_types.form_id = forms.id
        WHERE forms.id = @id
        ORDER BY form_types.slot
      `)
      .all({ id }) as PokemonDetailRow[];

    if (rows.length === 0) {
      return null;
    }

    const base = rows[0];
    const abilities = database
      .prepare(`
        SELECT
          abilities.id,
          abilities.name_ja AS nameJa,
          form_abilities.slot,
          form_abilities.is_hidden AS isHidden,
          abilities.effect_ja AS effectJa,
          abilities.effect_en AS effectEn
        FROM form_abilities
        JOIN abilities ON abilities.id = form_abilities.ability_id
        WHERE form_abilities.form_id = @id
        ORDER BY form_abilities.is_hidden, form_abilities.slot
      `)
      .all({ id }) as PokemonAbilityRow[];
    const stats = database
      .prepare(`
        SELECT
          stats.id,
          stats.name_ja AS nameJa,
          form_stats.base_stat AS baseStat,
          stats.game_index AS gameIndex
        FROM form_stats
        JOIN stats ON stats.id = form_stats.stat_id
        WHERE form_stats.form_id = @id AND stats.is_battle_only = 0
        ORDER BY stats.game_index
      `)
      .all({ id }) as PokemonStatRow[];
    const latestVersionGroup = database
      .prepare(`
        SELECT version_groups.id, version_groups.name
        FROM form_moves
        JOIN version_groups ON version_groups.id = form_moves.version_group_id
        WHERE form_moves.form_id = @id
        ORDER BY version_groups.sort_order DESC
        LIMIT 1
      `)
      .get({ id }) as LatestVersionGroupRow | undefined;
    const moves = latestVersionGroup
      ? (database
          .prepare(`
            SELECT
              moves.id,
              moves.name_ja AS nameJa,
              moves.type_name AS typeName,
              moves.damage_class_name AS damageClassName,
              moves.power,
              moves.pp,
              moves.accuracy,
              move_learn_methods.name AS learnMethodName,
              move_learn_methods.name_ja AS learnMethodNameJa,
              form_moves.level_learned_at AS levelLearnedAt,
              form_moves.move_order AS moveOrder
            FROM form_moves
            JOIN moves ON moves.id = form_moves.move_id
            JOIN move_learn_methods ON move_learn_methods.id = form_moves.learn_method_id
            WHERE
              form_moves.form_id = @id
              AND form_moves.version_group_id = @versionGroupId
            ORDER BY
              move_learn_methods.id,
              form_moves.level_learned_at,
              form_moves.move_order,
              moves.id
          `)
          .all({ id, versionGroupId: latestVersionGroup.id }) as PokemonMoveRow[])
      : [];

    return {
      id: base.id,
      name: base.name,
      nameJa: base.nameJa,
      imageUrl: base.imageUrl,
      types: rows.map((row) => row.typeName),
      height: base.height,
      weight: base.weight,
      abilities: abilities.map((ability) => ({
        id: ability.id,
        name: ability.nameJa ?? ability.id,
        isHidden: ability.isHidden === 1,
        effect: ability.effectJa ?? ability.effectEn,
      })),
      stats: stats.map((stat) => ({
        id: stat.id,
        name: stat.nameJa ?? stat.id,
        baseStat: stat.baseStat,
      })),
      statTotal: stats.reduce((total, stat) => total + stat.baseStat, 0),
      moves: moves.map((move) => ({
        id: move.id,
        name: move.nameJa ?? move.id,
        typeName: move.typeName,
        damageClassName: move.damageClassName,
        power: move.power,
        pp: move.pp,
        accuracy: move.accuracy,
        learnMethod: move.learnMethodNameJa ?? move.learnMethodName,
        levelLearnedAt: move.levelLearnedAt,
      })),
      moveVersionGroup: latestVersionGroup?.name ?? null,
    };
  } finally {
    database.close();
  }
}
