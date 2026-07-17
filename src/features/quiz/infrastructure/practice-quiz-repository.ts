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

type MemberPokemonRow = SqliteRow & {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
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
    { nameJa: string; imageUrl: string | null }
  >;
  movesByFormId: Map<number, PracticeMove[]>;
};

export async function getPracticeTargets(
  battleFormat: PracticeBattleFormat,
): Promise<PracticeTarget[]> {
  const rows = await sqliteWorkerClient.catalogQuery<TargetRow>(
    `
      SELECT
        rankings.form_id AS formId,
        COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
        COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl,
        form_types.type_name AS typeName,
        rankings.usage_rank AS usageRank
      FROM champions_form_usage_rankings AS rankings
      JOIN forms ON forms.id = rankings.form_id
      JOIN form_types ON form_types.form_id = forms.id
      WHERE rankings.battle_format = ?
        AND rankings.usage_rank <= 100
      ORDER BY rankings.usage_rank, form_types.slot
    `,
    [battleFormat],
  );

  const targets = new Map<number, PracticeTarget>();
  for (const row of rows) {
    const target = targets.get(row.formId) ?? {
      formId: Number(row.formId),
      nameJa: String(row.nameJa),
      imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
      types: [],
      usageRank: Number(row.usageRank),
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
    sqliteWorkerClient.catalogQuery<MemberPokemonRow>(
      `
        SELECT
          forms.id AS formId,
          COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
          COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS imageUrl
        FROM forms
        WHERE forms.id IN (${placeholders})
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

  const pokemonByFormId = new Map(
    pokemonRows.map((row) => [
      Number(row.formId),
      {
        nameJa: String(row.nameJa),
        imageUrl: row.imageUrl === null ? null : String(row.imageUrl),
      },
    ]),
  );
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
