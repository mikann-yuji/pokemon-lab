/**
 * このファイルの役割: ポケモンのタイプ名とタイプ相性データ構造を定義するドメイン層の型ファイル。
 */

// アプリ全体とDBで共通して使う、タイプの正式な表示順。
export const TYPE_NAMES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy",
] as const;

export type TypeName = (typeof TYPE_NAMES)[number];

// 攻撃する側から見たタイプ相性の共通データ構造。
type TypeMatchupSource = {
  name: TypeName;
  nameJa: string;
  superEffectiveAgainst: TypeName[];
  notVeryEffectiveAgainst: TypeName[];
  noEffectAgainst: TypeName[];
};

// 攻撃側の相性に、防御する側から見た相性を加えた共通データ構造。
export type TypeMatchup = TypeMatchupSource & {
  vulnerableTo: TypeName[];
  resistantTo: TypeName[];
  noEffectTo: TypeName[];
};
