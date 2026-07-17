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
      WITH top_rankings AS (
        SELECT form_id, usage_rank
        FROM champions_form_usage_rankings
        WHERE battle_format = ?
          AND usage_rank <= 100
      ),
      quiz_forms AS (
        SELECT form_id, usage_rank FROM top_rankings
        UNION
        SELECT mega_forms.id, top_rankings.usage_rank
        FROM top_rankings
        JOIN forms AS ranked_forms ON ranked_forms.id = top_rankings.form_id
        JOIN forms AS mega_forms
          ON mega_forms.species_id = ranked_forms.species_id
          AND mega_forms.is_mega = 1
        JOIN champions_forms
          ON champions_forms.form_id = mega_forms.id
          AND champions_forms.normally_available = 1
          AND champions_forms.source_section = 'mega'
      )
      SELECT
        quiz_forms.form_id AS formId,
        COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
        COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
        quiz_forms.usage_rank AS usageRank,
        form_stats.stat_id AS statId,
        form_stats.base_stat AS baseStat
      FROM quiz_forms
      JOIN forms ON forms.id = quiz_forms.form_id
      JOIN form_stats ON form_stats.form_id = forms.id
      ORDER BY quiz_forms.usage_rank, forms.is_mega, forms.id
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
