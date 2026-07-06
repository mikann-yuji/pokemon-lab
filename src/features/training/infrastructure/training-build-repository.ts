import {
  sqliteWorkerClient,
} from "@/infrastructure/sqlite-wasm/sqlite-client";
import type {
  SqliteRow,
  SqliteStatement,
} from "@/infrastructure/sqlite-wasm/worker-protocol";

export type TrainingBuild = {
  id?: number;
  name: string;
  contentKey: string;
  pokemonId: number;
  nature: string;
  itemId: string;
  /** Pokémon Champions の能力ポイント。合計66、各能力32が上限。 */
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

type TrainingBuildRow = SqliteRow & {
  id: number;
  name: string;
  content_key: string;
  pokemon_id: number;
  nature: string;
  item_id: string | null;
  ability_points_json: string;
  move_ids_json: string;
  updated_at: number;
};

type BattleTeamRow = SqliteRow & {
  id: number;
  name: string;
  updated_at: number;
  build_ids: string | null;
};

function parseJson<Value>(value: string, fallback: Value): Value {
  try {
    return JSON.parse(value) as Value;
  } catch {
    return fallback;
  }
}

function toTrainingBuild(row: TrainingBuildRow): TrainingBuild {
  return {
    id: Number(row.id),
    name: String(row.name),
    contentKey: String(row.content_key),
    pokemonId: Number(row.pokemon_id),
    nature: String(row.nature),
    itemId: row.item_id === null ? "" : String(row.item_id),
    abilityPoints: parseJson<Record<string, number>>(
      String(row.ability_points_json),
      {},
    ),
    moveIds: parseJson<string[]>(String(row.move_ids_json), []),
    updatedAt: Number(row.updated_at),
  };
}

const BUILD_COLUMNS = `
  id, name, content_key, pokemon_id, nature, item_id,
  ability_points_json, move_ids_json, updated_at
`;

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

export async function loadLatestTrainingBuild(pokemonId: number) {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS}
     FROM training_builds
     WHERE pokemon_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [pokemonId],
  );
  return rows[0] ? toTrainingBuild(rows[0]) : undefined;
}

export async function loadTrainingBuild(id: number) {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS} FROM training_builds WHERE id = ?`,
    [id],
  );
  return rows[0] ? toTrainingBuild(rows[0]) : undefined;
}

export async function getAllTrainingBuilds() {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS}
     FROM training_builds
     ORDER BY updated_at DESC, id DESC`,
  );
  return rows.map(toTrainingBuild);
}

export async function findTrainingBuildByContentKey(contentKey: string) {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS}
     FROM training_builds
     WHERE content_key = ?
     LIMIT 1`,
    [contentKey],
  );
  return rows[0] ? toTrainingBuild(rows[0]) : undefined;
}

export async function saveTrainingBuild(build: TrainingBuild) {
  const bind = [
    build.name,
    build.contentKey,
    build.pokemonId,
    build.nature,
    build.itemId || null,
    JSON.stringify(build.abilityPoints),
    JSON.stringify(build.moveIds),
    build.updatedAt,
  ];

  let id = build.id;
  if (id === undefined) {
    const result = await sqliteWorkerClient.execute(
      `INSERT INTO training_builds (
         name, content_key, pokemon_id, nature, item_id,
         ability_points_json, move_ids_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      bind,
    );
    id = result.lastInsertRowId;
  } else {
    const result = await sqliteWorkerClient.execute(
      `UPDATE training_builds SET
         name = ?, content_key = ?, pokemon_id = ?, nature = ?, item_id = ?,
         ability_points_json = ?, move_ids_json = ?, updated_at = ?
       WHERE id = ?`,
      [...bind, id],
    );
    if (result.changes !== 1) {
      throw new Error("更新する育成案が見つかりませんでした。");
    }
  }

  const savedBuild = await loadTrainingBuild(id);
  if (!savedBuild) {
    throw new Error("保存した育成案を確認できませんでした。");
  }
  return savedBuild;
}

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

export async function getAllBattleTeams(): Promise<BattleTeam[]> {
  const rows = await sqliteWorkerClient.query<BattleTeamRow>(
    `SELECT
       teams.id,
       teams.name,
       teams.updated_at,
       (
         SELECT GROUP_CONCAT(ordered.build_id, ',')
         FROM (
           SELECT build_id
           FROM battle_team_members
           WHERE team_id = teams.id
           ORDER BY position
         ) AS ordered
       ) AS build_ids
     FROM battle_teams AS teams
     ORDER BY teams.updated_at DESC, teams.id DESC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    buildIds: row.build_ids
      ? String(row.build_ids).split(",").map(Number)
      : [],
    updatedAt: Number(row.updated_at),
  }));
}

export async function saveBattleTeam(name: string, buildIds: number[]) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("チーム名を入力してください。");
  const uniqueBuildIds = [...new Set(buildIds)];
  if (uniqueBuildIds.length !== buildIds.length) {
    throw new Error("同じ育成案を重複して登録できません。");
  }

  const placeholders = uniqueBuildIds.map(() => "?").join(",");
  const rows =
    uniqueBuildIds.length === 0
      ? []
      : await sqliteWorkerClient.query<TrainingBuildRow>(
          `SELECT ${BUILD_COLUMNS}
           FROM training_builds
           WHERE id IN (${placeholders})`,
          uniqueBuildIds,
        );
  const builds = rows.map(toTrainingBuild);
  if (builds.length !== uniqueBuildIds.length) {
    throw new Error("選択した育成案が見つかりません。");
  }
  validateBattleTeamBuilds(builds);

  const statements: SqliteStatement[] = [
    {
      sql: "INSERT INTO battle_teams (name, updated_at) VALUES (?, ?)",
      bind: [normalizedName, Date.now()],
    },
    ...uniqueBuildIds.map(
      (buildId, position): SqliteStatement => ({
        sql: `INSERT INTO battle_team_members (team_id, build_id, position)
              VALUES (?, ?, ?)`,
        bind: [null, buildId, position],
        bindReferences: [
          { bindIndex: 0, resultIndex: 0, field: "lastInsertRowId" },
        ],
      }),
    ),
  ];
  const [teamResult] = await sqliteWorkerClient.transaction(statements);
  return teamResult.lastInsertRowId;
}

export async function deleteBattleTeam(id: number) {
  await sqliteWorkerClient.execute("DELETE FROM battle_teams WHERE id = ?", [
    id,
  ]);
}
