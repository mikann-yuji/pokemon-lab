"use client";

/** Page-level state controller for the damage calculator. */

import { useMemo } from "react";
import { championsDamageCalculator } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import {
  type DamageHistoryRecord,
  type DamageHistorySide,
} from "../infrastructure/damage-history-repository";
import {
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  getTypeEffectiveness,
  type TypeEffectivenessSource,
} from "@/domain/type-matchup";
import { DamageCalculatorView } from "./damage-calculator-view";
import type {
  AdjustableStatId,
  DamageSide,
  StatAdjustment,
} from "./damage-calculator-types";
import {
  applyAbility,
  applyHeldItem,
  applyStatAdjustment,
  applyTrainingBuildToPokemon,
  createSpeedComparisonRows,
  createStatAdjustmentsFromBuild,
  getRelevantStatIds,
} from "./damage-calculator-state";
import { useDamageCalculatorStore } from "./damage-calculator-store";
import { useDamageCalculatorUserData } from "./use-damage-calculator-user-data";
import { useDamageHistoryPersistence } from "./use-damage-history-persistence";

/**
 * Coordinates battle-side selections, user data, and damage calculation.
 */
export function DamageCalculator({
  pokemonCatalog,
  heldItems,
  weathers,
  terrains,
  typeEffectivenessSource,
}: {
  /** Full damage-calculator catalog loaded from catalog.db by the page. */
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
  typeEffectivenessSource: TypeEffectivenessSource;
}) {
  const attacker = useDamageCalculatorStore((state) => state.pokemon.attacker);
  const defender = useDamageCalculatorStore((state) => state.pokemon.defender);
  const attackerQuery = useDamageCalculatorStore((state) => state.query.attacker);
  const defenderQuery = useDamageCalculatorStore((state) => state.query.defender);
  const moveId = useDamageCalculatorStore((state) => state.moveId);
  const preservedMove = useDamageCalculatorStore((state) => state.preservedMove);
  const weatherId = useDamageCalculatorStore((state) => state.weatherId);
  const terrainId = useDamageCalculatorStore((state) => state.terrainId);
  const selectedTeamIds = useDamageCalculatorStore((state) => state.selectedTeamIds);
  const selectedBuildIds = useDamageCalculatorStore((state) => state.selectedBuildIds);
  const teamModalSide = useDamageCalculatorStore((state) => state.teamModalSide);
  const speedModalOpen = useDamageCalculatorStore((state) => state.speedModalOpen);
  const metronomeConsecutiveUseCount = useDamageCalculatorStore(
    (state) => state.metronomeConsecutiveUseCount,
  );
  const abilityConditionEnabled = useDamageCalculatorStore(
    (state) => state.abilityConditionEnabled,
  );
  const statAdjustments = useDamageCalculatorStore((state) => state.statAdjustments);
  const setQuery = useDamageCalculatorStore((state) => state.setQuery);
  const selectPokemon = useDamageCalculatorStore((state) => state.selectPokemon);
  const setMoveId = useDamageCalculatorStore((state) => state.setMoveId);
  const setPreservedMove = useDamageCalculatorStore(
    (state) => state.setPreservedMove,
  );
  const setWeatherId = useDamageCalculatorStore((state) => state.setWeatherId);
  const setTerrainId = useDamageCalculatorStore((state) => state.setTerrainId);
  const setSelectedTeamId = useDamageCalculatorStore(
    (state) => state.setSelectedTeamId,
  );
  const setSelectedBuildId = useDamageCalculatorStore(
    (state) => state.setSelectedBuildId,
  );
  const setTeamModalSide = useDamageCalculatorStore(
    (state) => state.setTeamModalSide,
  );
  const setSpeedModalOpen = useDamageCalculatorStore(
    (state) => state.setSpeedModalOpen,
  );
  const setMetronomeConsecutiveUseCount = useDamageCalculatorStore(
    (state) => state.setMetronomeConsecutiveUseCount,
  );
  const setAbilityConditionEnabled = useDamageCalculatorStore(
    (state) => state.setAbilityConditionEnabled,
  );
  const setStatAdjustment = useDamageCalculatorStore(
    (state) => state.setStatAdjustment,
  );
  const setSideStatAdjustments = useDamageCalculatorStore(
    (state) => state.setSideStatAdjustments,
  );
  const swapStoreSides = useDamageCalculatorStore((state) => state.swapSides);
  const resetSideForDirectPokemon = useDamageCalculatorStore(
    (state) => state.resetSideForDirectPokemon,
  );
  const {
    attackerHistory,
    setAttackerHistory,
    defenderHistory,
    setDefenderHistory,
    battleTeams,
    trainingBuilds,
    natures,
    teamLoadError,
  } = useDamageCalculatorUserData();
  const attackerSelection = useMemo(
    () => ({
      pokemon: attacker,
      query: attackerQuery,
      setQuery: (query: string) => setQuery("attacker", query),
      select: (pokemon: DamageCalculatorPokemon | null) =>
        selectPokemon("attacker", pokemon),
    }),
    [attacker, attackerQuery, selectPokemon, setQuery],
  );
  const defenderSelection = useMemo(
    () => ({
      pokemon: defender,
      query: defenderQuery,
      setQuery: (query: string) => setQuery("defender", query),
      select: (pokemon: DamageCalculatorPokemon | null) =>
        selectPokemon("defender", pokemon),
    }),
    [defender, defenderQuery, selectPokemon, setQuery],
  );
  const buildById = useMemo(
    () =>
      new Map(
        trainingBuilds.flatMap((build) =>
          build.id === undefined ? [] : [[build.id, build] as const],
        ),
      ),
    [trainingBuilds],
  );
  const selectedTeams = useMemo(
    () => ({
      attacker:
        battleTeams.find((team) => team.id === selectedTeamIds.attacker) ??
        null,
      defender:
        battleTeams.find((team) => team.id === selectedTeamIds.defender) ??
        null,
    }),
    [battleTeams, selectedTeamIds],
  );
  const selectedTeamMembers = useMemo(() => {
    const toMembers = (team: BattleTeam | null) =>
      team?.buildIds
        .map((buildId) => buildById.get(buildId))
        .filter((build): build is TrainingBuild => Boolean(build))
        .flatMap((build) => {
          const pokemon = pokemonCatalog.find(
            ({ id }) => id === build.pokemonId,
          );
          return pokemon ? [{ build, pokemon }] : [];
        }) ?? [];

    return {
      attacker: toMembers(selectedTeams.attacker),
      defender: toMembers(selectedTeams.defender),
    };
  }, [buildById, pokemonCatalog, selectedTeams]);
  const getTrainingDetailHref = (
    pokemon: DamageCalculatorPokemon | null,
    buildId: number | null,
  ) => {
    if (!pokemon) return undefined;
    const linkedBuildId =
      buildId ??
      trainingBuilds.find((build) => build.pokemonId === pokemon.id)?.id ??
      null;
    return linkedBuildId
      ? `/training/${pokemon.id}?build=${linkedBuildId}`
      : `/training/${pokemon.id}`;
  };

  // Changing the attacker invalidates the previously selected move and result.
  function selectAttacker(pokemon: DamageCalculatorPokemon | null) {
    selectPokemon("attacker", pokemon);
    resetSideForDirectPokemon("attacker");
    setMetronomeConsecutiveUseCount(1);
    setMoveId("");
    setPreservedMove(null);
  }

  // Changing the defender also invalidates the result for the old matchup.
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    selectPokemon("defender", pokemon);
    resetSideForDirectPokemon("defender");
  }

  function changeHeldItem(side: DamageSide, itemId: string) {
    const item = heldItems.find(({ id }) => id === itemId) ?? null;
    const pokemon = side === "attacker" ? attacker : defender;
    selectPokemon(side, applyHeldItem(pokemon, item));
    if (side === "attacker" && item?.id !== "metronome") {
      setMetronomeConsecutiveUseCount(1);
    }
  }

  function changeAbility(side: DamageSide, abilityId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const ability =
      selection.pokemon?.abilities.find(({ id }) => id === abilityId) ?? null;
    selectPokemon(side, applyAbility(selection.pokemon, ability));
    setAbilityConditionEnabled(side, false);
  }

  function changeStatAdjustment(
    side: DamageSide,
    statId: AdjustableStatId,
    values: Partial<StatAdjustment>,
  ) {
    setStatAdjustment(side, statId, values);
  }

  function selectBattleTeam(side: DamageSide, team: BattleTeam) {
    setSelectedTeamId(side, team.id ?? null);
    setTeamModalSide(null);
  }

  function selectTeamMember(side: DamageSide, build: TrainingBuild) {
    const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
    if (!pokemon) return;

    const trainedPokemon = applyTrainingBuildToPokemon(
      pokemon,
      build,
      natures,
      heldItems,
    );
    selectPokemon(side, trainedPokemon);
    setSelectedBuildId(side, build.id ?? null);
    setSideStatAdjustments(side, createStatAdjustmentsFromBuild(build, natures));
    setAbilityConditionEnabled(side, false);
    if (side === "attacker") {
      setMoveId(trainedPokemon.moves[0]?.id ?? "");
      setPreservedMove(null);
      if (trainedPokemon.heldItem?.id !== "metronome") {
        setMetronomeConsecutiveUseCount(1);
      }
    }
  }

  function swapBattleSides() {
    swapStoreSides();
    const nextMove =
      defender?.moves.find(({ id }) => id === moveId) ??
      defender?.moves[0] ??
      selectedMove ??
      null;
    setMoveId(nextMove?.id ?? "");
    setPreservedMove(nextMove && !defender?.moves.some(({ id }) => id === nextMove.id) ? nextMove : null);
    if (defender?.heldItem?.id !== "metronome") {
      setMetronomeConsecutiveUseCount(1);
    }
  }

  /**
   * Restores a pokemon from local history.
   * Missing IDs are ignored because the static catalog may have changed.
   */
  function restoreHistory(
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) {
    const pokemon =
      pokemonCatalog.find(({ id }) => id === history.pokemonId) ?? null;
    if (!pokemon) return;

    if (side === "attacker") {
      selectPokemon("attacker", pokemon);
      setSelectedBuildId("attacker", null);
      setPreservedMove(null);
      setMoveId(
        pokemon.moves.some(({ id }) => id === history.moveId)
          ? (history.moveId ?? "")
          : "",
      );
    } else {
      selectPokemon("defender", pokemon);
      setSelectedBuildId("defender", null);
    }
  }

  const selectedMove =
    attacker?.moves.find(({ id }) => id === moveId) ??
    (preservedMove?.id === moveId ? preservedMove : undefined);
  const selectedWeather =
    weathers.find(({ id }) => id === weatherId) ?? null;
  const selectedTerrain =
    terrains.find(({ id }) => id === terrainId) ?? null;
  const fieldOptions = useMemo(
    () => ({
      ...(selectedWeather ? { weather: selectedWeather.smogonWeather } : {}),
      ...(selectedTerrain ? { terrain: selectedTerrain.smogonTerrain } : {}),
    }),
    [selectedTerrain, selectedWeather],
  );
  const relevantStatIds = getRelevantStatIds(selectedMove);
  const adjustedAttacker = useMemo(
    () =>
      applyStatAdjustment(
        attacker,
        relevantStatIds.attacker,
        relevantStatIds.attacker
          ? statAdjustments.attacker[relevantStatIds.attacker]
          : null,
      ),
    [attacker, relevantStatIds.attacker, statAdjustments.attacker],
  );
  const adjustedDefender = useMemo(
    () => {
      const statAdjustedDefender = applyStatAdjustment(
        defender,
        relevantStatIds.defender,
        relevantStatIds.defender
          ? statAdjustments.defender[relevantStatIds.defender]
          : null,
      );
      return applyStatAdjustment(
        statAdjustedDefender,
        "hp",
        statAdjustments.defender.hp,
      );
    },
    [defender, relevantStatIds.defender, statAdjustments.defender],
  );
  const speedComparisonRows = useMemo(
    () => createSpeedComparisonRows(attacker, defender),
    [attacker, defender],
  );

  const { result, error } = useMemo(() => {
    if (!attacker || !defender || !selectedMove) {
      return { result: null, error: null };
    }
    if (!adjustedAttacker || !adjustedDefender) {
      return { result: null, error: null };
    }

    try {
      return {
        result: {
          normal: championsDamageCalculator.calculate({
            attacker: adjustedAttacker,
            defender: adjustedDefender,
            move: selectedMove,
            metronomeConsecutiveUseCount,
            abilityConditionEnabled,
            field: fieldOptions,
            typeEffectivenessSource,
          }),
          critical: championsDamageCalculator.calculate({
            attacker: adjustedAttacker,
            defender: adjustedDefender,
            move: selectedMove,
            metronomeConsecutiveUseCount,
            abilityConditionEnabled,
            isCritical: true,
            field: fieldOptions,
            typeEffectivenessSource,
          }),
          attackerName: attacker.nameJa,
          defenderName: defender.nameJa,
          moveName: selectedMove.name,
          moveEffectiveness: getTypeEffectiveness(
            selectedMove.typeName,
            defender.types,
            typeEffectivenessSource,
          ),
        },
        error: null,
      };
    } catch (caught) {
      return {
        result: null,
        error: caught instanceof Error ? caught.message : "計算に失敗しました。",
      };
    }
  }, [
    adjustedAttacker,
    adjustedDefender,
    abilityConditionEnabled,
    attacker,
    defender,
    fieldOptions,
    metronomeConsecutiveUseCount,
    selectedMove,
    typeEffectivenessSource,
  ]);
  useDamageHistoryPersistence({
    attacker,
    defender,
    selectedMove,
    setAttackerHistory,
    setDefenderHistory,
  });

  return (
    <DamageCalculatorView
      pokemonCatalog={pokemonCatalog}
      heldItems={heldItems}
      weathers={weathers}
      terrains={terrains}
      attackerSelection={attackerSelection}
      defenderSelection={defenderSelection}
      attacker={attacker}
      defender={defender}
      selectedMove={selectedMove}
      moveId={moveId}
      typeEffectivenessSource={typeEffectivenessSource}
      selectedTeams={selectedTeams}
      selectedTeamMembers={selectedTeamMembers}
      selectedBuildIds={selectedBuildIds}
      attackerHistory={attackerHistory}
      defenderHistory={defenderHistory}
      battleTeams={battleTeams}
      selectedTeamIds={selectedTeamIds}
      teamModalSide={teamModalSide}
      teamLoadError={teamLoadError}
      abilityConditionEnabled={abilityConditionEnabled}
      metronomeConsecutiveUseCount={metronomeConsecutiveUseCount}
      statAdjustments={statAdjustments}
      relevantStatIds={relevantStatIds}
      weatherId={weatherId}
      terrainId={terrainId}
      result={result}
      error={error}
      speedModalOpen={speedModalOpen}
      speedComparisonRows={speedComparisonRows}
      getTrainingDetailHref={getTrainingDetailHref}
      onOpenTeamModal={setTeamModalSide}
      onSelectTeam={(team) => {
        if (teamModalSide) selectBattleTeam(teamModalSide, team);
      }}
      onCloseTeamModal={() => setTeamModalSide(null)}
      onSelectTeamMember={selectTeamMember}
      onSelectAttacker={selectAttacker}
      onSelectDefender={selectDefender}
      onRestoreHistory={restoreHistory}
      onAbilityChange={changeAbility}
      onAbilityConditionChange={setAbilityConditionEnabled}
      onHeldItemChange={changeHeldItem}
      onMetronomeCountChange={setMetronomeConsecutiveUseCount}
      onMoveChange={(nextMoveId) => {
        setPreservedMove(null);
        setMoveId(nextMoveId);
      }}
      onStatAdjustmentChange={changeStatAdjustment}
      onSwapSides={swapBattleSides}
      onWeatherChange={setWeatherId}
      onTerrainChange={setTerrainId}
      onSpeedModalOpenChange={setSpeedModalOpen}
    />
  );
}
