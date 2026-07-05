/**
 * このファイルの役割: 間違えたクイズ問題のキーをIndexedDBへ永続保存する。
 */

import Dexie, { type EntityTable } from "dexie";

type MistakeRecord = {
  questionKey: string;
  updatedAt: number;
};

type HintRecord = {
  questionKey: string;
  text: string;
  updatedAt: number;
};

const database = new Dexie("pokemon-lab-quiz") as Dexie & {
  mistakes: EntityTable<MistakeRecord, "questionKey">;
  hints: EntityTable<HintRecord, "questionKey">;
};

database.version(1).stores({
  mistakes: "&questionKey, updatedAt",
});
database.version(2).stores({
  mistakes: "&questionKey, updatedAt",
  hints: "&questionKey, updatedAt",
});

export async function getMistakeKeys(): Promise<string[]> {
  const records = await database.mistakes.orderBy("updatedAt").reverse().toArray();
  return records.map(({ questionKey }) => questionKey);
}

export async function saveMistake(questionKey: string): Promise<void> {
  await database.mistakes.put({
    questionKey,
    updatedAt: Date.now(),
  });
}

export async function removeMistake(questionKey: string): Promise<void> {
  await database.mistakes.delete(questionKey);
}

export async function getHint(questionKey: string): Promise<string> {
  return (await database.hints.get(questionKey))?.text ?? "";
}

export async function saveHint(
  questionKey: string,
  text: string,
): Promise<void> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    await database.hints.delete(questionKey);
    return;
  }

  await database.hints.put({
    questionKey,
    text: normalizedText,
    updatedAt: Date.now(),
  });
}
