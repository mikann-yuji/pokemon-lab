/**
 * このファイルの役割: SQLiteからポケモン検索結果と詳細情報を読み出すインフラ層リポジトリ。
 */

import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import { TYPE_NAMES, type TypeName } from "@/domain/type-matchup";
import {
  toHiragana,
  toKatakana,
} from "@/domain/pokemon-name-search";

type PokemonSearchRow = {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  typeName: TypeName;
  typeNameJa: string;
};

type PokemonDetailRow = PokemonSearchRow & {
  speciesId: number;
  isMega: number;
  height: number;
  weight: number;
};

type DefaultFormRow = {
  id: number;
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
  typeNameJa: string;
  damageClassName: string | null;
  effectJa: string | null;
  effectEn: string | null;
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
  typeNamesJa: string[];
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
  typeNameJa: string;
  damageClassName: string | null;
  description: string | null;
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

const DAMAGE_CLASS_NAMES_JA: Record<string, string> = {
  physical: "ぶつり",
  special: "とくしゅ",
  status: "へんか",
};

function escapeLikePattern(value: string) {
  return value.replaceAll(/([%_\\])/g, "\\$1");
}

/**
 * 日本語名・英語名・フォーム名からポケモンを検索する。
 */
export function searchPokemon(
  query: string,
  {
    limit = 50,
    offset = 0,
    championsOnly = false,
  }: { limit?: number; offset?: number; championsOnly?: boolean } = {},
): PokemonSearchResult[] {
  const databasePath =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "pokemon-lab.db");
  const database = new Database(databasePath, { readonly: true });
  // 前後の空白は検索意図に含めず、空文字なら一覧の先頭100件を返す。
  const normalizedQuery = query.trim();
  // ひらがな・カタカナの両方を検索し、LIKEの記号は入力文字として扱う。
  const escapedQuery = escapeLikePattern(normalizedQuery);
  const hiraganaQuery = escapeLikePattern(toHiragana(normalizedQuery));
  const katakanaQuery = escapeLikePattern(toKatakana(normalizedQuery));
  const searchPattern = `%${escapedQuery}%`;
  const hiraganaPattern = `%${hiraganaQuery}%`;
  const katakanaPattern = `%${katakanaQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const hiraganaPrefix = `${hiraganaQuery}%`;
  const katakanaPrefix = `${katakanaQuery}%`;

  try {
    const rows = database
      .prepare(`
        WITH matching_forms AS (
          SELECT
            forms.id,
            forms.name,
            COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
            COALESCE(
              forms.artwork_default_url,
              forms.sprite_default_url
            ) AS imageUrl,
            forms.species_id,
            forms.is_default,
            forms.form_order
          FROM forms
          WHERE
            (
              @query = ''
              OR forms.name LIKE @pattern ESCAPE '\\'
              OR forms.name_ja LIKE @pattern ESCAPE '\\'
              OR forms.name_ja LIKE @hiraganaPattern ESCAPE '\\'
              OR forms.name_ja LIKE @katakanaPattern ESCAPE '\\'
              OR forms.form_name LIKE @pattern ESCAPE '\\'
              OR forms.form_name_ja LIKE @pattern ESCAPE '\\'
              OR forms.form_name_ja LIKE @hiraganaPattern ESCAPE '\\'
              OR forms.form_name_ja LIKE @katakanaPattern ESCAPE '\\'
            )
            AND (
              @championsOnly = 0
              OR EXISTS (
                SELECT 1
                FROM champions_forms
                WHERE champions_forms.form_id = forms.id
              )
            )
          ORDER BY
            CASE
              WHEN forms.name LIKE @prefix ESCAPE '\\'
                OR forms.name_ja LIKE @prefix ESCAPE '\\'
                OR forms.name_ja LIKE @hiraganaPrefix ESCAPE '\\'
                OR forms.name_ja LIKE @katakanaPrefix ESCAPE '\\'
                OR forms.form_name LIKE @prefix ESCAPE '\\'
                OR forms.form_name_ja LIKE @prefix ESCAPE '\\'
                OR forms.form_name_ja LIKE @hiraganaPrefix ESCAPE '\\'
                OR forms.form_name_ja LIKE @katakanaPrefix ESCAPE '\\'
              THEN 0
              ELSE 1
            END,
            forms.species_id,
            forms.is_default DESC,
            forms.form_order
          LIMIT @limit OFFSET @offset
        )
        SELECT
          matching_forms.id,
          matching_forms.name,
          matching_forms.nameJa,
          matching_forms.imageUrl,
          form_types.type_name AS typeName,
          types.name_ja AS typeNameJa
        FROM matching_forms
        JOIN form_types ON form_types.form_id = matching_forms.id
        JOIN types ON types.name = form_types.type_name
        ORDER BY
          matching_forms.species_id,
          matching_forms.is_default DESC,
          matching_forms.form_order,
          form_types.slot
      `)
      .all({
        query: normalizedQuery,
        pattern: searchPattern,
        hiraganaPattern,
        katakanaPattern,
        prefix: prefixPattern,
        hiraganaPrefix,
        katakanaPrefix,
        championsOnly: championsOnly ? 1 : 0,
        limit: Math.max(1, Math.min(limit, 100)),
        offset: Math.max(0, offset),
      }) as PokemonSearchRow[];
    // 複数タイプのJOINで同じフォームが複数行になるため、Mapで1件にまとめる。
    const results = new Map<number, PokemonSearchResult>();

    for (const row of rows) {
      const result = results.get(row.id) ?? {
        id: row.id,
        name: row.name,
        nameJa: row.nameJa,
        imageUrl: row.imageUrl,
        types: [],
        typeNamesJa: [],
      };
      result.types.push(row.typeName);
      result.typeNamesJa.push(row.typeNameJa);
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
          forms.species_id AS speciesId,
          forms.is_mega AS isMega,
          forms.height,
          forms.weight,
          form_types.type_name AS typeName,
          types.name_ja AS typeNameJa
        FROM forms
        JOIN form_types ON form_types.form_id = forms.id
        JOIN types ON types.name = form_types.type_name
        WHERE forms.id = @id
        ORDER BY form_types.slot
      `)
      .all({ id }) as PokemonDetailRow[];

    if (rows.length === 0) {
      return null;
    }

        // 1行目にはフォーム共通情報が入っている。タイプだけは複数行から配列化する。
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
    const moveSourceForm = base.isMega
      ? (database
          .prepare(`
            SELECT id
            FROM forms
            WHERE species_id = @speciesId AND is_default = 1
            LIMIT 1
          `)
          .get({ speciesId: base.speciesId }) as DefaultFormRow | undefined)
      : undefined;
    const moveSourceFormId = moveSourceForm?.id ?? id;
    const latestVersionGroup = database
      .prepare(`
        SELECT version_groups.id, version_groups.name
        FROM form_moves
        JOIN version_groups ON version_groups.id = form_moves.version_group_id
        WHERE form_moves.form_id = @moveSourceFormId
        ORDER BY version_groups.sort_order DESC
        LIMIT 1
      `)
      .get({ moveSourceFormId }) as LatestVersionGroupRow | undefined;
    const moves = latestVersionGroup
      ? (database
          .prepare(`
            SELECT
              moves.id,
              moves.name_ja AS nameJa,
              moves.type_name AS typeName,
              types.name_ja AS typeNameJa,
              moves.damage_class_name AS damageClassName,
              moves.effect_ja AS effectJa,
              moves.effect_en AS effectEn,
              moves.power,
              moves.pp,
              moves.accuracy,
              move_learn_methods.name AS learnMethodName,
              move_learn_methods.name_ja AS learnMethodNameJa,
              form_moves.level_learned_at AS levelLearnedAt,
              form_moves.move_order AS moveOrder
            FROM form_moves
            JOIN moves ON moves.id = form_moves.move_id
            JOIN types ON types.name = moves.type_name
            JOIN move_learn_methods ON move_learn_methods.id = form_moves.learn_method_id
            WHERE
              form_moves.form_id = @moveSourceFormId
              AND form_moves.version_group_id = @versionGroupId
            ORDER BY
              move_learn_methods.id,
              form_moves.level_learned_at,
              form_moves.move_order,
              moves.id
          `)
          .all({
            moveSourceFormId,
            versionGroupId: latestVersionGroup.id,
          }) as PokemonMoveRow[])
      : [];
    const uniqueMoves = [
      ...new Map(moves.map((move) => [move.id, move])).values(),
    ].sort(
      (left, right) =>
        TYPE_NAMES.indexOf(left.typeName) -
          TYPE_NAMES.indexOf(right.typeName) ||
        (left.nameJa ?? left.id).localeCompare(right.nameJa ?? right.id, "ja"),
    );

    return {
      id: base.id,
      name: base.name,
      nameJa: base.nameJa,
      imageUrl: base.imageUrl,
      types: rows.map((row) => row.typeName),
      typeNamesJa: rows.map((row) => row.typeNameJa),
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
      moves: uniqueMoves.map((move) => ({
        id: move.id,
        name: move.nameJa ?? move.id,
        typeName: move.typeName,
        typeNameJa: move.typeNameJa,
        damageClassName: move.damageClassName
          ? (DAMAGE_CLASS_NAMES_JA[move.damageClassName] ?? move.damageClassName)
          : null,
        description: move.effectJa ?? move.effectEn,
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
