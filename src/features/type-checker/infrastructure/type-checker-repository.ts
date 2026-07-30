"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type TypeCheckerBattleFormat = "single" | "double";

export type RankedPokemon = {
  formId: number;
  rank: number;
  abilityPoints: Record<string, number>;
  usageRate: number | null;
};

type RankedPokemonRow = SqliteRow & {
  formId: number;
  rank: number;
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  usageRate: number;
};

export async function getTopRankedPokemon(
  battleFormat: TypeCheckerBattleFormat,
  rankLimit = 30,
): Promise<RankedPokemon[]> {
  const normalizedRankLimit = Math.max(1, Math.trunc(rankLimit));
  try {
    const rows = await sqliteWorkerClient.catalogQuery<RankedPokemonRow>(`
      SELECT
        rankings.form_id AS formId,
        rankings.usage_rank AS rank,
        points.hp,
        points.attack,
        points.defense,
        points.special_attack AS specialAttack,
        points.special_defense AS specialDefense,
        points.speed,
        points.usage_rate AS usageRate
      FROM champions_form_usage_rankings AS rankings
      JOIN champions_form_stat_points AS points
        ON points.form_id = rankings.form_id
        AND points.battle_format = rankings.battle_format
      WHERE rankings.battle_format = ?
        AND rankings.usage_rank <= ?
      ORDER BY rankings.usage_rank, rankings.form_id
      `,
      [battleFormat, normalizedRankLimit],
    );
    return rows.map((row) => ({
      formId: Number(row.formId),
      rank: Number(row.rank),
      abilityPoints: {
        hp: Number(row.hp),
        attack: Number(row.attack),
        defense: Number(row.defense),
        "special-attack": Number(row.specialAttack),
        "special-defense": Number(row.specialDefense),
        speed: Number(row.speed),
      },
      usageRate: Number(row.usageRate),
    }));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("no such table: champions_form_stat_points")
    ) {
      throw error;
    }
    const rows = await sqliteWorkerClient.catalogQuery<{
      formId: number;
      rank: number;
    }>(
      `
        SELECT form_id AS formId, usage_rank AS rank
        FROM champions_form_usage_rankings
        WHERE battle_format = ?
          AND usage_rank <= ?
        ORDER BY usage_rank, form_id
      `,
      [battleFormat, normalizedRankLimit],
    );
    return rows.map((row) => ({
      formId: Number(row.formId),
      rank: Number(row.rank),
      abilityPoints: {},
      usageRate: null,
    }));
  }
}
