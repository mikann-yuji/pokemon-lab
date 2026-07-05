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

export type BattleTeam = {
  id?: number;
  name: string;
  buildIds: number[];
  updatedAt: number;
};

const database = new Dexie("pokemon-lab-training") as Dexie & {
  builds: EntityTable<TrainingBuild, "id">;
  teams: EntityTable<BattleTeam, "id">;
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
database.version(4).stores({
  builds: "++id, &contentKey, pokemonId, updatedAt",
  teams: "++id, updatedAt",
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

export const loadTrainingBuild = (id: number) => database.builds.get(id);

export const getAllTrainingBuilds = () =>
  database.builds.orderBy("updatedAt").reverse().toArray();

export const findTrainingBuildByContentKey = (contentKey: string) =>
  database.builds.where("contentKey").equals(contentKey).first();

export const saveTrainingBuild = (build: TrainingBuild) =>
  database.builds.put(build);

export function validateBattleTeamBuilds(builds: TrainingBuild[]) {
  if (builds.length < 1 || builds.length > 6) {
    throw new Error("バトルチームは1〜6体で編成してください。");
  }

  const pokemonIds = new Set<number>();
  const itemIds = new Set<string>();
  for (const build of builds) {
    if (pokemonIds.has(build.pokemonId)) {
      throw new Error("同じポケモンを同じチームには登録できません。");
    }
    pokemonIds.add(build.pokemonId);

    if (build.itemId) {
      if (itemIds.has(build.itemId)) {
        throw new Error("同じ持ち物を同じチームには登録できません。");
      }
      itemIds.add(build.itemId);
    }
  }
}

export const getAllBattleTeams = () =>
  database.teams.orderBy("updatedAt").reverse().toArray();

export async function saveBattleTeam(name: string, buildIds: number[]) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("チーム名を入力してください。");
  const uniqueBuildIds = [...new Set(buildIds)];
  if (uniqueBuildIds.length !== buildIds.length) {
    throw new Error("同じ育成案を重複して登録できません。");
  }

  return database.transaction(
    "rw",
    database.builds,
    database.teams,
    async () => {
      const builds = (await database.builds.bulkGet(uniqueBuildIds)).filter(
        (build): build is TrainingBuild => Boolean(build),
      );
      if (builds.length !== uniqueBuildIds.length) {
        throw new Error("選択した育成案が見つかりません。");
      }
      validateBattleTeamBuilds(builds);
      return database.teams.add({
        name: normalizedName,
        buildIds: uniqueBuildIds,
        updatedAt: Date.now(),
      });
    },
  );
}

export const deleteBattleTeam = (id: number) => database.teams.delete(id);
