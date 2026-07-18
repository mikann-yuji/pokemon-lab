"use client";

import { useEffect } from "react";
import { useDamageCalculatorCatalogStore } from "@/features/damage-calculator/components/damage-calculator-catalog-store";
import DamageAdjustmentMap from "./damage-adjustment-map";
import styles from "../styles/damage-adjustment-map.module.css";

export default function DamageAdjustmentMapLoader() {
  const store = useDamageCalculatorCatalogStore();
  useEffect(() => {
    void store.ensureLoaded().catch(() => undefined);
  }, [store]);

  if (store.status === "error") {
    return <p className={styles.status} role="alert">{store.error}</p>;
  }
  if (store.status !== "loaded" || !store.typeEffectivenessSource) {
    return <p className={styles.status}>計算データを読み込んでいます…</p>;
  }
  return (
    <DamageAdjustmentMap
      pokemonCatalog={store.pokemonCatalog}
      heldItems={store.heldItems}
      weathers={store.weathers}
      terrains={store.terrains}
      typeEffectivenessSource={store.typeEffectivenessSource}
    />
  );
}
