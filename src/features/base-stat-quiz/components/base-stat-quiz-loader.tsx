"use client";

import { useEffect, useState } from "react";
import type {
  BaseStatBattleFormat,
  BaseStatPokemon,
} from "../base-stat-quiz-logic";
import { getBaseStatQuizPokemon } from "../infrastructure/base-stat-quiz-repository";
import BaseStatQuizGame from "./base-stat-quiz-game";
import styles from "../styles/base-stat-quiz.module.css";

export default function BaseStatQuizLoader() {
  const [pokemonByFormat, setPokemonByFormat] = useState<
    Record<BaseStatBattleFormat, BaseStatPokemon[]>
  >({ single: [], double: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getBaseStatQuizPokemon("single"),
      getBaseStatQuizPokemon("double"),
    ])
      .then(([single, double]) => {
        if (!active) return;
        setPokemonByFormat({ single, double });
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        console.error("種族値クイズのデータを読み込めませんでした。", cause);
        if (!active) return;
        setError("種族値クイズのデータを読み込めませんでした。");
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) return <p className={styles.status}>クイズデータを読み込んでいます…</p>;
  if (error) return <p className={styles.status} role="alert">{error}</p>;
  return <BaseStatQuizGame pokemonByFormat={pokemonByFormat} />;
}
