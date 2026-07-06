import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";

type MistakeRow = SqliteRow & {
  question_key: string;
};

type HintRow = SqliteRow & {
  text: string;
};

/** 復習モードの出題対象にする、間違えた問題のキー一覧を新しい順で返す。 */
export async function getMistakeKeys(): Promise<string[]> {
  const rows = await sqliteWorkerClient.query<MistakeRow>(
    `SELECT question_key
     FROM quiz_mistakes
     ORDER BY updated_at DESC`,
  );
  return rows.map(({ question_key }) => String(question_key));
}

/** 不正解だった問題をuser.dbへupsertし、再度間違えた時はupdated_atだけ更新する。 */
export async function saveMistake(questionKey: string): Promise<void> {
  await sqliteWorkerClient.execute(
    `INSERT INTO quiz_mistakes (question_key, updated_at)
     VALUES (?, ?)
     ON CONFLICT(question_key) DO UPDATE SET updated_at = excluded.updated_at`,
    [questionKey, Date.now()],
  );
}

/** 正解できた復習問題を、間違いリストから削除する。 */
export async function removeMistake(questionKey: string): Promise<void> {
  await sqliteWorkerClient.execute(
    "DELETE FROM quiz_mistakes WHERE question_key = ?",
    [questionKey],
  );
}

/** 問題ごとのメモ/ヒントを取得する。未保存なら空文字を返して入力欄にそのまま渡す。 */
export async function getHint(questionKey: string): Promise<string> {
  const rows = await sqliteWorkerClient.query<HintRow>(
    "SELECT text FROM quiz_hints WHERE question_key = ?",
    [questionKey],
  );
  return rows[0] ? String(rows[0].text) : "";
}

/**
 * 問題ごとのメモ/ヒントを保存する。
 * 空文字は「ヒントなし」として扱い、不要な空レコードを残さない。
 */
export async function saveHint(
  questionKey: string,
  text: string,
): Promise<void> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    await sqliteWorkerClient.execute(
      "DELETE FROM quiz_hints WHERE question_key = ?",
      [questionKey],
    );
    return;
  }

  await sqliteWorkerClient.execute(
    `INSERT INTO quiz_hints (question_key, text, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(question_key) DO UPDATE SET
       text = excluded.text,
       updated_at = excluded.updated_at`,
    [questionKey, normalizedText, Date.now()],
  );
}
