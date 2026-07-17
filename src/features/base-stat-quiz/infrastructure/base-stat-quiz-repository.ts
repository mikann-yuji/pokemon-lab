"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type {
  BaseStatBattleFormat,
  BaseStatId,
  BaseStatPokemon,
} from "../base-stat-quiz-logic";

type BaseStatRow = SqliteRow & {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  usageRank: number;
  statId: BaseStatId;
  baseStat: number;
};

const STAT_IDS: BaseStatId[] = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
];

export async function getBaseStatQuizPokemon(
  battleFormat: BaseStatBattleFormat,
): Promise<BaseStatPokemon[]> {
  const rows = await sqliteWorkerClient.catalogQuery<BaseStatRow>(
    `
      SELECT
        rankings.form_id AS formId,
        COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
        COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
        rankings.usage_rank AS usageRank,
        form_stats.stat_id AS statId,
        form_stats.base_stat AS baseStat
      FROM champions_form_usage_rankings AS rankings
      JOIN forms ON forms.id = rankings.form_id
      JOIN form_stats ON form_stats.form_id = forms.id
      WHERE rankings.battle_format = ?
        AND rankings.usage_rank <= 100
      ORDER BY rankings.usage_rank
    `,
    [battleFormat],
  );
  const byFormId = new Map<number, BaseStatPokemon>();
  for (const row of rows) {
    if (!STAT_IDS.includes(row.statId)) continue;
    const formId = Number(row.formId);
    const pokemon = byFormId.get(formId) ?? {
      formId,
      nameJa: String(row.nameJa),
      imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
      usageRank: Number(row.usageRank),
      stats: {} as Record<BaseStatId, number>,
    };
    pokemon.stats[row.statId] = Number(row.baseStat);
    byFormId.set(formId, pokemon);
  }
  return [...byFormId.values()].filter((pokemon) =>
    STAT_IDS.every((statId) => Number.isFinite(pokemon.stats[statId])),
  );
}
