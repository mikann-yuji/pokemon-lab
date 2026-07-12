import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type BattleRecord = {
  id: number;
  battleAt: number;
  memo: string;
  imageDataUrl: string;
  createdAt: number;
  updatedAt: number;
};

type BattleRecordRow = SqliteRow & {
  id: number;
  battle_at: number;
  memo: string;
  image_data_url: string;
  created_at: number;
  updated_at: number;
};

function toBattleRecord(row: BattleRecordRow): BattleRecord {
  return {
    id: Number(row.id),
    battleAt: Number(row.battle_at),
    memo: String(row.memo),
    imageDataUrl: String(row.image_data_url),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getBattleRecords(): Promise<BattleRecord[]> {
  const rows = await sqliteWorkerClient.query<BattleRecordRow>(
    `SELECT id, battle_at, memo, image_data_url, created_at, updated_at
     FROM battle_records
     ORDER BY battle_at DESC, id DESC`,
  );
  return rows.map(toBattleRecord);
}

export async function saveBattleRecord({
  battleAt,
  memo,
  imageDataUrl,
}: {
  battleAt: number;
  memo: string;
  imageDataUrl: string;
}): Promise<BattleRecord> {
  const normalizedMemo = memo.trim();
  if (!imageDataUrl) {
    throw new Error("選出画面の写真を選択してください。");
  }
  if (!Number.isFinite(battleAt)) {
    throw new Error("日時を入力してください。");
  }

  const now = Date.now();
  const result = await sqliteWorkerClient.execute(
    `INSERT INTO battle_records
       (battle_at, memo, image_data_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [battleAt, normalizedMemo, imageDataUrl, now, now],
  );

  const rows = await sqliteWorkerClient.query<BattleRecordRow>(
    `SELECT id, battle_at, memo, image_data_url, created_at, updated_at
     FROM battle_records
     WHERE id = ?
     LIMIT 1`,
    [result.lastInsertRowId],
  );
  if (!rows[0]) {
    throw new Error("保存したバトル記録を確認できませんでした。");
  }
  return toBattleRecord(rows[0]);
}

export async function deleteBattleRecord(id: number) {
  await sqliteWorkerClient.execute("DELETE FROM battle_records WHERE id = ?", [
    id,
  ]);
}
