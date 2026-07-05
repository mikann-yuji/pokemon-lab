import Dexie, { type EntityTable } from "dexie";

export type TrainingBuild = {
  id?: number;
  name: string;
  contentKey: string;
  pokemonId: number;
  nature: string;
  itemId: string;
  /** Pokémon Championsの能力ポイント。全能力合計66、各能力32が上限。 */
  abilityPoints: Record<string, number>;
  moveIds: string[];
  updatedAt: number;
};

const database = new Dexie("pokemon-lab-training") as Dexie & {
  builds: EntityTable<TrainingBuild, "id">;
};

database.version(1).stores({ builds: "&pokemonId, updatedAt" });
// 保存済みの初版データと同じ主キーを保ちつつ、内容を能力ポイント方式へ更新する。
database.version(2).stores({ builds: "&pokemonId, updatedAt" });
database
  .version(3)
  .stores({ builds: "++id, &contentKey, pokemonId, updatedAt" })
  .upgrade(async (transaction) => {
    await transaction
      .table<TrainingBuild, number>("builds")
      .toCollection()
      .modify((build) => {
        build.name ||= `ポケモン #${build.pokemonId} の育成案`;
        build.itemId ||= "";
        build.contentKey ||= createTrainingBuildContentKey(build);
      });
  });

export function createTrainingBuildContentKey(
  build: Pick<
    TrainingBuild,
    "pokemonId" | "nature" | "itemId" | "abilityPoints" | "moveIds"
  >,
) {
  const statKey = [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ]
    .map((statId) => `${statId}:${build.abilityPoints[statId] ?? 0}`)
    .join(",");
  const moveKey = [...build.moveIds, "", "", "", ""].slice(0, 4).join(",");
  return [
    "v1",
    build.pokemonId,
    build.nature,
    build.itemId || "-",
    statKey,
    moveKey,
  ].join("|");
}

export const loadLatestTrainingBuild = async (pokemonId: number) => {
  const builds = await database.builds
    .where("pokemonId")
    .equals(pokemonId)
    .reverse()
    .sortBy("updatedAt");
  return builds[0];
};

export const findTrainingBuildByContentKey = (contentKey: string) =>
  database.builds.where("contentKey").equals(contentKey).first();

export const saveTrainingBuild = (build: TrainingBuild) =>
  database.builds.put(build);
