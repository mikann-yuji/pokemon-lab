"use client";

import { useEffect, useState } from "react";
import { DamageCalculator } from "./damage-calculator";
import type { DamageCalculatorPokemon } from "../domain/damage-calculator-types";
import { getChampionsDamageCalculatorPokemon } from "../infrastructure/damage-calculator-catalog-repository";
import styles from "../styles/damage-calculator.module.css";

/**
 * ダメージ計算画面のClient Loader。
 * catalog.dbから計算対象ポケモンを読み、読み込み状態とエラーを画面へ反映する。
 */
export function DamageCalculatorCatalogLoader() {
  const [pokemonCatalog, setPokemonCatalog] = useState<
    DamageCalculatorPokemon[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  // ダメージ計算に必要な全カタログを1回だけ読み、以降の検索と計算はローカル配列で行う。
  useEffect(() => {
    let active = true;
    void getChampionsDamageCalculatorPokemon()
      .then((catalog) => {
        if (!active) return;
        setPokemonCatalog(catalog);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("catalog.dbからダメージ計算用データを読み込めませんでした。", error);
        if (active) {
          setLoadError("ダメージ計算用データを読み込めませんでした。");
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
    return (
      <p className={styles.statusMessage}>
        ダメージ計算用データを読み込んでいます…
      </p>
    );
  }

  return <DamageCalculator pokemonCatalog={pokemonCatalog} />;
}
