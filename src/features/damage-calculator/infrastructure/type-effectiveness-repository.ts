"use client";

import {
  createTypeEffectivenessSource,
  setTypeEffectivenessSource,
  type TypeEffectivenessSource,
  type TypeName,
} from "@/domain/type-matchup";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

type TypeEffectivenessRow = SqliteRow & {
  attackerType: TypeName;
  defenderType: TypeName;
  effectiveness: 0 | 0.5 | 1 | 2;
};

let loadingTypeEffectiveness: Promise<TypeEffectivenessSource> | null = null;

/**
 * ダメージ計算ページで使うタイプ相性表をcatalog.dbから読み込み、共有キャッシュへ保存する。
 *
 * @returns 攻撃タイプから防御タイプへの倍率を引けるタイプ相性表。
 */
export function loadTypeEffectivenessFromCatalog() {
  loadingTypeEffectiveness ??= sqliteWorkerClient
    .catalogQuery<TypeEffectivenessRow>(`
      SELECT
        attacker_type AS attackerType,
        defender_type AS defenderType,
        effectiveness
      FROM type_matchups
    `)
    .then((rows) => {
      const source = createTypeEffectivenessSource(rows);
      setTypeEffectivenessSource(source);
      return source;
    })
    .catch((caught: unknown) => {
      loadingTypeEffectiveness = null;
      throw caught;
    });

  return loadingTypeEffectiveness;
}
