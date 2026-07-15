"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import {
  saveDamageHistory,
  type DamageHistoryRecord,
  type DamageHistorySide,
} from "../infrastructure/damage-history-repository";
import {
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  STAT_LABELS,
  applyTrainingBuildToPokemon,
  createDefaultAdjustmentState,
  createStatAdjustmentsFromBuild,
  getRelevantStatIds,
  parseObservedInput,
  usePokemonSelection,
  type DamageSide,
  type StatAdjustment,
  type StatAdjustmentState,
  type StatId,
  type TeamSelectionState,
  type UnknownSide,
  type BuildSelectionState,
} from "./reverse-damage-calculator-state";
import { ReverseDamageObservationSection } from "./reverse-damage-observation-section";
import { MoveSelect, MoveSummary } from "./reverse-damage-calculator-form";
import { ReverseResultTable } from "./reverse-damage-calculator-result";
import { BattleTeamModal, SideContent } from "./reverse-damage-calculator-side";
import { useReverseDamageCandidates } from "./use-reverse-damage-candidates";
import { useReverseDamageUserData } from "./use-reverse-damage-user-data";
import damageStyles from "../styles/damage-calculator.module.css";
import styles from "../styles/reverse-damage-calculator.module.css";


export function ReverseDamageCalculator({
  pokemonCatalog,
  heldItems,
  weathers,
  terrains,
}: {
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
}) {
  const attackerSelection = usePokemonSelection();
  const defenderSelection = usePokemonSelection();
  const attacker = attackerSelection.pokemon;
  const defender = defenderSelection.pokemon;
  const [unknownSide, setUnknownSide] = useState<UnknownSide>("attacker");
  const [observedDamage, setObservedDamage] = useState("100");
  const [observedPercent, setObservedPercent] = useState("50");
  const [percentTolerance, setPercentTolerance] = useState(0.1);
  const [moveId, setMoveId] = useState("");
  const [weatherId, setWeatherId] = useState("");
  const [terrainId, setTerrainId] = useState("");
  const {
    attackerHistory,
    battleTeams,
    defenderHistory,
    natures,
    setAttackerHistory,
    setDefenderHistory,
    teamLoadError,
    trainingBuilds,
    typeEffectivenessSource,
  } = useReverseDamageUserData();
  const [selectedTeamIds, setSelectedTeamIds] = useState<TeamSelectionState>({
    attacker: null,
    defender: null,
  });
  const [selectedBuildIds, setSelectedBuildIds] = useState<BuildSelectionState>({
    attacker: null,
    defender: null,
  });
  const [teamModalSide, setTeamModalSide] = useState<DamageSide | null>(null);
  const [statAdjustments, setStatAdjustments] =
    useState<StatAdjustmentState>(createDefaultAdjustmentState);

  const selectedMove = attacker?.moves.find(({ id }) => id === moveId) ?? null;
  const observedDamageValue = parseObservedInput(observedDamage);
  const observedPercentValue = parseObservedInput(observedPercent);
  const relevantStatIds = getRelevantStatIds(selectedMove);
  const selectedWeather = weathers.find(({ id }) => id === weatherId) ?? null;
  const selectedTerrain = terrains.find(({ id }) => id === terrainId) ?? null;
  const fieldOptions = useMemo(
    () => ({
      ...(selectedWeather ? { weather: selectedWeather.smogonWeather } : {}),
      ...(selectedTerrain ? { terrain: selectedTerrain.smogonTerrain } : {}),
    }),
    [selectedTerrain, selectedWeather],
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
          const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
          return pokemon ? [{ build, pokemon }] : [];
        }) ?? [];

    return {
      attacker: toMembers(selectedTeams.attacker),
      defender: toMembers(selectedTeams.defender),
    };
  }, [buildById, pokemonCatalog, selectedTeams]);
  useEffect(() => {
    if (!attacker || !defender || !selectedMove) return;

    let active = true;
    void Promise.all([
      saveDamageHistory("attacker", attacker.id, selectedMove.id),
      saveDamageHistory("defender", defender.id),
    ])
      .then(([savedAttackers, savedDefenders]) => {
        if (!active) return;
        setAttackerHistory(savedAttackers);
        setDefenderHistory(savedDefenders);
      })
      .catch((caught: unknown) => {
        console.error("Failed to save damage history.", caught);
      });

    return () => {
      active = false;
    };
  }, [
    attacker,
    defender,
    selectedMove,
    setAttackerHistory,
    setDefenderHistory,
  ]);

  function selectPokemon(side: DamageSide, pokemon: DamageCalculatorPokemon | null) {
    if (side === "attacker") {
      attackerSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, attacker: null }));
      setStatAdjustments((current) => ({
        ...current,
        attacker: createDefaultAdjustmentState().attacker,
      }));
      setMoveId("");
    } else {
      defenderSelection.select(pokemon);
      setSelectedBuildIds((current) => ({ ...current, defender: null }));
      setStatAdjustments((current) => ({
        ...current,
        defender: createDefaultAdjustmentState().defender,
      }));
    }
  }

  function changeHeldItem(side: DamageSide, itemId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const item = heldItems.find(({ id }) => id === itemId) ?? null;
    selection.select(
      selection.pokemon ? { ...selection.pokemon, heldItem: item } : null,
    );
  }

  function changeAbility(side: DamageSide, abilityId: string) {
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    const ability =
      selection.pokemon?.abilities.find(({ id }) => id === abilityId) ?? null;
    selection.select(
      selection.pokemon
        ? { ...selection.pokemon, selectedAbility: ability }
        : null,
    );
  }

  function changeStatAdjustment(
    side: DamageSide,
    statId: StatId,
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
    setSelectedTeamIds((current) => ({ ...current, [side]: team.id ?? null }));
    setTeamModalSide(null);
  }

  function selectTeamMember(side: DamageSide, build: TrainingBuild) {
    const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
    if (!pokemon) return;

    const trainedPokemon = applyTrainingBuildToPokemon(pokemon, build, heldItems);
    const selection = side === "attacker" ? attackerSelection : defenderSelection;
    selection.select(trainedPokemon);
    setSelectedBuildIds((current) => ({ ...current, [side]: build.id ?? null }));
    setStatAdjustments((current) => ({
      ...current,
      [side]: createStatAdjustmentsFromBuild(build, natures),
    }));
    if (side === "attacker") setMoveId(trainedPokemon.moves[0]?.id ?? "");
  }

  function restoreHistory(
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) {
    const pokemon =
      pokemonCatalog.find(({ id }) => id === history.pokemonId) ?? null;
    if (!pokemon) return;

    selectPokemon(side, pokemon);
    if (side === "attacker") {
      setMoveId(
        pokemon.moves.some(({ id }) => id === history.moveId)
          ? (history.moveId ?? "")
          : "",
      );
    }
  }

  function changeUnknownSide(nextSide: UnknownSide) {
    setUnknownSide(nextSide);
  }

  const candidates = useReverseDamageCandidates({
    attacker,
    defender,
    fieldOptions,
    heldItems,
    observedDamageValue,
    observedPercentValue,
    percentTolerance,
    relevantStatIds,
    selectedMove,
    statAdjustments,
    typeEffectivenessSource,
    unknownSide,
  });

  const visibleCandidates = candidates.slice(0, 120);
  const unknownStatLabel =
    unknownSide === "attacker"
      ? STAT_LABELS[relevantStatIds.attacker]
      : STAT_LABELS[relevantStatIds.defender];

  return (
    <form
      className={`${damageStyles.calculator} ${styles.reverseCalculator}`}
      onSubmit={(event) => event.preventDefault()}
    >
      <ReverseDamageObservationSection
        unknownSide={unknownSide}
        observedDamage={observedDamage}
        observedPercent={observedPercent}
        observedPercentValue={observedPercentValue}
        percentTolerance={percentTolerance}
        onUnknownSideChange={changeUnknownSide}
        onObservedDamageChange={setObservedDamage}
        onObservedPercentChange={setObservedPercent}
        onPercentToleranceChange={setPercentTolerance}
      />

      <section className={damageStyles.side}>
        <SideContent
          side="attacker"
          title="攻撃側"
          unknownSide={unknownSide}
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          selection={attackerSelection}
          history={attackerHistory}
          selectedTeam={selectedTeams.attacker}
          selectedTeamMembers={selectedTeamMembers.attacker}
          selectedBuildId={selectedBuildIds.attacker}
          teamLoadError={teamLoadError}
          statAdjustment={statAdjustments.attacker[relevantStatIds.attacker]}
          statLabel={STAT_LABELS[relevantStatIds.attacker]}
          showControls={unknownSide !== "attacker"}
          onOpenTeam={() => setTeamModalSide("attacker")}
          onSelectTeamMember={(build) => selectTeamMember("attacker", build)}
          onSelectPokemon={(pokemon) => selectPokemon("attacker", pokemon)}
          onRestore={restoreHistory}
          onAbilityChange={(abilityId) => changeAbility("attacker", abilityId)}
          onHeldItemChange={(itemId) => changeHeldItem("attacker", itemId)}
          onStatChange={(values) =>
            changeStatAdjustment("attacker", relevantStatIds.attacker, values)
          }
        >
          <MoveSelect
            label="使用する技"
            moves={attacker?.moves ?? []}
            defenderTypes={defender?.types ?? []}
            typeEffectivenessSource={typeEffectivenessSource}
            selectedMoveId={moveId}
            disabled={!attacker}
            onChange={setMoveId}
          />
          {selectedMove ? <MoveSummary move={selectedMove} /> : null}
        </SideContent>
      </section>

      <div className={damageStyles.versus}>
        <span>VS</span>
      </div>

      <section className={damageStyles.side}>
        <SideContent
          side="defender"
          title="防御側"
          unknownSide={unknownSide}
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          selection={defenderSelection}
          history={defenderHistory}
          selectedTeam={selectedTeams.defender}
          selectedTeamMembers={selectedTeamMembers.defender}
          selectedBuildId={selectedBuildIds.defender}
          teamLoadError={teamLoadError}
          statAdjustment={statAdjustments.defender[relevantStatIds.defender]}
          hpAdjustment={statAdjustments.defender.hp}
          statLabel={STAT_LABELS[relevantStatIds.defender]}
          showControls={unknownSide !== "defender"}
          onOpenTeam={() => setTeamModalSide("defender")}
          onSelectTeamMember={(build) => selectTeamMember("defender", build)}
          onSelectPokemon={(pokemon) => selectPokemon("defender", pokemon)}
          onRestore={restoreHistory}
          onAbilityChange={(abilityId) => changeAbility("defender", abilityId)}
          onHeldItemChange={(itemId) => changeHeldItem("defender", itemId)}
          onStatChange={(values) =>
            changeStatAdjustment("defender", relevantStatIds.defender, values)
          }
          onHpChange={(values) => changeStatAdjustment("defender", "hp", values)}
        />
      </section>

      <section className={damageStyles.fieldConditions}>
        <div>
          <p>FIELD</p>
          <h2>場の条件</h2>
        </div>
        <label>
          天候
          <select
            value={weatherId}
            onChange={(event) => setWeatherId(event.target.value)}
          >
            <option value="">なし</option>
            {weathers.map((weather) => (
              <option value={weather.id} key={weather.id}>
                {weather.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          フィールド
          <select
            value={terrainId}
            onChange={(event) => setTerrainId(event.target.value)}
          >
            <option value="">なし</option>
            {terrains.map((terrain) => (
              <option value={terrain.id} key={terrain.id}>
                {terrain.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={`${damageStyles.result} ${styles.reverseResult}`} aria-live="polite">
        <div className={damageStyles.resultHeader}>
          <strong>
            {selectedMove
              ? `${unknownStatLabel}候補 ${candidates.length}件`
              : "条件を入力してください"}
          </strong>
          {candidates.length > visibleCandidates.length ? (
            <span className={damageStyles.resultMove}>
              先頭 {visibleCandidates.length} 件
            </span>
          ) : null}
        </div>
        {!attacker || !defender || !selectedMove ? (
          <p className={styles.resultNotice}>
            攻撃側、防御側、技、観測値を入れると候補を表示します。
          </p>
        ) : visibleCandidates.length === 0 ? (
          <p className={styles.resultNotice}>
            一致する候補がありません。急所、持ち物、特性、天候、場合の誤差を確認してください。
          </p>
        ) : (
          <ReverseResultTable
            unknownSide={unknownSide}
            unknownStatLabel={unknownStatLabel}
            candidates={visibleCandidates}
          />
        )}
      </section>

      {teamModalSide ? (
        <BattleTeamModal
          teams={battleTeams}
          selectedTeamId={selectedTeamIds[teamModalSide]}
          onSelect={(team) => selectBattleTeam(teamModalSide, team)}
          onClose={() => setTeamModalSide(null)}
        />
      ) : null}
    </form>
  );
}
