"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type { TypeCheckerBattleFormat } from "@/features/type-checker/infrastructure/type-checker-repository";

export type SurvivalCheckHistoryMember = {
  pokemonId: number;
  pokemonName: string;
  buildName: string;
};

export type SurvivalCheckHistoryTarget = {
  pokemonId: number;
  pokemonName: string;
  rank: number;
};

export type SurvivalCheckHistory = {
  id: number;
  checkedAt: number;
  teamName: string;
  battleFormat: TypeCheckerBattleFormat;
  members: SurvivalCheckHistoryMember[];
  remainingTargets: SurvivalCheckHistoryTarget[];
};

type SurvivalCheckHistoryRow = SqliteRow & {
  id: number;
  checked_at: number;
  team_name: string;
  battle_format: TypeCheckerBattleFormat;
  team_json: string;
  result_json: string;
};

function parseArray<Value>(value: string): Value[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as Value[]) : [];
  } catch {
    return [];
  }
}

function toHistory(row: SurvivalCheckHistoryRow): SurvivalCheckHistory {
  return {
    id: Number(row.id),
    checkedAt: Number(row.checked_at),
    teamName: String(row.team_name),
    battleFormat: row.battle_format,
    members: parseArray<SurvivalCheckHistoryMember>(String(row.team_json)),
    remainingTargets: parseArray<SurvivalCheckHistoryTarget>(
      String(row.result_json),
    ),
  };
}

export async function getSurvivalCheckHistories() {
  const rows = await sqliteWorkerClient.query<SurvivalCheckHistoryRow>(
    `SELECT id, checked_at, team_name, battle_format, team_json, result_json
     FROM survival_check_histories
     WHERE deleted_at IS NULL
     ORDER BY checked_at DESC, id DESC`,
  );
  return rows.map(toHistory);
}

export async function saveSurvivalCheckHistory({
  checkedAt,
  teamName,
  battleFormat,
  members,
  remainingTargets,
}: Omit<SurvivalCheckHistory, "id">) {
  const now = Date.now();
  const result = await sqliteWorkerClient.execute(
    `INSERT INTO survival_check_histories (
       sync_id, checked_at, team_name, battle_format, team_json, result_json,
       created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      crypto.randomUUID(),
      checkedAt,
      teamName,
      battleFormat,
      JSON.stringify(members),
      JSON.stringify(remainingTargets),
      now,
      now,
    ],
  );
  const rows = await sqliteWorkerClient.query<SurvivalCheckHistoryRow>(
    `SELECT id, checked_at, team_name, battle_format, team_json, result_json
     FROM survival_check_histories
     WHERE id = ?
     LIMIT 1`,
    [result.lastInsertRowId],
  );
  if (!rows[0]) {
    throw new Error("保存した勝ち残り確認履歴を読み込めませんでした。");
  }
  return toHistory(rows[0]);
}
// 耐久チェックの履歴をユーザーDBへ保存し、再利用可能な形で読み戻す。
