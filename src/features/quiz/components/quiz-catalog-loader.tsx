"use client";

import { useEffect, useState } from "react";
import type { TypeMatchup } from "@/domain/type-matchup";
import QuizGame from "./quiz-game";
import {
  getPokemonImagesByType,
  getTypeMatchups,
} from "../infrastructure/quiz-catalog-repository";
import { createQuestions, type PokemonImagesByType } from "../quiz-logic";
import styles from "../styles/quiz-page.module.css";

/**
 * クイズ画面のClient Loader。
 * catalog.dbからタイプ相性と画像候補を読み、クイズ本体へ渡す。
 */
export default function QuizCatalogLoader() {
  const [typeMatchups, setTypeMatchups] = useState<TypeMatchup[]>([]);
  const [pokemonImagesByType, setPokemonImagesByType] =
    useState<PokemonImagesByType>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  // クイズ本体に必要な読み取り専用カタログを初回マウント後にまとめて取得する。
  useEffect(() => {
    let active = true;
    void Promise.all([getTypeMatchups(), getPokemonImagesByType()])
      .then(([loadedTypeMatchups, loadedPokemonImagesByType]) => {
        if (!active) return;
        setTypeMatchups(loadedTypeMatchups);
        setPokemonImagesByType(loadedPokemonImagesByType);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("catalog.dbからクイズデータを読み込めませんでした。", error);
        if (active) {
          setLoadError("クイズデータを読み込めませんでした。");
          setLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadError) {
    return (
      <p className={styles.statusMessage} role="alert">
        {loadError}
      </p>
    );
  }

  if (!loaded) {
    return <p className={styles.statusMessage}>クイズデータを読み込んでいます…</p>;
  }

  const initialQuestions = createQuestions(typeMatchups, {
    pokemonImagesByType,
  });

  return (
    <QuizGame
      initialQuestions={initialQuestions}
      typeMatchups={typeMatchups}
      pokemonImagesByType={pokemonImagesByType}
    />
  );
}
