# 実行入口とルーティング

## アプリケーション入口

| ファイル | 種別 | 役割 |
|---|---|---|
| `src/app/layout.tsx` | Server Component | 全ページ共通のHTML骨格、メタデータ、viewport、ヘッダー、戻るボタン、Service Worker登録を配置する。 |
| `src/app/globals.css` | Global CSS | 全体のリセット、本文フォント、背景、ヘッダー高さ、横はみ出し抑制を定義する。 |
| `src/app/page.tsx` | Server Component | ホーム画面を表示し、主要機能への導線を提供する。 |
| `src/components/pwa/service-worker-register.tsx` | Client Component | 本番環境でService Workerを登録し、開発環境では既存Service Workerとキャッシュを整理する。 |

## ルート一覧

| URL | ページファイル | 主な実装 |
|---|---|---|
| `/` | `src/app/page.tsx` | ホーム |
| `/pokemon` | `src/app/pokemon/page.tsx` | `PokemonSearchForm`, `PokemonResults` |
| `/pokemon/[id]` | `src/app/pokemon/[id]/page.tsx` | `PokemonDetailLoader`, `PokemonDetail` |
| `/training` | `src/app/training/page.tsx` | 育成対象検索 |
| `/training/[id]` | `src/app/training/[id]/page.tsx` | `TrainingSimulatorLoader`, `TrainingSimulator` |
| `/training-builds` | `src/app/training-builds/page.tsx` | 保存済み育成案一覧 |
| `/battle-team` | `src/app/battle-team/page.tsx` | バトルチーム一覧 |
| `/battle-team/new` | `src/app/battle-team/new/page.tsx` | 新規チーム作成 |
| `/battle-team/[id]` | `src/app/battle-team/[id]/page.tsx` | 既存チーム編集 |
| `/damage-calculator` | `src/app/damage-calculator/page.tsx` | `DamageCalculatorCatalogLoader`, `DamageCalculator` |
| `/battle-simulator` | `src/app/battle-simulator/page.tsx` | `BattleSimulatorTeamSelect` |
| `/battle-simulator/battle` | `src/app/battle-simulator/battle/page.tsx` | `BattleSimulator` |
| `/quiz` | `src/app/quiz/page.tsx` | `QuizCatalogLoader`, `QuizGame` |
| `/sqlite-diagnostics` | `src/app/sqlite-diagnostics/page.tsx` | `SqliteDiagnostics` |

## Server Component と Client Component の境界

基本方針:

- ページファイルは URL パラメータと大枠レイアウトを担当する。
- ブラウザSQLite、フォーム操作、モーダル、ローカル状態を扱う実処理は Client Component に寄せる。
- catalog DB もブラウザ上の SQLite Worker 経由で読むため、データ取得ローダーは多くが Client Component になる。

代表例:

| 境界 | 内容 |
|---|---|
| `src/app/damage-calculator/page.tsx` -> `DamageCalculatorCatalogLoader` | ページ入口から計算用カタログ読み込みへ渡す。 |
| `src/app/training/[id]/page.tsx` -> `TrainingSimulatorLoader` | URL上のポケモンID/育成案IDをローダーへ渡す。 |
| `src/app/quiz/page.tsx` -> `QuizCatalogLoader` | クイズ用タイプ相性データを読み込む。 |
| `src/app/battle-simulator/battle/page.tsx` -> `BattleSimulator` | search params のチームIDを対戦画面へ渡す。 |

## 共通レイアウト部品

| ファイル | 主要関数/コンポーネント | 設計メモ |
|---|---|---|
| `src/components/layout/site-header.tsx` | `SiteHeader` | ナビゲーション、モバイルメニュー、タイプ相性表ボタンを持つ。 |
| `src/components/layout/type-matchup-modal-button.tsx` | `TypeMatchupModalButton` | catalog DB からタイプ相性を読み、`createPortal` でモーダルを表示する。 |
| `src/components/layout/back-button.tsx` | `BackButton` | ブラウザ履歴に戻る固定ボタン。 |
| `src/features/quiz/components/type-matchup-matrix.tsx` | `TypeMatchupMatrix` | 全タイプ相性を表形式で表示する。 |

## ルーティング上の注意

- `battle-team` は一覧、新規、編集で同じ `SavedTrainingBuilds` を使い、ページ側からモードを渡す。
- `battle-simulator` はチーム選択画面と対戦画面を分ける。対戦画面はURL queryからPlayer 1/2のチームIDを受け取る。
- `training/[id]` はポケモンIDを主キーとして開き、必要に応じて育成案IDを読み込む設計にする。
- docsのみの変更時は `data/pokemon-lab.db` の生成差分をコミットしない。

