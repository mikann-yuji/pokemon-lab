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
  /**
   * ダメージ計算ページで、catalog.db由来の静的データを一度だけ読み込む。
   *
   * @returns 読み込み完了を表すPromise。すでに読み込み済みなら即座に解決する。
   */
  ensureLoaded: () => Promise<void>;
};

// 複数コンポーネントが同時にensureLoadedを呼んでも、catalog.db読み込みを1本にまとめる。
// Zustand stateだけでは「進行中Promise」そのものを共有しにくいため、module変数で保持する。
let catalogLoadPromise: Promise<void> | null = null;

/**
 * ダメージ計算ページで、catalog.db読み込み失敗時に表示できるエラー文へ変換する。
 *
 * @param error - catch句で受け取った任意の例外値。
 * @returns Errorならmessage、それ以外なら固定文言。
 */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * ダメージ計算ページで、ポケモン・持ち物・天候・フィールド・タイプ相性を共有するstore。
 *
 * @returns Zustand selector経由で、catalog.db由来の静的データと読み込み操作を返すhook。
 */
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

      // ここで読むデータは全ユーザー共通の静的データ。
      // user.db同期とは独立しており、ページをまたいでも再取得しない。
      set({ status: "loading", error: "" });
      catalogLoadPromise = Promise.all([
        getChampionsDamageCalculatorPokemon(),
        getChampionsDamageCalculatorHeldItems(),
        getChampionsDamageFieldConditions(),
        loadTypeEffectivenessFromCatalog(),
      ])
        .then(([pokemonCatalog, heldItems, fieldConditions, typeEffectivenessSource]) => {
          // fieldConditionsはDB上ではまとめて返るので、画面で扱いやすいweathers/terrainsへ分ける。
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
          // 失敗時はPromiseを捨て、次回のensureLoadedで再試行できる状態に戻す。
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
