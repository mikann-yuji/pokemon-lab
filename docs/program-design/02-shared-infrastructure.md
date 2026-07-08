# 共通基盤とSQLite Worker

## SQLite Worker構成

| ファイル | 役割 |
|---|---|
| `src/infrastructure/sqlite-wasm/sqlite-client.ts` | UIスレッド側のWorkerクライアント。初期化、リクエストID管理、タイムアウト、診断を担当する。 |
| `src/infrastructure/sqlite-wasm/worker-protocol.ts` | Workerとの通信型を定義する。 |
| `scripts/sqlite-runtime-worker.mjs` | ブラウザで動くSQLite Worker本体。catalog DBとuser DBを初期化し、SQLを実行する。 |
| `scripts/sqlite-runtime-diagnostic.html` | SQLite Worker単体診断用HTML。 |

## Worker通信プロトコル

主な型:

| 型 | 内容 |
|---|---|
| `SqliteWorkerRequestMap` | Workerへ送る要求種別とpayload。 |
| `SqliteWorkerResultMap` | 要求種別ごとの成功結果。 |
| `SqliteWorkerRequest` | `id`, `type`, `payload` を持つリクエスト。 |
| `SqliteWorkerSuccess` | `ok: true` のレスポンス。 |
| `SqliteWorkerFailure` | `ok: false` とエラー文字列を持つレスポンス。 |
| `SqliteRow` | SQL結果1行。 |

主な要求:

| request type | 用途 |
|---|---|
| `initialize` | Worker、SQLite WASM、catalog/user DBを初期化する。 |
| `catalogQuery` | 読み取り専用catalog DBへSELECTを実行する。 |
| `query` | user DBへSELECTを実行する。 |
| `execute` | user DBへ更新SQLを実行する。 |
| `transaction` | user DBへ複数SQLをまとめて実行する。 |
| `diagnostics` | DBとストレージの状態を取得する。 |

## `SqliteWorkerClient`

ファイル: `src/infrastructure/sqlite-wasm/sqlite-client.ts`

主な責務:

- Workerを遅延生成する。
- リクエストIDとPromise resolverを対応付ける。
- `DEFAULT_TIMEOUT_MS` によるタイムアウトを設定する。
- 初期化要求を多重実行しない。
- `catalogQuery`, `query`, `execute`, `transaction`, `diagnostics` のメソッドを公開する。

公開インスタンス:

```ts
export const sqliteWorkerClient = new SqliteWorkerClient();
```

## catalog DB と user DB

| DB | 初期化元 | 読み書き | 主な用途 |
|---|---|---|---|
| catalog DB | `public/sqlite-catalog.db.gz` | 読み取り専用 | ポケモン、タイプ、技、特性、持ち物、性格、Champions補正 |
| user DB | ブラウザストレージ上のSQLite | 読み書き | 育成案、バトルチーム、クイズミス、ダメージ履歴 |

## user DBスキーマ

user DB は `scripts/sqlite-runtime-worker.mjs` 内で作成する。

| テーブル | 用途 |
|---|---|
| `schema_metadata` | user DBのスキーマバージョンなどを保存する。 |
| `training_builds` | 育成案を保存する。 |
| `battle_teams` | バトルチームのヘッダー情報を保存する。 |
| `battle_team_members` | チームと育成案の対応を保存する。 |
| `quiz_mistakes` | クイズで間違えた問題キーを保存する。 |
| `quiz_hints` | クイズヒント情報用。 |
| `damage_history` | ダメージ計算で最近使ったポケモンを保存する。 |

## ブラウザストレージ診断

主な関数:

| 関数 | 内容 |
|---|---|
| `detectBrowserStorageCapabilities` | OPFS、IndexedDB、Cache APIなどの利用可否を判定する。 |
| `getBrowserStorageSnapshot` | storage estimateを含むスナップショットを取得する。 |
| `runSqlitePhaseTwoDiagnostics` | Worker診断とブラウザストレージ診断をまとめて返す。 |

SQLite診断画面:

- `src/app/sqlite-diagnostics/sqlite-diagnostics.tsx`
- `runSqlitePhaseTwoDiagnostics` を呼び、初期化状況、テーブル数、DB保存状態を表示する。

## SQL実装ルール

- 画面コンポーネントから直接SQLを書かない。
- 機能ごとのリポジトリ関数にSQLを閉じ込める。
- catalog DB は `catalogQuery`、user DB は `query` / `execute` / `transaction` を使い分ける。
- 複数テーブル更新は `transaction` にまとめる。
- JSON文字列として保存する列は、読み込み時にfallback付きでparseする。

