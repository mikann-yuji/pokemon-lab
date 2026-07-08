"use client";

import type { TypeName } from "@/domain/type-matchup";
import {
  toHiragana,
  toKatakana,
} from "@/domain/pokemon-name-search";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

type PokemonSearchRow = SqliteRow & {
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

type DefaultFormRow = SqliteRow & {
  id: number;
};

type PokemonAbilityRow = SqliteRow & {
  id: string;
  nameJa: string | null;
  slot: number;
  isHidden: number;
  effectJa: string | null;
  effectEn: string | null;
};

type PokemonStatRow = SqliteRow & {
  id: string;
  nameJa: string | null;
  baseStat: number;
  gameIndex: number | null;
};

type PokemonMoveRow = SqliteRow & {
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
  usageRate: number | null;
};

type LatestVersionGroupRow = SqliteRow & {
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
  usageRate: number | null;
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

/** LIKE検索のワイルドカードを文字として扱うため、ユーザー入力の %, _, \ をエスケープする。 */
function escapeLikePattern(value: string) {
  return value.replaceAll(/([%_\\])/g, "\\$1");
}

/**
 * catalog.dbからポケモンフォームを検索する。
 *
 * @param query 日本語名、英語名、フォーム名に対する部分一致文字列。
 * @param limit 1回に返す最大件数。UIの過大取得を避けるため100件に丸める。
 * @param offset ページング用の開始位置。
 * @param championsOnly trueならPokémon Champions対象フォームだけへ絞り込む。
 */
export async function searchPokemon(
  query: string,
  {
    limit = 50,
    offset = 0,
    championsOnly = false,
  }: { limit?: number; offset?: number; championsOnly?: boolean } = {},
): Promise<PokemonSearchResult[]> {
  const normalizedQuery = query.trim();
  // 日本語名はひらがな/カタカナ表記ゆれを吸収して同じSQLで検索する。
  const escapedQuery = escapeLikePattern(normalizedQuery);
  const hiraganaQuery = escapeLikePattern(toHiragana(normalizedQuery));
  const katakanaQuery = escapeLikePattern(toKatakana(normalizedQuery));

  // form_types JOINでタイプ数ぶん行が増えるため、後段でフォーム単位に畳み込む。
  const rows = await sqliteWorkerClient.catalogQuery<PokemonSearchRow>(
    `
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
    `,
    {
      "@query": normalizedQuery,
      "@pattern": `%${escapedQuery}%`,
      "@hiraganaPattern": `%${hiraganaQuery}%`,
      "@katakanaPattern": `%${katakanaQuery}%`,
      "@prefix": `${escapedQuery}%`,
      "@hiraganaPrefix": `${hiraganaQuery}%`,
      "@katakanaPrefix": `${katakanaQuery}%`,
      "@championsOnly": championsOnly ? 1 : 0,
      "@limit": Math.max(1, Math.min(limit, 100)),
      "@offset": Math.max(0, offset),
    },
  );

  // SQL結果は「フォーム x タイプ」の行なので、Mapでフォームごとのtypes配列へ戻す。
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
}

/**
 * 検索結果や詳細ページから使う、1フォーム分の詳細情報をcatalog.dbから組み立てる。
 * 能力、種族値、技は別クエリで取得し、UIがそのまま描画できるDTOへ変換する。
 */
export async function getPokemonDetail(
  id: number,
): Promise<PokemonDetail | null> {
  const rows = await sqliteWorkerClient.catalogQuery<PokemonDetailRow>(
    `
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
    `,
    { "@id": id },
  );

  if (rows.length === 0) return null;

  const base = rows[0];
  // 詳細画面の独立した表示セクションに必要なデータは並列に読む。
  const [abilities, stats, defaultForms] = await Promise.all([
    sqliteWorkerClient.catalogQuery<PokemonAbilityRow>(
      `
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
      `,
      { "@id": id },
    ),
    sqliteWorkerClient.catalogQuery<PokemonStatRow>(
      `
        SELECT
          stats.id,
          stats.name_ja AS nameJa,
          form_stats.base_stat AS baseStat,
          stats.game_index AS gameIndex
        FROM form_stats
        JOIN stats ON stats.id = form_stats.stat_id
        WHERE form_stats.form_id = @id AND stats.is_battle_only = 0
        ORDER BY stats.game_index
      `,
      { "@id": id },
    ),
    base.isMega
      ? sqliteWorkerClient.catalogQuery<DefaultFormRow>(
          `
            SELECT id
            FROM forms
            WHERE species_id = @speciesId AND is_default = 1
            LIMIT 1
          `,
          { "@speciesId": base.speciesId },
        )
      : Promise.resolve([]),
  ]);

  // メガシンカフォームは技データを持たないことがあるため、同じ種の通常フォームを技の参照元にする。
  const moveSourceFormId = defaultForms[0]?.id ?? id;
  const latestVersionGroups =
    await sqliteWorkerClient.catalogQuery<LatestVersionGroupRow>(
      `
        SELECT version_groups.id, version_groups.name
        FROM form_moves
        JOIN version_groups ON version_groups.id = form_moves.version_group_id
        WHERE form_moves.form_id = @moveSourceFormId
        ORDER BY version_groups.sort_order DESC
        LIMIT 1
      `,
      { "@moveSourceFormId": moveSourceFormId },
    );
  const latestVersionGroup = latestVersionGroups[0];
  // 技は最も新しいversion_groupだけを採用し、同じ技が複数習得方法で出る場合は1件へまとめる。
  const moves = latestVersionGroup
    ? await sqliteWorkerClient.catalogQuery<PokemonMoveRow>(
        `
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
            form_moves.move_order AS moveOrder,
            champions_form_move_usage.usage_rate AS usageRate
          FROM form_moves
          JOIN moves ON moves.id = form_moves.move_id
          JOIN types ON types.name = moves.type_name
          JOIN move_learn_methods ON move_learn_methods.id = form_moves.learn_method_id
          LEFT JOIN champions_form_move_usage
            ON champions_form_move_usage.form_id = @id
            AND champions_form_move_usage.move_id = moves.id
          WHERE
            form_moves.form_id = @moveSourceFormId
            AND form_moves.version_group_id = @versionGroupId
          ORDER BY
            champions_form_move_usage.usage_rate IS NULL,
            champions_form_move_usage.usage_rate DESC,
            move_learn_methods.id,
            form_moves.level_learned_at,
            form_moves.move_order,
            moves.id
        `,
        {
          "@id": id,
          "@moveSourceFormId": moveSourceFormId,
          "@versionGroupId": latestVersionGroup.id,
        },
      )
    : [];
  const uniqueMoves = [
    ...new Map(moves.map((move) => [move.id, move])).values(),
  ].sort(
    (left, right) =>
      (right.usageRate ?? -1) - (left.usageRate ?? -1) ||
      (left.nameJa ?? left.id).localeCompare(right.nameJa ?? right.id, "ja"),
  );

  // DB列名やnullフォールバックをここで吸収し、コンポーネントからSQL都合を隠す。
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
      usageRate: move.usageRate,
    })),
    moveVersionGroup: latestVersionGroup?.name ?? null,
  };
}

/** 指定フォームがPokémon Champions対象かどうかを1件存在確認で返す。 */
export async function isChampionsForm(id: number): Promise<boolean> {
  const rows = await sqliteWorkerClient.catalogQuery(
    "SELECT 1 AS found FROM champions_forms WHERE form_id = @id LIMIT 1",
    { "@id": id },
  );
  return rows.length > 0;
}
