"use client";

import { create } from "zustand";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import {
  createDefaultAdjustmentState,
  type StatAdjustmentState,
} from "./damage-calculator-state";
import type {
  AdjustableStatId,
  DamageSide,
  StatAdjustment,
} from "./damage-calculator-types";

type TeamSelectionState = Record<DamageSide, number | null>;
type BuildSelectionState = Record<DamageSide, number | null>;
type AbilityConditionState = Record<DamageSide, boolean>;
type PokemonSelectionState = Record<DamageSide, DamageCalculatorPokemon | null>;
type PokemonQueryState = Record<DamageSide, string>;

type DamageCalculatorStore = {
  // Editable form state for the normal damage calculator.
  // Derived calculation results are intentionally kept outside this store.
  pokemon: PokemonSelectionState;
  query: PokemonQueryState;
  moveId: string;
  preservedMove: DamageCalculatorMove | null;
  weatherId: string;
  terrainId: string;
  selectedTeamIds: TeamSelectionState;
  selectedBuildIds: BuildSelectionState;
  teamModalSide: DamageSide | null;
  speedModalOpen: boolean;
  metronomeConsecutiveUseCount: number;
  abilityConditionEnabled: AbilityConditionState;
  statAdjustments: StatAdjustmentState;

  // Small setters and actions that update related fields together.
  setQuery: (side: DamageSide, query: string) => void;
  selectPokemon: (side: DamageSide, pokemon: DamageCalculatorPokemon | null) => void;
  setMoveId: (moveId: string) => void;
  setPreservedMove: (move: DamageCalculatorMove | null) => void;
  setWeatherId: (weatherId: string) => void;
  setTerrainId: (terrainId: string) => void;
  setSelectedTeamId: (side: DamageSide, teamId: number | null) => void;
  setSelectedBuildId: (side: DamageSide, buildId: number | null) => void;
  setTeamModalSide: (side: DamageSide | null) => void;
  setSpeedModalOpen: (open: boolean) => void;
  setMetronomeConsecutiveUseCount: (count: number) => void;
  setAbilityConditionEnabled: (side: DamageSide, enabled: boolean) => void;
  setStatAdjustment: (
    side: DamageSide,
    statId: AdjustableStatId,
    values: Partial<StatAdjustment>,
  ) => void;
  setSideStatAdjustments: (
    side: DamageSide,
    adjustments: StatAdjustmentState[DamageSide],
  ) => void;
  swapSides: () => void;
  resetSideForDirectPokemon: (side: DamageSide) => void;
  reset: () => void;
};

function initialState() {
  return {
    pokemon: { attacker: null, defender: null },
    query: { attacker: "", defender: "" },
    moveId: "",
    preservedMove: null,
    weatherId: "",
    terrainId: "",
    selectedTeamIds: { attacker: null, defender: null },
    selectedBuildIds: { attacker: null, defender: null },
    teamModalSide: null,
    speedModalOpen: false,
    metronomeConsecutiveUseCount: 1,
    abilityConditionEnabled: { attacker: false, defender: false },
    statAdjustments: createDefaultAdjustmentState(),
  };
}

export const useDamageCalculatorStore = create<DamageCalculatorStore>((set) => ({
  ...initialState(),

  setQuery: (side, query) =>
    set((state) => ({ query: { ...state.query, [side]: query } })),

  selectPokemon: (side, pokemon) =>
    set((state) => ({
      pokemon: { ...state.pokemon, [side]: pokemon },
      query: { ...state.query, [side]: pokemon?.nameJa ?? "" },
    })),

  setMoveId: (moveId) => set({ moveId }),
  setPreservedMove: (preservedMove) => set({ preservedMove }),
  setWeatherId: (weatherId) => set({ weatherId }),
  setTerrainId: (terrainId) => set({ terrainId }),
  setTeamModalSide: (teamModalSide) => set({ teamModalSide }),
  setSpeedModalOpen: (speedModalOpen) => set({ speedModalOpen }),
  setMetronomeConsecutiveUseCount: (metronomeConsecutiveUseCount) =>
    set({ metronomeConsecutiveUseCount }),

  setSelectedTeamId: (side, teamId) =>
    set((state) => ({
      selectedTeamIds: { ...state.selectedTeamIds, [side]: teamId },
    })),

  setSelectedBuildId: (side, buildId) =>
    set((state) => ({
      selectedBuildIds: { ...state.selectedBuildIds, [side]: buildId },
    })),

  setAbilityConditionEnabled: (side, enabled) =>
    set((state) => ({
      abilityConditionEnabled: {
        ...state.abilityConditionEnabled,
        [side]: enabled,
      },
    })),

  setStatAdjustment: (side, statId, values) =>
    set((state) => ({
      statAdjustments: {
        ...state.statAdjustments,
        [side]: {
          ...state.statAdjustments[side],
          [statId]: {
            ...state.statAdjustments[side][statId],
            ...values,
          },
        },
      },
    })),

  setSideStatAdjustments: (side, adjustments) =>
    set((state) => ({
      statAdjustments: { ...state.statAdjustments, [side]: adjustments },
    })),

  swapSides: () =>
    set((state) => ({
      pokemon: {
        attacker: state.pokemon.defender,
        defender: state.pokemon.attacker,
      },
      query: {
        attacker: state.pokemon.defender?.nameJa ?? "",
        defender: state.pokemon.attacker?.nameJa ?? "",
      },
      statAdjustments: {
        attacker: state.statAdjustments.defender,
        defender: state.statAdjustments.attacker,
      },
      abilityConditionEnabled: {
        attacker: state.abilityConditionEnabled.defender,
        defender: state.abilityConditionEnabled.attacker,
      },
      selectedTeamIds: {
        attacker: state.selectedTeamIds.defender,
        defender: state.selectedTeamIds.attacker,
      },
      selectedBuildIds: {
        attacker: state.selectedBuildIds.defender,
        defender: state.selectedBuildIds.attacker,
      },
    })),

  resetSideForDirectPokemon: (side) =>
    set((state) => ({
      selectedBuildIds: { ...state.selectedBuildIds, [side]: null },
      statAdjustments: {
        ...state.statAdjustments,
        [side]: createDefaultAdjustmentState()[side],
      },
      abilityConditionEnabled: {
        ...state.abilityConditionEnabled,
        [side]: false,
      },
    })),

  reset: () => set(initialState()),
}));
