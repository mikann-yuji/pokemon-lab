/** UI スレッドと SQLite 専用 Worker の通信契約。 */

/** SQLiteへbindできる値だけを許可し、UI層から任意オブジェクトを渡さないようにする。 */
export type SqliteValue = string | number | bigint | null | Uint8Array;
export type SqliteBind = SqliteValue[] | Record<string, SqliteValue>;

/**
 * transaction内で前のINSERT結果を後続statementのbindへ流し込む指定。
 * 例: battle_teamsのlastInsertRowIdをbattle_team_members.team_idへ入れる。
 */
export type SqliteBindReference = {
  bindIndex: number;
  resultIndex: number;
  field: "lastInsertRowId";
};

/** Workerへ渡すSQL 1本分の形。bindReferencesはtransaction専用。 */
export type SqliteStatement = {
  sql: string;
  bind?: SqliteBind;
  bindReferences?: SqliteBindReference[];
};

/** sqlite-wasmのrowMode: "object"から返る1行分の型。 */
export type SqliteRow = Record<string, SqliteValue>;

/** INSERT/UPDATE/DELETE後にUI側が必要とする最小の実行結果。 */
export type SqliteExecuteResult = {
  changes: number;
  lastInsertRowId: number;
};

/** 診断画面へ返す、OPFS上のDBと配布カタログDBの健全性情報。 */
export type SqliteDatabaseDiagnostics = {
  schemaVersion: number;
  tableCount: number;
  foreignKeysEnabled: boolean;
  databaseCreatedAt: number;
  userRecordCount: number;
  catalogDatabaseFilename: string;
  catalogSeedVersion: string | null;
  championsFormCount: number;
  typeMatchupCount: number;
  crudVerified: boolean;
  transactionRollbackVerified: boolean;
};

/** initializeの成功時にだけ返る、SQLiteランタイムとDB診断を合わせた情報。 */
export type SqliteWorkerInitialization = SqliteDatabaseDiagnostics & {
  sqliteVersion: string;
  vfs: "opfs-sahpool";
  databaseFilename: string;
};

/**
 * Workerが受け付ける要求一覧。
 * query/execute/transactionはuser.db、catalogQueryはcatalog.dbを対象にする。
 */
export type SqliteWorkerRequestMap = {
  initialize: undefined;
  ping: undefined;
  query: SqliteStatement;
  catalogQuery: SqliteStatement;
  execute: SqliteStatement;
  transaction: { statements: SqliteStatement[] };
  exportUserDatabase: undefined;
  importUserDatabase: Uint8Array;
  diagnose: undefined;
  close: undefined;
};

/** 要求typeごとの戻り値を固定し、UI側の呼び出しで取り違えないようにする。 */
export type SqliteWorkerResultMap = {
  initialize: SqliteWorkerInitialization;
  ping: { initialized: boolean };
  query: SqliteRow[];
  catalogQuery: SqliteRow[];
  execute: SqliteExecuteResult;
  transaction: SqliteExecuteResult[];
  exportUserDatabase: Uint8Array;
  importUserDatabase: SqliteWorkerInitialization;
  diagnose: SqliteDatabaseDiagnostics;
  close: undefined;
};

/** UIスレッドからWorkerへ送るメッセージ。idは非同期応答の対応付けに使う。 */
export type SqliteWorkerRequest<
  Type extends keyof SqliteWorkerRequestMap = keyof SqliteWorkerRequestMap,
> = {
  id: number;
  type: Type;
  payload: SqliteWorkerRequestMap[Type];
};

/** Worker処理が成功した時のレスポンス。 */
export type SqliteWorkerSuccess<
  Type extends keyof SqliteWorkerResultMap = keyof SqliteWorkerResultMap,
> = {
  id: number;
  type: Type;
  ok: true;
  result: SqliteWorkerResultMap[Type];
};

/** Worker処理が失敗した時のレスポンス。ErrorはpostMessage可能なプレーン値へ落とす。 */
export type SqliteWorkerFailure = {
  id: number;
  type: keyof SqliteWorkerResultMap;
  ok: false;
  error: { name: string; message: string };
};

export type SqliteWorkerResponse = SqliteWorkerSuccess | SqliteWorkerFailure;
