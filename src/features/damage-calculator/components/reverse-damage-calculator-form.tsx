"use client";

import { useState } from "react";
import { getTypeEffectiveness, type TypeEffectivenessSource } from "@/domain/type-matchup";
import type { DamageCalculatorAbility, DamageCalculatorHeldItem, DamageCalculatorMove, DamageCalculatorPokemon } from "../domain/damage-calculator-types";
import { TypeBadge } from "./reverse-damage-calculator-type-badge";
import {
  POINT_MAX,
  POINT_MIN,
  RANK_MAX,
  RANK_MIN,
  TYPE_LABELS,
  formatRank,
  type StatAdjustment,
} from "./reverse-damage-calculator-state";
import damageStyles from "../styles/damage-calculator.module.css";

// 逆引き画面の入力フォーム部品。
// 技選択、技概要、特性、持ち物、能力補正を小さく分けて左右パネルから使う。

function formatItemModifier(item: DamageCalculatorHeldItem) {
  const modifier = item.damageModifier;
  return modifier ? ` x${modifier.multiplier}` : "";
}

function formatMoveUsageRate(move: DamageCalculatorMove) {
  return move.usageRate === null ? "" : ` / 採用率 ${move.usageRate.toFixed(1)}%`;
}

function formatMovePower(move: DamageCalculatorMove) {
  return move.power > 0 ? String(move.power) : "変動";
}

function formatMoveAccuracy(move: DamageCalculatorMove) {
  return move.accuracy === null ? "必中" : `${move.accuracy}`;
}

function getEffectivenessLabel(effectiveness: number) {
  if (effectiveness >= 4) return "かなりばつぐん";
  if (effectiveness === 2) return "ばつぐん";
  if (effectiveness === 0.5) return "いまひとつ";
  if (effectiveness > 0 && effectiveness <= 0.25) return "かなりいまひとつ";
  if (effectiveness === 0) return "効果なし";
  return "";
}

function MoveEffectivenessBadge({ effectiveness }: { effectiveness: number }) {
  const label = getEffectivenessLabel(effectiveness);
  if (!label) return null;

  return (
    <span
      className={`${damageStyles.effectivenessBadge} ${
        effectiveness >= 2
          ? damageStyles.effectivenessStrong
          : effectiveness === 0
            ? damageStyles.effectivenessNone
            : damageStyles.effectivenessWeak
      }`}
    >
      {label}
    </span>
  );
}

function MoveOptionContent({
  move,
  defenderTypes,
  typeEffectivenessSource,
}: {
  move: DamageCalculatorMove;
  defenderTypes: DamageCalculatorPokemon["types"];
  typeEffectivenessSource: TypeEffectivenessSource | null;
}) {
  // 技候補1行分。通常計算と同じく、タイプ・技名・相性・威力などをまとめて表示する。
  const effectiveness =
    defenderTypes.length === 0
      ? 1
      : getTypeEffectiveness(
          move.typeName,
          defenderTypes,
          typeEffectivenessSource,
        );

  return (
    <span className={damageStyles.moveOptionContent}>
      <TypeBadge typeName={move.typeName} />
      <strong>{move.name}</strong>
      <MoveEffectivenessBadge effectiveness={effectiveness} />
      <small>
        威力 {formatMovePower(move)}
        {" / "}命中 {formatMoveAccuracy(move)}
        {formatMoveUsageRate(move)}
      </small>
      {move.description ? (
        <span className={damageStyles.moveDescription}>{move.description}</span>
      ) : null}
    </span>
  );
}

export function MoveSelect({
  label,
  moves,
  defenderTypes,
  typeEffectivenessSource,
  selectedMoveId,
  disabled,
  onChange,
}: {
  label: string;
  moves: DamageCalculatorMove[];
  defenderTypes: DamageCalculatorPokemon["types"];
  typeEffectivenessSource: TypeEffectivenessSource | null;
  selectedMoveId: string;
  disabled: boolean;
  onChange: (moveId: string) => void;
}) {
  // 逆引きで使う技を選ぶ自作セレクト。
  // 相手タイプが分かっている時は、候補内に相性バッジを出す。
  const [open, setOpen] = useState(false);
  const selectedMove = moves.find((move) => move.id === selectedMoveId) ?? null;

  function selectMove(moveId: string) {
    onChange(moveId);
    setOpen(false);
  }

  return (
    <div className={damageStyles.moveSelectField}>
      <span>{label}</span>
      <div
        className={damageStyles.moveSelect}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={damageStyles.moveSelectButton}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {selectedMove ? (
            <MoveOptionContent
              move={selectedMove}
              defenderTypes={defenderTypes}
              typeEffectivenessSource={typeEffectivenessSource}
            />
          ) : (
            <span className={damageStyles.movePlaceholder}>技を選択</span>
          )}
        </button>
        {open && !disabled ? (
          <div className={damageStyles.moveOptions} role="listbox" aria-label={label}>
            <button
              type="button"
              role="option"
              aria-selected={selectedMoveId === ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMove("")}
            >
              <span className={damageStyles.movePlaceholder}>技を選択</span>
            </button>
            {moves.map((move) => (
              <button
                type="button"
                role="option"
                aria-selected={move.id === selectedMoveId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMove(move.id)}
                key={move.id}
              >
                <MoveOptionContent
                  move={move}
                  defenderTypes={defenderTypes}
                  typeEffectivenessSource={typeEffectivenessSource}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MoveSummary({ move }: { move: DamageCalculatorMove }) {
  return (
    <p className={damageStyles.moveSummary}>
      {TYPE_LABELS[move.typeName]} / {move.damageClass === "physical" ? "物理" : "特殊"} /
      威力 {formatMovePower(move)} / 命中 {formatMoveAccuracy(move)}
    </p>
  );
}

export function AbilityField({
  pokemon,
  onAbilityChange,
}: {
  pokemon: DamageCalculatorPokemon | null;
  onAbilityChange: (abilityId: string) => void;
}) {
  // 逆引き側の特性入力はシンプルなselect。
  // 候補探索の条件に使うだけなので、説明表示は持たせない。
  return (
    <label className={damageStyles.moveField}>
      特性
      <select
        value={pokemon?.selectedAbility?.id ?? ""}
        disabled={!pokemon}
        onChange={(event) => onAbilityChange(event.target.value)}
      >
        <option value="">なし</option>
        {pokemon?.abilities.map((ability: DamageCalculatorAbility) => (
          <option value={ability.id} key={ability.id}>
            {ability.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HeldItemField({
  pokemon,
  heldItems,
  onChange,
}: {
  pokemon: DamageCalculatorPokemon | null;
  heldItems: DamageCalculatorHeldItem[];
  onChange: (itemId: string) => void;
}) {
  return (
    <label className={damageStyles.moveField}>
      持ち物
      <select
        value={pokemon?.heldItem?.id ?? ""}
        disabled={!pokemon}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">なし</option>
        {heldItems.map((item) => (
          <option value={item.id} key={item.id}>
            {item.name}
            {formatItemModifier(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DamageStatControls({
  title,
  statLabel,
  value,
  showRank = true,
  showNature = true,
  onChange,
}: {
  title: string;
  statLabel: string;
  value: StatAdjustment;
  showRank?: boolean;
  showNature?: boolean;
  onChange: (values: Partial<StatAdjustment>) => void;
}) {
  // 既知側の能力補正を固定条件として入力するUI。
  // 未知側は候補探索で変化させるため、SideContent側でこの部品を隠す。
  const changePoint = (point: number) => {
    onChange({ point: Math.min(POINT_MAX, Math.max(POINT_MIN, Math.trunc(point))) });
  };
  const changeRank = (rank: number) => {
    onChange({ rank: Math.min(RANK_MAX, Math.max(RANK_MIN, Math.trunc(rank))) });
  };

  return (
    <div className={damageStyles.statControls}>
      <div className={damageStyles.statControlsHeader}>
        <strong>{title}</strong>
        <span>{statLabel}</span>
      </div>
      <label>
        能力ポイント
        <div className={damageStyles.pointControl}>
          <input
            type="number"
            min={POINT_MIN}
            max={POINT_MAX}
            value={value.point}
            onChange={(event) => changePoint(Number(event.target.value))}
          />
          <button type="button" onClick={() => changePoint(POINT_MAX)}>
            32
          </button>
        </div>
        <input
          type="range"
          min={POINT_MIN}
          max={POINT_MAX}
          step="1"
          value={value.point}
          onChange={(event) => changePoint(Number(event.target.value))}
        />
      </label>
      {showRank ? (
        <label>
          能力ランク
          <div className={damageStyles.rankStepper}>
            <button type="button" onClick={() => changeRank(value.rank - 1)}>
              -
            </button>
            <span className={damageStyles.rankValue}>{formatRank(value.rank)}</span>
            <button type="button" onClick={() => changeRank(value.rank + 1)}>
              +
            </button>
          </div>
          <input
            type="range"
            min={RANK_MIN}
            max={RANK_MAX}
            step="1"
            value={value.rank}
            onChange={(event) => changeRank(Number(event.target.value))}
          />
        </label>
      ) : null}
      {showNature ? (
        <label className={damageStyles.natureToggle}>
          <input
            type="checkbox"
            checked={value.nature}
            onChange={(event) => onChange({ nature: event.target.checked })}
          />
          性格補正あり
        </label>
      ) : null}
    </div>
  );
}

