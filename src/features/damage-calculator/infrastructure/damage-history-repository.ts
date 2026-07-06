import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type DamageHistorySide = "attacker" | "defender";

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

export async function getDamageHistory(
  side: DamageHistorySide,
): Promise<DamageHistoryRecord[]> {
  const rows = await sqliteWorkerClient.query<DamageHistoryRow>(
    `SELECT side, pokemon_id, move_id, updated_at
     FROM damage_history
     WHERE side = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
    [side, HISTORY_LIMIT],
  );
  return rows.map(toDamageHistory);
}

export async function saveDamageHistory(
  side: DamageHistorySide,
  pokemonId: number,
  moveId?: string,
): Promise<DamageHistoryRecord[]> {
  const now = Date.now();
  await sqliteWorkerClient.transaction([
    {
      sql: "DELETE FROM damage_history WHERE side = ? AND pokemon_id = ?",
      bind: [side, pokemonId],
    },
    {
      sql: `INSERT INTO damage_history
              (side, pokemon_id, move_id, updated_at)
            VALUES (?, ?, ?, ?)`,
      bind: [side, pokemonId, moveId ?? null, now],
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
