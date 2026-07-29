"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type TypeCheckerBattleFormat = "single" | "double";

export type RankedPokemon = {
  formId: number;
  rank: number;
};

type RankedPokemonRow = SqliteRow & {
  formId: number;
  rank: number;
};

export async function getTopRankedPokemon(
  battleFormat: TypeCheckerBattleFormat,
): Promise<RankedPokemon[]> {
  const rows = await sqliteWorkerClient.catalogQuery<RankedPokemonRow>(
    `
      SELECT
        form_id AS formId,
        usage_rank AS rank
      FROM champions_form_usage_rankings
      WHERE battle_format = ?
        AND usage_rank <= 30
      ORDER BY usage_rank, form_id
    `,
    [battleFormat],
  );
  return rows.map((row) => ({
    formId: Number(row.formId),
    rank: Number(row.rank),
  }));
}
