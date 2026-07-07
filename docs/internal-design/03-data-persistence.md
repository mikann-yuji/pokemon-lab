# データ永続化とSQLite構成

## SQLiteの利用方針

PokemonLabは2種類のSQLiteデータを使う。

| DB | 用途 | 読み書き |
|---|---|---|
| catalog DB | ポケモン、タイプ、技、特性、持ち物などのマスタデータ | 読み取り専用 |
| user DB | 育成案、バトルチーム、履歴、ミス情報など | 読み書き |

ブラウザ上では `sqliteWorkerClient` を通してSQLite Workerへ処理を依頼する。

## SQLite Worker

### 主なファイル

- `src/infrastructure/sqlite-wasm/sqlite-client.ts`
- `src/infrastructure/sqlite-wasm/worker-protocol.ts`
- `scripts/sqlite-runtime-worker.mjs`
- `scripts/sqlite-runtime-diagnostic.html`

### 主な責務

| 要素 | 責務 |
|---|---|
| `sqliteWorkerClient` | UI側からSQLite Workerへ問い合わせるクライアント。 |
| `catalogQuery` | カタログDBへの読み取りクエリ。 |
| `query` | ユーザーDBへの読み取りクエリ。 |
| `execute` | ユーザーDBへの更新クエリ。 |
| `transaction` | 複数SQLをまとめて実行する。 |
| `runSqlitePhaseTwoDiagnostics` | ブラウザストレージとSQLite状態を診断する。 |

## カタログDB生成

### 関連スクリプト

- `scripts/init-db.mjs`
- `scripts/export-sqlite-catalog-db.mjs`
- `scripts/copy-sqlite-wasm-assets.mjs`
- `scripts/fetch-pokeapi-seeds.mjs`
- `scripts/fetch-pokeapi-items.mjs`
- `scripts/fetch-champions-seed.mjs`
- `scripts/fetch-champions-items.mjs`
- `scripts/fetch-champions-move-usage.mjs`

### 生成物

| 生成物 | 用途 |
|---|---|
| `data/pokemon-lab.db` | 開発/生成元のSQLite DB。 |
| `public/sqlite-catalog.db.gz` | ブラウザで読み込む圧縮済みcatalog DB。 |
| `public/sqlite-wasm/` | SQLite WASM実行に必要な資産。 |

## ユーザー保存データ

### 育成案

型:

- `TrainingBuild`

主なフィールド:

- `id`
- `name`
- `contentKey`
- `pokemonId`
- `nature`
- `itemId`
- `abilityId`
- `abilityPoints`
- `moveIds`
- `updatedAt`

主な関数:

- `createTrainingBuildContentKey`
- `loadLatestTrainingBuild`
- `loadTrainingBuild`
- `getAllTrainingBuilds`
- `findTrainingBuildByContentKey`
- `saveTrainingBuild`

### バトルチーム

型:

- `BattleTeam`

主なフィールド:

- `id`
- `name`
- `buildIds`
- `updatedAt`

主な関数:

- `getAllBattleTeams`
- `saveBattleTeam`
- `updateBattleTeam`
- `deleteBattleTeam`
- `validateBattleTeamBuilds`

### ダメージ履歴

型:

- `DamageHistoryRecord`
- `DamageHistorySide`

主な関数:

- `getDamageHistory`
- `saveDamageHistory`

### クイズのミス履歴

主なファイル:

- `src/features/quiz/storage/mistake-repository.ts`

用途:

- タイプ相性クイズで間違えた問題の保存/復元。

## データ整合性

### 育成案の重複判定

`createTrainingBuildContentKey` で以下をもとに同一内容判定用キーを作る。

- ポケモンID
- 性格
- 持ち物
- 特性
- 能力ポイント
- 技ID

同一キーの育成案がある場合、保存時に既存データを更新できる。

### バトルチームの制約

`validateBattleTeamBuilds` で以下を検証する。

- 1〜6体であること。
- 同じポケモンが重複していないこと。
- 持ち物がある場合、同じ持ち物が重複していないこと。

## 注意点

- `npm run build` は `prebuild` でDB資産を再生成する。
- そのため、`data/pokemon-lab.db` が変更扱いになることがある。
- docsのみのコミットでは `data/pokemon-lab.db` をステージしない。
