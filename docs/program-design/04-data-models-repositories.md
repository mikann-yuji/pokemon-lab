# データモデルとリポジトリ

## 共通ドメイン型

| ファイル | 型/関数 | 内容 |
|---|---|---|
| `src/domain/type-matchup.ts` | `TYPE_NAMES`, `TypeName`, `TypeMatchup` | タイプ名とタイプ相性データ構造。 |
| `src/domain/pokemon-name-search.ts` | `normalizePokemonSearchText`, `pokemonNameIncludes` | ひらがな/カタカナ/英字を含む検索正規化。 |
| `src/presentation/pokemon-type-colors.ts` | タイプ色定義 | UI表示用のタイプ色。 |

## catalog DBリポジトリ

### ポケモン検索

ファイル: `src/infrastructure/database/pokemon-search-repository.ts`

主な型:

| 型 | 内容 |
|---|---|
| `PokemonSearchResult` | 一覧表示用のポケモン情報。 |
| `PokemonAbility` | 特性情報。 |
| `PokemonStat` | 種族値/能力値情報。 |
| `PokemonMove` | 技情報。 |
| `PokemonDetail` | 詳細画面用に集約したポケモン情報。 |

設計:

- 一覧取得と詳細取得を同一リポジトリに置く。
- SQL結果を画面で使いやすい型へ変換して返す。
- 名前検索は `pokemonNameIncludes` とDB側検索条件を組み合わせる。

### 育成カタログ

ファイル: `src/features/training/infrastructure/training-catalog-repository.ts`

主な型/関数:

| 型/関数 | 内容 |
|---|---|
| `HeldItem` | 育成画面用の持ち物。 |
| `Nature` | 性格と補正対象能力。 |
| `TrainingPokemon` | 育成対象ポケモンの基本情報。 |
| `TrainingPokemonStatProfile` | 種族値ランキング用の能力情報を含む。 |
| `getNatures` | 性格一覧を取得する。 |
| `getTrainingPokemonCatalog` | 育成対象ポケモン一覧を取得する。 |
| `getTrainingPokemonStatProfiles` | 実数値順位用の比較データを取得する。 |
| `getHeldItems` | 持ち物一覧を取得する。 |

### ダメージ計算カタログ

ファイル: `src/features/damage-calculator/infrastructure/damage-calculator-catalog-repository.ts`

主な関数:

| 関数 | 内容 |
|---|---|
| `getChampionsDamageCalculatorPokemon` | Champions対象ポケモン、タイプ、技、特性を取得する。 |
| `getChampionsDamageCalculatorHeldItems` | 持ち物とダメージ補正を取得する。 |
| `getChampionsDamageFieldConditions` | 天候/フィールド条件を取得する。 |

## user DBリポジトリ

### 育成案

ファイル: `src/features/training/infrastructure/training-build-repository.ts`

型:

```ts
export type TrainingBuild = {
  id?: number;
  name: string;
  contentKey: string;
  pokemonId: number;
  nature: string;
  itemId: string;
  abilityId: string;
  abilityPoints: Record<string, number>;
  moveIds: string[];
  updatedAt: number;
};
```

主な関数:

| 関数 | 内容 |
|---|---|
| `createTrainingBuildContentKey` | 育成案の同一内容判定キーを作る。 |
| `loadLatestTrainingBuild` | 指定ポケモンの最新育成案を取得する。 |
| `loadTrainingBuild` | ID指定で育成案を取得する。 |
| `getAllTrainingBuilds` | 全育成案を更新日時降順で取得する。 |
| `findTrainingBuildByContentKey` | 同一内容の育成案を探す。 |
| `saveTrainingBuild` | 育成案を保存する。 |

保存方針:

- `abilityPoints` と `moveIds` はJSON文字列として保存する。
- 読み込み時は `parseJson` でfallback付き変換を行う。
- `contentKey` は保存前に同一内容チェックへ使う。

### バトルチーム

型:

```ts
export type BattleTeam = {
  id?: number;
  name: string;
  buildIds: number[];
  updatedAt: number;
};
```

主な関数:

| 関数 | 内容 |
|---|---|
| `validateBattleTeamBuilds` | チーム制約を検証する。 |
| `getAllBattleTeams` | 全チームを取得する。 |
| `saveBattleTeam` | 新規チームを保存する。 |
| `updateBattleTeam` | 既存チームを更新する。 |
| `deleteBattleTeam` | チームを削除する。 |

制約:

- 1〜6体。
- 同一ポケモン不可。
- 持ち物がある場合は同一持ち物不可。

### ダメージ履歴

ファイル: `src/features/damage-calculator/infrastructure/damage-history-repository.ts`

型:

| 型 | 内容 |
|---|---|
| `DamageHistorySide` | `attacker` または `defender`。 |
| `DamageHistoryRecord` | 履歴に保存するポケモンID、名前、side、更新日時。 |

用途:

- 攻撃側/防御側ごとに最近使ったポケモンを保存する。
- ダメージ計算画面の再選択を速くする。

### クイズミス履歴

ファイル: `src/features/quiz/storage/mistake-repository.ts`

用途:

- `getQuestionKey` で作成した問題キーを保存する。
- 復習モードでミス問題だけを出題できるようにする。

## DB生成用テーブル

catalog DB は `database/migrations/` と `database/seeds/` から生成する。

代表テーブル:

| 系統 | テーブル |
|---|---|
| タイプ | `types`, `type_matchups` |
| ポケモン | `species`, `forms`, `form_types`, `form_stats`, `form_abilities`, `form_moves` |
| 技/特性 | `moves`, `abilities`, `move_learn_methods`, `version_groups` |
| Champions | `champions_forms`, `champions_items`, `natures`, `champions_form_move_usage` |
| ダメージ補正 | `champions_item_damage_modifiers`, `champions_ability_damage_modifiers`, `champions_damage_weathers`, `champions_damage_terrains` |
