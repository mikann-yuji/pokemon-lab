"use client";

import { useEffect, useState } from "react";
import { DamageCalculator } from "./damage-calculator";
import { ReverseDamageCalculator } from "./reverse-damage-calculator";
import { useDamageCalculatorCatalogStore } from "./damage-calculator-catalog-store";
import styles from "../styles/damage-calculator.module.css";

type CalculatorMode = "normal" | "reverse";

/**
 * Client-side loader for the static damage-calculator catalog.
 * The actual catalog data lives in a Zustand store so route re-entry and
 * normal/reverse tab switches can reuse the first catalog.db read.
 */
export function DamageCalculatorCatalogLoader() {
  const [mode, setMode] = useState<CalculatorMode>("normal");
  const pokemonCatalog = useDamageCalculatorCatalogStore(
    (state) => state.pokemonCatalog,
  );
  const heldItems = useDamageCalculatorCatalogStore((state) => state.heldItems);
  const weathers = useDamageCalculatorCatalogStore((state) => state.weathers);
  const terrains = useDamageCalculatorCatalogStore((state) => state.terrains);
  const typeEffectivenessSource = useDamageCalculatorCatalogStore(
    (state) => state.typeEffectivenessSource,
  );
  const status = useDamageCalculatorCatalogStore((state) => state.status);
  const error = useDamageCalculatorCatalogStore((state) => state.error);
  const ensureLoaded = useDamageCalculatorCatalogStore(
    (state) => state.ensureLoaded,
  );

  useEffect(() => {
    void ensureLoaded().catch((caught: unknown) => {
      console.error("catalog.dbからダメージ計算用データを読み込めませんでした。", caught);
    });
  }, [ensureLoaded]);

  if (status === "error") {
    return (
      <p className={styles.statusMessage} role="alert">
        ダメージ計算用データを読み込めませんでした。
        {error ? ` (${error})` : ""}
      </p>
    );
  }

  if (status !== "loaded" || !typeEffectivenessSource) {
    return (
      <p className={styles.statusMessage}>
        ダメージ計算用データを読み込んでいます...
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
          typeEffectivenessSource={typeEffectivenessSource}
        />
      ) : (
        <ReverseDamageCalculator
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          weathers={weathers}
          terrains={terrains}
          typeEffectivenessSource={typeEffectivenessSource}
        />
      )}
    </>
  );
}
