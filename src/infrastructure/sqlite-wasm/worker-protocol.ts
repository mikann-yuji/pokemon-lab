/** UI スレッドと SQLite 専用 Worker の通信契約。 */

export type SqliteValue = string | number | bigint | null | Uint8Array;
export type SqliteBind = SqliteValue[] | Record<string, SqliteValue>;
export type SqliteBindReference = {
  bindIndex: number;
  resultIndex: number;
  field: "lastInsertRowId";
};
export type SqliteStatement = {
  sql: string;
  bind?: SqliteBind;
  bindReferences?: SqliteBindReference[];
};
export type SqliteRow = Record<string, SqliteValue>;
export type SqliteExecuteResult = {
  changes: number;
  lastInsertRowId: number;
};

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

export type SqliteWorkerInitialization = SqliteDatabaseDiagnostics & {
  sqliteVersion: string;
  vfs: "opfs-sahpool";
  databaseFilename: string;
};

export type SqliteWorkerRequestMap = {
  initialize: undefined;
  ping: undefined;
  query: SqliteStatement;
  catalogQuery: SqliteStatement;
  execute: SqliteStatement;
  transaction: { statements: SqliteStatement[] };
  diagnose: undefined;
  close: undefined;
};

export type SqliteWorkerResultMap = {
  initialize: SqliteWorkerInitialization;
  ping: { initialized: boolean };
  query: SqliteRow[];
  catalogQuery: SqliteRow[];
  execute: SqliteExecuteResult;
  transaction: SqliteExecuteResult[];
  diagnose: SqliteDatabaseDiagnostics;
  close: undefined;
};

export type SqliteWorkerRequest<
  Type extends keyof SqliteWorkerRequestMap = keyof SqliteWorkerRequestMap,
> = {
  id: number;
  type: Type;
  payload: SqliteWorkerRequestMap[Type];
};

export type SqliteWorkerSuccess<
  Type extends keyof SqliteWorkerResultMap = keyof SqliteWorkerResultMap,
> = {
  id: number;
  type: Type;
  ok: true;
  result: SqliteWorkerResultMap[Type];
};

export type SqliteWorkerFailure = {
  id: number;
  type: keyof SqliteWorkerResultMap;
  ok: false;
  error: { name: string; message: string };
};

export type SqliteWorkerResponse = SqliteWorkerSuccess | SqliteWorkerFailure;
