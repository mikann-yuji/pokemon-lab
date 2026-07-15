import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type DamageHistorySide = "attacker" | "defender";

/** ダメージ計算画面の「最近使ったポケモン」に表示する1件分の保存データ。 */
export type DamageHistoryRecord = {
  id: string;
  side: DamageHistorySide;
  pokemonId: number;
  moveId?: string;
  updatedAt: number;
};

type DamageHistoryRow = SqliteRow & {
  side: DamageHistorySide;
  pokemon_id: number;
  move_id: string | null;
  updated_at: number;
};

const HISTORY_LIMIT = 10;

/**
 * ダメージ計算ページで、user.dbの履歴行をUI用レコードへ変換する。
 *
 * @param row - damage_historyテーブルから取得した1行。
 * @returns 最近使ったポケモン表示で使う履歴レコード。
 */
function toDamageHistory(row: DamageHistoryRow): DamageHistoryRecord {
  const side = String(row.side) as DamageHistorySide;
  const pokemonId = Number(row.pokemon_id);
  return {
    id: `${side}:${pokemonId}`,
    side,
    pokemonId,
    ...(row.move_id === null ? {} : { moveId: String(row.move_id) }),
    updatedAt: Number(row.updated_at),
  };
}

/**
 * ダメージ計算ページで、攻撃側または防御側の最近使ったポケモンを取得する。
 *
 * @param side - 取得する履歴の側。
 * @returns 新しい順に並んだ履歴レコード一覧。
 */
export async function getDamageHistory(
  side: DamageHistorySide,
): Promise<DamageHistoryRecord[]> {
  const rows = await sqliteWorkerClient.query<DamageHistoryRow>(
    `SELECT side, pokemon_id, move_id, updated_at
     FROM damage_history
     WHERE side = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
    [side, HISTORY_LIMIT],
  );
  return rows.map(toDamageHistory);
}

/**
 * ダメージ計算ページで、計算に成功した組み合わせを履歴へ保存する。
 *
 * @param side - 保存する履歴の側。
 * @param pokemonId - 履歴に残すポケモンフォームID。
 * @param moveId - 攻撃側履歴に紐づける技ID。防御側では省略できる。
 * @returns 保存後の新しい履歴一覧。
 */
export async function saveDamageHistory(
  side: DamageHistorySide,
  pokemonId: number,
  moveId?: string,
): Promise<DamageHistoryRecord[]> {
  const now = Date.now();
  await sqliteWorkerClient.transaction([
    {
      sql: "DELETE FROM damage_history WHERE deleted_at IS NOT NULL",
      bind: [],
    },
    {
      sql: "DELETE FROM damage_history WHERE side = ? AND pokemon_id = ?",
      bind: [side, pokemonId],
    },
    {
      sql: `INSERT INTO damage_history
              (side, pokemon_id, move_id, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, NULL)`,
      bind: [side, pokemonId, moveId ?? null, now, now],
    },
    {
      sql: `DELETE FROM damage_history
            WHERE side = ?
              AND id NOT IN (
                SELECT id FROM damage_history
                WHERE side = ?
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
              )`,
      bind: [side, side, HISTORY_LIMIT],
    },
  ]);
  return getDamageHistory(side);
}
