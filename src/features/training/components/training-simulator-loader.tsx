"use client";

import { useEffect, useState } from "react";
import {
  getPokemonDetail,
  isChampionsForm,
  type PokemonDetail,
} from "@/infrastructure/database/pokemon-search-repository";
import {
  getTrainingPokemonStatProfiles,
  type TrainingPokemonStatProfile,
} from "../infrastructure/training-catalog-repository";
import { TrainingSimulator } from "./training-simulator";
import pageStyles from "@/app/pokemon/pokemon-search.module.css";

/**
 * 育成シミュレーターのClient Loader。
 * 指定フォームがChampions対象かを確認してから、編集画面へPokemonDetailを渡す。
 */
export function TrainingSimulatorLoader({
  pokemonId,
  initialBuildId,
}: {
  /** URL paramsから数値化したフォームID。 */
  pokemonId: number;
  /** 保存済み育成案から開いた場合に復元するID。 */
  initialBuildId?: number;
}) {
  const [pokemon, setPokemon] = useState<PokemonDetail | null>(null);
  const [statProfiles, setStatProfiles] = useState<
    TrainingPokemonStatProfile[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // 対象外フォームを弾くため、詳細取得とChampions対象判定を同時に行う。
  useEffect(() => {
    if (!Number.isInteger(pokemonId)) return;

    let active = true;
    void Promise.all([
      isChampionsForm(pokemonId),
      getPokemonDetail(pokemonId),
      getTrainingPokemonStatProfiles(),
    ])
      .then(([championsForm, detail, profiles]) => {
        if (!active) return;
        setPokemon(championsForm ? detail : null);
        setStatProfiles(profiles);
      })
      .catch((caught: unknown) => {
        console.error("育成シミュレーター用ポケモンを読み込めませんでした。", caught);
        if (active) setError("育成シミュレーター用ポケモンを読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [pokemonId]);

  if (!Number.isInteger(pokemonId)) {
    return <p className={pageStyles.empty}>育成対象のポケモンが見つかりませんでした。</p>;
  }

  if (!loaded) {
    return <p className={pageStyles.empty}>ポケモンを読み込んでいます…</p>;
  }

  if (error) {
    return <p className={pageStyles.loadError}>{error}</p>;
  }

  if (!pokemon) {
    return <p className={pageStyles.empty}>育成対象のポケモンが見つかりませんでした。</p>;
  }

  return (
    <TrainingSimulator
      pokemon={pokemon}
      statProfiles={statProfiles}
      initialBuildId={initialBuildId}
    />
  );
}
