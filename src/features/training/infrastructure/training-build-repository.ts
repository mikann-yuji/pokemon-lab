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
  abilityId: string;
  /** Pokémon Champions の能力ポイント。合計66、各能力32が上限。 */
  abilityPoints: Record<string, number>;
  moveIds: string[];
  updatedAt: number;
};

/** バトルチームはuser.dbに保存した育成案IDの並びだけを保持する。 */
export type BattleTeam = {
  id?: number;
  name: string;
  buildIds: number[];
  updatedAt: number;
};

export type TrainingMatchupKind = "favorable" | "unfavorable";

export type TrainingMatchupTargetKind = "pokemon" | "build";

export type TrainingMatchupNote = {
  id?: number;
  sourceBuildId: number;
  matchupKind: TrainingMatchupKind;
  targetKind: TrainingMatchupTargetKind;
  targetPokemonId: number;
  targetBuildId: number | null;
  targetName: string;
  note: string;
  updatedAt: number;
};

type TrainingBuildRow = SqliteRow & {
  id: number;
  name: string;
  content_key: string;
  pokemon_id: number;
  nature: string;
  item_id: string | null;
  ability_id: string | null;
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

type TrainingMatchupNoteRow = SqliteRow & {
  id: number;
  source_build_id: number;
  matchup_kind: TrainingMatchupKind;
  target_kind: TrainingMatchupTargetKind;
  target_pokemon_id: number;
  target_build_id: number | null;
  target_name: string;
  note: string;
  updated_at: number;
};

/** user.db内のJSON列が壊れていても画面全体を落とさず、空値で復旧する。 */
function parseJson<Value>(value: string, fallback: Value): Value {
  try {
    return JSON.parse(value) as Value;
  } catch {
    return fallback;
  }
}

/** SQLiteのsnake_case行を、UI層が扱うcamelCaseの育成案へ変換する。 */
function toTrainingBuild(row: TrainingBuildRow): TrainingBuild {
  return {
    id: Number(row.id),
    name: String(row.name),
    contentKey: String(row.content_key),
    pokemonId: Number(row.pokemon_id),
    nature: String(row.nature),
    itemId: row.item_id === null ? "" : String(row.item_id),
    abilityId: row.ability_id === null ? "" : String(row.ability_id),
    abilityPoints: parseJson<Record<string, number>>(
      String(row.ability_points_json),
      {},
    ),
    moveIds: parseJson<string[]>(String(row.move_ids_json), []),
    updatedAt: Number(row.updated_at),
  };
}

function toTrainingMatchupNote(
  row: TrainingMatchupNoteRow,
): TrainingMatchupNote {
  return {
    id: Number(row.id),
    sourceBuildId: Number(row.source_build_id),
    matchupKind: row.matchup_kind,
    targetKind: row.target_kind,
    targetPokemonId: Number(row.target_pokemon_id),
    targetBuildId:
      row.target_build_id === null ? null : Number(row.target_build_id),
    targetName: String(row.target_name),
    note: String(row.note),
    updatedAt: Number(row.updated_at),
  };
}

const BUILD_COLUMNS = `
  id, name, content_key, pokemon_id, nature, item_id, ability_id,
  ability_points_json, move_ids_json, updated_at
`;

/**
 * 育成案の内容から重複判定用キーを作る。
 * 名前や保存日時は含めず、同じポケモン・性格・持ち物・能力ポイント・技構成なら同じキーにする。
 */
export function createTrainingBuildContentKey(
  build: Pick<
    TrainingBuild,
    "pokemonId" | "nature" | "itemId" | "abilityId" | "abilityPoints" | "moveIds"
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
    build.abilityId || "-",
    statKey,
    moveKey,
  ].join("|");
}

/** 指定ポケモンで最後に保存した育成案を、シミュレーター初期表示へ復元する。 */
export async function loadLatestTrainingBuild(pokemonId: number) {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS}
     FROM training_builds
     WHERE pokemon_id = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [pokemonId],
  );
  return rows[0] ? toTrainingBuild(rows[0]) : undefined;
}

/** URLの[id]やチーム表示から、特定の育成案を1件読み込む。 */
export async function loadTrainingBuild(id: number) {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS}
     FROM training_builds
     WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ? toTrainingBuild(rows[0]) : undefined;
}

/** 保存済み育成案一覧画面とチーム編成画面で使う全件取得。 */
export async function getAllTrainingBuilds() {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS}
     FROM training_builds
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC`,
  );
  return rows.map(toTrainingBuild);
}

/** 保存前に、同じ内容の育成案が既にあるかを確認する。 */
export async function findTrainingBuildByContentKey(contentKey: string) {
  const rows = await sqliteWorkerClient.query<TrainingBuildRow>(
    `SELECT ${BUILD_COLUMNS}
     FROM training_builds
     WHERE content_key = ? AND deleted_at IS NULL
     LIMIT 1`,
    [contentKey],
  );
  return rows[0] ? toTrainingBuild(rows[0]) : undefined;
}

/**
 * 育成案をuser.dbへINSERTまたはUPDATEする。
 * 能力ポイントと技ID配列は小さな構造体なのでJSON列として保存する。
 */
export async function saveTrainingBuild(build: TrainingBuild) {
  const bind = [
    build.name,
    build.contentKey,
    build.pokemonId,
    build.nature,
    build.itemId || null,
    build.abilityId || null,
    JSON.stringify(build.abilityPoints),
    JSON.stringify(build.moveIds),
    build.updatedAt,
  ];

  let id = build.id;
  if (id === undefined) {
    const result = await sqliteWorkerClient.execute(
      `INSERT INTO training_builds (
         sync_id, name, content_key, pokemon_id, nature, item_id, ability_id,
         ability_points_json, move_ids_json, created_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [crypto.randomUUID(), ...bind.slice(0, -1), build.updatedAt, build.updatedAt],
    );
    id = result.lastInsertRowId;
  } else {
    const result = await sqliteWorkerClient.execute(
      `UPDATE training_builds SET
         name = ?, content_key = ?, pokemon_id = ?, nature = ?, item_id = ?, ability_id = ?,
         ability_points_json = ?, move_ids_json = ?, updated_at = ?, deleted_at = NULL
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

export async function getTrainingMatchupNotes(sourceBuildId: number) {
  const rows = await sqliteWorkerClient.query<TrainingMatchupNoteRow>(
    `SELECT
       id, source_build_id, matchup_kind, target_kind, target_pokemon_id,
       target_build_id, target_name, note, updated_at
     FROM training_matchup_notes
     WHERE source_build_id = ? AND deleted_at IS NULL
     ORDER BY matchup_kind, updated_at DESC, id DESC`,
    [sourceBuildId],
  );
  return rows.map(toTrainingMatchupNote);
}

export async function saveTrainingMatchupNote(
  note: Omit<TrainingMatchupNote, "id" | "updatedAt">,
) {
  const normalizedTargetName = note.targetName.trim();
  const normalizedNote = note.note.trim();
  if (!normalizedTargetName) {
    throw new Error("対象ポケモンを選択してください。");
  }
  if (!normalizedNote) {
    throw new Error("メモを入力してください。");
  }

  const now = Date.now();
  const result = await sqliteWorkerClient.execute(
    `INSERT INTO training_matchup_notes (
       sync_id, source_build_id, matchup_kind, target_kind, target_pokemon_id,
       target_build_id, target_name, note, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      crypto.randomUUID(),
      note.sourceBuildId,
      note.matchupKind,
      note.targetKind,
      note.targetPokemonId,
      note.targetBuildId,
      normalizedTargetName,
      normalizedNote,
      now,
      now,
    ],
  );

  const rows = await sqliteWorkerClient.query<TrainingMatchupNoteRow>(
    `SELECT
       id, source_build_id, matchup_kind, target_kind, target_pokemon_id,
       target_build_id, target_name, note, updated_at
     FROM training_matchup_notes
     WHERE id = ?
     LIMIT 1`,
    [result.lastInsertRowId],
  );
  if (!rows[0]) throw new Error("保存した相性メモを確認できませんでした。");
  return toTrainingMatchupNote(rows[0]);
}

export async function deleteTrainingMatchupNote(id: number) {
  await sqliteWorkerClient.execute(
    "UPDATE training_matchup_notes SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [Date.now(), Date.now(), id],
  );
}

/**
 * Pokémon Championsのチーム制約を保存前に検証する。
 * 同一ポケモンと同一持ち物の重複をここで止め、UI側の入力経路に依存しないようにする。
 */
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

/** チーム一覧用に、battle_team_membersをposition順のbuildIdsへ畳み込んで返す。 */
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
           JOIN training_builds ON training_builds.id = battle_team_members.build_id
           WHERE team_id = teams.id
             AND training_builds.deleted_at IS NULL
           ORDER BY position
         ) AS ordered
       ) AS build_ids
     FROM battle_teams AS teams
     WHERE teams.deleted_at IS NULL
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

/**
 * チーム名と育成案ID配列から新しいチームを保存する。
 * 親テーブルINSERT後のidをbindReferencesで子テーブルへ渡し、1トランザクションで作成する。
 */
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
           WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          uniqueBuildIds,
        );
  const builds = rows.map(toTrainingBuild);
  if (builds.length !== uniqueBuildIds.length) {
    throw new Error("選択した育成案が見つかりません。");
  }
  validateBattleTeamBuilds(builds);

  const statements: SqliteStatement[] = [
    {
      sql: `INSERT INTO battle_teams
              (sync_id, name, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, NULL)`,
      bind: [crypto.randomUUID(), normalizedName, Date.now(), Date.now()],
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

/**
 * 既存チームの名前とメンバーを置き換える。
 * メンバーはpositionを維持するため、子テーブルを作り直す。
 */
export async function updateBattleTeam(
  id: number,
  name: string,
  buildIds: number[],
) {
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
           WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          uniqueBuildIds,
        );
  const builds = rows.map(toTrainingBuild);
  if (builds.length !== uniqueBuildIds.length) {
    throw new Error("選択した育成案が見つかりません。");
  }
  validateBattleTeamBuilds(builds);

  const now = Date.now();
  const statements: SqliteStatement[] = [
    {
      sql: "UPDATE battle_teams SET name = ?, updated_at = ?, deleted_at = NULL WHERE id = ?",
      bind: [normalizedName, now, id],
    },
    {
      sql: "DELETE FROM battle_team_members WHERE team_id = ?",
      bind: [id],
    },
    ...uniqueBuildIds.map(
      (buildId, position): SqliteStatement => ({
        sql: `INSERT INTO battle_team_members (team_id, build_id, position)
              VALUES (?, ?, ?)`,
        bind: [id, buildId, position],
      }),
    ),
  ];

  const [teamResult] = await sqliteWorkerClient.transaction(statements);
  if (teamResult.changes !== 1) {
    throw new Error("更新するバトルチームが見つかりませんでした。");
  }
}

export async function deleteBattleTeam(id: number) {
  const now = Date.now();
  await sqliteWorkerClient.execute(
    "UPDATE battle_teams SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}
