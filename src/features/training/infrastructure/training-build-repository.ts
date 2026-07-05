import Dexie, { type EntityTable } from "dexie";

export type TrainingBuild = {
  pokemonId: number;
  nature: string;
  /** Pokémon Championsの能力ポイント。全能力合計66、各能力32が上限。 */
  abilityPoints: Record<string, number>;
  moveIds: string[];
  updatedAt: number;
};

const database = new Dexie("pokemon-lab-training") as Dexie & {
  builds: EntityTable<TrainingBuild, "pokemonId">;
};

database.version(1).stores({ builds: "&pokemonId, updatedAt" });
// 保存済みの初版データと同じ主キーを保ちつつ、内容を能力ポイント方式へ更新する。
database.version(2).stores({ builds: "&pokemonId, updatedAt" });

export const loadTrainingBuild = (pokemonId: number) =>
  database.builds.get(pokemonId);

export const saveTrainingBuild = (build: TrainingBuild) =>
  database.builds.put(build);
