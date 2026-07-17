"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type {
  MoveQuizBattleFormat,
  MoveQuizPokemon,
} from "../move-quiz-logic";

type MoveQuizRow = SqliteRow & {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  usageRank: number;
  moveId: string;
  moveName: string;
  usageRate: number;
};

export async function getMoveQuizPokemon(
  battleFormat: MoveQuizBattleFormat,
): Promise<MoveQuizPokemon[]> {
  const rows = await sqliteWorkerClient.catalogQuery<MoveQuizRow>(
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
        usage.move_id AS moveId,
        COALESCE(moves.name_ja, moves.id) AS moveName,
        usage.usage_rate AS usageRate
      FROM quiz_forms
      JOIN forms ON forms.id = quiz_forms.form_id
      JOIN champions_form_move_usage AS usage
        ON usage.form_id = quiz_forms.form_id
      JOIN moves ON moves.id = usage.move_id
      ORDER BY quiz_forms.usage_rank, forms.is_mega, forms.id,
        usage.usage_rate DESC, usage.move_id
    `,
    [battleFormat],
  );

  const pokemonByFormId = new Map<number, MoveQuizPokemon>();
  for (const row of rows) {
    const formId = Number(row.formId);
    const pokemon = pokemonByFormId.get(formId) ?? {
      formId,
      nameJa: String(row.nameJa),
      imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
      usageRank: Number(row.usageRank),
      moves: [],
    };
    if (pokemon.moves.length < 15) {
      pokemon.moves.push({
        id: String(row.moveId),
        name: String(row.moveName),
        usageRate: Number(row.usageRate),
      });
    }
    pokemonByFormId.set(formId, pokemon);
  }
  return [...pokemonByFormId.values()].filter(
    (pokemon) => pokemon.moves.length >= 10,
  );
}
