import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type BattleRecord = {
  id: number;
  battleAt: number;
  memo: string;
  imageDataUrl: string;
  opponentNames: string[];
  createdAt: number;
  updatedAt: number;
};

type BattleRecordRow = SqliteRow & {
  id: number;
  battle_at: number;
  memo: string;
  image_data_url: string;
  opponent_names_json: string;
  created_at: number;
  updated_at: number;
};

function toBattleRecord(row: BattleRecordRow): BattleRecord {
  let opponentNames: string[] = [];
  try {
    const parsed = JSON.parse(String(row.opponent_names_json ?? "[]")) as unknown;
    if (Array.isArray(parsed)) {
      opponentNames = parsed.filter(
        (name): name is string => typeof name === "string" && name.length > 0,
      );
    }
  } catch {
    opponentNames = [];
  }
  return {
    id: Number(row.id),
    battleAt: Number(row.battle_at),
    memo: String(row.memo),
    imageDataUrl: String(row.image_data_url),
    opponentNames,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getBattleRecords(): Promise<BattleRecord[]> {
  const rows = await sqliteWorkerClient.query<BattleRecordRow>(
    `SELECT id, battle_at, memo, image_data_url, opponent_names_json, created_at, updated_at
     FROM battle_records
     WHERE deleted_at IS NULL
     ORDER BY battle_at DESC, id DESC`,
  );
  return rows.map(toBattleRecord);
}

export async function saveBattleRecord({
  battleAt,
  memo,
  imageDataUrl,
  opponentNames,
}: {
  battleAt: number;
  memo: string;
  imageDataUrl: string;
  opponentNames: string[];
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
       (sync_id, battle_at, memo, image_data_url, opponent_names_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      crypto.randomUUID(),
      battleAt,
      normalizedMemo,
      imageDataUrl,
      JSON.stringify(opponentNames),
      now,
      now,
    ],
  );

  const rows = await sqliteWorkerClient.query<BattleRecordRow>(
    `SELECT id, battle_at, memo, image_data_url, opponent_names_json, created_at, updated_at
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
  const now = Date.now();
  await sqliteWorkerClient.execute(
    "UPDATE battle_records SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}
// 対戦履歴をユーザーDBへ保存し、一覧・集計用に読み出す。
