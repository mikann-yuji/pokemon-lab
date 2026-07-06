"use client";

import type {
  SqliteBind,
  SqliteDatabaseDiagnostics,
  SqliteExecuteResult,
  SqliteRow,
  SqliteStatement,
  SqliteWorkerInitialization,
  SqliteWorkerRequest,
  SqliteWorkerRequestMap,
  SqliteWorkerResponse,
  SqliteWorkerResultMap,
} from "./worker-protocol";

const DEFAULT_TIMEOUT_MS = 20_000;
const STORAGE_API_TIMEOUT_MS = 3_000;

/**
 * Workerへ送ったリクエストの待ち受け情報。
 * idごとにresolve/rejectを保持し、Workerから同じidの応答が戻った時だけ完了させる。
 */
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
};

/**
 * SQLite WASMをブラウザで動かすための最低限の機能検出結果。
 * 診断画面では、どの要件が足りないかをこの値から表示する。
 */
export type BrowserStorageCapabilities = {
  secureContext: boolean;
  webAssembly: boolean;
  webWorker: boolean;
  opfs: boolean;
};

/**
 * Storage APIから見える永続化と容量の状態。
 * OPFS自体の利用可否とは別に、ブラウザが永続ストレージを許可したかを確認する。
 */
export type BrowserStorageSnapshot = {
  capabilities: BrowserStorageCapabilities;
  persisted: boolean;
  persistenceRequested: boolean;
  usage: number | null;
  quota: number | null;
};

export type SqlitePhaseTwoDiagnostics = BrowserStorageSnapshot & {
  worker: SqliteWorkerInitialization;
};

/**
 * Storage API呼び出しがブラウザ都合で長く止まることがあるため、
 * 診断UIを固めないよう短いタイムアウトでフォールバック値へ倒す。
 */
function settleWithin<Value>(promise: Promise<Value>, fallback: Value) {
  return Promise.race([
    promise,
    new Promise<Value>((resolve) => {
      window.setTimeout(() => resolve(fallback), STORAGE_API_TIMEOUT_MS);
    }),
  ]);
}

/**
 * public配下へコピーしたSQLite専用Workerをmodule workerとして起動する。
 * Next.jsのClient ComponentからはこのWorkerだけがSQLite WASMへ直接触る。
 */
function createWorker() {
  return new Worker("/sqlite-runtime-worker.mjs", {
    type: "module",
    name: "pokemon-lab-sqlite",
  });
}

/** ブラウザがSQLite WASM + OPFS構成を実行できるかを同期的に判定する。 */
export function detectBrowserStorageCapabilities(): BrowserStorageCapabilities {
  return {
    secureContext: window.isSecureContext,
    webAssembly: typeof WebAssembly !== "undefined",
    webWorker: typeof Worker !== "undefined",
    opfs:
      typeof navigator.storage !== "undefined" &&
      typeof navigator.storage.getDirectory === "function",
  };
}

/**
 * Storage APIの診断値を集める。
 * requestPersistence=trueの時だけ、ユーザーDBを消されにくくするためpersist()も試す。
 */
export async function getBrowserStorageSnapshot(
  requestPersistence = false,
): Promise<BrowserStorageSnapshot> {
  const capabilities = detectBrowserStorageCapabilities();
  const storage = navigator.storage;
  let persistenceRequested = false;

  if (requestPersistence && typeof storage.persist === "function") {
    persistenceRequested = await settleWithin(storage.persist(), false);
  }

  const [persisted, estimate] = await Promise.all([
    typeof storage.persisted === "function"
      ? settleWithin(storage.persisted(), false)
      : Promise.resolve(false),
    typeof storage.estimate === "function"
      ? settleWithin(storage.estimate(), {} as StorageEstimate)
      : Promise.resolve({} as StorageEstimate),
  ]);

  return {
    capabilities,
    persisted,
    persistenceRequested,
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
  };
}

/**
 * UIスレッドからSQLite専用Workerへ型付きメッセージを送るクライアント。
 * catalogQueryは配布カタログDB、query/execute/transactionはユーザーDBを対象にする。
 */
class SqliteWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();

  /** 初回アクセス時にだけWorkerを作り、以降は同じOPFS接続を再利用する。 */
  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = createWorker();
    worker.addEventListener("message", this.handleMessage);
    worker.addEventListener("error", this.handleWorkerError);
    this.worker = worker;
    return worker;
  }

  private handleMessage = (event: MessageEvent<SqliteWorkerResponse>) => {
    const response = event.data;
    const pending = this.pending.get(response.id);
    if (!pending) return;

    window.clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      const error = new Error(response.error.message);
      error.name = response.error.name;
      pending.reject(error);
    }
  };

  /** Workerで構文エラーや初期化失敗が起きた時、待機中の全リクエストへ同じ失敗を返す。 */
  private handleWorkerError = (event: ErrorEvent) => {
    this.rejectAll(
      new Error(event.message || "SQLite Worker でエラーが発生しました。"),
    );
    this.terminate();
  };

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /**
   * Workerプロトコルの共通送信口。
   * タイムアウトを置くことで、Worker初期化失敗時にUIが永久待ちにならないようにする。
   */
  private request<Type extends keyof SqliteWorkerRequestMap>(
    type: Type,
    payload: SqliteWorkerRequestMap[Type],
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<SqliteWorkerResultMap[Type]> {
    const worker = this.ensureWorker();
    const id = this.nextRequestId++;

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`SQLite Worker の ${type} 処理がタイムアウトしました。`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      worker.postMessage({
        id,
        type,
        payload,
      } satisfies SqliteWorkerRequest<Type>);
    });
  }

  async initialize() {
    try {
      return await this.request("initialize", undefined);
    } catch {
      this.terminate();
      return this.request("initialize", undefined);
    }
  }

  ping() {
    return this.request("ping", undefined);
  }

  /** catalog.dbではなく、OPFS上のuser.dbへSELECT系クエリを投げる。 */
  query<Row extends SqliteRow = SqliteRow>(
    sql: string,
    bind?: SqliteBind,
  ): Promise<Row[]> {
    return this.request("query", { sql, bind }) as Promise<Row[]>;
  }

  /** 配布カタログ用のcatalog.dbへ読み取り専用クエリを投げる。 */
  catalogQuery<Row extends SqliteRow = SqliteRow>(
    sql: string,
    bind?: SqliteBind,
  ): Promise<Row[]> {
    return this.request("catalogQuery", { sql, bind }) as Promise<Row[]>;
  }

  /** user.dbへ単一のINSERT/UPDATE/DELETEを実行し、変更件数とlast_insert_rowidを返す。 */
  execute(sql: string, bind?: SqliteBind): Promise<SqliteExecuteResult> {
    return this.request("execute", { sql, bind });
  }

  /** 複数のuser.db更新をBEGIN/COMMITでまとめ、途中失敗時はWorker側でROLLBACKする。 */
  transaction(
    statements: SqliteStatement[],
  ): Promise<SqliteExecuteResult[]> {
    return this.request("transaction", { statements });
  }

  /** 診断画面からSQLite/OPFS/スキーマ/CRUDの状態をまとめて確認する。 */
  diagnose(): Promise<SqliteDatabaseDiagnostics> {
    return this.request("diagnose", undefined);
  }

  async close() {
    if (!this.worker) return;
    await this.request("close", undefined);
  }

  terminate() {
    if (!this.worker) return;
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleWorkerError);
    this.worker.terminate();
    this.worker = null;
  }
}

export const sqliteWorkerClient = new SqliteWorkerClient();

/**
 * 診断画面用の統合チェック。
 * ブラウザ能力、Storage API、SQLite Worker初期化を並列に確認して表示用の形にまとめる。
 */
export async function runSqlitePhaseTwoDiagnostics(
  requestPersistence = true,
): Promise<SqlitePhaseTwoDiagnostics> {
  const capabilities = detectBrowserStorageCapabilities();
  const unsupported = Object.entries(capabilities)
    .filter(([, supported]) => !supported)
    .map(([name]) => name);
  if (unsupported.length > 0) {
    throw new Error(
      `SQLite WASM の実行要件を満たしていません: ${unsupported.join(", ")}`,
    );
  }

  const [worker, storage] = await Promise.all([
    sqliteWorkerClient.initialize(),
    getBrowserStorageSnapshot(requestPersistence),
  ]);
  return { ...storage, worker };
}
