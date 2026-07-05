/**
 * このファイルの役割:
 * ダメージ計算で最近使ったポケモンと技をIndexedDBへ保存する。
 *
 * ポケモンの種族値などはSQLite由来のカタログを正とするため、
 * IndexedDBにはフォームIDと技IDだけを保存する。
 */

import Dexie, { type EntityTable } from "dexie";

export type DamageHistorySide = "attacker" | "defender";

export type DamageHistoryRecord = {
  /** 攻撃側・防御側ごとに同じポケモンを1件へまとめるための主キー。 */
  id: string;
  side: DamageHistorySide;
  pokemonId: number;
  /** 攻撃側で使用した技。防御側では保存しない。 */
  moveId?: string;
  updatedAt: number;
};

const HISTORY_LIMIT = 6;

const database = new Dexie("pokemon-lab-damage-calculator") as Dexie & {
  history: EntityTable<DamageHistoryRecord, "id">;
};

database.version(1).stores({
  history: "&id, side, updatedAt",
});

/**
 * 指定した側で最近使った履歴を、新しい順に返す。
 */
export async function getDamageHistory(
  side: DamageHistorySide,
): Promise<DamageHistoryRecord[]> {
  const records = await database.history.where("side").equals(side).toArray();
  return records
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, HISTORY_LIMIT);
}

/**
 * 計算に使った選択を保存し、古い履歴が増え続けないよう上限を超えた分を削除する。
 */
export async function saveDamageHistory(
  side: DamageHistorySide,
  pokemonId: number,
  moveId?: string,
): Promise<DamageHistoryRecord[]> {
  const record: DamageHistoryRecord = {
    id: `${side}:${pokemonId}`,
    side,
    pokemonId,
    ...(moveId ? { moveId } : {}),
    updatedAt: Date.now(),
  };

  await database.history.put(record);
  const records = await database.history.where("side").equals(side).toArray();
  const sortedRecords = records.sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
  const expiredIds = sortedRecords
    .slice(HISTORY_LIMIT)
    .map(({ id }) => id);

  if (expiredIds.length > 0) {
    await database.history.bulkDelete(expiredIds);
  }

  return sortedRecords.slice(0, HISTORY_LIMIT);
}
