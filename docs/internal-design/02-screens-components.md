# 画面とコンポーネント構成

## 共通レイアウト

| ファイル | 役割 |
|---|---|
| `src/app/layout.tsx` | 全ページ共通のHTML、ヘッダー、戻るボタン、Service Worker登録を配置する。 |
| `src/components/layout/site-header.tsx` | 主要画面へのナビゲーションを表示する。 |
| `src/components/layout/type-matchup-modal-button.tsx` | タイプ相性表モーダルを開く。 |
| `src/components/layout/back-button.tsx` | 前のページへ戻るボタン。 |
| `src/components/pwa/service-worker-register.tsx` | 本番環境でService Workerを登録する。 |

## 画面と主要コンポーネント

| 画面 | ページファイル | 主なコンポーネント |
|---|---|---|
| ホーム | `src/app/page.tsx` | 画面内のカードリスト |
| ポケモン検索 | `src/app/pokemon/page.tsx` | `PokemonSearchForm`, `PokemonResults` |
| ポケモン詳細 | `src/app/pokemon/[id]/page.tsx` | `PokemonDetailLoader`, `PokemonDetail` |
| 育成ポケモン選択 | `src/app/training/page.tsx` | `PokemonSearchForm`, `PokemonResults` |
| 育成詳細 | `src/app/training/[id]/page.tsx` | `TrainingSimulatorLoader`, `TrainingSimulator` |
| 保存済み育成案 | `src/app/training-builds/page.tsx` | `SavedTrainingBuilds` |
| バトルチーム編成 | `src/app/battle-team/page.tsx` | `SavedTrainingBuilds` |
| ダメージ計算 | `src/app/damage-calculator/page.tsx` | `DamageCalculatorCatalogLoader`, `DamageCalculator` |
| 対戦シミュレータ | `src/app/battle-simulator/page.tsx` | `BattleSimulator` |
| クイズ | `src/app/quiz/page.tsx` | `QuizCatalogLoader`, `QuizGame` |
| SQLite診断 | `src/app/sqlite-diagnostics/page.tsx` | `SqliteDiagnostics` |

## ポケモン検索/詳細

### 主なファイル

- `src/app/pokemon/pokemon-search-form.tsx`
- `src/app/pokemon/pokemon-results.tsx`
- `src/app/pokemon/pokemon-detail-loader.tsx`
- `src/app/pokemon/pokemon-detail.tsx`
- `src/infrastructure/database/pokemon-search-repository.ts`

### 処理概要

1. `PokemonSearchForm` が検索キーワードをURLへ反映する。
2. `PokemonResults` が検索キーワードを使って検索結果を取得する。
3. 詳細画面では `PokemonDetailLoader` が対象ポケモンを読み込む。
4. `PokemonDetail` が詳細情報を表示する。

## 育成シミュレータ

### 主なファイル

- `src/features/training/components/training-simulator-loader.tsx`
- `src/features/training/components/training-simulator.tsx`
- `src/features/training/infrastructure/training-catalog-repository.ts`
- `src/features/training/infrastructure/training-build-repository.ts`

### 主な責務

| コンポーネント/関数 | 責務 |
|---|---|
| `TrainingSimulatorLoader` | ポケモン詳細、性格、持ち物、種族値比較用データを読み込む。 |
| `TrainingSimulator` | 育成案の編集、実数値計算、保存ダイアログ、ランキング表示を扱う。 |
| `getNatures` | 性格一覧を取得する。 |
| `getHeldItems` | 持ち物一覧を取得する。 |
| `saveTrainingBuild` | 育成案を保存する。 |
| `findTrainingBuildByContentKey` | 同一内容の育成案を検索する。 |

## 保存済み育成案/バトルチーム

### 主なファイル

- `src/features/training/components/saved-training-builds.tsx`
- `src/features/training/infrastructure/training-build-repository.ts`

### 主な責務

- 保存済み育成案一覧の表示。
- チーム編成モードでの育成案選択。
- バトルチーム保存。
- 既存バトルチーム編集。

## ダメージ計算

### 主なファイル

- `src/features/damage-calculator/components/damage-calculator-catalog-loader.tsx`
- `src/features/damage-calculator/components/damage-calculator.tsx`
- `src/features/damage-calculator/components/pokemon-combobox.tsx`
- `src/features/damage-calculator/application/smogon-damage-calculator.ts`
- `src/features/damage-calculator/config/champions-damage-ruleset.ts`
- `src/features/damage-calculator/infrastructure/damage-calculator-catalog-repository.ts`
- `src/features/damage-calculator/infrastructure/damage-history-repository.ts`

### 主な責務

| コンポーネント/関数 | 責務 |
|---|---|
| `DamageCalculatorCatalogLoader` | ダメージ計算用カタログ、持ち物、天候、フィールドを読み込む。 |
| `DamageCalculator` | 画面状態、ポケモン選択、技選択、計算結果表示を管理する。 |
| `PokemonCombobox` | ポケモン選択用コンボボックス。 |
| `SmogonDamageCalculator` | `@smogon/calc` への入力変換と結果整形。 |
| `championsDamageCalculator` | Pokemon Champions向けルールセットを適用した計算器。 |

## 対戦シミュレータ

### 主なファイル

- `src/app/battle-simulator/page.tsx`
- `src/features/battle-simulator/components/battle-simulator.tsx`
- `src/features/battle-simulator/domain/battle-simulator-types.ts`
- `src/features/battle-simulator/styles/battle-simulator.module.css`

### 主な責務

| 要素 | 責務 |
|---|---|
| `BattleSimulator` | チーム選択、対戦状態生成、行動選択、ターン実行を管理する。 |
| `BattleState` | 対戦全体の状態を表す。 |
| `BattlePokemon` | 対戦中のポケモン状態を表す。 |
| `BattleCommand` | 技または交代の行動入力を表す。 |
| `BattleField` | 場に出ているPlayer 1/2のポケモンを横並びで表示する。 |
| `HpPanel` | 各プレイヤーのHPバー、名前、HP数値を表示する。 |
| `BattleLog` | 固定高のログ領域を表示し、ログ追加時に最新行へスクロールする。 |
| `ActionTabs` | Player 1/2の行動選択をタブで切り替える。 |
| `SwitchModal` | 交代ボタンから開く控えポケモン選択モーダル。 |

### 対戦中の画面構成

対戦中の画面はスマホ縦画面での操作を優先し、以下の順で縦に配置する。

1. `BattleField`
2. `BattleLog`
3. `ActionTabs`
4. ターン実行ボタン

`BattleField` はPlayer 1のHPを左上、Player 2のHPを右下に固定配置する。
`ActionTabs` は表示中プレイヤーの技リストと交代ボタンだけを表示し、交代先の選択は `SwitchModal` に分離する。

## クイズ

### 主なファイル

- `src/features/quiz/components/quiz-catalog-loader.tsx`
- `src/features/quiz/components/quiz-game.tsx`
- `src/features/quiz/components/question-panel.tsx`
- `src/features/quiz/components/score-section.tsx`
- `src/features/quiz/components/type-matchup-matrix.tsx`
- `src/features/quiz/quiz-logic.ts`
- `src/features/quiz/storage/mistake-repository.ts`

### 主な責務

- タイプ相性データの読み込み。
- 問題生成。
- 回答判定。
- スコア表示。
- ミス履歴保存。
