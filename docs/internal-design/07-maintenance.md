# 保守運用メモ

## 変更時の確認コマンド

通常のコード変更では以下を確認する。

```powershell
npm.cmd run lint
npm.cmd run build
```

docsのみの変更では、必要に応じてMarkdownのリンクや表示を確認する。
現時点ではMarkdown専用lintは導入していない。

## Git運用

### コミット対象

通常コミットするもの:

- `src/` 配下の実装
- `docs/` 配下の設計書
- `database/` 配下の明示的なスキーマ/seed変更
- `scripts/` 配下の明示的な生成処理変更

注意するもの:

- `data/pokemon-lab.db`
- ビルドで再生成されただけのSQLite資産

これらは、明示的にDB更新が目的でない限りコミット対象から外す。

## ドキュメント構成

| 種別 | 場所 | 内容 |
|---|---|---|
| 外部設計 | `docs/external-design/` | 画面、機能、遷移、データの流れ、制約。 |
| 内部設計 | `docs/internal-design/` | コンポーネント、関数、DB、処理フロー、保守メモ。 |

## 内部設計更新タイミング

以下の変更をした場合は内部設計書も更新する。

- 新しい画面を追加した。
- DBテーブルや保存形式を変更した。
- 主要なリポジトリ関数を追加/変更した。
- ダメージ計算や対戦処理の仕様を変更した。
- PWA/Service Worker/SQLite資産生成の流れを変更した。

## 外部設計更新タイミング

以下の変更をした場合は外部設計書も更新する。

- 利用者から見える機能を追加/削除した。
- 画面遷移を変更した。
- UI上の入力/出力を変更した。
- 保存データの扱いが利用者に影響する形で変わった。
- 既存の制約が解消された、または新しい制約が増えた。

## 既知の注意点

### 文字コード

PowerShellの通常表示では、日本語Markdownが文字化けして見える場合がある。
内容確認時はUTF-8指定で読む。

```powershell
Get-Content -Encoding UTF8 docs\external-design\README.md
Get-Content -Encoding UTF8 docs\internal-design\README.md
```

### 対戦シミュレータ

現状は簡易エンジンであり、完全な対戦再現ではない。
命中、PP、優先度、状態異常、ランク変化などを追加する場合は、先に状態モデルを拡張する。

### ダメージ計算

`@smogon/calc` へ渡すデータ変換が仕様の中心になる。
ポケモン、技、特性、持ち物の追加/変更時は、以下を確認する。

- `DamageCalculatorPokemon`
- `DamageCalculatorMove`
- `DamageCalculatorHeldItem`
- `DamageCalculatorAbility`
- `SmogonDamageCalculator`
- `CHAMPIONS_DAMAGE_RULESET`
