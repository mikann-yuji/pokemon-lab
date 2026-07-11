"use client";

import { useEffect, useState } from "react";
import { DamageCalculator } from "./damage-calculator";
import { ReverseDamageCalculator } from "./reverse-damage-calculator";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import {
  getChampionsDamageFieldConditions,
  getChampionsDamageCalculatorHeldItems,
  getChampionsDamageCalculatorPokemon,
} from "../infrastructure/damage-calculator-catalog-repository";
import styles from "../styles/damage-calculator.module.css";

type CalculatorMode = "normal" | "reverse";

/**
 * ダメージ計算画面のClient Loader。
 * catalog.dbから計算対象ポケモンを読み、読み込み状態とエラーを画面へ反映する。
 */
export function DamageCalculatorCatalogLoader() {
  const [pokemonCatalog, setPokemonCatalog] = useState<
    DamageCalculatorPokemon[]
  >([]);
  const [heldItems, setHeldItems] = useState<DamageCalculatorHeldItem[]>([]);
  const [weathers, setWeathers] = useState<DamageCalculatorWeather[]>([]);
  const [terrains, setTerrains] = useState<DamageCalculatorTerrain[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<CalculatorMode>("normal");

  // ダメージ計算に必要な全カタログを1回だけ読み、以降の検索と計算はローカル配列で行う。
  useEffect(() => {
    let active = true;
    void Promise.all([
      getChampionsDamageCalculatorPokemon(),
      getChampionsDamageCalculatorHeldItems(),
      getChampionsDamageFieldConditions(),
    ])
      .then(([catalog, items, fieldConditions]) => {
        if (!active) return;
        setPokemonCatalog(catalog);
        setHeldItems(items);
        setWeathers(fieldConditions.weathers);
        setTerrains(fieldConditions.terrains);
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

  return (
    <>
      <div className={styles.calculatorTabs} aria-label="ダメージ計算モード">
        <button
          type="button"
          aria-pressed={mode === "normal"}
          onClick={() => setMode("normal")}
        >
          通常計算
        </button>
        <button
          type="button"
          aria-pressed={mode === "reverse"}
          onClick={() => setMode("reverse")}
        >
          逆引き計算
        </button>
      </div>
      {mode === "normal" ? (
        <DamageCalculator
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          weathers={weathers}
          terrains={terrains}
        />
      ) : (
        <ReverseDamageCalculator
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          weathers={weathers}
          terrains={terrains}
        />
      )}
    </>
  );
}
