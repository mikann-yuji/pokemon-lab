"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type KnowledgeStatId =
  | "hp"
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense"
  | "speed";

export type KnowledgePokemon = {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  stats: Record<KnowledgeStatId, number>;
};

type KnowledgeRow = SqliteRow & {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  statId: KnowledgeStatId;
  baseStat: number;
};

const STAT_IDS: KnowledgeStatId[] = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
];

export async function getKnowledgePokemon(): Promise<KnowledgePokemon[]> {
  const rows = await sqliteWorkerClient.catalogQuery<KnowledgeRow>(`
    WITH top_rankings AS (
      SELECT form_id
      FROM champions_form_usage_rankings
      WHERE battle_format = 'single'
        AND usage_rank <= 100
    ),
    knowledge_forms AS (
      SELECT form_id FROM top_rankings
      UNION
      SELECT mega_forms.id
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
      forms.id AS formId,
      COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
      COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
      form_stats.stat_id AS statId,
      form_stats.base_stat AS baseStat
    FROM knowledge_forms
    JOIN forms ON forms.id = knowledge_forms.form_id
    JOIN form_stats ON form_stats.form_id = forms.id
    WHERE form_stats.stat_id IN (
      'hp', 'attack', 'defense',
      'special-attack', 'special-defense', 'speed'
    )
    ORDER BY forms.id
  `);

  const pokemonById = new Map<number, KnowledgePokemon>();
  for (const row of rows) {
    const formId = Number(row.formId);
    const pokemon = pokemonById.get(formId) ?? {
      formId,
      nameJa: String(row.nameJa),
      imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
      stats: {} as Record<KnowledgeStatId, number>,
    };
    pokemon.stats[row.statId] = Number(row.baseStat);
    pokemonById.set(formId, pokemon);
  }
  return [...pokemonById.values()].filter((pokemon) =>
    STAT_IDS.every((statId) => Number.isFinite(pokemon.stats[statId])),
  );
}
