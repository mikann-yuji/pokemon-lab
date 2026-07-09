/**
 * SQLite WASM を OPFS 上で実行する専用 Worker。
 * アプリ側はこの Worker を経由して user.db を操作する。
 */

import sqlite3InitModule from "/sqlite-wasm/index.mjs";

const DATABASE_FILENAME = "/user.db";
const CATALOG_DATABASE_FILENAME = "/catalog.db";
const SUPPORTED_SCHEMA_VERSION = 3;
const CATALOG_DATABASE_URL = "/sqlite-catalog.db.gz";
const CATALOG_SEED_VERSION = "6";

// OPFS上のSQLite接続はWorker内でだけ保持し、UIスレッドへDBオブジェクトを渡さない。
let database = null;
let catalogDatabase = null;
let sahPool = null;
let initialization;

// 旧user.dbにカタログ同梱テーブルが残っていた場合に削除するための一覧。
const catalogTableNames = [
  "champions_damage_terrains",
  "champions_damage_weathers",
  "champions_ability_damage_modifiers",
  "champions_item_damage_modifiers",
  "champions_items",
  "items",
  "champions_forms",
  "champions_form_move_usage",
  "form_moves",
  "move_learn_methods",
  "version_groups",
  "moves",
  "form_types",
  "natures",
  "form_stats",
  "stats",
  "form_abilities",
  "abilities",
  "forms",
  "species",
  "type_matchups",
  "types",
];

/** postMessageできるプレーンなエラー情報へ変換する。 */
function toError(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "Error", message: String(error) };
}

/**
 * user.dbへ更新SQLを1本実行する。
 * changesは更新件数、lastInsertRowIdは関連テーブルを続けて作る時の参照値として返す。
 */
function executeStatement(statement) {
  database.exec({ sql: statement.sql, bind: statement.bind });
  return {
    changes: Number(database.changes()),
    lastInsertRowId: Number(database.selectValue("SELECT last_insert_rowid()")),
  };
}

/** user.dbからアプリ固有の保存データを読む。 */
function queryRows({ sql, bind }) {
  return database.exec({
    sql,
    bind,
    rowMode: "object",
    returnValue: "resultRows",
  });
}

/** catalog.dbから配布済みの読み取り専用カタログを読む。 */
function queryCatalogRows({ sql, bind }) {
  return catalogDatabase.exec({
    sql,
    bind,
    rowMode: "object",
    returnValue: "resultRows",
  });
}

/**
 * 複数のuser.db更新を不可分に実行する。
 * bindReferencesで前のINSERT結果を後続SQLへ渡し、チーム作成などの親子保存を1往復で完了させる。
 */
function runTransaction(statements) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const results = [];
    for (const statement of statements) {
      let resolvedStatement = statement;
      if (statement.bindReferences?.length) {
        if (!Array.isArray(statement.bind)) {
          throw new Error("bindReferences は配列形式の bind でのみ使用できます。");
        }
        const bind = [...statement.bind];
        for (const reference of statement.bindReferences) {
          const source = results[reference.resultIndex];
          if (!source) {
            throw new Error(
              `トランザクション結果 ${reference.resultIndex} を参照できません。`,
            );
          }
          bind[reference.bindIndex] = source[reference.field];
        }
        resolvedStatement = { ...statement, bind };
      }
      results.push(executeStatement(resolvedStatement));
    }
    database.exec("COMMIT");
    return results;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/**
 * user.dbのスキーマを現在のアプリが読める形へそろえる。
 * user_versionが新しすぎる場合は、過去にuser.dbへ混在していたカタログテーブルだけを掃除する。
 */
function migrateSchema() {
  database.exec("PRAGMA foreign_keys = ON");
  let currentVersion = Number(database.selectValue("PRAGMA user_version"));

  if (currentVersion > SUPPORTED_SCHEMA_VERSION) {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const tableName of catalogTableNames) {
        database.exec(`DROP TABLE IF EXISTS "${tableName}"`);
      }
      database.exec(`
        DELETE FROM schema_metadata
        WHERE key IN ('catalog_seed_version');
        PRAGMA user_version = ${SUPPORTED_SCHEMA_VERSION};
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  if (currentVersion === 0) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
        CREATE TABLE schema_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE training_builds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          content_key TEXT NOT NULL UNIQUE,
          pokemon_id INTEGER NOT NULL,
          nature TEXT NOT NULL,
          item_id INTEGER,
          ability_id TEXT,
          ability_points_json TEXT NOT NULL,
          move_ids_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE battle_teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE battle_team_members (
          team_id INTEGER NOT NULL,
          build_id INTEGER NOT NULL,
          position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 5),
          PRIMARY KEY (team_id, position),
          UNIQUE (team_id, build_id),
          FOREIGN KEY (team_id) REFERENCES battle_teams(id) ON DELETE CASCADE,
          FOREIGN KEY (build_id) REFERENCES training_builds(id) ON DELETE CASCADE
        );

        CREATE TABLE quiz_mistakes (
          question_key TEXT PRIMARY KEY,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE quiz_hints (
          question_key TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE damage_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          side TEXT NOT NULL CHECK (side IN ('attacker', 'defender')),
          pokemon_id INTEGER NOT NULL,
          move_id INTEGER,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX damage_history_side_updated_at
          ON damage_history(side, updated_at DESC);

        CREATE TABLE training_matchup_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_build_id INTEGER NOT NULL,
          matchup_kind TEXT NOT NULL CHECK (matchup_kind IN ('favorable', 'unfavorable')),
          target_kind TEXT NOT NULL CHECK (target_kind IN ('pokemon', 'build')),
          target_pokemon_id INTEGER NOT NULL,
          target_build_id INTEGER,
          target_name TEXT NOT NULL,
          note TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (source_build_id) REFERENCES training_builds(id) ON DELETE CASCADE,
          FOREIGN KEY (target_build_id) REFERENCES training_builds(id) ON DELETE SET NULL
        );

        CREATE INDEX training_matchup_notes_source_kind_updated_at
          ON training_matchup_notes(source_build_id, matchup_kind, updated_at DESC);

        INSERT INTO schema_metadata (key, value)
        VALUES ('database_created_at', CAST(unixepoch() AS TEXT));

        PRAGMA user_version = 3;
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  if (currentVersion === 1) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
        ALTER TABLE training_builds ADD COLUMN ability_id TEXT;
        PRAGMA user_version = 2;
      `);
      database.exec("COMMIT");
      currentVersion = 2;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  if (currentVersion === 2) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
        CREATE TABLE IF NOT EXISTS training_matchup_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_build_id INTEGER NOT NULL,
          matchup_kind TEXT NOT NULL CHECK (matchup_kind IN ('favorable', 'unfavorable')),
          target_kind TEXT NOT NULL CHECK (target_kind IN ('pokemon', 'build')),
          target_pokemon_id INTEGER NOT NULL,
          target_build_id INTEGER,
          target_name TEXT NOT NULL,
          note TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (source_build_id) REFERENCES training_builds(id) ON DELETE CASCADE,
          FOREIGN KEY (target_build_id) REFERENCES training_builds(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS training_matchup_notes_source_kind_updated_at
          ON training_matchup_notes(source_build_id, matchup_kind, updated_at DESC);

        PRAGMA user_version = 3;
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

}

/**
 * publicに置いたgzip圧縮済みcatalog.dbを取得し、ブラウザ標準のDecompressionStreamで展開する。
 * カタログは配布物なので、ユーザーDBとは別ファイルとしてOPFSへimportする。
 */
async function fetchCompressedCatalogDatabase() {
  const response = await fetch(CATALOG_DATABASE_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `配布用カタログDBを取得できませんでした: ${response.status} ${response.statusText}`,
    );
  }

  const stream = response.body?.pipeThrough(new DecompressionStream("gzip"));
  if (stream) {
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const compressed = await response.arrayBuffer();
  throw new Error(
    `このブラウザでは配布用カタログDBの解凍に対応していません: ${compressed.byteLength} bytes`,
  );
}

/**
 * OPFS上のcatalog.dbを準備する。
 * catalog_seed_versionが一致していれば既存DBを使い、一致しなければ配布DBで入れ替える。
 */
async function ensureCatalogDatabase() {
  if (catalogDatabase) return false;

  catalogDatabase = new sahPool.OpfsSAHPoolDb(CATALOG_DATABASE_FILENAME);
  let currentSeedVersion = null;
  try {
    currentSeedVersion = catalogDatabase.selectValue(
      "SELECT value FROM catalog_metadata WHERE key = 'catalog_seed_version'",
    );
  } catch {
    currentSeedVersion = null;
  }
  if (String(currentSeedVersion) === CATALOG_SEED_VERSION) return false;

  catalogDatabase.close();
  catalogDatabase = null;
  const catalogDatabaseBytes = await fetchCompressedCatalogDatabase();
  sahPool.unlink(CATALOG_DATABASE_FILENAME);
  await sahPool.importDb(CATALOG_DATABASE_FILENAME, catalogDatabaseBytes);
  catalogDatabase = new sahPool.OpfsSAHPoolDb(CATALOG_DATABASE_FILENAME);
  return true;
}

/**
 * 診断画面用の自己検査。
 * 実際にBEGIN/ROLLBACKを行い、CRUDとロールバックがOPFS上で成立することを確認する。
 */
function runDiagnostics() {
  const diagnosticKey = `diagnostic_${crypto.randomUUID()}`;
  let rollbackVerified = false;

  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec({
      sql: "INSERT INTO schema_metadata (key, value) VALUES (?, ?)",
      bind: [diagnosticKey, "created"],
    });
    database.exec({
      sql: "UPDATE schema_metadata SET value = ? WHERE key = ?",
      bind: ["updated", diagnosticKey],
    });
    const value = database.selectValue(
      "SELECT value FROM schema_metadata WHERE key = ?",
      diagnosticKey,
    );
    if (value !== "updated") {
      throw new Error("CRUD診断で保存値が一致しませんでした。");
    }
    database.exec("ROLLBACK");
    rollbackVerified =
      Number(
        database.selectValue(
          "SELECT COUNT(*) FROM schema_metadata WHERE key = ?",
          diagnosticKey,
        ),
      ) === 0;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return {
    schemaVersion: Number(database.selectValue("PRAGMA user_version")),
    tableCount: Number(
      database.selectValue(
        "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      ),
    ),
    foreignKeysEnabled: Number(database.selectValue("PRAGMA foreign_keys")) === 1,
    databaseCreatedAt: Number(
      database.selectValue(
        "SELECT value FROM schema_metadata WHERE key = 'database_created_at'",
      ),
    ),
    userRecordCount: Number(
      database.selectValue(`
        SELECT
          (SELECT COUNT(*) FROM training_builds)
          + (SELECT COUNT(*) FROM battle_teams)
          + (SELECT COUNT(*) FROM battle_team_members)
          + (SELECT COUNT(*) FROM quiz_mistakes)
          + (SELECT COUNT(*) FROM quiz_hints)
          + (SELECT COUNT(*) FROM damage_history)
      `),
    ),
    catalogDatabaseFilename: CATALOG_DATABASE_FILENAME,
    catalogSeedVersion:
      catalogDatabase?.selectValue(
        "SELECT value FROM catalog_metadata WHERE key = 'catalog_seed_version'",
      ) ?? null,
    championsFormCount: Number(
      catalogDatabase?.selectValue("SELECT COUNT(*) FROM champions_forms") ?? 0,
    ),
    typeMatchupCount: Number(
      catalogDatabase?.selectValue("SELECT COUNT(*) FROM type_matchups") ?? 0,
    ),
    crudVerified: rollbackVerified,
    transactionRollbackVerified: rollbackVerified,
  };
}

/**
 * SQLite WASMとOPFS SAH Pool VFSを初期化する。
 * initialization Promiseを共有し、同時に複数メッセージが来ても初期化を1回にまとめる。
 */
async function initializeSqlite() {
  if (initialization) return initialization;

  initialization = (async () => {
    const sqlite3 = await sqlite3InitModule();
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      directory: ".pokemon-lab-sahpool",
      initialCapacity: 8,
    });
    sahPool = pool;
    database = new pool.OpfsSAHPoolDb(DATABASE_FILENAME);
    migrateSchema();
    await ensureCatalogDatabase();

    return {
      sqliteVersion: sqlite3.version.libVersion,
      vfs: "opfs-sahpool",
      databaseFilename: DATABASE_FILENAME,
      ...runDiagnostics(),
    };
  })();

  try {
    return await initialization;
  } catch (error) {
    initialization = undefined;
    catalogDatabase?.close();
    catalogDatabase = null;
    database?.close();
    database = null;
    sahPool = null;
    throw error;
  }
}

/**
 * UIスレッドからの要求をDB操作へ振り分ける。
 * initialize以外は必ずDB初期化後に実行し、query系の対象DBをここで分離する。
 */
async function handleRequest(request) {
  if (request.type !== "initialize") await initializeSqlite();

  switch (request.type) {
    case "initialize":
      return initializeSqlite();
    case "ping":
      return { initialized: database !== null };
    case "query":
      return queryRows(request.payload);
    case "catalogQuery":
      return queryCatalogRows(request.payload);
    case "execute":
      return executeStatement(request.payload);
    case "transaction":
      return runTransaction(request.payload.statements);
    case "diagnose":
      return runDiagnostics();
    case "close":
      database?.close();
      catalogDatabase?.close();
      database = null;
      catalogDatabase = null;
      sahPool = null;
      initialization = undefined;
      return undefined;
    default:
      throw new Error(`未対応の SQLite Worker 要求です: ${request.type}`);
  }
}

// Workerプロトコルはid付きのrequest/response形式。UI側はidでPromiseを解決する。
self.addEventListener("message", (event) => {
  const request = event.data;
  void handleRequest(request)
    .then((result) => {
      self.postMessage({
        id: request.id,
        type: request.type,
        ok: true,
        result,
      });
    })
    .catch((error) => {
      self.postMessage({
        id: request.id,
        type: request.type,
        ok: false,
        error: toError(error),
      });
    });
});
