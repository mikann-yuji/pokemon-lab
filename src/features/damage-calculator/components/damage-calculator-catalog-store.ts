"use client";

import { create } from "zustand";
import type { TypeEffectivenessSource } from "@/domain/type-matchup";
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
import { loadTypeEffectivenessFromCatalog } from "../infrastructure/type-effectiveness-repository";

type CatalogLoadStatus = "idle" | "loading" | "loaded" | "error";

type DamageCalculatorCatalogState = {
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
  typeEffectivenessSource: TypeEffectivenessSource | null;
  status: CatalogLoadStatus;
  error: string;
  ensureLoaded: () => Promise<void>;
};

let catalogLoadPromise: Promise<void> | null = null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

export const useDamageCalculatorCatalogStore =
  create<DamageCalculatorCatalogState>((set, get) => ({
    pokemonCatalog: [],
    heldItems: [],
    weathers: [],
    terrains: [],
    typeEffectivenessSource: null,
    status: "idle",
    error: "",

    async ensureLoaded() {
      const current = get();
      if (current.status === "loaded") return;
      if (catalogLoadPromise) return catalogLoadPromise;

      set({ status: "loading", error: "" });
      catalogLoadPromise = Promise.all([
        getChampionsDamageCalculatorPokemon(),
        getChampionsDamageCalculatorHeldItems(),
        getChampionsDamageFieldConditions(),
        loadTypeEffectivenessFromCatalog(),
      ])
        .then(([pokemonCatalog, heldItems, fieldConditions, typeEffectivenessSource]) => {
          set({
            pokemonCatalog,
            heldItems,
            weathers: fieldConditions.weathers,
            terrains: fieldConditions.terrains,
            typeEffectivenessSource,
            status: "loaded",
            error: "",
          });
        })
        .catch((error: unknown) => {
          catalogLoadPromise = null;
          set({
            status: "error",
            error: getErrorMessage(error),
          });
          throw error;
        });

      return catalogLoadPromise;
    },
  }));
