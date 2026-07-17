"use client";

import { useEffect, useState } from "react";
import type {
  MoveQuizBattleFormat,
  MoveQuizPokemon,
} from "../move-quiz-logic";
import { getMoveQuizPokemon } from "../infrastructure/move-quiz-repository";
import MoveQuizGame from "./move-quiz-game";
import styles from "../styles/move-quiz.module.css";

export default function MoveQuizLoader() {
  const [pokemonByFormat, setPokemonByFormat] = useState<
    Record<MoveQuizBattleFormat, MoveQuizPokemon[]>
  >({ single: [], double: [] });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getMoveQuizPokemon("single"),
      getMoveQuizPokemon("double"),
    ])
      .then(([single, double]) => {
        if (!active) return;
        setPokemonByFormat({ single, double });
        setLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("ポケモン技クイズのデータを読み込めませんでした。", error);
        if (!active) return;
        setLoadError("ポケモン技クイズのデータを読み込めませんでした。");
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) {
    return <p className={styles.status}>クイズデータを読み込んでいます…</p>;
  }
  if (loadError) {
    return (
      <p className={styles.status} role="alert">
        {loadError}
      </p>
    );
  }
  return <MoveQuizGame pokemonByFormat={pokemonByFormat} />;
}
