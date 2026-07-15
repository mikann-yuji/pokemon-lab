import { normalizePokemonSearchText } from "@/domain/pokemon-name-search";
import type { TypeName } from "@/domain/type-matchup";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import type { TrainingBuild } from "../infrastructure/training-build-repository";
import type { TrainingPokemonStatProfile } from "../infrastructure/training-catalog-repository";

// 育成シミュレータで共有する「表示名・計算式・検索候補生成」をまとめたモデル層。
// UI部品から細かい式や検索用データ構築を追わなくて済むよう、このファイルに寄せている。

// 画面の能力値は必ずこの順番で並べる。CSVやDBの並びに引っ張られないための固定順。
export const STAT_IDS = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"];
export const STAT_NAMES: Record<string, string> = {
  hp: "HP", attack: "こうげき", defense: "ぼうぎょ",
  "special-attack": "とくこう", "special-defense": "とくぼう", speed: "すばやさ",
};
export type StatRankingRow = {
  // 種族値ランキングの元データ。表示用の検索名などは後段で足す。
  profile: TrainingPokemonStatProfile;
  uninvested: number;
  maximum: number;
};
export type DisplayStatRankingRow = {
  // ランキングモーダルで実際に表示・検索する1行。
  // 育成中ポケモン自身も同じ表に混ぜるため、isTrainingTargetを持つ。
  id: string;
  name: string;
  searchName: string;
  uninvested: number;
  maximum: number;
  isTrainingTarget: boolean;
};
export type StatCompareMode = "uninvested" | "maximum";
export type MatchupSearchOption =
  // 相性メモの検索候補。素のポケモンと保存済み育成案を同じリストで扱う。
  | {
      key: string;
      kind: "pokemon";
      pokemonId: number;
      name: string;
      subLabel: string;
      searchName: string;
      buildId: null;
    }
  | {
      key: string;
      kind: "build";
      pokemonId: number;
      name: string;
      subLabel: string;
      searchName: string;
      buildId: number;
    };

export const TYPE_LABELS: Record<TypeName, string> = {
  Normal: "ノーマル",
  Fire: "ほのお",
  Water: "みず",
  Electric: "でんき",
  Grass: "くさ",
  Ice: "こおり",
  Fighting: "かくとう",
  Poison: "どく",
  Ground: "じめん",
  Flying: "ひこう",
  Psychic: "エスパー",
  Bug: "むし",
  Rock: "いわ",
  Ghost: "ゴースト",
  Dragon: "ドラゴン",
  Dark: "あく",
  Steel: "はがね",
  Fairy: "フェアリー",
};

/** 6能力すべてに同じ初期値を入れた能力ポイント表を作る。 */
export const initialStats = (value: number) =>
  Object.fromEntries(STAT_IDS.map((id) => [id, value]));

export function calculateActualStat(baseStat: number, statId: string, point = 0, nature = false) {
  // Champions用の簡易実数値。Lv.50、個体値31、能力ポイントを直接加算する前提。
  // HPだけ式が違うので、先に分岐してから他能力へ性格補正を掛ける。
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * (nature ? 1.1 : 1));
}

export function rankCurrentValue(values: number[], currentValue: number) {
  // 自分より高い値の数+1が順位。タイは同順位として扱う。
  return 1 + values.filter((value) => value > currentValue).length;
}

export function formatUsageRate(usageRate: number | null) {
  return usageRate === null ? "" : ` / 採用率 ${usageRate.toFixed(1)}%`;
}

export function formatMovePower(move: PokemonDetail["moves"][number]) {
  return move.power === null ? "変化" : `威力 ${move.power}`;
}

export function compareMoveUsageRate(
  left: PokemonDetail["moves"][number],
  right: PokemonDetail["moves"][number],
) {
  // 技リストは採用率の高い順に並べ、採用率が同じなら名前で安定ソートする。
  const leftRate = left.usageRate ?? -1;
  const rightRate = right.usageRate ?? -1;
  if (leftRate !== rightRate) return rightRate - leftRate;
  return left.name.localeCompare(right.name, "ja") || left.id.localeCompare(right.id);
}

export function createMatchupSearchOptions(
  pokemonCatalog: TrainingPokemonStatProfile[],
  builds: TrainingBuild[],
): MatchupSearchOption[] {
  // 相性メモの検索対象は「全ポケモン」と「保存済み育成案」の合算。
  // どちらを選んでも同じUIでメモ保存できるよう、共通のoption型に変換する。
  const pokemonById = new Map(pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]));
  const pokemonOptions: MatchupSearchOption[] = pokemonCatalog.map((pokemon) => ({
    key: `pokemon-${pokemon.id}`,
    kind: "pokemon",
    pokemonId: pokemon.id,
    name: pokemon.nameJa,
    subLabel: `チャンピオンズ登場ポケモン / ${pokemon.name}`,
    searchName: normalizePokemonSearchText(`${pokemon.nameJa} ${pokemon.name}`),
    buildId: null,
  }));
  const buildOptions: MatchupSearchOption[] = builds.flatMap((build) => {
    if (build.id === undefined) return [];
    const pokemon = pokemonById.get(build.pokemonId);
    if (!pokemon) return [];
    return [
      {
        key: `build-${build.id}`,
        kind: "build" as const,
        pokemonId: build.pokemonId,
        name: build.name,
        subLabel: `${pokemon.nameJa}の保存済み育成案`,
        searchName: normalizePokemonSearchText(
          `${build.name} ${pokemon.nameJa} ${pokemon.name}`,
        ),
        buildId: build.id,
      },
    ];
  });
  return [...pokemonOptions, ...buildOptions];
}

