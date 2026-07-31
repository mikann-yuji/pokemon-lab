"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type { DamageCalculatorNature } from "../domain/damage-calculator-types";

export type PopularStatPoints = Record<string, number>;

export type PopularStatProfile = {
  abilityPoints: PopularStatPoints;
  nature: DamageCalculatorNature | null;
};

type PopularStatPointsRow = SqliteRow & {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  natureId: string | null;
  increasedStatId: string | null;
  decreasedStatId: string | null;
};

/**
 * 直接選択したポケモンへ使う、採用率1位の能力ポイント配分と性格をcatalog.dbから読む。
 * メガシンカ形態は通常形態と同じ構成を利用する。
 */
export async function getPopularStatProfile(
  formId: number,
  battleFormat: "single" | "double" = "single",
): Promise<PopularStatProfile | null> {
  let rows: PopularStatPointsRow[];
  try {
    rows = await sqliteWorkerClient.catalogQuery<PopularStatPointsRow>(
      `SELECT
       points.hp,
       points.attack,
       points.defense,
       points.special_attack AS specialAttack,
       points.special_defense AS specialDefense,
       points.speed,
       popular_nature.nature_id AS natureId,
       nature.increased_stat_id AS increasedStatId,
       nature.decreased_stat_id AS decreasedStatId
     FROM forms AS selected_form
     JOIN forms AS point_form
       ON point_form.id = selected_form.id
       OR (
         selected_form.is_mega = 1
         AND point_form.species_id = selected_form.species_id
         AND point_form.is_default = 1
       )
     JOIN champions_form_stat_points AS points
       ON points.form_id = point_form.id
       AND points.battle_format = ?
     LEFT JOIN champions_form_natures AS popular_nature
       ON popular_nature.form_id = point_form.id
       AND popular_nature.battle_format = ?
     LEFT JOIN natures AS nature
       ON nature.id = popular_nature.nature_id
     WHERE selected_form.id = ?
     ORDER BY point_form.id = selected_form.id DESC
     LIMIT 1`,
      [battleFormat, battleFormat, formId],
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("no such table: champions_form_natures")
    ) {
      throw error;
    }
    rows = await sqliteWorkerClient.catalogQuery<PopularStatPointsRow>(
      `SELECT
         points.hp,
         points.attack,
         points.defense,
         points.special_attack AS specialAttack,
         points.special_defense AS specialDefense,
         points.speed,
         NULL AS natureId,
         NULL AS increasedStatId,
         NULL AS decreasedStatId
       FROM forms AS selected_form
       JOIN forms AS point_form
         ON point_form.id = selected_form.id
         OR (
           selected_form.is_mega = 1
           AND point_form.species_id = selected_form.species_id
           AND point_form.is_default = 1
         )
       JOIN champions_form_stat_points AS points
         ON points.form_id = point_form.id
         AND points.battle_format = ?
       WHERE selected_form.id = ?
       ORDER BY point_form.id = selected_form.id DESC
       LIMIT 1`,
      [battleFormat, formId],
    );
  }
  const row = rows[0];
  return row
    ? {
        abilityPoints: {
          hp: Number(row.hp),
          attack: Number(row.attack),
          defense: Number(row.defense),
          "special-attack": Number(row.specialAttack),
          "special-defense": Number(row.specialDefense),
          speed: Number(row.speed),
        },
        nature: row.natureId
          ? {
              id: String(row.natureId),
              increasedStatId:
                row.increasedStatId === null
                  ? null
                  : String(row.increasedStatId),
              decreasedStatId:
                row.decreasedStatId === null
                  ? null
                  : String(row.decreasedStatId),
            }
          : null,
      }
    : null;
}
