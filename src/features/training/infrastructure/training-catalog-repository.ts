"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type HeldItem = {
  id: string;
  name: string;
};

/** 性格は上昇補正と下降補正の能力IDを持つ。補正なし性格は同じIDが入る。 */
export type Nature = {
  id: string;
  name: string;
  increasedStatId: string | null;
  decreasedStatId: string | null;
};

/** 育成対象の一覧表示に必要な最小限のフォーム情報。 */
export type TrainingPokemon = {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
};

type NatureRow = SqliteRow & {
  id: string;
  name: string;
  increasedStatId: string | null;
  decreasedStatId: string | null;
};

type TrainingPokemonRow = SqliteRow & {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
};

type HeldItemRow = SqliteRow & {
  id: string;
  name: string;
};

/** 性格マトリクスと能力値計算に使う性格一覧をcatalog.dbから取得する。 */
export async function getNatures(): Promise<Nature[]> {
  const rows = await sqliteWorkerClient.catalogQuery<NatureRow>(`
    SELECT
      id,
      name_ja AS name,
      increased_stat_id AS increasedStatId,
      decreased_stat_id AS decreasedStatId
    FROM natures
    ORDER BY sort_order
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    increasedStatId: row.increasedStatId,
    decreasedStatId: row.decreasedStatId,
  }));
}

/** 保存済み育成案の表示・検索に使うChampions対象ポケモン一覧をcatalog.dbから取得する。 */
export async function getTrainingPokemonCatalog(): Promise<TrainingPokemon[]> {
  const rows = await sqliteWorkerClient.catalogQuery<TrainingPokemonRow>(`
    SELECT
      forms.id,
      forms.name,
      COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
      COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl
    FROM champions_forms
    JOIN forms ON forms.id = champions_forms.form_id
    ORDER BY forms.species_id, forms.is_default DESC, forms.form_order
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameJa: row.nameJa,
    imageUrl: row.imageUrl,
  }));
}

/** Pokémon Championsで使用できる持ち物をcatalog.dbから表示順で取得する。 */
export async function getHeldItems(): Promise<HeldItem[]> {
  const rows = await sqliteWorkerClient.catalogQuery<HeldItemRow>(`
    SELECT
      items.id,
      COALESCE(champions_items.name_ja, items.name_ja, items.id) AS name
    FROM champions_items
    JOIN items ON items.id = champions_items.item_id
    ORDER BY name COLLATE NOCASE, items.id
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
  }));
}
