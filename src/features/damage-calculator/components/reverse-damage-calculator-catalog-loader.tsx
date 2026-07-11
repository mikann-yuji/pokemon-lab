"use client";

import { useEffect, useState } from "react";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import {
  getChampionsDamageCalculatorHeldItems,
  getChampionsDamageCalculatorPokemon,
  getChampionsDamageFieldConditions,
} from "../infrastructure/damage-calculator-catalog-repository";
import { ReverseDamageCalculator } from "./reverse-damage-calculator";
import styles from "../styles/reverse-damage-calculator.module.css";

export function ReverseDamageCalculatorCatalogLoader() {
  const [pokemonCatalog, setPokemonCatalog] = useState<
    DamageCalculatorPokemon[]
  >([]);
  const [heldItems, setHeldItems] = useState<DamageCalculatorHeldItem[]>([]);
  const [weathers, setWeathers] = useState<DamageCalculatorWeather[]>([]);
  const [terrains, setTerrains] = useState<DamageCalculatorTerrain[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

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
        console.error("Failed to load reverse damage calculator catalog.", error);
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
    return <p className={styles.statusMessage}>データを読み込んでいます...</p>;
  }

  return (
    <ReverseDamageCalculator
      pokemonCatalog={pokemonCatalog}
      heldItems={heldItems}
      weathers={weathers}
      terrains={terrains}
    />
  );
}
