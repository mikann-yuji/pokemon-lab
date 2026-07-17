"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type { DamageQuizBattleFormat } from "../damage-quiz-logic";

type TargetRow = SqliteRow & { formId: number };

export async function getDamageQuizTargetIds(
  battleFormat: DamageQuizBattleFormat,
): Promise<number[]> {
  const rows = await sqliteWorkerClient.catalogQuery<TargetRow>(
    `
      WITH top_rankings AS (
        SELECT form_id
        FROM champions_form_usage_rankings
        WHERE battle_format = ?
          AND usage_rank <= 100
      ),
      quiz_forms AS (
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
      SELECT form_id AS formId FROM quiz_forms ORDER BY form_id
    `,
    [battleFormat],
  );
  return rows.map((row) => Number(row.formId));
}
