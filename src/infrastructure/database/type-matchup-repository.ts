import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import {
  TYPE_NAMES,
  type TypeMatchup,
  type TypeName,
} from "@/domain/type-matchup";

type MatchupRow = {
  attackerType: TypeName;
  defenderType: TypeName;
  effectiveness: 0 | 0.5 | 1 | 2;
};

type TypeRow = {
  name: TypeName;
  nameJa: string;
};

/**
 * SQLiteに保存されたタイプ相性を、アプリで扱いやすい形に変換して返す。
 */
export function getTypeMatchups(): TypeMatchup[] {
  // 環境変数が指定されていない場合は、プロジェクト内のDBを使用する。
  const databasePath =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "pokemon-lab.db");
  const database = new Database(databasePath, { readonly: true });

  try {
    // 表示順を保ったまま、タイプ名と日本語名を取得する。
    const types = database
      .prepare(
        "SELECT name, name_ja AS nameJa FROM types ORDER BY sort_order",
      )
      .all() as TypeRow[];

    // 攻撃タイプ、防御タイプ、倍率の全組み合わせを取得する。
    const rows = database
      .prepare(`
        SELECT
          attacker_type AS attackerType,
          defender_type AS defenderType,
          effectiveness
        FROM type_matchups
      `)
      .all() as MatchupRow[];

    // 「攻撃タイプ → 防御タイプ → 倍率」の順で素早く参照できる表を作る。
    const byAttacker = new Map<TypeName, Map<TypeName, number>>();
    for (const row of rows) {
      const matchups =
        byAttacker.get(row.attackerType) ?? new Map<TypeName, number>();
      matchups.set(row.defenderType, row.effectiveness);
      byAttacker.set(row.attackerType, matchups);
    }

    return types.map(({ name, nameJa }) => {
      const attack = byAttacker.get(name);

      // このタイプで攻撃したとき、指定倍率になる防御タイプを探す。
      const targetsWith = (effectiveness: number) =>
        TYPE_NAMES.filter((defender) => attack?.get(defender) === effectiveness);

      // このタイプが攻撃を受けたとき、指定倍率になる攻撃タイプを探す。
      const attackersWith = (effectiveness: number) =>
        TYPE_NAMES.filter(
          (attacker) => byAttacker.get(attacker)?.get(name) === effectiveness,
        );

      // 攻撃側・防御側の両方向の相性を、クイズ用データにまとめる。
      return {
        name,
        nameJa,
        superEffectiveAgainst: targetsWith(2),
        notVeryEffectiveAgainst: targetsWith(0.5),
        noEffectAgainst: targetsWith(0),
        vulnerableTo: attackersWith(2),
        resistantTo: attackersWith(0.5),
        noEffectTo: attackersWith(0),
      };
    });
  } finally {
    // 途中でエラーが発生した場合も、必ずDB接続を閉じる。
    database.close();
  }
}
