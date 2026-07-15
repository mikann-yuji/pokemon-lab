"use client";

import { useState } from "react";
import {
  getTypeEffectiveness,
  type TypeEffectivenessSource,
} from "@/domain/type-matchup";
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import { TYPE_LABELS } from "./damage-calculator-display";
import { TypeBadge } from "./damage-calculator-pokemon-widgets";
import type { NatureCorrection, StatAdjustment } from "./damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

// ダメージ計算画面の「入力フォーム系」だけを集めたファイル。
// ポケモン表示や結果表示は別ファイルに分け、ここでは技・特性・持ち物・能力補正に集中する。

export function formatMovePower(move: DamageCalculatorMove) {
  return move.power > 0 ? String(move.power) : "変動";
}

function formatMoveAccuracy(move: DamageCalculatorMove) {
  return move.accuracy === null ? "必中" : `${move.accuracy}`;
}

function formatMoveUsageRate(move: DamageCalculatorMove) {
  return move.usageRate === null ? "" : ` / 採用率 ${move.usageRate.toFixed(1)}%`;
}

function getEffectivenessLabel(effectiveness: number) {
  if (effectiveness >= 4) return "ちょうばつぐん";
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
      className={`${styles.effectivenessBadge} ${
        effectiveness >= 2
          ? styles.effectivenessStrong
          : effectiveness === 0
            ? styles.effectivenessNone
            : styles.effectivenessWeak
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
  // 技の候補行。タイプ、技名、相性、威力/命中/採用率を1行にまとめる。
  // 選択済みボタンと候補リストの両方で同じ見た目を使う。
  const effectiveness =
    defenderTypes.length === 0
      ? 1
      : getTypeEffectiveness(
          move.typeName,
          defenderTypes,
          typeEffectivenessSource,
        );

  return (
    <span className={styles.moveOptionContent}>
      <TypeBadge typeName={move.typeName} />
      <strong>{move.name}</strong>
      <MoveEffectivenessBadge effectiveness={effectiveness} />
      <small>
        威力 {formatMovePower(move)}
        {" / "}命中 {formatMoveAccuracy(move)}
        {formatMoveUsageRate(move)}
      </small>
    </span>
  );
}

export function MoveSelect({
  label,
  moves,
  defenderTypes,
  typeEffectivenessSource,
  selectedMoveId,
  selectedMoveFallback,
  disabled,
  onChange,
}: {
  label: string;
  moves: DamageCalculatorMove[];
  defenderTypes: DamageCalculatorPokemon["types"];
  typeEffectivenessSource: TypeEffectivenessSource | null;
  selectedMoveId: string;
  selectedMoveFallback?: DamageCalculatorMove;
  disabled: boolean;
  onChange: (moveId: string) => void;
}) {
  // select要素ではなく自作リストにして、技タイプや相性バッジを候補内に表示する。
  const [open, setOpen] = useState(false);
  const selectedMove =
    moves.find((move) => move.id === selectedMoveId) ??
    (selectedMoveFallback?.id === selectedMoveId ? selectedMoveFallback : null);
  const buttonLabel = selectedMove
    ? `${selectedMove.name} 威力 ${formatMovePower(selectedMove)}`
    : "技を選択";

  function selectMove(moveId: string) {
    onChange(moveId);
    setOpen(false);
  }

  return (
    <div className={styles.moveSelectField}>
      <span>{label}</span>
      <div
        className={styles.moveSelect}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          type="button"
          className={styles.moveSelectButton}
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
            <span className={styles.movePlaceholder}>{buttonLabel}</span>
          )}
        </button>
        {open && !disabled ? (
          <div className={styles.moveOptions} role="listbox" aria-label={label}>
            <button
              type="button"
              role="option"
              aria-selected={selectedMoveId === ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMove("")}
            >
              <span className={styles.movePlaceholder}>技を選択</span>
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

function hasManualAbilityCondition(ability: DamageCalculatorAbility | null) {
  // 条件付きで発動する特性だけ、手動ON/OFFのチェックボックスを出す。
  // 常時発動する補正は選択した時点で計算へ渡すので、追加UIは不要。
  return Boolean(
    ability?.damageModifiers.some((modifier) =>
      [
        "low_power_move",
        "not_very_effective",
        "manual",
        "manual_type_match",
        "manual_physical",
        "manual_special",
      ].includes(modifier.condition),
    ),
  );
}

function formatAbilityModifier(ability: DamageCalculatorAbility) {
  return ability.damageModifiers.length > 0 ? " / ダメージ補正あり" : "";
}

function AbilityOptionContent({ ability }: { ability: DamageCalculatorAbility }) {
  // 特性候補リスト内だけで説明を見せる。
  // 選択後の画面には説明を残さず、フォームをコンパクトに保つ。
  return (
    <span className={styles.abilityOptionContent}>
      <strong>{ability.name}</strong>
      <small>{formatAbilityModifier(ability) || ability.effect || "説明なし"}</small>
    </span>
  );
}

export function AbilityField({
  pokemon,
  conditionEnabled,
  onAbilityChange,
  onConditionChange,
}: {
  pokemon: DamageCalculatorPokemon | null;
  conditionEnabled: boolean;
  onAbilityChange: (abilityId: string) => void;
  onConditionChange: (enabled: boolean) => void;
}) {
  // 特性は技と同じ自作ドロップダウンにする。
  // 通常のselectでは説明文や補正有無を候補内に出しにくいため。
  const [open, setOpen] = useState(false);
  const selectedAbility = pokemon?.selectedAbility ?? null;

  function selectAbility(abilityId: string) {
    onAbilityChange(abilityId);
    setOpen(false);
  }

  return (
    <div className={styles.abilityField}>
      <span>特性</span>
      <div
        className={styles.moveSelect}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          type="button"
          className={styles.moveSelectButton}
          disabled={!pokemon}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {selectedAbility?.name ?? "特性なし"}
        </button>
        {open && pokemon ? (
          <div className={styles.moveOptions} role="listbox" aria-label="特性">
            <button
              type="button"
              role="option"
              aria-selected={!selectedAbility}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectAbility("")}
            >
              <span className={styles.movePlaceholder}>特性なし</span>
            </button>
            {pokemon.abilities.map((ability) => (
              <button
                type="button"
                role="option"
                aria-selected={ability.id === selectedAbility?.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectAbility(ability.id)}
                key={ability.id}
              >
                <AbilityOptionContent ability={ability} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {hasManualAbilityCondition(selectedAbility) ? (
        <label className={styles.conditionToggle}>
          <input
            type="checkbox"
            checked={conditionEnabled}
            onChange={(event) => onConditionChange(event.target.checked)}
          />
          条件を有効
        </label>
      ) : null}
    </div>
  );
}

function formatItemModifier(item: DamageCalculatorHeldItem) {
  const modifier = item.damageModifier;
  return modifier ? ` x${modifier.multiplier}` : "";
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
  // 持ち物は説明を表示せず、名前とダメージ倍率だけをoptionに含める。
  return (
    <label>
      持ち物
      <select
        value={pokemon?.heldItem?.id ?? ""}
        disabled={!pokemon}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">持ち物なし</option>
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

export function MetronomeUseControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  // メトロノームは「連続使用回数」で倍率が変わるため、技や持ち物とは独立入力にする。
  return (
    <label className={styles.metronomeControl}>
      メトロノーム連続使用
      <input
        type="number"
        min="1"
        max="10"
        value={value}
        onChange={(event) => onChange(Math.max(1, Number(event.target.value)))}
      />
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
  // 能力ポイント、能力ランク、性格補正を1セットで編集する共通UI。
  // 攻撃側/防御側/HPで同じ部品を使い、必要ない入力だけ showRank/showNature で隠す。
  const natureOptions: { value: NatureCorrection; label: string }[] = [
    { value: "up", label: "上昇" },
    { value: "neutral", label: "なし" },
    { value: "down", label: "下降" },
  ];

  return (
    <div className={styles.statControls}>
      <div className={styles.statControlsHeader}>
        <strong>{title}</strong>
        <span>{statLabel}</span>
      </div>
      <div className={styles.statControlGrid}>
        <label className={styles.pointField}>
          能力ポイント
          <div className={styles.pointControl}>
            <input
              type="number"
              min="0"
              max="32"
              value={value.point}
              onChange={(event) => onChange({ point: Number(event.target.value) })}
            />
            <button type="button" onClick={() => onChange({ point: 32 })}>
              32
            </button>
          </div>
          <input
            type="range"
            min="0"
            max="32"
            step="1"
            value={value.point}
            onChange={(event) => onChange({ point: Number(event.target.value) })}
          />
        </label>
        {showRank ? (
          <label className={styles.rankField}>
            能力ランク
            <div className={styles.rankStepper}>
              <button
                type="button"
                onClick={() => onChange({ rank: Math.min(6, value.rank + 1) })}
              >
                +
              </button>
              <span className={styles.rankValue}>
                {value.rank > 0 ? `+${value.rank}` : value.rank}
              </span>
              <button
                type="button"
                onClick={() => onChange({ rank: Math.max(-6, value.rank - 1) })}
              >
                -
              </button>
            </div>
          </label>
        ) : null}
      </div>
      {showNature ? (
        <fieldset className={styles.natureRadioGroup}>
          <legend>性格補正</legend>
          <div>
            {natureOptions.map((option) => (
              <label className={styles.natureRadio} key={option.value}>
                <input
                  type="radio"
                  name={`${title}-${statLabel}-nature`}
                  value={option.value}
                  checked={value.nature === option.value}
                  onChange={() => onChange({ nature: option.value })}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

export function MoveSummary({ move }: { move: DamageCalculatorMove }) {
  return (
    <p className={styles.moveSummary}>
      {TYPE_LABELS[move.typeName]} / {move.damageClass === "physical" ? "物理" : "特殊"} /
      威力 {formatMovePower(move)} / 命中 {formatMoveAccuracy(move)}
    </p>
  );
}
