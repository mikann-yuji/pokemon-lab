"use client";

import { useMemo, useState } from "react";
import type { TypeEffectivenessSource, TypeName } from "@/domain/type-matchup";
import type {
  DamageCalculation,
  DamageCalculationInput,
} from "@/features/damage-calculator/application/smogon-damage-calculator";
import {
  applyAbility,
  applyHeldItem,
  applyStatAdjustment,
} from "@/features/damage-calculator/components/damage-calculator-state";
import { championsDamageCalculator } from "@/features/damage-calculator/config/champions-damage-ruleset";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorPokemon,
  DamageCalculatorTerrain,
  DamageCalculatorWeather,
} from "@/features/damage-calculator/domain/damage-calculator-types";
import type { NatureCorrection } from "@/features/damage-calculator/components/damage-calculator-types";
import {
  classifyDamageZone,
  DAMAGE_ZONE_LABELS,
  durabilityIndex,
  firepowerIndex,
  type DamageZone,
} from "../damage-adjustment-map-model";
import styles from "../styles/damage-adjustment-map.module.css";

const POINTS = [0, 4, 8, 12, 16, 20, 24, 28, 32];
const ZONE_COLORS: Record<DamageZone, string> = {
  "certain-one": "#ef5350",
  "random-one-high": "#ff7961",
  "random-one-mid": "#ff9f67",
  "random-one-low": "#ffca70",
  "certain-two": "#ffee93",
  "random-two": "#a8d8a0",
  "three-plus": "#91c4e8",
};
const NON_MATCHING_TYPES: TypeName[] = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
  "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
  "Dragon", "Dark", "Steel", "Fairy",
];

type Props = {
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  weathers: DamageCalculatorWeather[];
  terrains: DamageCalculatorTerrain[];
  typeEffectivenessSource: TypeEffectivenessSource;
};

type SideSettings = {
  point: number;
  nature: NatureCorrection;
  rank: number;
  itemId: string;
  abilityId: string;
  abilityCondition: boolean;
};

type CalculatedPoint = {
  result: DamageCalculation;
  zone: DamageZone;
  x: number;
  y: number;
  attackValue: number;
  hpValue: number;
  defenseValue: number;
};

type GridCell = CalculatedPoint & {
  attackPoint: number;
  defensePoint: number;
};

type CandidatePoint = CalculatedPoint & {
  point: number;
};

type MapData = {
  cells: GridCell[];
  current: CalculatedPoint;
  attackCandidates: CandidatePoint[];
  hpCandidates: CandidatePoint[];
  defenseCandidates: CandidatePoint[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const DEFAULT_SIDE: SideSettings = {
  point: 0,
  nature: "neutral",
  rank: 0,
  itemId: "",
  abilityId: "",
  abilityCondition: false,
};

export default function DamageAdjustmentMap(props: Props) {
  const [attackerId, setAttackerId] = useState(props.pokemonCatalog[0]?.id ?? 0);
  const [defenderId, setDefenderId] = useState(props.pokemonCatalog[1]?.id ?? 0);
  const attackerBase = props.pokemonCatalog.find((p) => p.id === attackerId) ?? null;
  const defenderBase = props.pokemonCatalog.find((p) => p.id === defenderId) ?? null;
  const [moveId, setMoveId] = useState(attackerBase?.moves[0]?.id ?? "");
  const selectedMove =
    attackerBase?.moves.find((move) => move.id === moveId) ??
    attackerBase?.moves[0] ??
    null;
  const [attackerSettings, setAttackerSettings] =
    useState<SideSettings>(DEFAULT_SIDE);
  const [defenderSettings, setDefenderSettings] =
    useState<SideSettings>(DEFAULT_SIDE);
  const [hpPoint, setHpPoint] = useState(0);
  const [weatherId, setWeatherId] = useState("");
  const [terrainId, setTerrainId] = useState("");
  const [wall, setWall] = useState(false);
  const [stab, setStab] = useState(true);

  const attackStatId =
    selectedMove?.damageClass === "special" ? "special-attack" : "attack";
  const defenseStatId =
    selectedMove?.damageClass === "special" ? "special-defense" : "defense";

  const weather = props.weathers.find((item) => item.id === weatherId);
  const terrain = props.terrains.find((item) => item.id === terrainId);
  const field: DamageCalculationInput["field"] = {
    ...(weather ? { weather: weather.smogonWeather } : {}),
    ...(terrain ? { terrain: terrain.smogonTerrain } : {}),
    defenderSide: {
      isReflect: wall && selectedMove?.damageClass === "physical",
      isLightScreen: wall && selectedMove?.damageClass === "special",
    },
  };

  function preparePokemon(
    base: DamageCalculatorPokemon,
    side: "attacker" | "defender",
    point: number,
    hp = hpPoint,
  ) {
    const settings = side === "attacker" ? attackerSettings : defenderSettings;
    const statId = side === "attacker" ? attackStatId : defenseStatId;
    const item = props.heldItems.find((entry) => entry.id === settings.itemId) ?? null;
    const ability = base.abilities.find((entry) => entry.id === settings.abilityId) ?? null;
    let pokemon = applyStatAdjustment(base, statId, {
      point,
      nature: settings.nature,
      rank: settings.rank,
    });
    if (side === "defender") {
      pokemon = applyStatAdjustment(pokemon, "hp", {
        point: hp,
        nature: "neutral",
        rank: 0,
      });
    }
    pokemon = applyHeldItem(pokemon, item);
    pokemon = applyAbility(pokemon, ability);
    return pokemon;
  }

  function calculate(attackPoint: number, defensePoint: number, nextHp = hpPoint) {
    if (!attackerBase || !defenderBase || !selectedMove) return null;
    let attacker = preparePokemon(attackerBase, "attacker", attackPoint);
    const defender = preparePokemon(defenderBase, "defender", defensePoint, nextHp);
    if (!attacker || !defender) return null;
    if (!stab && attacker.types.includes(selectedMove.typeName)) {
      attacker = {
        ...attacker,
        types: [
          NON_MATCHING_TYPES.find((typeName) => typeName !== selectedMove.typeName) ??
            "Normal",
        ],
      };
    }
    const result = championsDamageCalculator.calculate({
      attacker,
      defender,
      move: selectedMove,
      field,
      typeEffectivenessSource: props.typeEffectivenessSource,
      abilityConditionEnabled: {
        attacker: attackerSettings.abilityCondition,
        defender: defenderSettings.abilityCondition,
      },
    });
    const attackValue = attacker.actualStats?.[attackStatId] ?? attacker.stats[attackStatId] ?? 1;
    const hpValue = defender.actualStats?.hp ?? defender.stats.hp ?? 1;
    const defenseValue =
      defender.actualStats?.[defenseStatId] ?? defender.stats[defenseStatId] ?? 1;
    return {
      result,
      zone: classifyDamageZone(result),
      x: durabilityIndex(hpValue, defenseValue, defenderSettings.rank),
      y: firepowerIndex(attackValue, selectedMove.power, attackerSettings.rank),
      attackValue,
      hpValue,
      defenseValue,
    };
  }

  const mapData = useMemo<MapData | null>(() => {
    if (!selectedMove) return null;
    const cells = POINTS.flatMap((attackPoint) =>
      POINTS.flatMap((defensePoint) => {
        try {
          const value = calculate(attackPoint, defensePoint);
          return value ? [{ ...value, attackPoint, defensePoint }] : [];
        } catch {
          return [];
        }
      }),
    );
    const current = calculate(attackerSettings.point, defenderSettings.point);
    const attackCandidates = POINTS.flatMap((point) => {
      const value = calculate(point, defenderSettings.point);
      return value ? [{ ...value, point }] : [];
    });
    const hpCandidates = POINTS.flatMap((point) => {
      const value = calculate(attackerSettings.point, defenderSettings.point, point);
      return value ? [{ ...value, point }] : [];
    });
    const defenseCandidates = POINTS.flatMap((point) => {
      const value = calculate(attackerSettings.point, point);
      return value ? [{ ...value, point }] : [];
    });
    const all = [...cells, ...attackCandidates, ...hpCandidates, ...defenseCandidates];
    if (!current || all.length === 0) return null;
    return {
      cells,
      current,
      attackCandidates,
      hpCandidates,
      defenseCandidates,
      minX: Math.min(...all.map((item) => item.x)) * 0.97,
      maxX: Math.max(...all.map((item) => item.x)) * 1.03,
      minY: Math.min(...all.map((item) => item.y)) * 0.97,
      maxY: Math.max(...all.map((item) => item.y)) * 1.03,
    };
  // calculate is intentionally derived from all listed inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attackerBase, defenderBase, selectedMove, attackerSettings, defenderSettings,
    hpPoint, field, stab, props.typeEffectivenessSource, props.heldItems,
  ]);

  const minimumAdjustments = useMemo(() => {
    if (!mapData) return null;
    const attack = Array.from(
      { length: 33 - attackerSettings.point },
      (_, index) => attackerSettings.point + index,
    ).find((point) => {
      const value = calculate(point, defenderSettings.point);
      return value ? value.result.minimum >= value.result.defenderHp : false;
    });
    const hp = Array.from(
      { length: 33 - hpPoint },
      (_, index) => hpPoint + index,
    ).find((point) => {
      const value = calculate(attackerSettings.point, defenderSettings.point, point);
      return value ? value.result.maximum < value.result.defenderHp : false;
    });
    const defense = Array.from(
      { length: 33 - defenderSettings.point },
      (_, index) => defenderSettings.point + index,
    ).find((point) => {
      const value = calculate(attackerSettings.point, point);
      return value ? value.result.maximum < value.result.defenderHp : false;
    });
    return { attack, hp, defense };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData, attackerSettings.point, defenderSettings.point, hpPoint]);

  function selectAttacker(id: number) {
    const pokemon = props.pokemonCatalog.find((entry) => entry.id === id);
    setAttackerId(id);
    setMoveId(pokemon?.moves[0]?.id ?? "");
  }

  return (
    <div className={styles.layout}>
      <div className={styles.settingsGrid}>
        <SidePanel
          title="攻撃側設定"
          open
          pokemon={attackerBase}
          pokemonCatalog={props.pokemonCatalog}
          settings={attackerSettings}
          statLabel={selectedMove?.damageClass === "special" ? "特攻" : "攻撃"}
          heldItems={props.heldItems}
          onPokemonChange={selectAttacker}
          onSettingsChange={setAttackerSettings}
        >
          <label>
            技
            <select value={selectedMove?.id ?? ""} onChange={(e) => setMoveId(e.target.value)}>
              {attackerBase?.moves.map((move) => (
                <option value={move.id} key={move.id}>
                  {move.name}（{move.damageClass === "physical" ? "物理" : "特殊"}・威力{move.power || "変動"}）
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={stab} onChange={(e) => setStab(e.target.checked)} />
            タイプ一致補正を適用
          </label>
        </SidePanel>
        <SidePanel
          title="防御側設定"
          pokemon={defenderBase}
          pokemonCatalog={props.pokemonCatalog}
          settings={defenderSettings}
          statLabel={selectedMove?.damageClass === "special" ? "特防" : "防御"}
          heldItems={props.heldItems}
          onPokemonChange={setDefenderId}
          onSettingsChange={setDefenderSettings}
        >
          <PointControl label="HP能力ポイント" value={hpPoint} onChange={setHpPoint} />
          <label className={styles.check}>
            <input type="checkbox" checked={wall} onChange={(e) => setWall(e.target.checked)} />
            {selectedMove?.damageClass === "special" ? "ひかりのかべ" : "リフレクター"}
          </label>
        </SidePanel>
      </div>
      <section className={styles.fieldPanel}>
        <label>天候<select value={weatherId} onChange={(e) => setWeatherId(e.target.value)}>
          <option value="">なし</option>
          {props.weathers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>フィールド<select value={terrainId} onChange={(e) => setTerrainId(e.target.value)}>
          <option value="">なし</option>
          {props.terrains.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      </section>
      {mapData && attackerBase && defenderBase && selectedMove ? (
        <>
          <ResultSummary
            attacker={attackerBase.nameJa}
            defender={defenderBase.nameJa}
            move={selectedMove.name}
            data={mapData.current}
          />
          <DamageMapSvg
            data={mapData}
            attackStatLabel={attackStatId === "attack" ? "攻撃" : "特攻"}
            defenseStatLabel={defenseStatId === "defense" ? "防御" : "特防"}
          />
          <section className={styles.adjustments}>
            <h2>最小調整候補</h2>
            <div>
              <p><strong>確定1発にするには</strong><br />
                {minimumAdjustments?.attack === undefined
                  ? "能力ポイント32以内では到達しません"
                  : minimumAdjustments.attack <= attackerSettings.point
                    ? "すでに確定1発です"
                    : `${attackStatId === "attack" ? "攻撃" : "特攻"}をあと${minimumAdjustments.attack - attackerSettings.point}ポイント`}
              </p>
              <p><strong>確定耐えにするには</strong><br />
                {minimumAdjustments?.hp !== undefined && minimumAdjustments.hp > hpPoint
                  ? `HPをあと${minimumAdjustments.hp - hpPoint}ポイント`
                  : minimumAdjustments?.defense !== undefined && minimumAdjustments.defense > defenderSettings.point
                    ? `${defenseStatId === "defense" ? "防御" : "特防"}をあと${minimumAdjustments.defense - defenderSettings.point}ポイント`
                    : mapData.current.result.maximum < mapData.current.result.defenderHp
                      ? "すでに確定で耐えます"
                      : "能力ポイント32以内では到達しません"}
              </p>
            </div>
          </section>
        </>
      ) : (
        <p className={styles.status}>攻撃側・技・防御側を選択してください。</p>
      )}
    </div>
  );
}

function SidePanel({
  title, open = false, pokemon, pokemonCatalog, settings, statLabel,
  heldItems, onPokemonChange, onSettingsChange, children,
}: {
  title: string; open?: boolean; pokemon: DamageCalculatorPokemon | null;
  pokemonCatalog: DamageCalculatorPokemon[]; settings: SideSettings; statLabel: string;
  heldItems: DamageCalculatorHeldItem[]; onPokemonChange: (id: number) => void;
  onSettingsChange: (value: SideSettings) => void; children?: React.ReactNode;
}) {
  const patch = (value: Partial<SideSettings>) => onSettingsChange({ ...settings, ...value });
  return (
    <details className={styles.sidePanel} open={open}>
      <summary>{title}<span>{pokemon?.nameJa ?? "未選択"}</span></summary>
      <div className={styles.sideFields}>
        <label>ポケモン<select value={pokemon?.id ?? ""} onChange={(e) => onPokemonChange(Number(e.target.value))}>
          {pokemonCatalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.nameJa}</option>)}
        </select></label>
        {children}
        <PointControl label={`${statLabel}能力ポイント`} value={settings.point} onChange={(point) => patch({ point })} />
        <label>性格補正<select value={settings.nature} onChange={(e) => patch({ nature: e.target.value as NatureCorrection })}>
          <option value="up">上昇</option><option value="neutral">なし</option><option value="down">下降</option>
        </select></label>
        <label>能力ランク<select value={settings.rank} onChange={(e) => patch({ rank: Number(e.target.value) })}>
          {Array.from({ length: 13 }, (_, index) => index - 6).map((rank) => <option key={rank} value={rank}>{rank > 0 ? `+${rank}` : rank}</option>)}
        </select></label>
        <label>持ち物<select value={settings.itemId} onChange={(e) => patch({ itemId: e.target.value })}>
          <option value="">なし</option>{heldItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>特性<select value={settings.abilityId} onChange={(e) => patch({ abilityId: e.target.value })}>
          <option value="">なし</option>{pokemon?.abilities.map((ability) => <option key={ability.id} value={ability.id}>{ability.name}</option>)}
        </select></label>
        <label className={styles.check}><input type="checkbox" checked={settings.abilityCondition} onChange={(e) => patch({ abilityCondition: e.target.checked })} />条件付き特性を有効</label>
      </div>
    </details>
  );
}

function PointControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label>{label}<div className={styles.range}><input type="range" min="0" max="32" value={value} onChange={(e) => onChange(Number(e.target.value))} /><output>{value}</output></div></label>;
}

function ResultSummary({ attacker, defender, move, data }: {
  attacker: string; defender: string; move: string;
  data: { x: number; y: number; zone: DamageZone; result: ReturnType<typeof championsDamageCalculator.calculate> };
}) {
  return <section className={styles.summary}><h2>現在のダメージ結果</h2><p className={styles.matchup}>{attacker}の{move} → {defender}</p><dl>
    <div><dt>火力指数</dt><dd>{data.y.toLocaleString()}</dd></div>
    <div><dt>耐久指数</dt><dd>{data.x.toLocaleString()}</dd></div>
    <div><dt>ダメージ</dt><dd>{data.result.minimum}〜{data.result.maximum}</dd></div>
    <div><dt>割合</dt><dd>{data.result.minimumPercent.toFixed(1)}〜{data.result.maximumPercent.toFixed(1)}%</dd></div>
    <div><dt>1発撃破率</dt><dd>{(data.result.oneHitProbability * 100).toFixed(2)}%</dd></div>
    <div><dt>2発撃破率</dt><dd>{(data.result.twoHitProbability * 100).toFixed(2)}%</dd></div>
    <div><dt>判定</dt><dd>{DAMAGE_ZONE_LABELS[data.zone]}</dd></div>
  </dl></section>;
}

function DamageMapSvg({
  data,
  attackStatLabel,
  defenseStatLabel,
}: {
  data: MapData;
  attackStatLabel: string;
  defenseStatLabel: string;
}) {
  const left = 76, top = 24, width = 684, height = 390;
  const sx = (x: number) => left + ((x - data.minX) / (data.maxX - data.minX || 1)) * width;
  const sy = (y: number) => top + height - ((y - data.minY) / (data.maxY - data.minY || 1)) * height;
  return <section className={styles.mapPanel}><h2>ダメージ調整マップ</h2>
    <div className={styles.legend}>{Object.entries(DAMAGE_ZONE_LABELS).map(([zone,label]) => <span key={zone}><i style={{ background: ZONE_COLORS[zone as DamageZone] }} />{label}</span>)}</div>
    <svg viewBox="0 0 800 460" role="img" aria-label="耐久指数と火力指数によるダメージ領域">
      <rect x={left} y={top} width={width} height={height} className={styles.plotBackground}/>
      {data.cells.map((cell) => <circle key={`${cell.attackPoint}-${cell.defensePoint}`} cx={sx(cell.x)} cy={sy(cell.y)} r="31" fill={ZONE_COLORS[cell.zone]} opacity=".78"/>)}
      <polyline points={data.attackCandidates.map((point) => `${sx(point.x)},${sy(point.y)}`).join(" ")} className={styles.attackLine}/>
      <polyline points={data.hpCandidates.map((point) => `${sx(point.x)},${sy(point.y)}`).join(" ")} className={styles.hpLine}/>
      <polyline points={data.defenseCandidates.map((point) => `${sx(point.x)},${sy(point.y)}`).join(" ")} className={styles.defenseLine}/>
      {[...data.attackCandidates,...data.hpCandidates,...data.defenseCandidates].map((point, index)=><circle key={index} cx={sx(point.x)} cy={sy(point.y)} r="3.5" className={styles.candidatePoint}/>)}
      <circle cx={sx(data.current.x)} cy={sy(data.current.y)} r="10" className={styles.currentPoint}/>
      <text x={sx(data.current.x)+13} y={sy(data.current.y)-12} className={styles.currentLabel}>{DAMAGE_ZONE_LABELS[data.current.zone]}</text>
      <line x1={left} y1={top+height} x2={left+width} y2={top+height} className={styles.axis}/>
      <line x1={left} y1={top} x2={left} y2={top+height} className={styles.axis}/>
      <text x={left+width/2} y="448" textAnchor="middle" className={styles.axisLabel}>耐久指数（HP × {defenseStatLabel}実数値）</text>
      <text x="18" y={top+height/2} textAnchor="middle" transform={`rotate(-90 18 ${top+height/2})`} className={styles.axisLabel}>火力指数（{attackStatLabel}実数値 × 技威力）</text>
    </svg>
    <p className={styles.lineHelp}><span>赤線：A/Cポイント</span><span>青線：Hポイント</span><span>緑線：B/Dポイント</span></p>
  </section>;
}
