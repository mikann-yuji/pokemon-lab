"use client";

/** Page-level state controller for the damage calculator. */

import { useEffect, useMemo, useState } from "react";
import { championsDamageCalculator } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import {
  type DamageHistoryRecord,
  type DamageHistorySide,
} from "../infrastructure/damage-history-repository";
import { loadTypeEffectivenessFromCatalog } from "../infrastructure/type-effectiveness-repository";
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
  createDefaultAdjustmentState,
  createSpeedComparisonRows,
  createStatAdjustmentsFromBuild,
  getRelevantStatIds,
  usePokemonSelection,
  type StatAdjustmentState,
} from "./damage-calculator-state";
import { useDamageCalculatorUserData } from "./use-damage-calculator-user-data";
import { useDamageHistoryPersistence } from "./use-damage-history-persistence";

type TeamSelectionState = Record<DamageSide, number | null>;
type BuildSelectionState = Record<DamageSide, number | null>;

/**
 * Coordinates battle-side selections, user data, and damage calculation.
 */
export function DamageCalculator({
  pokemonCatalog,
  heldItems,
  weathers,
  terrains,
}: {
  /** Full damage-calculator catalog loaded from catalog.db by the page. */
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
}) {
  const attackerSelection = usePokemonSelection();
  const defenderSelection = usePokemonSelection();
  const attacker = attackerSelection.pokemon;
  const defender = defenderSelection.pokemon;
  const [moveId, setMoveId] = useState("");
  const [preservedMove, setPreservedMove] =
    useState<DamageCalculatorMove | null>(null);
  const [weatherId, setWeatherId] = useState("");
  const [terrainId, setTerrainId] = useState("");
  const [typeEffectivenessSource, setTypeEffectivenessSource] =
    useState<TypeEffectivenessSource | null>(null);
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
  const [selectedTeamIds, setSelectedTeamIds] = useState<TeamSelectionState>({
    attacker: null,
    defender: null,
  });
  const [selectedBuildIds, setSelectedBuildIds] = useState<BuildSelectionState>({
    attacker: null,
    defender: null,
  });
  const [teamModalSide, setTeamModalSide] = useState<DamageSide | null>(null);
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [metronomeConsecutiveUseCount, setMetronomeConsecutiveUseCount] =
    useState(1);
  const [abilityConditionEnabled, setAbilityConditionEnabled] = useState({
    attacker: false,
    defender: false,
  });
  const [statAdjustments, setStatAdjustments] =
    useState<StatAdjustmentState>(() => createDefaultAdjustmentState());
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

  // user.db is browser-local, so user-specific records are loaded after mount.
  useEffect(() => {
    let active = true;
    void loadTypeEffectivenessFromCatalog()
      .then((source) => {
        if (active) setTypeEffectivenessSource(source);
      })
      .catch((caught: unknown) => {
        console.error("Failed to load type effectiveness from catalog.", caught);
      });
    return () => {
      active = false;
    };
  }, []);


  // Changing the attacker invalidates the previously selected move and result.
  function selectAttacker(pokemon: DamageCalculatorPokemon | null) {
    attackerSelection.select(pokemon);
    setSelectedBuildIds((current) => ({ ...current, attacker: null }));
    setStatAdjustments((current) => ({
      ...current,
      attacker: createDefaultAdjustmentState().attacker,
    }));
    setAbilityConditionEnabled((current) => ({ ...current, attacker: false }));
    setMetronomeConsecutiveUseCount(1);
    setMoveId("");
    setPreservedMove(null);
  }

  // Changing the defender also invalidates the result for the old matchup.
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    defenderSelection.select(pokemon);
    setSelectedBuildIds((current) => ({ ...current, defender: null }));
    setStatAdjustments((current) => ({
      ...current,
      defender: createDefaultAdjustmentState().defender,
    }));
    setAbilityConditionEnabled((current) => ({ ...current, defender: false }));
  }

  function changeHeldItem(side: DamageSide, itemId: string) {
    const item = heldItems.find(({ id }) => id === itemId) ?? null;
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    selection.select(applyHeldItem(selection.pokemon, item));
    if (side === "attacker" && item?.id !== "metronome") {
      setMetronomeConsecutiveUseCount(1);
    }
  }

  function changeAbility(side: DamageSide, abilityId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const ability =
      selection.pokemon?.abilities.find(({ id }) => id === abilityId) ?? null;
    selection.select(applyAbility(selection.pokemon, ability));
    setAbilityConditionEnabled((current) => ({ ...current, [side]: false }));
  }

  function changeStatAdjustment(
    side: DamageSide,
    statId: AdjustableStatId,
    values: Partial<StatAdjustment>,
  ) {
    setStatAdjustments((current) => ({
      ...current,
      [side]: {
        ...current[side],
        [statId]: {
          ...current[side][statId],
          ...values,
        },
      },
    }));
  }

  function selectBattleTeam(side: DamageSide, team: BattleTeam) {
    setSelectedTeamIds((current) => ({
      ...current,
      [side]: team.id ?? null,
    }));
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
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    selection.select(trainedPokemon);
    setSelectedBuildIds((current) => ({
      ...current,
      [side]: build.id ?? null,
    }));
    setStatAdjustments((current) => ({
      ...current,
      [side]: createStatAdjustmentsFromBuild(build, natures),
    }));
    setAbilityConditionEnabled((current) => ({ ...current, [side]: false }));
    if (side === "attacker") {
      setMoveId(trainedPokemon.moves[0]?.id ?? "");
      setPreservedMove(null);
      if (trainedPokemon.heldItem?.id !== "metronome") {
        setMetronomeConsecutiveUseCount(1);
      }
    }
  }

  function swapBattleSides() {
    attackerSelection.select(defender);
    defenderSelection.select(attacker);
    setStatAdjustments((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
    setAbilityConditionEnabled((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
    setSelectedTeamIds((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
    setSelectedBuildIds((current) => ({
      attacker: current.defender,
      defender: current.attacker,
    }));
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
      attackerSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, attacker: null }));
      setPreservedMove(null);
      setMoveId(
        pokemon.moves.some(({ id }) => id === history.moveId)
          ? (history.moveId ?? "")
          : "",
      );
    } else {
      defenderSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, defender: null }));
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
      onAbilityConditionChange={(side, enabled) =>
        setAbilityConditionEnabled((current) => ({ ...current, [side]: enabled }))
      }
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
