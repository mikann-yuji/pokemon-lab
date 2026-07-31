"use client";

import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

export type PopularStatPoints = Record<string, number>;

type PopularStatPointsRow = SqliteRow & {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
};

/**
 * 直接選択したポケモンへ使う、採用率1位の能力ポイント配分をcatalog.dbから読む。
 * メガシンカ形態は通常形態と同じ配分を利用する。
 */
export async function getPopularStatPoints(
  formId: number,
  battleFormat: "single" | "double" = "single",
): Promise<PopularStatPoints | null> {
  const rows = await sqliteWorkerClient.catalogQuery<PopularStatPointsRow>(
    `SELECT
       points.hp,
       points.attack,
       points.defense,
       points.special_attack AS specialAttack,
       points.special_defense AS specialDefense,
       points.speed
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
  const row = rows[0];
  return row
    ? {
        hp: Number(row.hp),
        attack: Number(row.attack),
        defense: Number(row.defense),
        "special-attack": Number(row.specialAttack),
        "special-defense": Number(row.specialDefense),
        speed: Number(row.speed),
      }
    : null;
}
