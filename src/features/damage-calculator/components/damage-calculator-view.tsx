"use client";

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
  moveId: string;
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
  moveId,
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
  onStatAdjustmentChange,
  onSwapSides,
  onWeatherChange,
  onTerrainChange,
  onSpeedModalOpenChange,
}: DamageCalculatorViewProps) {
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
        {selectedMove && relevantStatIds.attacker ? (
          <DamageStatControls
            title="攻撃側の補正"
            statLabel={STAT_LABELS[relevantStatIds.attacker]}
            value={statAdjustments.attacker[relevantStatIds.attacker]}
            onChange={(values) =>
              onStatAdjustmentChange("attacker", relevantStatIds.attacker!, values)
            }
          />
        ) : null}
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
        {selectedMove ? (
          <DamageStatControls
            title="防御側のHP"
            statLabel={STAT_LABELS.hp}
            value={statAdjustments.defender.hp}
            showRank={false}
            showNature={false}
            onChange={(values) => onStatAdjustmentChange("defender", "hp", values)}
          />
        ) : null}
        {selectedMove && relevantStatIds.defender ? (
          <DamageStatControls
            title="防御側の補正"
            statLabel={STAT_LABELS[relevantStatIds.defender]}
            value={statAdjustments.defender[relevantStatIds.defender]}
            onChange={(values) =>
              onStatAdjustmentChange("defender", relevantStatIds.defender!, values)
            }
          />
        ) : null}
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
      {speedModalOpen ? (
        <SpeedComparisonModal
          attackerName={attacker?.nameJa ?? "攻撃側未選択"}
          defenderName={defender?.nameJa ?? "防御側未選択"}
          rows={speedComparisonRows}
          onClose={() => onSpeedModalOpenChange(false)}
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
