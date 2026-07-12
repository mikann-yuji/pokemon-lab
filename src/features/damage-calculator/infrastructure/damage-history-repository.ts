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

const HISTORY_LIMIT = 6;

/** DB行をUIで扱いやすい履歴レコードへ変換し、sideとpokemonIdから安定した表示keyを作る。 */
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

/** 攻撃側または防御側の最近使ったポケモンを新しい順に取得する。 */
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
 * 計算に成功した組み合わせを履歴へ保存する。
 * 同じside/pokemonは一度削除してから入れ直し、最新順に並ぶようにする。
 */
export async function saveDamageHistory(
  side: DamageHistorySide,
  pokemonId: number,
  moveId?: string,
): Promise<DamageHistoryRecord[]> {
  const now = Date.now();
  await sqliteWorkerClient.transaction([
    {
      sql: "UPDATE damage_history SET deleted_at = ?, updated_at = ? WHERE side = ? AND pokemon_id = ?",
      bind: [now, now, side, pokemonId],
    },
    {
      sql: `INSERT INTO damage_history
              (side, pokemon_id, move_id, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, NULL)`,
      bind: [side, pokemonId, moveId ?? null, now, now],
    },
    {
      sql: `UPDATE damage_history
            SET deleted_at = ?, updated_at = ?
            WHERE side = ?
              AND deleted_at IS NULL
              AND id NOT IN (
                SELECT id FROM damage_history
                WHERE side = ?
                  AND deleted_at IS NULL
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
              )`,
      bind: [now, now, side, side, HISTORY_LIMIT],
    },
  ]);
  return getDamageHistory(side);
}
