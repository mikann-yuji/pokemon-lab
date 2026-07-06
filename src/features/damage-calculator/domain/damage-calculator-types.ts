/**
 * このファイルの役割:
 * ダメージ計算機能の各層で共有する、最小限のデータ形式を定義する。
 *
 * domainフォルダの型はReact、SQLite、@smogon/calcの都合を持ち込まない。
 * そのため、DBや計算ライブラリを将来変更しても、この型を境界として影響を抑えられる。
 */

import type { TypeName } from "@/domain/type-matchup";

/**
 * ダメージを与える技の情報。
 * 変化技はダメージ計算に使わないため、physicalとspecialだけを扱う。
 */
export type DamageCalculatorMove = {
  /** PokeAPI・SQLiteで共通利用する英語ID。例: thunderbolt */
  id: string;
  /** 画面へ表示する日本語名。例: 10まんボルト */
  name: string;
  /** 技のタイプ。例: Electric */
  typeName: TypeName;
  /** 攻撃と防御、特攻と特防のどちらを使うかを表す。 */
  damageClass: "physical" | "special";
  /** 技の基本威力。 */
  power: number;
};

/**
 * 1フォーム分のダメージ計算用ポケモン情報。
 * ページ生成時にSQLiteから読み込み、ブラウザへ渡すのでオフラインでも利用できる。
 */
export type DamageCalculatorPokemon = {
  /** formsテーブルの主キー。 */
  id: number;
  /** ライブラリとの名前解決にも使う英語名。 */
  name: string;
  /** 検索候補と結果に表示する日本語名。 */
  nameJa: string;
  /** 公式アートワーク。画像がないフォームではnull。 */
  imageUrl: string | null;
  /** kg単位の重さ。一部の技の計算に利用される。 */
  weightKg: number;
  /** 1つまたは2つのタイプ。 */
  types: TypeName[];
  /** hp、attackなど、SQLiteのstat_idをキーにした種族値。 */
  stats: Record<string, number>;
  /** 育成案から復元した実数値。指定時はダメージ計算で種族値計算より優先する。 */
  actualStats?: Record<string, number>;
  /** このフォームが利用できるダメージ技。 */
  moves: DamageCalculatorMove[];
};
