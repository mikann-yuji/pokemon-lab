"use client";

import { useEffect, useState } from "react";
import {
  getPokemonDetail,
  isChampionsForm,
  type PokemonDetail,
} from "@/infrastructure/database/pokemon-search-repository";
import { TrainingSimulator } from "./training-simulator";
import pageStyles from "@/app/pokemon/pokemon-search.module.css";

export function TrainingSimulatorLoader({
  pokemonId,
  initialBuildId,
}: {
  pokemonId: number;
  initialBuildId?: number;
}) {
  const [pokemon, setPokemon] = useState<PokemonDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(pokemonId)) return;

    let active = true;
    void Promise.all([isChampionsForm(pokemonId), getPokemonDetail(pokemonId)])
      .then(([championsForm, detail]) => {
        if (!active) return;
        setPokemon(championsForm ? detail : null);
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
      initialBuildId={initialBuildId}
    />
  );
}
