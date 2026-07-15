import type { CSSProperties } from "react";
import type { DamageCalculation } from "../application/smogon-damage-calculator";
import type { CalculationResult } from "./damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

type HpBarStyle = CSSProperties & {
  "--minimum-remaining-hp": string;
  "--maximum-remaining-hp": string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function DamageOutcome({
  title,
  outcome,
  critical = false,
}: {
  title: string;
  outcome: DamageCalculation;
  critical?: boolean;
}) {
  const damagePercentLabel = `${outcome.minimumPercent.toFixed(1)}-${outcome.maximumPercent.toFixed(1)}%`;
  const remainingHpAfterMinimumDamage = clampPercent(100 - outcome.minimumPercent);
  const remainingHpAfterMaximumDamage = clampPercent(100 - outcome.maximumPercent);
  const remainingHpLabel = `${remainingHpAfterMaximumDamage.toFixed(1)}-${remainingHpAfterMinimumDamage.toFixed(1)}%`;
  const barStyle: HpBarStyle = {
    "--minimum-remaining-hp": `${remainingHpAfterMaximumDamage}%`,
    "--maximum-remaining-hp": `${remainingHpAfterMinimumDamage}%`,
  };

  return (
    <div className={`${styles.outcome} ${critical ? styles.criticalOutcome : ""}`}>
      <span className={styles.outcomeTitle}>{title}</span>
      <span className={styles.damagePercent}>{damagePercentLabel}</span>
      <span className={styles.koLabel}>{outcome.koLabel}</span>
      <span
        className={styles.damageBar}
        aria-label={`残りHP ${remainingHpLabel}`}
        key={`${title}-${outcome.minimum}-${outcome.maximum}-${outcome.maximumPercent}`}
      >
        <span className={styles.maximumRemainingHpBar} style={barStyle} />
        <span className={styles.minimumRemainingHpBar} style={barStyle} />
      </span>
    </div>
  );
}

export function DamageResult({ result }: { result: CalculationResult }) {
  return (
    <section className={styles.result} aria-live="polite">
      <div className={styles.resultHeader}>
        <span className={styles.resultTitle}>
          {result.attackerName} の {result.moveName}
        </span>
        <span className={styles.resultMove}>
          {result.defenderName} に
          <small>x{result.moveEffectiveness}</small>
        </span>
      </div>
      <div className={styles.outcomeGrid}>
        <DamageOutcome title="通常" outcome={result.normal} />
        <DamageOutcome title="急所" outcome={result.critical} critical />
      </div>
    </section>
  );
}
