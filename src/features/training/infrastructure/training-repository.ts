import "server-only";

import Database from "better-sqlite3";
import path from "node:path";

export type Nature = {
  id: string;
  name: string;
  increasedStatId: string | null;
  decreasedStatId: string | null;
};

/** SQLiteの性格マスタを表示順に取得する。 */
export function getNatures(): Nature[] {
  const database = new Database(
    process.env.DATABASE_PATH ??
      path.join(process.cwd(), "data", "pokemon-lab.db"),
    { readonly: true },
  );
  try {
    return database
      .prepare(`
        SELECT
          id,
          name_ja AS name,
          increased_stat_id AS increasedStatId,
          decreased_stat_id AS decreasedStatId
        FROM natures
        ORDER BY sort_order
      `)
      .all() as Nature[];
  } finally {
    database.close();
  }
}
