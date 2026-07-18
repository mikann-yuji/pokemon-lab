"use client";

/** Page-level state controller for the damage calculator. */

import { useMemo, useState } from "react";
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
import { getVariableMovePowers } from "../domain/variable-move-power";

/**
 * ダメージ計算ページで、画面状態・保存済みデータ・計算実行をつなぐcontroller。
 *
 * @param props - catalog.dbから読み込んだポケモン、持ち物、天候、フィールド、タイプ相性。
 * @returns 通常ダメージ計算ページの入力UIと計算結果UI。
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
  const [variableMovePowerSelection, setVariableMovePowerSelection] = useState<{
    moveId: string;
    power: number;
  } | null>(null);
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
  /**
   * ダメージ計算ページで、選択中ポケモンから育成詳細ページへのリンクを作る。
   *
   * @param pokemon - リンク対象のポケモン。未選択ならnull。
   * @param buildId - 選択中の育成案ID。未選択ならnull。
   * @returns 育成詳細ページURL。ポケモン未選択ならundefined。
   */
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

  /**
   * ダメージ計算ページで、攻撃側ポケモンの直接選択を反映する。
   *
   * @param pokemon - 新しく攻撃側に選ぶポケモン。選択解除ならnull。
   * @returns 戻り値なし。
   */
  function selectAttacker(pokemon: DamageCalculatorPokemon | null) {
    selectPokemon("attacker", pokemon);
    resetSideForDirectPokemon("attacker");
    setMetronomeConsecutiveUseCount(1);
    setMoveId("");
    setPreservedMove(null);
  }

  /**
   * ダメージ計算ページで、防御側ポケモンの直接選択を反映する。
   *
   * @param pokemon - 新しく防御側に選ぶポケモン。選択解除ならnull。
   * @returns 戻り値なし。
   */
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    selectPokemon("defender", pokemon);
    resetSideForDirectPokemon("defender");
  }

  /**
   * ダメージ計算ページで、攻撃側または防御側の持ち物変更を反映する。
   *
   * @param side - 持ち物を変更する側。
   * @param itemId - 選択された持ち物ID。持ち物なしなら空文字。
   * @returns 戻り値なし。
   */
  function changeHeldItem(side: DamageSide, itemId: string) {
    const item = heldItems.find(({ id }) => id === itemId) ?? null;
    const pokemon = side === "attacker" ? attacker : defender;
    selectPokemon(side, applyHeldItem(pokemon, item));
    if (side === "attacker" && item?.id !== "metronome") {
      setMetronomeConsecutiveUseCount(1);
    }
  }

  /**
   * ダメージ計算ページで、攻撃側または防御側の特性変更を反映する。
   *
   * @param side - 特性を変更する側。
   * @param abilityId - 選択された特性ID。特性なしなら空文字。
   * @returns 戻り値なし。
   */
  function changeAbility(side: DamageSide, abilityId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const ability =
      selection.pokemon?.abilities.find(({ id }) => id === abilityId) ?? null;
    selectPokemon(side, applyAbility(selection.pokemon, ability));
    setAbilityConditionEnabled(side, false);
  }

  /**
   * ダメージ計算ページで、能力ポイント・ランク・性格補正の入力変更を保存する。
   *
   * @param side - 補正を変更する側。
   * @param statId - 補正対象の能力ID。
   * @param values - 変更された補正値の一部。
   * @returns 戻り値なし。
   */
  function changeStatAdjustment(
    side: DamageSide,
    statId: AdjustableStatId,
    values: Partial<StatAdjustment>,
  ) {
    setStatAdjustment(side, statId, values);
  }

  /**
   * ダメージ計算ページで、モーダルから選ばれたバトルチームを現在の側に紐づける。
   *
   * @param side - チームを選ぶ側。
   * @param team - 選択されたバトルチーム。
   * @returns 戻り値なし。
   */
  function selectBattleTeam(side: DamageSide, team: BattleTeam) {
    setSelectedTeamId(side, team.id ?? null);
    setTeamModalSide(null);
  }

  /**
   * ダメージ計算ページで、バトルチーム内の育成案を攻撃側/防御側へ反映する。
   *
   * @param side - 育成案を反映する側。
   * @param build - 選択された保存済み育成案。
   * @returns 戻り値なし。
   */
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

  /**
   * ダメージ計算ページで、攻撃側と防御側の入力状態を入れ替える。
   *
   * @returns 戻り値なし。
   */
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
   * ダメージ計算ページで、履歴からポケモンと使用技を復元する。
   *
   * @param side - 復元先の履歴種別。
   * @param history - 選択された履歴レコード。
   * @returns 戻り値なし。catalog.dbに存在しないポケモンIDは無視する。
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

  const selectedMoveBase =
    attacker?.moves.find(({ id }) => id === moveId) ??
    (preservedMove?.id === moveId ? preservedMove : undefined);
  const variableMovePowerOptions = getVariableMovePowers(selectedMoveBase);
  const selectedMovePower =
    selectedMoveBase && variableMovePowerOptions
      ? variableMovePowerSelection?.moveId === selectedMoveBase.id &&
        variableMovePowerOptions.includes(variableMovePowerSelection.power)
        ? variableMovePowerSelection.power
        : variableMovePowerOptions.includes(selectedMoveBase.power)
          ? selectedMoveBase.power
          : variableMovePowerOptions[0]
      : selectedMoveBase?.power;
  const selectedMove =
    selectedMoveBase && selectedMovePower !== undefined
      ? { ...selectedMoveBase, power: selectedMovePower }
      : selectedMoveBase;
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
    if (!attacker || !defender || !selectedMoveBase) {
      return { result: null, error: null };
    }
    if (!adjustedAttacker || !adjustedDefender) {
      return { result: null, error: null };
    }

    try {
      const calculationMove = {
        ...selectedMoveBase,
        power: selectedMovePower ?? selectedMoveBase.power,
      };
      return {
        result: {
          normal: championsDamageCalculator.calculate({
            attacker: adjustedAttacker,
            defender: adjustedDefender,
            move: calculationMove,
            metronomeConsecutiveUseCount,
            abilityConditionEnabled,
            field: fieldOptions,
            typeEffectivenessSource,
          }),
          critical: championsDamageCalculator.calculate({
            attacker: adjustedAttacker,
            defender: adjustedDefender,
            move: calculationMove,
            metronomeConsecutiveUseCount,
            abilityConditionEnabled,
            isCritical: true,
            field: fieldOptions,
            typeEffectivenessSource,
          }),
          attackerName: attacker.nameJa,
          defenderName: defender.nameJa,
          moveName: calculationMove.name,
          moveEffectiveness: getTypeEffectiveness(
            calculationMove.typeName,
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
    selectedMoveBase,
    selectedMovePower,
    typeEffectivenessSource,
  ]);
  useDamageHistoryPersistence({
    attacker,
    defender,
    selectedMove: selectedMoveBase,
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
      variableMovePowerOptions={variableMovePowerOptions}
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
      onVariableMovePowerChange={(power) => {
        if (selectedMoveBase) {
          setVariableMovePowerSelection({ moveId: selectedMoveBase.id, power });
        }
      }}
      onStatAdjustmentChange={changeStatAdjustment}
      onSwapSides={swapBattleSides}
      onWeatherChange={setWeatherId}
      onTerrainChange={setTerrainId}
      onSpeedModalOpenChange={setSpeedModalOpen}
    />
  );
}
