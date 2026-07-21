"use client";

import { useState } from "react";
import { CHAMPIONS_DAMAGE_RULESET } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import { PokemonCombobox } from "./pokemon-combobox";
import type {
  DamageHistoryRecord,
  DamageHistorySide,
} from "../infrastructure/damage-history-repository";
import type {
  BattleTeam,
  TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import type { TypeEffectivenessSource } from "@/domain/type-matchup";
import { STAT_LABELS } from "./damage-calculator-display";
import {
  AbilityField,
  DamageStatControls,
  HeldItemField,
  MetronomeUseControl,
  MoveSelect,
  VariableMovePowerField,
} from "./damage-calculator-form-widgets";
import {
  BattleTeamModal,
  PokemonImage,
  PokemonSummary,
  RecentPokemonList,
  SmallPokemonName,
  SpeedComparisonModal,
} from "./damage-calculator-pokemon-widgets";
import { DamageResult } from "./damage-calculator-result";
import { DetailedSpeedComparisonModal } from "./detailed-speed-comparison-modal";
import type {
  AdjustableStatId,
  CalculationResult,
  DamageSide,
  SpeedComparisonRow,
  StatAdjustment,
} from "./damage-calculator-types";
import type { StatAdjustmentState } from "./damage-calculator-state";
import styles from "../styles/damage-calculator.module.css";

// 通常ダメージ計算ページの見た目を組み立てるファイル。
// 状態更新や計算は親へ任せ、ここでは「どの入力をどこに置くか」だけを扱う。

type PokemonSelection = {
  pokemon: DamageCalculatorPokemon | null;
  query: string;
  setQuery: (query: string) => void;
  select: (nextPokemon: DamageCalculatorPokemon | null) => void;
};
type TeamMembersBySide = Record<
  DamageSide,
  { build: TrainingBuild; pokemon: DamageCalculatorPokemon }[]
>;

type DamageCalculatorViewProps = {
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
  attackerSelection: PokemonSelection;
  defenderSelection: PokemonSelection;
  attacker: DamageCalculatorPokemon | null;
  defender: DamageCalculatorPokemon | null;
  selectedMove: DamageCalculatorMove | undefined;
  multiHitRange: { minimum: number; maximum: number } | null;
  useMaximumHits: boolean;
  moveId: string;
  variableMovePowerOptions: readonly number[] | null;
  typeEffectivenessSource: TypeEffectivenessSource | null;
  selectedTeams: Record<DamageSide, BattleTeam | null>;
  selectedTeamMembers: TeamMembersBySide;
  selectedBuildIds: Record<DamageSide, number | null>;
  attackerHistory: DamageHistoryRecord[];
  defenderHistory: DamageHistoryRecord[];
  battleTeams: BattleTeam[];
  selectedTeamIds: Record<DamageSide, number | null>;
  teamModalSide: DamageSide | null;
  teamLoadError: string;
  abilityConditionEnabled: Record<DamageSide, boolean>;
  metronomeConsecutiveUseCount: number;
  statAdjustments: StatAdjustmentState;
  relevantStatIds: Record<DamageSide, AdjustableStatId | null>;
  weatherId: string;
  terrainId: string;
  result: CalculationResult | null;
  error: string | null;
  speedModalOpen: boolean;
  speedComparisonRows: SpeedComparisonRow[];
  getTrainingDetailHref: (
    pokemon: DamageCalculatorPokemon | null,
    buildId: number | null,
  ) => string | undefined;
  onOpenTeamModal: (side: DamageSide) => void;
  onSelectTeam: (team: BattleTeam) => void;
  onCloseTeamModal: () => void;
  onSelectTeamMember: (side: DamageSide, build: TrainingBuild) => void;
  onSelectAttacker: (pokemon: DamageCalculatorPokemon | null) => void;
  onSelectDefender: (pokemon: DamageCalculatorPokemon | null) => void;
  onRestoreHistory: (
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) => void;
  onAbilityChange: (side: DamageSide, abilityId: string) => void;
  onAbilityConditionChange: (side: DamageSide, enabled: boolean) => void;
  onHeldItemChange: (side: DamageSide, itemId: string) => void;
  onMetronomeCountChange: (value: number) => void;
  onMoveChange: (moveId: string) => void;
  onUseMaximumHitsChange: (enabled: boolean) => void;
  onVariableMovePowerChange: (power: number) => void;
  onStatAdjustmentChange: (
    side: DamageSide,
    statId: AdjustableStatId,
    values: Partial<StatAdjustment>,
  ) => void;
  onSwapSides: () => void;
  onWeatherChange: (weatherId: string) => void;
  onTerrainChange: (terrainId: string) => void;
  onSpeedModalOpenChange: (open: boolean) => void;
};

/**
 * ダメージ計算ページで、攻撃側に表示する能力補正欄を決める。
 *
 * @param selectedMove - 現在選択されている技。未選択ならundefined。
 * @param relevantStatId - 技選択済みのときに計算へ使う攻撃能力。
 * @returns 表示する攻撃能力ID。技未選択時はA/Cを先に編集できるようにする。
 */
function getAttackerAdjustmentStatIds(
  selectedMove: DamageCalculatorMove | undefined,
  relevantStatId: AdjustableStatId | null,
): AdjustableStatId[] {
  return selectedMove && relevantStatId
    ? [relevantStatId]
    : ["attack", "special-attack"];
}

/**
 * ダメージ計算ページで、防御側に表示する能力補正欄を決める。
 *
 * @param selectedMove - 現在選択されている技。未選択ならundefined。
 * @param relevantStatId - 技選択済みのときに計算へ使う防御能力。
 * @returns 表示する防御能力ID。HPは常に出し、技未選択時はB/Dも先に編集できるようにする。
 */
function getDefenderAdjustmentStatIds(
  selectedMove: DamageCalculatorMove | undefined,
  relevantStatId: AdjustableStatId | null,
): AdjustableStatId[] {
  return selectedMove && relevantStatId
    ? ["hp", relevantStatId]
    : ["hp", "defense", "special-defense"];
}

export function DamageCalculatorView({
  pokemonCatalog,
  heldItems,
  weathers,
  terrains,
  attackerSelection,
  defenderSelection,
  attacker,
  defender,
  selectedMove,
  multiHitRange,
  useMaximumHits,
  moveId,
  variableMovePowerOptions,
  typeEffectivenessSource,
  selectedTeams,
  selectedTeamMembers,
  selectedBuildIds,
  attackerHistory,
  defenderHistory,
  battleTeams,
  selectedTeamIds,
  teamModalSide,
  teamLoadError,
  abilityConditionEnabled,
  metronomeConsecutiveUseCount,
  statAdjustments,
  relevantStatIds,
  weatherId,
  terrainId,
  result,
  error,
  speedModalOpen,
  speedComparisonRows,
  getTrainingDetailHref,
  onOpenTeamModal,
  onSelectTeam,
  onCloseTeamModal,
  onSelectTeamMember,
  onSelectAttacker,
  onSelectDefender,
  onRestoreHistory,
  onAbilityChange,
  onAbilityConditionChange,
  onHeldItemChange,
  onMetronomeCountChange,
  onMoveChange,
  onUseMaximumHitsChange,
  onVariableMovePowerChange,
  onStatAdjustmentChange,
  onSwapSides,
  onWeatherChange,
  onTerrainChange,
  onSpeedModalOpenChange,
}: DamageCalculatorViewProps) {
  const [detailedSpeedModalOpen, setDetailedSpeedModalOpen] = useState(false);
  const attackerAdjustmentStatIds = getAttackerAdjustmentStatIds(
    selectedMove,
    relevantStatIds.attacker,
  );
  const defenderAdjustmentStatIds = getDefenderAdjustmentStatIds(
    selectedMove,
    relevantStatIds.defender,
  );

  return (
    <form className={styles.calculator} onSubmit={(event) => event.preventDefault()}>
      {/* 攻撃側。技選択と攻撃側補正はchildrenとしてこのパネルに差し込む。 */}
      <BattleSidePanel
        side="attacker"
        title="攻撃側"
        team={selectedTeams.attacker}
        teamMembers={selectedTeamMembers.attacker}
        teamLoadError={teamLoadError}
        selection={attackerSelection}
        pokemon={attacker}
        pokemonCatalog={pokemonCatalog}
        history={attackerHistory}
        selectedBuildId={selectedBuildIds.attacker}
        heldItems={heldItems}
        abilityConditionEnabled={abilityConditionEnabled.attacker}
        onOpenTeam={() => onOpenTeamModal("attacker")}
        onSelectTeamMember={(build) => onSelectTeamMember("attacker", build)}
        onSelectPokemon={onSelectAttacker}
        onRestoreHistory={onRestoreHistory}
        getTrainingDetailHref={getTrainingDetailHref}
        onAbilityChange={(abilityId) => onAbilityChange("attacker", abilityId)}
        onAbilityConditionChange={(enabled) =>
          onAbilityConditionChange("attacker", enabled)
        }
        onHeldItemChange={(itemId) => onHeldItemChange("attacker", itemId)}
      >
        {attacker?.heldItem?.id === "metronome" ? (
          <MetronomeUseControl
            value={metronomeConsecutiveUseCount}
            onChange={onMetronomeCountChange}
          />
        ) : null}
        <MoveSelect
          label="使用する技"
          moves={attacker?.moves ?? []}
          defenderTypes={defender?.types ?? []}
          typeEffectivenessSource={typeEffectivenessSource}
          selectedMoveId={moveId}
          selectedMoveFallback={selectedMove}
          disabled={!attacker}
          onChange={onMoveChange}
        />
        {multiHitRange && multiHitRange.maximum > multiHitRange.minimum ? (
          <label className={styles.maximumHitsToggle}>
            <input
              type="checkbox"
              checked={useMaximumHits}
              onChange={(event) =>
                onUseMaximumHitsChange(event.target.checked)
              }
            />
            最大回数（{multiHitRange.maximum}回）で計算
          </label>
        ) : null}
        {selectedMove && variableMovePowerOptions ? (
          <VariableMovePowerField
            moveName={selectedMove.name}
            options={variableMovePowerOptions}
            value={selectedMove.power}
            onChange={onVariableMovePowerChange}
          />
        ) : null}
        {attackerAdjustmentStatIds.map((statId) => (
          <DamageStatControls
            key={statId}
            title="攻撃側の補正"
            statLabel={STAT_LABELS[statId]}
            value={statAdjustments.attacker[statId]}
            onChange={(values) => onStatAdjustmentChange("attacker", statId, values)}
          />
        ))}
      </BattleSidePanel>

      {/* 攻守交代は左右の入力を入れ替える操作なので、2つのパネルの間に置く。 */}
      <div className={styles.battleActions}>
        <button type="button" onClick={onSwapSides} disabled={!attacker && !defender}>
          攻守交代
        </button>
      </div>

      {/* 防御側。HP補正と防御能力補正の2種類をここで表示する。 */}
      <BattleSidePanel
        side="defender"
        title="防御側"
        team={selectedTeams.defender}
        teamMembers={selectedTeamMembers.defender}
        teamLoadError={teamLoadError}
        selection={defenderSelection}
        pokemon={defender}
        pokemonCatalog={pokemonCatalog}
        history={defenderHistory}
        selectedBuildId={selectedBuildIds.defender}
        heldItems={heldItems}
        abilityConditionEnabled={abilityConditionEnabled.defender}
        onOpenTeam={() => onOpenTeamModal("defender")}
        onSelectTeamMember={(build) => onSelectTeamMember("defender", build)}
        onSelectPokemon={onSelectDefender}
        onRestoreHistory={onRestoreHistory}
        getTrainingDetailHref={getTrainingDetailHref}
        onAbilityChange={(abilityId) => onAbilityChange("defender", abilityId)}
        onAbilityConditionChange={(enabled) =>
          onAbilityConditionChange("defender", enabled)
        }
        onHeldItemChange={(itemId) => onHeldItemChange("defender", itemId)}
      >
        {defenderAdjustmentStatIds.map((statId) => (
          <DamageStatControls
            key={statId}
            title={statId === "hp" ? "防御側のHP" : "防御側の補正"}
            statLabel={STAT_LABELS[statId]}
            value={statAdjustments.defender[statId]}
            showRank={statId !== "hp"}
            showNature={statId !== "hp"}
            onChange={(values) => onStatAdjustmentChange("defender", statId, values)}
          />
        ))}
      </BattleSidePanel>

      {/* 天候・フィールドは攻防どちらにも属さない共通条件。 */}
      <FieldConditionSection
        weathers={weathers}
        terrains={terrains}
        weatherId={weatherId}
        terrainId={terrainId}
        onWeatherChange={onWeatherChange}
        onTerrainChange={onTerrainChange}
      />

      <div className={styles.conditions}>
        基準式: 第{CHAMPIONS_DAMAGE_RULESET.generation}世代・レベル
        {CHAMPIONS_DAMAGE_RULESET.level}
        ・個体値31・努力値0・性格補正なし・HP満タンで計算します。
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {result ? <DamageResult result={result} /> : null}
      <button
        className={styles.speedCompareButton}
        type="button"
        disabled={!attacker && !defender}
        onClick={() => onSpeedModalOpenChange(true)}
      >
        かんたん素早さ比較
      </button>
      <button
        className={`${styles.speedCompareButton} ${styles.detailedSpeedCompareButton}`}
        type="button"
        disabled={!attacker && !defender}
        onClick={() => setDetailedSpeedModalOpen(true)}
      >
        詳細すばやさ比較
      </button>
      {speedModalOpen ? (
        <SpeedComparisonModal
          attackerName={attacker?.nameJa ?? "攻撃側未選択"}
          defenderName={defender?.nameJa ?? "防御側未選択"}
          rows={speedComparisonRows}
          onClose={() => onSpeedModalOpenChange(false)}
        />
      ) : null}
      {detailedSpeedModalOpen ? (
        <DetailedSpeedComparisonModal
          attacker={attacker}
          defender={defender}
          heldItems={heldItems}
          onClose={() => setDetailedSpeedModalOpen(false)}
        />
      ) : null}
      {teamModalSide ? (
        <BattleTeamModal
          teams={battleTeams}
          selectedTeamId={selectedTeamIds[teamModalSide]}
          onSelect={onSelectTeam}
          onClose={onCloseTeamModal}
        />
      ) : null}
    </form>
  );
}

function BattleSidePanel({
  side,
  title,
  team,
  teamMembers,
  teamLoadError,
  selection,
  pokemon,
  pokemonCatalog,
  history,
  selectedBuildId,
  heldItems,
  abilityConditionEnabled,
  children,
  onOpenTeam,
  onSelectTeamMember,
  onSelectPokemon,
  onRestoreHistory,
  getTrainingDetailHref,
  onAbilityChange,
  onAbilityConditionChange,
  onHeldItemChange,
}: {
  side: DamageSide;
  title: string;
  team: BattleTeam | null;
  teamMembers: { build: TrainingBuild; pokemon: DamageCalculatorPokemon }[];
  teamLoadError: string;
  selection: PokemonSelection;
  pokemon: DamageCalculatorPokemon | null;
  pokemonCatalog: DamageCalculatorPokemon[];
  history: DamageHistoryRecord[];
  selectedBuildId: number | null;
  heldItems: DamageCalculatorHeldItem[];
  abilityConditionEnabled: boolean;
  children?: React.ReactNode;
  onOpenTeam: () => void;
  onSelectTeamMember: (build: TrainingBuild) => void;
  onSelectPokemon: (pokemon: DamageCalculatorPokemon | null) => void;
  onRestoreHistory: (
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) => void;
  getTrainingDetailHref: (
    pokemon: DamageCalculatorPokemon | null,
    buildId: number | null,
  ) => string | undefined;
  onAbilityChange: (abilityId: string) => void;
  onAbilityConditionChange: (enabled: boolean) => void;
  onHeldItemChange: (itemId: string) => void;
}) {
  // 攻撃側/防御側で共通する入力のまとまり。
  // パネルごとの違いはchildrenで受け取り、同じ見た目を維持する。
  return (
    <section className={styles.side}>
      <h2>{title}</h2>
      <div className={styles.teamPicker}>
        <button type="button" onClick={onOpenTeam}>
          バトルチームを選択
        </button>
        <span>{team?.name ?? "未選択"}</span>
      </div>
      {teamLoadError ? (
        <p className={styles.teamError} role="alert">
          {teamLoadError}
        </p>
      ) : null}
      {teamMembers.length > 0 ? (
        <div className={styles.teamPokemon}>
          {teamMembers.map(({ build, pokemon: member }) => (
            <button
              type="button"
              title={`${build.name || member.nameJa}を${title}に反映`}
              aria-label={`${build.name || member.nameJa}を${title}に反映`}
              onClick={() => onSelectTeamMember(build)}
              key={build.id}
            >
              {member.imageUrl ? (
                <PokemonImage pokemon={member} alt="" size={48} preferFallback />
              ) : (
                <SmallPokemonName name={member.nameJa} />
              )}
            </button>
          ))}
        </div>
      ) : null}
      <PokemonCombobox
        id={side}
        label={side === "attacker" ? "攻撃するポケモン" : "攻撃を受けるポケモン"}
        pokemonCatalog={pokemonCatalog}
        selectedPokemon={pokemon}
        inputValue={selection.query}
        onInputValueChange={selection.setQuery}
        onSelect={onSelectPokemon}
      />
      {team ? null : (
        <RecentPokemonList
          side={side}
          history={history}
          pokemonCatalog={pokemonCatalog}
          onRestore={onRestoreHistory}
        />
      )}
      <PokemonSummary
        pokemon={pokemon}
        href={getTrainingDetailHref(pokemon, selectedBuildId)}
      />
      <div className={styles.quickFields}>
        <AbilityField
          pokemon={pokemon}
          conditionEnabled={abilityConditionEnabled}
          onAbilityChange={onAbilityChange}
          onConditionChange={onAbilityConditionChange}
        />
        <HeldItemField
          pokemon={pokemon}
          heldItems={heldItems}
          onChange={onHeldItemChange}
        />
      </div>
      {children}
    </section>
  );
}

function FieldConditionSection({
  weathers,
  terrains,
  weatherId,
  terrainId,
  onWeatherChange,
  onTerrainChange,
}: {
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
  weatherId: string;
  terrainId: string;
  onWeatherChange: (weatherId: string) => void;
  onTerrainChange: (terrainId: string) => void;
}) {
  // 場の条件だけを扱う小さなセクション。今後条件が増えたらここに集約する。
  return (
    <section className={styles.fieldConditions}>
      <div>
        <p>BATTLE CONDITIONS</p>
        <h2>場の条件</h2>
      </div>
      <label>
        天候
        <select
          value={weatherId}
          onChange={(event) => onWeatherChange(event.target.value)}
        >
          <option value="">なし</option>
          {weathers.map((weather) => (
            <option value={weather.id} key={weather.id}>
              {weather.name}
              {weather.normallyAvailable ? "" : " (特殊)"}
            </option>
          ))}
        </select>
      </label>
      <label>
        フィールド
        <select
          value={terrainId}
          onChange={(event) => onTerrainChange(event.target.value)}
        >
          <option value="">なし</option>
          {terrains.map((terrain) => (
            <option value={terrain.id} key={terrain.id}>
              {terrain.name}
              {terrain.normallyAvailable ? "" : " (特殊)"}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
