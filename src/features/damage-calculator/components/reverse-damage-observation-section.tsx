"use client";

import {
  clampNumber,
  normalizeObservedInput,
  type UnknownSide,
} from "./reverse-damage-calculator-state";
import damageStyles from "../styles/damage-calculator.module.css";
import styles from "../styles/reverse-damage-calculator.module.css";

export function ReverseDamageObservationSection({
  unknownSide,
  observedDamage,
  observedPercent,
  observedPercentValue,
  percentTolerance,
  onUnknownSideChange,
  onObservedDamageChange,
  onObservedPercentChange,
  onPercentToleranceChange,
}: {
  unknownSide: UnknownSide;
  observedDamage: string;
  observedPercent: string;
  observedPercentValue: number;
  percentTolerance: number;
  onUnknownSideChange: (side: UnknownSide) => void;
  onObservedDamageChange: (value: string | ((current: string) => string)) => void;
  onObservedPercentChange: (value: string | ((current: string) => string)) => void;
  onPercentToleranceChange: (value: number) => void;
}) {
  return (
    <section className={damageStyles.fieldConditions}>
      <div>
        <p>REVERSE LOOKUP</p>
        <h2>観測値</h2>
      </div>
      <div className={styles.reverseTarget}>
        <button
          type="button"
          aria-pressed={unknownSide === "attacker"}
          onClick={() => onUnknownSideChange("attacker")}
        >
          攻撃側を逆引き
        </button>
        <button
          type="button"
          aria-pressed={unknownSide === "defender"}
          onClick={() => onUnknownSideChange("defender")}
        >
          防御側を逆引き
        </button>
      </div>
      {unknownSide === "attacker" ? (
        <label>
          ダメージ量
          <input
            type="number"
            min="0"
            max="400"
            step="1"
            value={observedDamage}
            onChange={(event) => onObservedDamageChange(event.target.value)}
            onBlur={() =>
              onObservedDamageChange((current) =>
                normalizeObservedInput(current, 400),
              )
            }
          />
        </label>
      ) : (
        <label>
          HP割合
          <div className={styles.percentControl}>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={observedPercent}
              onChange={(event) => onObservedPercentChange(event.target.value)}
              onBlur={() =>
                onObservedPercentChange((current) =>
                  normalizeObservedInput(current, 100),
                )
              }
            />
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={clampNumber(observedPercentValue, 0, 100)}
              onChange={(event) => onObservedPercentChange(event.target.value)}
            />
          </div>
        </label>
      )}
      {unknownSide === "defender" ? (
        <label>
          許容誤差
          <input
            type="number"
            min="0"
            max="5"
            step="0.1"
            value={percentTolerance}
            onChange={(event) =>
              onPercentToleranceChange(Math.max(0, Number(event.target.value)))
            }
          />
        </label>
      ) : null}
    </section>
  );
}
