"use client";

import type { TypeName } from "@/domain/type-matchup";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type {
  PracticeBattleFormat,
  PracticeMove,
  PracticeTarget,
} from "../practice-quiz-logic";

type TargetRow = SqliteRow & {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  typeName: TypeName;
  usageRank: number;
};

type TargetMoveRow = SqliteRow & {
  formId: number;
  id: string;
  name: string;
  typeName: TypeName;
  usageRate: number;
};

type MemberPokemonTypeRow = SqliteRow & {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  typeName: TypeName;
};

type MemberMoveRow = SqliteRow & {
  formId: number;
  id: string;
  name: string;
  typeName: TypeName;
};

export type PracticeMemberCatalog = {
  pokemonByFormId: Map<
    number,
    { nameJa: string; imageUrl: string | null; types: TypeName[] }
  >;
  movesByFormId: Map<number, PracticeMove[]>;
};

export async function getPracticeTargets(
  battleFormat: PracticeBattleFormat,
): Promise<PracticeTarget[]> {
  const [rows, moveRows] = await Promise.all([
    sqliteWorkerClient.catalogQuery<TargetRow>(
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
        form_types.type_name AS typeName,
        quiz_forms.usage_rank AS usageRank
      FROM quiz_forms
      JOIN forms ON forms.id = quiz_forms.form_id
      JOIN form_types ON form_types.form_id = forms.id
      ORDER BY quiz_forms.usage_rank, forms.is_mega, forms.id, form_types.slot
    `,
      [battleFormat],
    ),
    sqliteWorkerClient.catalogQuery<TargetMoveRow>(
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
        SELECT
          usage.form_id AS formId,
          moves.id,
          COALESCE(moves.name_ja, moves.id) AS name,
          moves.type_name AS typeName,
          usage.usage_rate AS usageRate
        FROM champions_form_move_usage AS usage
        JOIN moves ON moves.id = usage.move_id
        JOIN quiz_forms ON quiz_forms.form_id = usage.form_id
        WHERE moves.damage_class_name IN ('physical', 'special')
          AND moves.power > 0
        ORDER BY usage.form_id, usage.usage_rate DESC, moves.id
      `,
      [battleFormat],
    ),
  ]);

  const popularMovesByFormId = new Map<number, PracticeMove[]>();
  for (const row of moveRows) {
    const popularMoves = popularMovesByFormId.get(Number(row.formId)) ?? [];
    if (popularMoves.length >= 4) continue;
    popularMoves.push({
      id: String(row.id),
      name: String(row.name),
      typeName: row.typeName,
    });
    popularMovesByFormId.set(Number(row.formId), popularMoves);
  }

  const targets = new Map<number, PracticeTarget>();
  for (const row of rows) {
    const target = targets.get(row.formId) ?? {
      formId: Number(row.formId),
      nameJa: String(row.nameJa),
      imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
      types: [],
      usageRank: Number(row.usageRank),
      popularMoves: popularMovesByFormId.get(Number(row.formId)) ?? [],
    };
    target.types.push(row.typeName);
    targets.set(row.formId, target);
  }
  return [...targets.values()];
}

export async function getPracticeMemberCatalog(
  formIds: number[],
): Promise<PracticeMemberCatalog> {
  const uniqueFormIds = [...new Set(formIds)];
  if (uniqueFormIds.length === 0) {
    return { pokemonByFormId: new Map(), movesByFormId: new Map() };
  }
  const placeholders = uniqueFormIds.map(() => "?").join(", ");
  const [pokemonRows, moveRows] = await Promise.all([
    sqliteWorkerClient.catalogQuery<MemberPokemonTypeRow>(
      `
        SELECT
          forms.id AS formId,
          COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
          COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
          form_types.type_name AS typeName
        FROM forms
        JOIN form_types ON form_types.form_id = forms.id
        WHERE forms.id IN (${placeholders})
        ORDER BY forms.id, form_types.slot
      `,
      uniqueFormIds,
    ),
    sqliteWorkerClient.catalogQuery<MemberMoveRow>(
      `
        WITH requested_forms AS (
          SELECT
            forms.id AS formId,
            CASE
              WHEN forms.is_mega = 1 THEN COALESCE(default_forms.id, forms.id)
              ELSE forms.id
            END AS moveSourceId
          FROM forms
          LEFT JOIN forms AS default_forms
            ON default_forms.species_id = forms.species_id
            AND default_forms.is_default = 1
          WHERE forms.id IN (${placeholders})
        ),
        latest_versions AS (
          SELECT
            requested_forms.formId,
            requested_forms.moveSourceId,
            (
              SELECT form_moves.version_group_id
              FROM form_moves
              JOIN version_groups
                ON version_groups.id = form_moves.version_group_id
              WHERE form_moves.form_id = requested_forms.moveSourceId
              ORDER BY version_groups.sort_order DESC
              LIMIT 1
            ) AS versionGroupId
          FROM requested_forms
        )
        SELECT DISTINCT
          latest_versions.formId,
          moves.id,
          COALESCE(moves.name_ja, moves.id) AS name,
          moves.type_name AS typeName
        FROM latest_versions
        JOIN form_moves
          ON form_moves.form_id = latest_versions.moveSourceId
          AND form_moves.version_group_id = latest_versions.versionGroupId
        JOIN moves ON moves.id = form_moves.move_id
        WHERE moves.damage_class_name IN ('physical', 'special')
          AND moves.power > 0
        ORDER BY latest_versions.formId, moves.id
      `,
      uniqueFormIds,
    ),
  ]);

  const pokemonByFormId = new Map<
    number,
    { nameJa: string; imageUrl: string | null; types: TypeName[] }
  >();
  for (const row of pokemonRows) {
    const pokemon = pokemonByFormId.get(Number(row.formId)) ?? {
      nameJa: String(row.nameJa),
      imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
      types: [],
    };
    pokemon.types.push(row.typeName);
    pokemonByFormId.set(Number(row.formId), pokemon);
  }
  const movesByFormId = new Map<number, PracticeMove[]>();
  for (const { formId, ...move } of moveRows) {
    const moves = movesByFormId.get(Number(formId)) ?? [];
    moves.push({
      id: String(move.id),
      name: String(move.name),
      typeName: move.typeName,
    });
    movesByFormId.set(Number(formId), moves);
  }
  return { pokemonByFormId, movesByFormId };
}
