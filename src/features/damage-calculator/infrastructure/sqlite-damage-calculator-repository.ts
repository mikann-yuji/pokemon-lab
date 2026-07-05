/**
 * このファイルの役割:
 * SQLiteに保存されているフォーム、種族値、タイプ、習得技を読み込み、
 * ダメージ計算用の共通データ型へ組み立てる。
 *
 * infrastructureフォルダには、DBや外部サービスなど
 * 「アプリの外側との接続方法」を置く。
 */

import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import type { TypeName } from "@/domain/type-matchup";
import type { DamageCalculatorPokemon } from "../domain/damage-calculator-types";

type PokemonRow = {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  weight: number;
  speciesId: number;
  isMega: number;
  typeName: TypeName;
  statId: string;
  baseStat: number;
};

type MoveRow = {
  id: string;
  name: string;
  typeName: TypeName;
  damageClass: "physical" | "special";
  power: number;
};

function openDatabase() {
  // 環境変数があればそのDBを使い、なければ開発・本番共通の既定パスを使う。
  const databasePath =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "pokemon-lab.db");
  return new Database(databasePath, { readonly: true });
}

function getDamageCalculatorPokemonFromDatabase(
  database: Database.Database,
  id: number,
): DamageCalculatorPokemon | null {
  // タイプと種族値はそれぞれ複数行あるため、まずJOIN結果をまとめて取得する。
  const rows = database
      .prepare(`
        SELECT
          forms.id,
          forms.name,
          COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
          COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
          forms.weight,
          forms.species_id AS speciesId,
          forms.is_mega AS isMega,
          form_types.type_name AS typeName,
          form_stats.stat_id AS statId,
          form_stats.base_stat AS baseStat
        FROM forms
        JOIN form_types ON form_types.form_id = forms.id
        JOIN form_stats ON form_stats.form_id = forms.id
        WHERE forms.id = @id
        ORDER BY form_types.slot
      `)
      .all({ id }) as PokemonRow[];

  if (rows.length === 0) return null;

  const base = rows[0];
  const types = [...new Set(rows.map(({ typeName }) => typeName))];
  const stats = Object.fromEntries(
    rows.map(({ statId, baseStat }) => [statId, baseStat]),
  );
  const defaultForm = base.isMega
    ? (database
        .prepare(`
            SELECT id
            FROM forms
            WHERE species_id = @speciesId AND is_default = 1
            LIMIT 1
          `)
        .get({ speciesId: base.speciesId }) as { id: number } | undefined)
    : undefined;
  const moveSourceId = defaultForm?.id ?? id;
  // メガシンカは通常フォームと習得技を共有するため、通常フォームを参照する。
  const moveRows = database
    .prepare(`
        WITH latest_version AS (
          SELECT form_moves.version_group_id
          FROM form_moves
          JOIN version_groups
            ON version_groups.id = form_moves.version_group_id
          WHERE form_moves.form_id = @moveSourceId
          ORDER BY version_groups.sort_order DESC
          LIMIT 1
        )
        SELECT DISTINCT
          moves.id,
          COALESCE(moves.name_ja, moves.id) AS name,
          moves.type_name AS typeName,
          moves.damage_class_name AS damageClass,
          moves.power
        FROM form_moves
        JOIN moves ON moves.id = form_moves.move_id
        WHERE
          form_moves.form_id = @moveSourceId
          AND form_moves.version_group_id = (
            SELECT version_group_id FROM latest_version
          )
          AND moves.damage_class_name IN ('physical', 'special')
          AND moves.power > 0
        ORDER BY moves.name_ja, moves.id
      `)
    .all({ moveSourceId }) as MoveRow[];

  return {
    id: base.id,
    name: base.name,
    nameJa: base.nameJa,
    imageUrl: base.imageUrl,
    weightKg: base.weight / 10,
    types,
    stats,
    moves: moveRows,
  };
}

export function getDamageCalculatorPokemon(
  id: number,
): DamageCalculatorPokemon | null {
  const database = openDatabase();

  try {
    return getDamageCalculatorPokemonFromDatabase(database, id);
  } finally {
    database.close();
  }
}

/**
 * Pokémon Championsに登場するフォームだけを、オフライン計算用カタログとして返す。
 */
export function getChampionsDamageCalculatorPokemon(): DamageCalculatorPokemon[] {
  const database = openDatabase();

  try {
    const formIds = database
      .prepare(`
        SELECT form_id AS id
        FROM champions_forms
        ORDER BY form_id
      `)
      .all() as { id: number }[];

    // champions_formsを入口にすることで、通常の全国図鑑データが増えても
    // チャンピオンズ専用画面へ対象外ポケモンが混ざらない。
    return formIds.flatMap(({ id }) => {
      const pokemon = getDamageCalculatorPokemonFromDatabase(database, id);
      return pokemon ? [pokemon] : [];
    });
  } finally {
    database.close();
  }
}
