# 状態管理と計算処理

## 状態管理の基本方針

- 画面内だけで完結する状態は `useState` で持つ。
- カタログ読み込み結果や派生データは `useMemo` で整形する。
- DB読み込みや履歴保存などの副作用は `useEffect` に閉じ込める。
- 複数画面で共有する永続状態は user DB を正とし、React Context は使わない。

## 育成実数値計算

ファイル: `src/features/training/components/training-simulator.tsx`

主要関数:

| 関数 | 内容 |
|---|---|
| `calculateActualStat` | 種族値、能力ポイント、性格補正から実数値を計算する。 |
| `rankCurrentValue` | 現在値が比較対象内で何位かを返す。 |
| `compareMoveUsageRate` | 技使用率の表示順を決める。 |

主要派生値:

| 変数 | 内容 |
|---|---|
| `actualStats` | 選択中の能力ポイント/性格を反映した実数値。 |
| `baseStatRanks` | 種族値ランキング。 |
| `statRankingRows` | 実数値比較モーダルに出す行。 |

保存時の流れ:

1. 編集中の `nature`, `itemId`, `abilityId`, `abilityPoints`, `moveIds` を集める。
2. `createTrainingBuildContentKey` で内容キーを作る。
3. `findTrainingBuildByContentKey` で同一内容を確認する。
4. `saveTrainingBuild` で保存する。
5. 保存完了後にトースト/保存名を更新する。

## ダメージ計算の状態

ファイル: `src/features/damage-calculator/components/damage-calculator.tsx`

主要状態:

| 状態 | 内容 |
|---|---|
| `attacker`, `defender` | `usePokemonSelection` が返す攻撃側/防御側ポケモン選択状態。 |
| `moveId` | 選択中の技。 |
| `weatherId`, `terrainId` | 場条件。 |
| `battleTeams`, `trainingBuilds` | 保存済みデータ。 |
| `selectedTeamIds`, `selectedBuildIds` | チーム/育成案からの選択状態。 |
| `statAdjustments` | 能力ポイント、ランク、性格補正。 |
| `abilityConditionEnabled` | 手動条件付き特性の有効/無効。 |
| `metronomeConsecutiveUseCount` | メトロノーム系補正の連続回数。 |

主要関数:

| 関数 | 内容 |
|---|---|
| `createDefaultAdjustmentState` | 能力補正状態の初期値を作る。 |
| `applyStatAdjustment` | ポケモンに能力補正を反映する。 |
| `applyHeldItem` | 持ち物をポケモンへ反映する。 |
| `applyAbility` | 特性をポケモンへ反映する。 |
| `applyTrainingBuildToPokemon` | 保存済み育成案を計算用ポケモンへ変換適用する。 |
| `createSpeedComparisonRows` | 素早さ比較モーダル用の行を作る。 |

計算結果:

- `useMemo` 内で `championsDamageCalculator.calculate` を呼ぶ。
- 入力不足や計算失敗時は `error` を返し、UIで表示する。
- 計算成功時は通常/急所の `DamageCalculation` を表示する。

## `SmogonDamageCalculator`

ファイル: `src/features/damage-calculator/application/smogon-damage-calculator.ts`

公開型:

| 型 | 内容 |
|---|---|
| `DamageCalculationInput` | 攻撃側、防御側、技、場条件、手動条件を含む入力。 |
| `DamageCalculation` | ダメージ範囲、割合、KO目安などの結果。 |
| `DamageCalculatorRuleset` | 世代、レベル、個体値、努力値、補正フック。 |

主要処理:

1. アプリ内のポケモン/技データを `@smogon/calc` の `Pokemon` / `Move` に変換する。
2. タイプ相性、持ち物補正、特性補正、天候/フィールドを適用する。
3. `@smogon/calc` の結果を取得する。
4. アプリ用にダメージ配列、最小/最大、HP割合、KO表示を整形する。

補正関数:

| 関数 | 内容 |
|---|---|
| `getHeldItemPowerMultiplier` | 技威力にかかる持ち物補正。 |
| `getAbilityPowerMultiplier` | 技威力にかかる特性補正。 |
| `getAbilityAttackingStatMultiplier` | 攻撃/特攻にかかる特性補正。 |
| `getReceivedDamageItemMultiplier` | 被ダメージにかかる持ち物補正。 |
| `getAbilityReceivedDamageMultiplier` | 被ダメージにかかる特性補正。 |
| `scaleDamage` | ダメージ配列へ倍率を適用する。 |

## 対戦シミュレータ状態

型ファイル: `src/features/battle-simulator/domain/battle-simulator-types.ts`

状態の中心:

```ts
export type BattleState = {
  id: string;
  phase: "team-preview" | "command" | "finished";
  turn: number;
  players: Record<BattlePlayerId, BattlePlayerState>;
  field: {
    weatherId: string;
    terrainId: string;
  };
  pendingCommands: Record<BattlePlayerId, BattleCommand | null>;
  log: BattleLogEntry[];
};
```

ターン処理:

1. Player 1/2 の `pendingCommands` が揃う。
2. `executeTurn` を呼ぶ。
3. 交代コマンドを先に処理する。
4. 技コマンドを素早さ順に並べる。
5. `applyMoveCommand` が `championsDamageCalculator` を呼ぶ。
6. 平均ダメージをHPへ反映する。
7. ひんし判定、控え自動選出、勝敗判定を行う。
8. 未決着なら次ターンへ進む。

UI状態:

| 状態 | 内容 |
|---|---|
| `battleState` | 対戦全体の状態。 |
| `activeCommandPlayer` | 行動選択タブで表示中のプレイヤー。 |
| `switchModalPlayer` | 交代モーダルを開いているプレイヤー。 |
| `loaded`, `loadError` | catalog/user DB読み込み状態。 |

## クイズ状態

ファイル: `src/features/quiz/components/quiz-game.tsx`

主要状態:

| 状態 | 内容 |
|---|---|
| `questions` | 現在の出題セット。 |
| `currentQuestionIndex` | 表示中の問題番号。 |
| `score` | 正解数。 |
| `selectedAnswers` | 選択中のタイプ回答。 |
| `answered` | 回答済みかどうか。 |
| `feedback` | 正誤メッセージ。 |
| `includeDualTypes` | 複合タイプ問題を含めるか。 |
| `quizMode` | 全問/ミス復習などのモード。 |
| `mistakeKeys` | user DBから読み込んだミス問題キー。 |

問題生成:

- `createQuestions` がタイプ相性データから問題を作る。
- `getQuestionKey` がミス履歴保存用キーを作る。
- `isExactAnswer` が選択回答と正解タイプ集合を比較する。
