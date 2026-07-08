# 機能別プログラム構成

## ポケモン検索/詳細

| ファイル | 主要要素 | 責務 |
|---|---|---|
| `src/app/pokemon/pokemon-search-form.tsx` | `PokemonSearchForm` | 検索条件をURL search paramsへ反映する。 |
| `src/app/pokemon/pokemon-results.tsx` | `PokemonResults` | URL search paramsを読み、検索結果一覧を表示する。 |
| `src/app/pokemon/pokemon-detail-loader.tsx` | `PokemonDetailLoader` | 詳細データの読み込み状態とエラーを管理する。 |
| `src/app/pokemon/pokemon-detail.tsx` | `PokemonDetail` | 種族値、タイプ、特性、技などを表示する。 |
| `src/infrastructure/database/pokemon-search-repository.ts` | `searchPokemon`, `getPokemonDetail` | catalog DB検索と詳細取得を担当する。 |

処理:

1. `PokemonSearchForm` が入力値をURLへ反映する。
2. `PokemonResults` が検索条件を読み、`searchPokemon` を呼ぶ。
3. 詳細画面では `PokemonDetailLoader` が `getPokemonDetail` を呼ぶ。
4. `PokemonDetail` は表示専用に近く、DBアクセスを持たない。

## タイプ相性表/クイズ

| ファイル | 主要要素 | 責務 |
|---|---|---|
| `src/features/quiz/infrastructure/quiz-catalog-repository.ts` | `getTypeMatchups` | タイプ相性データをcatalog DBから読み込む。 |
| `src/features/quiz/components/type-matchup-matrix.tsx` | `TypeMatchupMatrix` | 攻撃側x防御側の倍率表を表示する。 |
| `src/features/quiz/components/quiz-catalog-loader.tsx` | `QuizCatalogLoader` | クイズ開始に必要なカタログを読み込む。 |
| `src/features/quiz/components/quiz-game.tsx` | `QuizGame` | 問題、回答、スコア、ミス履歴、モードを管理する。 |
| `src/features/quiz/components/question-panel.tsx` | `QuestionPanel` | 問題文、選択肢、回答UIを表示する。 |
| `src/features/quiz/components/score-section.tsx` | `ScoreSection` | スコアと終了状態を表示する。 |
| `src/features/quiz/quiz-logic.ts` | `createQuestions`, `isExactAnswer` | 問題生成と回答判定を担当する。 |
| `src/features/quiz/storage/mistake-repository.ts` | ミス履歴関数 | user DBへミス情報を保存/削除する。 |

設計メモ:

- 問題生成と判定は `quiz-logic.ts` に分離し、UIから直接倍率ロジックを持たない。
- `QuizGame` は `quizMode`, `includeDualTypes`, `mistakeKeys` により出題対象を切り替える。
- タイプ相性表はヘッダーからモーダルでも使うため、クイズ画面専用にしない。

## 育成シミュレータ

| ファイル | 主要要素 | 責務 |
|---|---|---|
| `src/features/training/components/training-simulator-loader.tsx` | `TrainingSimulatorLoader` | ポケモン、性格、持ち物、ランキング用データを読み込む。 |
| `src/features/training/components/training-simulator.tsx` | `TrainingSimulator` | 編集状態、実数値、保存、ランキング、性格表を管理する。 |
| `src/features/training/infrastructure/training-catalog-repository.ts` | `getNatures`, `getHeldItems` | 育成用catalog DBデータを取得する。 |
| `src/features/training/infrastructure/training-build-repository.ts` | `saveTrainingBuild` など | 育成案とバトルチームのuser DB操作を担当する。 |

`TrainingSimulator` の主な状態:

| 状態 | 内容 |
|---|---|
| `nature` | 選択中の性格ID。 |
| `abilityPoints` | 能力ポイント。 |
| `moveIds` | 4枠の技ID。 |
| `itemId` | 持ち物ID。 |
| `abilityId` | 特性ID。 |
| `isSaveDialogOpen` | 保存ダイアログ表示状態。 |
| `rankingStatId` | 実数値順位モーダルで表示する能力。 |

## 保存済み育成案/バトルチーム

| ファイル | 主要要素 | 責務 |
|---|---|---|
| `src/features/training/components/saved-training-builds.tsx` | `SavedTrainingBuilds` | 育成案一覧、チーム作成、チーム編集を1コンポーネントで扱う。 |
| `src/features/training/infrastructure/training-build-repository.ts` | `getAllTrainingBuilds`, `saveBattleTeam` | user DB上の育成案/チーム操作。 |

設計メモ:

- `SavedTrainingBuilds` はページから渡されるモードにより、一覧表示、チーム新規作成、チーム編集を切り替える。
- チーム保存前に `validateBattleTeamBuilds` で体数、同一ポケモン、同一持ち物を検証する。

## ダメージ計算

| ファイル | 主要要素 | 責務 |
|---|---|---|
| `src/features/damage-calculator/components/damage-calculator-catalog-loader.tsx` | `DamageCalculatorCatalogLoader` | 計算用カタログを読み込む。 |
| `src/features/damage-calculator/components/damage-calculator.tsx` | `DamageCalculator` | 選択状態、補正、計算、履歴、モーダルを管理する。 |
| `src/features/damage-calculator/components/pokemon-combobox.tsx` | `PokemonCombobox` | ポケモン検索入力。 |
| `src/features/damage-calculator/application/smogon-damage-calculator.ts` | `SmogonDamageCalculator` | `@smogon/calc` への入力変換と補正適用。 |
| `src/features/damage-calculator/config/champions-damage-ruleset.ts` | `championsDamageCalculator` | Champions用ルールセットを設定した計算器。 |
| `src/features/damage-calculator/infrastructure/damage-calculator-catalog-repository.ts` | catalog取得関数 | 計算に必要なポケモン、持ち物、場条件を取得する。 |
| `src/features/damage-calculator/infrastructure/damage-history-repository.ts` | 履歴関数 | 最近使ったポケモンを保存/取得する。 |

設計メモ:

- `DamageCalculator` は入力状態を集約し、計算自体は `championsDamageCalculator.calculate` へ委譲する。
- 保存済み育成案を適用する場合は、`applyTrainingBuildToPokemon` で実数値、技、特性、持ち物を反映する。

## 対戦シミュレータ

| ファイル | 主要要素 | 責務 |
|---|---|---|
| `src/features/battle-simulator/components/battle-simulator.tsx` | `BattleSimulatorTeamSelect`, `BattleSimulator` | チーム選択と対戦本体を実装する。 |
| `src/features/battle-simulator/domain/battle-simulator-types.ts` | `BattleState`, `BattleCommand` | 対戦状態の型定義。 |

主要関数:

| 関数 | 内容 |
|---|---|
| `createBattleState` | 選択チームから初期対戦状態を作る。 |
| `startBattle` | `team-preview` から行動選択フェーズへ進める。 |
| `setPendingCommand` | プレイヤーごとの技/交代選択を保存する。 |
| `executeTurn` | 交代、技順、ダメージ、ひんし、勝敗を1ターン分処理する。 |
| `applySwitchCommand` | 交代を適用する。 |
| `applyMoveCommand` | 技を適用し、ダメージ計算器を呼ぶ。 |

設計メモ:

- 対戦エンジン専用ライブラリは使わず、現在は簡易ターン処理をコンポーネント内関数として実装している。
- ダメージ計算はダメージ計算機能の `championsDamageCalculator` を再利用する。

