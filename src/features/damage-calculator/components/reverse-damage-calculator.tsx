"use client";

import { useMemo, useState } from "react";
import { championsDamageCalculator } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "../domain/damage-calculator-types";
import { PokemonCombobox } from "./pokemon-combobox";
import styles from "../styles/reverse-damage-calculator.module.css";

type Side = "attacker" | "defender";
type UnknownSide = "attacker" | "defender";
type ObservationMode = "raw" | "percent";
type StatId =
  | "hp"
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense";
type NonHpStatId = Exclude<StatId, "hp">;

type SelectionState = {
  pokemon: DamageCalculatorPokemon | null;
  query: string;
};

type KnownStatState = {
  hp: number;
  offense: number;
  defense: number;
  offenseRank: number;
  defenseRank: number;
  offenseNature: boolean;
  defenseNature: boolean;
};

type Candidate = {
  id: string;
  hpPoint: number | null;
  statPoint: number;
  statValue: number;
  hpValue: number;
  nature: boolean;
  rank: number;
  critical: boolean;
  minimum: number;
  maximum: number;
  minimumPercent: number;
  maximumPercent: number;
};

const POINT_MIN = 0;
const POINT_MAX = 32;
const RANK_MIN = -6;
const RANK_MAX = 6;

const STAT_LABELS: Record<NonHpStatId, string> = {
  attack: "こうげき",
  defense: "ぼうぎょ",
  "special-attack": "とくこう",
  "special-defense": "とくぼう",
};

function createSelectionState(): SelectionState {
  return { pokemon: null, query: "" };
}

function createKnownStatState(): KnownStatState {
  return {
    hp: 0,
    offense: 0,
    defense: 0,
    offenseRank: 0,
    defenseRank: 0,
    offenseNature: false,
    defenseNature: false,
  };
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function calculateActualStat(
  pokemon: DamageCalculatorPokemon,
  statId: StatId | "speed",
  point = 0,
  nature = false,
) {
  const baseStat = pokemon.stats[statId] ?? 1;
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * (nature ? 1.1 : 1));
}

function createNeutralActualStats(pokemon: DamageCalculatorPokemon) {
  return {
    hp: calculateActualStat(pokemon, "hp"),
    attack: calculateActualStat(pokemon, "attack"),
    defense: calculateActualStat(pokemon, "defense"),
    "special-attack": calculateActualStat(pokemon, "special-attack"),
    "special-defense": calculateActualStat(pokemon, "special-defense"),
    speed: calculateActualStat(pokemon, "speed"),
  };
}

function getRelevantStatIds(move: DamageCalculatorMove | null) {
  if (move?.damageClass === "physical") {
    return { offense: "attack", defense: "defense" } as const;
  }
  return {
    offense: "special-attack",
    defense: "special-defense",
  } as const;
}

function withBattleOptions({
  pokemon,
  heldItemId,
  abilityId,
  heldItems,
  pointByStat,
  natureByStat,
  rankByStat,
}: {
  pokemon: DamageCalculatorPokemon;
  heldItemId: string;
  abilityId: string;
  heldItems: DamageCalculatorHeldItem[];
  pointByStat: Partial<Record<StatId, number>>;
  natureByStat: Partial<Record<NonHpStatId, boolean>>;
  rankByStat: Partial<Record<NonHpStatId, number>>;
}): DamageCalculatorPokemon {
  const actualStats = createNeutralActualStats(pokemon);
  for (const [statId, point] of Object.entries(pointByStat) as [
    StatId,
    number,
  ][]) {
    actualStats[statId] = calculateActualStat(
      pokemon,
      statId,
      point,
      statId === "hp" ? false : (natureByStat[statId] ?? false),
    );
  }

  return {
    ...pokemon,
    actualStats,
    boosts: rankByStat,
    heldItem: heldItems.find((item) => item.id === heldItemId) ?? null,
    selectedAbility:
      pokemon.abilities.find((ability) => ability.id === abilityId) ?? null,
  };
}

function valueMatchesCandidate({
  mode,
  observedValue,
  minimum,
  maximum,
  minimumPercent,
  maximumPercent,
  tolerance,
}: {
  mode: ObservationMode;
  observedValue: number;
  minimum: number;
  maximum: number;
  minimumPercent: number;
  maximumPercent: number;
  tolerance: number;
}) {
  if (mode === "raw") {
    return observedValue >= minimum && observedValue <= maximum;
  }

  return (
    observedValue + tolerance >= minimumPercent &&
    observedValue - tolerance <= maximumPercent
  );
}

function formatRange(minimum: number, maximum: number, suffix = "") {
  return minimum === maximum
    ? `${minimum.toFixed(suffix ? 1 : 0)}${suffix}`
    : `${minimum.toFixed(suffix ? 1 : 0)}-${maximum.toFixed(suffix ? 1 : 0)}${suffix}`;
}

function formatRank(rank: number) {
  return rank > 0 ? `+${rank}` : String(rank);
}

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
  const [unknownSide, setUnknownSide] = useState<UnknownSide>("attacker");
  const [observationMode, setObservationMode] =
    useState<ObservationMode>("raw");
  const [observedValue, setObservedValue] = useState(100);
  const [percentTolerance, setPercentTolerance] = useState(0.1);
  const [attackerSelection, setAttackerSelection] = useState(
    createSelectionState,
  );
  const [defenderSelection, setDefenderSelection] = useState(
    createSelectionState,
  );
  const [moveId, setMoveId] = useState("");
  const [attackerItemId, setAttackerItemId] = useState("");
  const [defenderItemId, setDefenderItemId] = useState("");
  const [attackerAbilityId, setAttackerAbilityId] = useState("");
  const [defenderAbilityId, setDefenderAbilityId] = useState("");
  const [weatherId, setWeatherId] = useState("");
  const [terrainId, setTerrainId] = useState("");
  const [knownStats, setKnownStats] = useState(createKnownStatState);

  const attacker = attackerSelection.pokemon;
  const defender = defenderSelection.pokemon;
  const move = attacker?.moves.find((entry) => entry.id === moveId) ?? null;
  const relevantStats = getRelevantStatIds(move);
  const selectedWeather = weathers.find((weather) => weather.id === weatherId);
  const selectedTerrain = terrains.find((terrain) => terrain.id === terrainId);

  const candidates = useMemo(() => {
    if (!attacker || !defender || !move || observedValue <= 0) return [];

    const rows: Candidate[] = [];
    const criticalOptions = [false, true];

    if (unknownSide === "attacker") {
      const knownDefender = withBattleOptions({
        pokemon: defender,
        heldItemId: defenderItemId,
        abilityId: defenderAbilityId,
        heldItems,
        pointByStat: {
          hp: knownStats.hp,
          [relevantStats.defense]: knownStats.defense,
        },
        natureByStat: { [relevantStats.defense]: knownStats.defenseNature },
        rankByStat: { [relevantStats.defense]: knownStats.defenseRank },
      });

      for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
        for (const nature of [false, true]) {
          for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
            const candidateAttacker = withBattleOptions({
              pokemon: attacker,
              heldItemId: attackerItemId,
              abilityId: attackerAbilityId,
              heldItems,
              pointByStat: { [relevantStats.offense]: point },
              natureByStat: { [relevantStats.offense]: nature },
              rankByStat: { [relevantStats.offense]: rank },
            });

            for (const critical of criticalOptions) {
              const result = championsDamageCalculator.calculate({
                attacker: candidateAttacker,
                defender: knownDefender,
                move,
                isCritical: critical,
                field: {
                  weather: selectedWeather?.smogonWeather,
                  terrain: selectedTerrain?.smogonTerrain,
                },
              });

              if (
                valueMatchesCandidate({
                  mode: observationMode,
                  observedValue,
                  minimum: result.minimum,
                  maximum: result.maximum,
                  minimumPercent: result.minimumPercent,
                  maximumPercent: result.maximumPercent,
                  tolerance: percentTolerance,
                })
              ) {
                rows.push({
                  id: `a-${point}-${nature}-${rank}-${critical}`,
                  hpPoint: null,
                  statPoint: point,
                  statValue: calculateActualStat(
                    attacker,
                    relevantStats.offense,
                    point,
                    nature,
                  ),
                  hpValue: calculateActualStat(attacker, "hp"),
                  nature,
                  rank,
                  critical,
                  minimum: result.minimum,
                  maximum: result.maximum,
                  minimumPercent: result.minimumPercent,
                  maximumPercent: result.maximumPercent,
                });
              }
            }
          }
        }
      }
    } else {
      const knownAttacker = withBattleOptions({
        pokemon: attacker,
        heldItemId: attackerItemId,
        abilityId: attackerAbilityId,
        heldItems,
        pointByStat: { [relevantStats.offense]: knownStats.offense },
        natureByStat: { [relevantStats.offense]: knownStats.offenseNature },
        rankByStat: { [relevantStats.offense]: knownStats.offenseRank },
      });

      for (let hpPoint = POINT_MIN; hpPoint <= POINT_MAX; hpPoint += 1) {
        for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
          for (const nature of [false, true]) {
            for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
              const candidateDefender = withBattleOptions({
                pokemon: defender,
                heldItemId: defenderItemId,
                abilityId: defenderAbilityId,
                heldItems,
                pointByStat: {
                  hp: hpPoint,
                  [relevantStats.defense]: point,
                },
                natureByStat: { [relevantStats.defense]: nature },
                rankByStat: { [relevantStats.defense]: rank },
              });

              for (const critical of criticalOptions) {
                const result = championsDamageCalculator.calculate({
                  attacker: knownAttacker,
                  defender: candidateDefender,
                  move,
                  isCritical: critical,
                  field: {
                    weather: selectedWeather?.smogonWeather,
                    terrain: selectedTerrain?.smogonTerrain,
                  },
                });

                if (
                  valueMatchesCandidate({
                    mode: observationMode,
                    observedValue,
                    minimum: result.minimum,
                    maximum: result.maximum,
                    minimumPercent: result.minimumPercent,
                    maximumPercent: result.maximumPercent,
                    tolerance: percentTolerance,
                  })
                ) {
                  rows.push({
                    id: `d-${hpPoint}-${point}-${nature}-${rank}-${critical}`,
                    hpPoint,
                    statPoint: point,
                    statValue: calculateActualStat(
                      defender,
                      relevantStats.defense,
                      point,
                      nature,
                    ),
                    hpValue: calculateActualStat(defender, "hp", hpPoint),
                    nature,
                    rank,
                    critical,
                    minimum: result.minimum,
                    maximum: result.maximum,
                    minimumPercent: result.minimumPercent,
                    maximumPercent: result.maximumPercent,
                  });
                }
              }
            }
          }
        }
      }
    }

    return rows.sort((a, b) => {
      if (a.critical !== b.critical) return Number(a.critical) - Number(b.critical);
      if ((a.hpPoint ?? -1) !== (b.hpPoint ?? -1)) {
        return (a.hpPoint ?? -1) - (b.hpPoint ?? -1);
      }
      if (a.statPoint !== b.statPoint) return a.statPoint - b.statPoint;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return Number(a.nature) - Number(b.nature);
    });
  }, [
    attacker,
    attackerAbilityId,
    attackerItemId,
    defender,
    defenderAbilityId,
    defenderItemId,
    heldItems,
    knownStats,
    move,
    observationMode,
    observedValue,
    percentTolerance,
    relevantStats.defense,
    relevantStats.offense,
    selectedTerrain?.smogonTerrain,
    selectedWeather?.smogonWeather,
    unknownSide,
  ]);

  const visibleCandidates = candidates.slice(0, 120);
  const unknownStatLabel =
    unknownSide === "attacker"
      ? STAT_LABELS[relevantStats.offense]
      : STAT_LABELS[relevantStats.defense];

  function updateSelection(side: Side, pokemon: DamageCalculatorPokemon | null) {
    if (side === "attacker") {
      setAttackerSelection({ pokemon, query: pokemon?.nameJa ?? "" });
      setMoveId("");
      setAttackerAbilityId("");
    } else {
      setDefenderSelection({ pokemon, query: pokemon?.nameJa ?? "" });
      setDefenderAbilityId("");
    }
  }

  function setKnownStatValue(key: keyof KnownStatState, value: number | boolean) {
    setKnownStats((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className={styles.calculator}>
      <div className={styles.toolbar} aria-label="逆引き条件">
        <div className={styles.segmentedControl}>
          <button
            type="button"
            aria-pressed={unknownSide === "attacker"}
            onClick={() => setUnknownSide("attacker")}
          >
            攻撃側を逆引き
          </button>
          <button
            type="button"
            aria-pressed={unknownSide === "defender"}
            onClick={() => setUnknownSide("defender")}
          >
            防御側を逆引き
          </button>
        </div>
        <label>
          観測値
          <div className={styles.inlineInputs}>
            <select
              value={observationMode}
              onChange={(event) =>
                setObservationMode(event.target.value as ObservationMode)
              }
            >
              <option value="raw">ダメージ量</option>
              <option value="percent">HP割合</option>
            </select>
            <input
              type="number"
              min="0"
              step={observationMode === "raw" ? 1 : 0.1}
              value={observedValue}
              onChange={(event) => setObservedValue(Number(event.target.value))}
            />
          </div>
        </label>
        {observationMode === "percent" ? (
          <label>
            許容誤差
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={percentTolerance}
              onChange={(event) =>
                setPercentTolerance(Math.max(0, Number(event.target.value)))
              }
            />
          </label>
        ) : null}
      </div>

      <div className={styles.sides}>
        <SidePanel
          side="attacker"
          title="攻撃側"
          selection={attackerSelection}
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          itemId={attackerItemId}
          abilityId={attackerAbilityId}
          knownStats={knownStats}
          relevantStat={relevantStats.offense}
          unknownSide={unknownSide}
          onQueryChange={(query) =>
            setAttackerSelection((current) => ({ ...current, query }))
          }
          onPokemonSelect={(pokemon) => updateSelection("attacker", pokemon)}
          onItemChange={setAttackerItemId}
          onAbilityChange={setAttackerAbilityId}
          onKnownStatChange={setKnownStatValue}
        />
        <SidePanel
          side="defender"
          title="防御側"
          selection={defenderSelection}
          pokemonCatalog={pokemonCatalog}
          heldItems={heldItems}
          itemId={defenderItemId}
          abilityId={defenderAbilityId}
          knownStats={knownStats}
          relevantStat={relevantStats.defense}
          unknownSide={unknownSide}
          onQueryChange={(query) =>
            setDefenderSelection((current) => ({ ...current, query }))
          }
          onPokemonSelect={(pokemon) => updateSelection("defender", pokemon)}
          onItemChange={setDefenderItemId}
          onAbilityChange={setDefenderAbilityId}
          onKnownStatChange={setKnownStatValue}
        />
      </div>

      <div className={styles.conditions}>
        <label>
          技
          <select
            value={moveId}
            disabled={!attacker}
            onChange={(event) => setMoveId(event.target.value)}
          >
            <option value="">技を選択</option>
            {attacker?.moves.map((candidateMove) => (
              <option value={candidateMove.id} key={candidateMove.id}>
                {candidateMove.name} / {candidateMove.power || "変動"} /{" "}
                {candidateMove.damageClass === "physical" ? "物理" : "特殊"}
              </option>
            ))}
          </select>
        </label>
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
      </div>

      <section className={styles.results} aria-live="polite">
        <div className={styles.resultsHeader}>
          <div>
            <p>Reverse Lookup</p>
            <h2>
              {move
                ? `${unknownStatLabel}候補 ${candidates.length}件`
                : "条件を入力してください"}
            </h2>
          </div>
          {candidates.length > visibleCandidates.length ? (
            <span>先頭 {visibleCandidates.length} 件を表示</span>
          ) : null}
        </div>
        {!attacker || !defender || !move ? (
          <p className={styles.emptyState}>
            攻撃側、防御側、技、観測値を入れると候補を表示します。
          </p>
        ) : visibleCandidates.length === 0 ? (
          <p className={styles.emptyState}>
            一致する候補がありません。急所、持ち物、特性、天候、割合の誤差を確認してください。
          </p>
        ) : (
          <div className={styles.resultTable}>
            <div className={styles.resultHead}>
              {unknownSide === "defender" ? <span>HP</span> : null}
              <span>{unknownStatLabel}</span>
              <span>補正</span>
              <span>ランク</span>
              <span>判定</span>
              <span>ダメージ</span>
            </div>
            {visibleCandidates.map((candidate) => (
              <div className={styles.resultRow} key={candidate.id}>
                {unknownSide === "defender" ? (
                  <span>
                    {candidate.hpPoint}pt
                    <small>実数値 {candidate.hpValue}</small>
                  </span>
                ) : null}
                <span>
                  {candidate.statPoint}pt
                  <small>実数値 {candidate.statValue}</small>
                </span>
                <span>{candidate.nature ? "あり" : "なし"}</span>
                <span>{formatRank(candidate.rank)}</span>
                <span>{candidate.critical ? "急所" : "通常"}</span>
                <span>
                  {formatRange(candidate.minimum, candidate.maximum)}
                  <small>
                    {formatRange(
                      candidate.minimumPercent,
                      candidate.maximumPercent,
                      "%",
                    )}
                  </small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function SidePanel({
  side,
  title,
  selection,
  pokemonCatalog,
  heldItems,
  itemId,
  abilityId,
  knownStats,
  relevantStat,
  unknownSide,
  onQueryChange,
  onPokemonSelect,
  onItemChange,
  onAbilityChange,
  onKnownStatChange,
}: {
  side: Side;
  title: string;
  selection: SelectionState;
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  itemId: string;
  abilityId: string;
  knownStats: KnownStatState;
  relevantStat: NonHpStatId;
  unknownSide: UnknownSide;
  onQueryChange: (query: string) => void;
  onPokemonSelect: (pokemon: DamageCalculatorPokemon | null) => void;
  onItemChange: (itemId: string) => void;
  onAbilityChange: (abilityId: string) => void;
  onKnownStatChange: (key: keyof KnownStatState, value: number | boolean) => void;
}) {
  const isUnknown = unknownSide === side;
  const knownPointKey = side === "attacker" ? "offense" : "defense";
  const knownRankKey = side === "attacker" ? "offenseRank" : "defenseRank";
  const knownNatureKey =
    side === "attacker" ? "offenseNature" : "defenseNature";
  const abilities = selection.pokemon?.abilities ?? [];

  return (
    <section className={styles.sidePanel}>
      <div className={styles.sideHeader}>
        <h2>{title}</h2>
        <span>{isUnknown ? "逆引き対象" : "既知"}</span>
      </div>
      <PokemonCombobox
        id={`reverse-${side}`}
        label={`${title}ポケモン`}
        pokemonCatalog={pokemonCatalog}
        selectedPokemon={selection.pokemon}
        inputValue={selection.query}
        onInputValueChange={onQueryChange}
        onSelect={onPokemonSelect}
      />
      <div className={styles.selectGrid}>
        <label>
          持ち物
          <select value={itemId} onChange={(event) => onItemChange(event.target.value)}>
            <option value="">なし</option>
            {heldItems.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          特性
          <select
            value={abilityId}
            disabled={!selection.pokemon}
            onChange={(event) => onAbilityChange(event.target.value)}
          >
            <option value="">なし</option>
            {abilities.map((ability: DamageCalculatorAbility) => (
              <option value={ability.id} key={ability.id}>
                {ability.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!isUnknown ? (
        <div className={styles.knownStats}>
          {side === "defender" ? (
            <NumberControl
              label="HP能力ポイント"
              value={knownStats.hp}
              min={POINT_MIN}
              max={POINT_MAX}
              onChange={(value) => onKnownStatChange("hp", value)}
            />
          ) : null}
          <NumberControl
            label={`${STAT_LABELS[relevantStat]}能力ポイント`}
            value={knownStats[knownPointKey]}
            min={POINT_MIN}
            max={POINT_MAX}
            onChange={(value) => onKnownStatChange(knownPointKey, value)}
          />
          <NumberControl
            label="能力ランク"
            value={knownStats[knownRankKey]}
            min={RANK_MIN}
            max={RANK_MAX}
            onChange={(value) => onKnownStatChange(knownRankKey, value)}
          />
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={knownStats[knownNatureKey]}
              onChange={(event) =>
                onKnownStatChange(knownNatureKey, event.target.checked)
              }
            />
            性格補正あり
          </label>
        </div>
      ) : (
        <p className={styles.unknownHint}>
          {side === "defender"
            ? "HPと防御側能力ポイントを候補として調べます。"
            : "攻撃側能力ポイントを候補として調べます。"}
        </p>
      )}
    </section>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
      />
    </label>
  );
}
