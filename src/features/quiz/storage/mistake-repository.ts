/**
 * このファイルの役割: 間違えたクイズ問題のキーをIndexedDBへ永続保存する。
 */

import Dexie, { type EntityTable } from "dexie";

type MistakeRecord = {
  questionKey: string;
  updatedAt: number;
};

const database = new Dexie("pokemon-lab-quiz") as Dexie & {
  mistakes: EntityTable<MistakeRecord, "questionKey">;
};

database.version(1).stores({
  mistakes: "&questionKey, updatedAt",
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
