import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type {
  SqliteRow,
  SqliteStatement,
} from "@/infrastructure/sqlite-wasm/worker-protocol";
import { getFirebaseFirestore } from "./firebase-client";

const SYNC_TABLES = [
  "training_builds",
  "battle_teams",
  "quiz_mistakes",
  "quiz_hints",
  "damage_history",
  "training_matchup_notes",
  "battle_records",
] as const;

type SyncTable = (typeof SYNC_TABLES)[number];

type UserSyncRecord = {
  table: SyncTable;
  recordId: string;
  updatedAt: number;
  deletedAt: number | null;
  data: Record<string, unknown>;
};

type SyncResult = {
  downloaded: number;
  uploaded: number;
  deleted: number;
};

function recordCollection(database: Firestore, uid: string, table: SyncTable) {
  return collection(database, "users", uid, "syncTables", table, "records");
}

function numberOrNull(value: SqliteRow[string]) {
  return value === null ? null : Number(value);
}

function stringOrNull(value: SqliteRow[string]) {
  return value === null ? null : String(value);
}

function latestTimestamp(record: Pick<UserSyncRecord, "updatedAt" | "deletedAt">) {
  return Math.max(record.updatedAt, record.deletedAt ?? 0);
}

async function loadRemoteRecords(uid: string) {
  const database = getFirebaseFirestore();
  const records: UserSyncRecord[] = [];
  for (const table of SYNC_TABLES) {
    const snapshots = await getDocs(recordCollection(database, uid, table));
    for (const snapshot of snapshots.docs) {
      const value = snapshot.data();
      records.push({
        table,
        recordId: snapshot.id,
        updatedAt: Number(value.updatedAt ?? 0),
        deletedAt: value.deletedAt === null ? null : Number(value.deletedAt ?? 0),
        data:
          value.data && typeof value.data === "object"
            ? (value.data as Record<string, unknown>)
            : {},
      });
    }
  }
  return records;
}

async function writeRemoteRecords(uid: string, records: UserSyncRecord[]) {
  const database = getFirebaseFirestore();
  let batch = writeBatch(database);
  let writeCount = 0;

  async function commitIfNeeded() {
    if (writeCount < 450) return;
    await batch.commit();
    batch = writeBatch(database);
    writeCount = 0;
  }

  for (const record of records) {
    batch.set(
      doc(recordCollection(database, uid, record.table), record.recordId),
      {
        table: record.table,
        recordId: record.recordId,
        updatedAt: record.updatedAt,
        deletedAt: record.deletedAt,
        data: record.data,
        syncedAt: serverTimestamp(),
      },
      { merge: true },
    );
    writeCount += 1;
    await commitIfNeeded();
  }

  if (writeCount > 0) await batch.commit();
}

function pruneDamageHistoryRecords(records: UserSyncRecord[]) {
  const keptKeys = new Set<string>();
  const deletedRecords: UserSyncRecord[] = [];
  const damageHistoryBySide = new Map<string, UserSyncRecord[]>();

  for (const record of records) {
    if (record.table !== "damage_history") continue;
    if (record.deletedAt !== null) {
      deletedRecords.push(record);
      continue;
    }
    const side = String(record.data.side ?? record.recordId.split(":")[0] ?? "");
    damageHistoryBySide.set(side, [...(damageHistoryBySide.get(side) ?? []), record]);
  }

  for (const sideRecords of damageHistoryBySide.values()) {
    const sorted = [...sideRecords].sort((a, b) => {
      const timestampDiff = latestTimestamp(b) - latestTimestamp(a);
      return timestampDiff === 0 ? b.recordId.localeCompare(a.recordId) : timestampDiff;
    });

    for (const record of sorted.slice(0, 10)) {
      keptKeys.add(`${record.table}:${record.recordId}`);
    }

    deletedRecords.push(...sorted.slice(10));
  }

  return {
    keptRecords: records.filter(
      (record) =>
        record.table !== "damage_history" ||
        keptKeys.has(`${record.table}:${record.recordId}`),
    ),
    deletedRecords,
  };
}

async function deleteRemoteRecords(uid: string, records: UserSyncRecord[]) {
  const database = getFirebaseFirestore();
  const uniqueRecords = new Map<string, Pick<UserSyncRecord, "table" | "recordId">>();
  for (const record of records) {
    uniqueRecords.set(`${record.table}:${record.recordId}`, {
      table: record.table,
      recordId: record.recordId,
    });
  }

  await Promise.all(
    [...uniqueRecords.values()].map(({ table, recordId }) =>
      deleteDoc(doc(recordCollection(database, uid, table), recordId)),
    ),
  );
  return uniqueRecords.size;
}

async function pruneLocalDamageHistory() {
  await sqliteWorkerClient.transaction([
    {
      sql: "DELETE FROM damage_history WHERE deleted_at IS NOT NULL",
      bind: [],
    },
    {
      sql: `DELETE FROM damage_history
            WHERE side = 'attacker'
              AND deleted_at IS NULL
              AND id NOT IN (
                SELECT id FROM damage_history
                WHERE side = 'attacker'
                  AND deleted_at IS NULL
                ORDER BY updated_at DESC, id DESC
                LIMIT 10
              )`,
      bind: [],
    },
    {
      sql: `DELETE FROM damage_history
            WHERE side = 'defender'
              AND deleted_at IS NULL
              AND id NOT IN (
                SELECT id FROM damage_history
                WHERE side = 'defender'
                  AND deleted_at IS NULL
                ORDER BY updated_at DESC, id DESC
                LIMIT 10
              )`,
      bind: [],
    },
  ]);
}

async function exportLocalRecords(): Promise<UserSyncRecord[]> {
  const [
    builds,
    teams,
    mistakes,
    hints,
    damageHistory,
    matchupNotes,
    battleRecords,
  ] = await Promise.all([
    sqliteWorkerClient.query(`
      SELECT sync_id, name, content_key, pokemon_id, nature, item_id, ability_id,
             ability_points_json, move_ids_json, created_at, updated_at, deleted_at
      FROM training_builds
      WHERE sync_id IS NOT NULL
    `),
    sqliteWorkerClient.query(`
      SELECT
        teams.sync_id,
        teams.name,
        teams.created_at,
        teams.updated_at,
        teams.deleted_at,
        (
          SELECT GROUP_CONCAT(ordered.sync_id, ',')
          FROM (
            SELECT builds.sync_id
            FROM battle_team_members AS members
            JOIN training_builds AS builds ON builds.id = members.build_id
            WHERE members.team_id = teams.id
              AND builds.sync_id IS NOT NULL
              AND builds.deleted_at IS NULL
            ORDER BY members.position
          ) AS ordered
        ) AS build_sync_ids
      FROM battle_teams AS teams
      WHERE teams.sync_id IS NOT NULL
    `),
    sqliteWorkerClient.query(`
      SELECT question_key, updated_at, deleted_at
      FROM quiz_mistakes
    `),
    sqliteWorkerClient.query(`
      SELECT question_key, text, created_at, updated_at, deleted_at
      FROM quiz_hints
    `),
    sqliteWorkerClient.query(`
      SELECT side, pokemon_id, move_id, created_at, updated_at, deleted_at
      FROM damage_history
    `),
    sqliteWorkerClient.query(`
      SELECT
        notes.sync_id,
        notes.matchup_kind,
        notes.target_kind,
        notes.target_pokemon_id,
        notes.target_name,
        notes.note,
        notes.created_at,
        notes.updated_at,
        notes.deleted_at,
        source.sync_id AS source_build_sync_id,
        target.sync_id AS target_build_sync_id
      FROM training_matchup_notes AS notes
      JOIN training_builds AS source ON source.id = notes.source_build_id
      LEFT JOIN training_builds AS target ON target.id = notes.target_build_id
      WHERE notes.sync_id IS NOT NULL
    `),
    sqliteWorkerClient.query(`
      SELECT sync_id, battle_at, memo, image_data_url, created_at, updated_at, deleted_at
      FROM battle_records
      WHERE sync_id IS NOT NULL
    `),
  ]);

  const records: UserSyncRecord[] = [];
  for (const row of builds) {
    records.push({
      table: "training_builds",
      recordId: String(row.sync_id),
      updatedAt: Number(row.updated_at),
      deletedAt: numberOrNull(row.deleted_at),
      data: {
        name: String(row.name),
        contentKey: String(row.content_key),
        pokemonId: Number(row.pokemon_id),
        nature: String(row.nature),
        itemId: stringOrNull(row.item_id),
        abilityId: stringOrNull(row.ability_id),
        abilityPointsJson: String(row.ability_points_json),
        moveIdsJson: String(row.move_ids_json),
        createdAt: numberOrNull(row.created_at),
      },
    });
  }

  for (const row of teams) {
    records.push({
      table: "battle_teams",
      recordId: String(row.sync_id),
      updatedAt: Number(row.updated_at),
      deletedAt: numberOrNull(row.deleted_at),
      data: {
        name: String(row.name),
        buildSyncIds: row.build_sync_ids ? String(row.build_sync_ids).split(",") : [],
        createdAt: numberOrNull(row.created_at),
      },
    });
  }

  for (const row of mistakes) {
    records.push({
      table: "quiz_mistakes",
      recordId: String(row.question_key),
      updatedAt: Number(row.updated_at),
      deletedAt: numberOrNull(row.deleted_at),
      data: { questionKey: String(row.question_key) },
    });
  }

  for (const row of hints) {
    records.push({
      table: "quiz_hints",
      recordId: String(row.question_key),
      updatedAt: Number(row.updated_at),
      deletedAt: numberOrNull(row.deleted_at),
      data: {
        questionKey: String(row.question_key),
        text: String(row.text),
        createdAt: numberOrNull(row.created_at),
      },
    });
  }

  for (const row of damageHistory) {
    const recordId = `${String(row.side)}:${Number(row.pokemon_id)}`;
    records.push({
      table: "damage_history",
      recordId,
      updatedAt: Number(row.updated_at),
      deletedAt: numberOrNull(row.deleted_at),
      data: {
        side: String(row.side),
        pokemonId: Number(row.pokemon_id),
        moveId: stringOrNull(row.move_id),
        createdAt: numberOrNull(row.created_at),
      },
    });
  }

  for (const row of matchupNotes) {
    records.push({
      table: "training_matchup_notes",
      recordId: String(row.sync_id),
      updatedAt: Number(row.updated_at),
      deletedAt: numberOrNull(row.deleted_at),
      data: {
        sourceBuildSyncId: String(row.source_build_sync_id),
        matchupKind: String(row.matchup_kind),
        targetKind: String(row.target_kind),
        targetPokemonId: Number(row.target_pokemon_id),
        targetBuildSyncId: stringOrNull(row.target_build_sync_id),
        targetName: String(row.target_name),
        note: String(row.note),
        createdAt: numberOrNull(row.created_at),
      },
    });
  }

  for (const row of battleRecords) {
    records.push({
      table: "battle_records",
      recordId: String(row.sync_id),
      updatedAt: Number(row.updated_at),
      deletedAt: numberOrNull(row.deleted_at),
      data: {
        battleAt: Number(row.battle_at),
        memo: String(row.memo),
        imageDataUrl: String(row.image_data_url),
        createdAt: Number(row.created_at),
      },
    });
  }

  return records;
}

async function importRemoteRecords(records: UserSyncRecord[]) {
  const localRecords = await exportLocalRecords();
  const localByKey = new Map(
    localRecords.map((record) => [`${record.table}:${record.recordId}`, record]),
  );
  const buildRows = await sqliteWorkerClient.query(`
    SELECT id, sync_id FROM training_builds WHERE sync_id IS NOT NULL
  `);
  const buildIdBySyncId = new Map(
    buildRows.map((row) => [String(row.sync_id), Number(row.id)]),
  );
  const teamRows = await sqliteWorkerClient.query(`
    SELECT id, sync_id FROM battle_teams WHERE sync_id IS NOT NULL
  `);
  const teamIdBySyncId = new Map(
    teamRows.map((row) => [String(row.sync_id), Number(row.id)]),
  );

  const statements: SqliteStatement[] = [];
  const sortedRecords = [...records].sort(
    (a, b) => SYNC_TABLES.indexOf(a.table) - SYNC_TABLES.indexOf(b.table),
  );

  function shouldApply(remote: UserSyncRecord) {
    const local = localByKey.get(`${remote.table}:${remote.recordId}`);
    return !local || latestTimestamp(remote) > latestTimestamp(local);
  }

  for (const record of sortedRecords) {
    if (!shouldApply(record)) continue;
    const data = record.data;
    if (record.table === "training_builds") {
      statements.push({
        sql: `INSERT INTO training_builds (
               sync_id, name, content_key, pokemon_id, nature, item_id, ability_id,
               ability_points_json, move_ids_json, created_at, updated_at, deleted_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(sync_id) DO UPDATE SET
               name = excluded.name,
               content_key = excluded.content_key,
               pokemon_id = excluded.pokemon_id,
               nature = excluded.nature,
               item_id = excluded.item_id,
               ability_id = excluded.ability_id,
               ability_points_json = excluded.ability_points_json,
               move_ids_json = excluded.move_ids_json,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at
             ON CONFLICT(content_key) DO UPDATE SET
               sync_id = excluded.sync_id,
               name = excluded.name,
               pokemon_id = excluded.pokemon_id,
               nature = excluded.nature,
               item_id = excluded.item_id,
               ability_id = excluded.ability_id,
               ability_points_json = excluded.ability_points_json,
               move_ids_json = excluded.move_ids_json,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at`,
        bind: [
          record.recordId,
          String(data.name ?? ""),
          String(data.contentKey ?? record.recordId),
          Number(data.pokemonId ?? 0),
          String(data.nature ?? ""),
          data.itemId === null ? null : String(data.itemId ?? ""),
          data.abilityId === null ? null : String(data.abilityId ?? ""),
          String(data.abilityPointsJson ?? "{}"),
          String(data.moveIdsJson ?? "[]"),
          Number(data.createdAt ?? record.updatedAt),
          record.updatedAt,
          record.deletedAt,
        ],
      });
    }

    if (record.table === "quiz_mistakes") {
      statements.push({
        sql: `INSERT INTO quiz_mistakes (question_key, updated_at, deleted_at)
              VALUES (?, ?, ?)
              ON CONFLICT(question_key) DO UPDATE SET
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at`,
        bind: [record.recordId, record.updatedAt, record.deletedAt],
      });
    }

    if (record.table === "quiz_hints") {
      statements.push({
        sql: `INSERT INTO quiz_hints (question_key, text, created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(question_key) DO UPDATE SET
                text = excluded.text,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at`,
        bind: [
          record.recordId,
          String(data.text ?? ""),
          Number(data.createdAt ?? record.updatedAt),
          record.updatedAt,
          record.deletedAt,
        ],
      });
    }

    if (record.table === "damage_history") {
      statements.push({
        sql: "DELETE FROM damage_history WHERE side = ? AND pokemon_id = ?",
        bind: [
          String(data.side ?? "attacker"),
          Number(data.pokemonId ?? 0),
        ],
      });
      statements.push({
        sql: `INSERT INTO damage_history
                (side, pokemon_id, move_id, created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        bind: [
          String(data.side ?? "attacker"),
          Number(data.pokemonId ?? 0),
          data.moveId === null ? null : String(data.moveId ?? ""),
          Number(data.createdAt ?? record.updatedAt),
          record.updatedAt,
          record.deletedAt,
        ],
      });
    }
  }

  if (statements.length > 0) {
    await sqliteWorkerClient.transaction(statements);
  }

  const refreshedBuildRows = await sqliteWorkerClient.query(`
    SELECT id, sync_id FROM training_builds WHERE sync_id IS NOT NULL
  `);
  buildIdBySyncId.clear();
  for (const row of refreshedBuildRows) {
    buildIdBySyncId.set(String(row.sync_id), Number(row.id));
  }

  for (const record of sortedRecords) {
    if (!shouldApply(record)) continue;
    const data = record.data;
    if (record.table === "battle_teams") {
      const existingTeamId = teamIdBySyncId.get(record.recordId);
      const result = existingTeamId
        ? await sqliteWorkerClient.execute(
            `UPDATE battle_teams
             SET name = ?, created_at = ?, updated_at = ?, deleted_at = ?
             WHERE sync_id = ?`,
            [
              String(data.name ?? ""),
              Number(data.createdAt ?? record.updatedAt),
              record.updatedAt,
              record.deletedAt,
              record.recordId,
            ],
          )
        : await sqliteWorkerClient.execute(
            `INSERT INTO battle_teams
               (sync_id, name, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              record.recordId,
              String(data.name ?? ""),
              Number(data.createdAt ?? record.updatedAt),
              record.updatedAt,
              record.deletedAt,
            ],
          );
      const teamId = existingTeamId ?? result.lastInsertRowId;
      teamIdBySyncId.set(record.recordId, teamId);
      const buildSyncIds = Array.isArray(data.buildSyncIds)
        ? data.buildSyncIds.map(String)
        : [];
      await sqliteWorkerClient.transaction([
        {
          sql: "DELETE FROM battle_team_members WHERE team_id = ?",
          bind: [teamId],
        },
        ...buildSyncIds.flatMap((buildSyncId, position) => {
          const buildId = buildIdBySyncId.get(buildSyncId);
          if (buildId === undefined) return [];
          return [
            {
              sql: `INSERT INTO battle_team_members (team_id, build_id, position)
                    VALUES (?, ?, ?)`,
              bind: [teamId, buildId, position],
            },
          ];
        }),
      ]);
    }

    if (record.table === "training_matchup_notes") {
      const sourceBuildId = buildIdBySyncId.get(String(data.sourceBuildSyncId));
      if (sourceBuildId === undefined) continue;
      const targetBuildSyncId =
        data.targetBuildSyncId === null ? null : String(data.targetBuildSyncId ?? "");
      const targetBuildId =
        targetBuildSyncId === null ? null : buildIdBySyncId.get(targetBuildSyncId) ?? null;
      await sqliteWorkerClient.execute(
        `INSERT INTO training_matchup_notes (
           sync_id, source_build_id, matchup_kind, target_kind, target_pokemon_id,
           target_build_id, target_name, note, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sync_id) DO UPDATE SET
           source_build_id = excluded.source_build_id,
           matchup_kind = excluded.matchup_kind,
           target_kind = excluded.target_kind,
           target_pokemon_id = excluded.target_pokemon_id,
           target_build_id = excluded.target_build_id,
           target_name = excluded.target_name,
           note = excluded.note,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at`,
        [
          record.recordId,
          sourceBuildId,
          String(data.matchupKind ?? "favorable"),
          String(data.targetKind ?? "pokemon"),
          Number(data.targetPokemonId ?? 0),
          targetBuildId,
          String(data.targetName ?? ""),
          String(data.note ?? ""),
          Number(data.createdAt ?? record.updatedAt),
          record.updatedAt,
          record.deletedAt,
        ],
      );
    }

    if (record.table === "battle_records") {
      await sqliteWorkerClient.execute(
        `INSERT INTO battle_records (
           sync_id, battle_at, memo, image_data_url, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sync_id) DO UPDATE SET
           battle_at = excluded.battle_at,
           memo = excluded.memo,
           image_data_url = excluded.image_data_url,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at`,
        [
          record.recordId,
          Number(data.battleAt ?? 0),
          String(data.memo ?? ""),
          String(data.imageDataUrl ?? ""),
          Number(data.createdAt ?? record.updatedAt),
          record.updatedAt,
          record.deletedAt,
        ],
      );
    }
  }
}

export async function syncUserRecords(uid: string): Promise<SyncResult> {
  const remoteRecords = await loadRemoteRecords(uid);
  const prunedRemote = pruneDamageHistoryRecords(remoteRecords);
  const remoteDeleted = await deleteRemoteRecords(uid, prunedRemote.deletedRecords);
  await importRemoteRecords(prunedRemote.keptRecords);
  await pruneLocalDamageHistory();
  const mergedRecords = await exportLocalRecords();
  const prunedMerged = pruneDamageHistoryRecords(mergedRecords);
  await writeRemoteRecords(uid, prunedMerged.keptRecords);
  const mergedDeleted = await deleteRemoteRecords(uid, prunedMerged.deletedRecords);
  await pruneLocalDamageHistory();
  return {
    downloaded: prunedRemote.keptRecords.length,
    uploaded: prunedMerged.keptRecords.length,
    deleted: remoteDeleted + mergedDeleted,
  };
}
