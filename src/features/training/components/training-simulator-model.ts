import { normalizePokemonSearchText } from "@/domain/pokemon-name-search";
import type { TypeName } from "@/domain/type-matchup";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import type { TrainingBuild } from "../infrastructure/training-build-repository";
import type { TrainingPokemonStatProfile } from "../infrastructure/training-catalog-repository";

export const STAT_IDS = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"];
export const STAT_NAMES: Record<string, string> = {
  hp: "HP", attack: "こうげき", defense: "ぼうぎょ",
  "special-attack": "とくこう", "special-defense": "とくぼう", speed: "すばやさ",
};
export type StatRankingRow = {
  profile: TrainingPokemonStatProfile;
  uninvested: number;
  maximum: number;
};
export type DisplayStatRankingRow = {
  id: string;
  name: string;
  searchName: string;
  uninvested: number;
  maximum: number;
  isTrainingTarget: boolean;
};
export type StatCompareMode = "uninvested" | "maximum";
export type MatchupSearchOption =
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
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * (nature ? 1.1 : 1));
}

export function rankCurrentValue(values: number[], currentValue: number) {
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
  const leftRate = left.usageRate ?? -1;
  const rightRate = right.usageRate ?? -1;
  if (leftRate !== rightRate) return rightRate - leftRate;
  return left.name.localeCompare(right.name, "ja") || left.id.localeCompare(right.id);
}

export function createMatchupSearchOptions(
  pokemonCatalog: TrainingPokemonStatProfile[],
  builds: TrainingBuild[],
): MatchupSearchOption[] {
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


