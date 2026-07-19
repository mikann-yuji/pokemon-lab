"use client";

import { useState } from "react";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import { calculateDetailedSpeedValue } from "./damage-calculator-state";
import type { NatureCorrection } from "./damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

type Settings = {
  point: number;
  nature: NatureCorrection;
  rank: number;
  itemId: string;
};

const DEFAULT_SETTINGS: Settings = {
  point: 0,
  nature: "neutral",
  rank: 0,
  itemId: "",
};

export function DetailedSpeedComparisonModal({
  attacker,
  defender,
  heldItems,
  onClose,
}: {
  attacker: DamageCalculatorPokemon | null;
  defender: DamageCalculatorPokemon | null;
  heldItems: DamageCalculatorHeldItem[];
  onClose: () => void;
}) {
  const [attackerSettings, setAttackerSettings] =
    useState<Settings>(DEFAULT_SETTINGS);
  const [defenderSettings, setDefenderSettings] =
    useState<Settings>(DEFAULT_SETTINGS);
  const attackerSpeed = getSpeed(attacker, attackerSettings);
  const defenderSpeed = getSpeed(defender, defenderSettings);

  return (
    <div className={styles.speedModalOverlay} role="dialog" aria-modal="true">
      <button
        className={styles.speedModalBackdrop}
        type="button"
        aria-label="詳細すばやさ比較を閉じる"
        onClick={onClose}
      />
      <section className={`${styles.speedModalPanel} ${styles.detailedSpeedPanel}`}>
        <div className={styles.speedModalHeader}>
          <div>
            <p>DETAILED SPEED CHECK</p>
            <h2>詳細すばやさ比較</h2>
          </div>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        <div className={styles.detailedSpeedGrid}>
          <SpeedSide
            title="攻撃側"
            pokemon={attacker}
            settings={attackerSettings}
            heldItems={heldItems}
            speed={attackerSpeed}
            opponentSpeed={defenderSpeed}
            onChange={setAttackerSettings}
          />
          <SpeedSide
            title="防御側"
            pokemon={defender}
            settings={defenderSettings}
            heldItems={heldItems}
            speed={defenderSpeed}
            opponentSpeed={attackerSpeed}
            onChange={setDefenderSettings}
          />
        </div>
      </section>
    </div>
  );
}

function getSpeed(pokemon: DamageCalculatorPokemon | null, settings: Settings) {
  return calculateDetailedSpeedValue(
    pokemon,
    settings.point,
    settings.nature,
    settings.rank,
    settings.itemId,
  );
}

function SpeedSide({
  title,
  pokemon,
  settings,
  heldItems,
  speed,
  opponentSpeed,
  onChange,
}: {
  title: string;
  pokemon: DamageCalculatorPokemon | null;
  settings: Settings;
  heldItems: DamageCalculatorHeldItem[];
  speed: number | null;
  opponentSpeed: number | null;
  onChange: (settings: Settings) => void;
}) {
  const patch = (values: Partial<Settings>) =>
    onChange({ ...settings, ...values });
  const faster = speed !== null && opponentSpeed !== null && speed > opponentSpeed;
  const tied = speed !== null && speed === opponentSpeed;

  return (
    <section className={styles.detailedSpeedSide}>
      <header>
        <small>{title}</small>
        <h3>{pokemon?.nameJa ?? "未選択"}</h3>
      </header>
      <label>
        能力ポイント
        <div className={styles.detailedSpeedRange}>
          <input
            type="range"
            min="0"
            max="32"
            value={settings.point}
            onChange={(event) => patch({ point: Number(event.target.value) })}
          />
          <output>{settings.point}</output>
        </div>
      </label>
      <label>
        性格
        <select
          value={settings.nature}
          onChange={(event) =>
            patch({ nature: event.target.value as NatureCorrection })
          }
        >
          <option value="up">上昇</option>
          <option value="neutral">補正なし</option>
          <option value="down">下降</option>
        </select>
      </label>
      <label>
        能力ランク
        <select
          value={settings.rank}
          onChange={(event) => patch({ rank: Number(event.target.value) })}
        >
          {Array.from({ length: 13 }, (_, index) => index - 6).map((rank) => (
            <option value={rank} key={rank}>
              {rank > 0 ? `+${rank}` : rank}
            </option>
          ))}
        </select>
      </label>
      <label>
        持ち物
        <select
          value={settings.itemId}
          onChange={(event) => patch({ itemId: event.target.value })}
        >
          <option value="">なし</option>
          {heldItems.map((item) => (
            <option value={item.id} key={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <div className={`${styles.detailedSpeedResult} ${faster ? styles.fasterSpeedValue : ""}`}>
        <small>最終すばやさ</small>
        <strong>{speed ?? "-"}</strong>
        <span>{faster ? "先手" : tied ? "同速" : speed === null ? "" : "後手"}</span>
      </div>
    </section>
  );
}
