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
      SELECT
        rankings.form_id AS formId,
        COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
        COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
        rankings.usage_rank AS usageRank,
        usage.move_id AS moveId,
        COALESCE(moves.name_ja, moves.id) AS moveName,
        usage.usage_rate AS usageRate
      FROM champions_form_usage_rankings AS rankings
      JOIN forms ON forms.id = rankings.form_id
      JOIN champions_form_move_usage AS usage
        ON usage.form_id = rankings.form_id
      JOIN moves ON moves.id = usage.move_id
      WHERE rankings.battle_format = ?
        AND rankings.usage_rank <= 100
      ORDER BY rankings.usage_rank, usage.usage_rate DESC, usage.move_id
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
