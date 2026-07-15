import type { DamageCalculation } from "../application/smogon-damage-calculator";
import type { CalculationResult } from "./damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

function DamageOutcome({
  title,
  outcome,
}: {
  title: string;
  outcome: DamageCalculation;
}) {
  return (
    <div className={styles.damageOutcome}>
      <strong>{title}</strong>
      <span>
        {outcome.minimum}-{outcome.maximum}
      </span>
      <small>
        {outcome.minimumPercent.toFixed(1)}-{outcome.maximumPercent.toFixed(1)}%
      </small>
      <em>{outcome.koLabel}</em>
    </div>
  );
}

export function DamageResult({ result }: { result: CalculationResult }) {
  return (
    <section className={styles.result} aria-live="polite">
      <div className={styles.resultHeader}>
        <strong>
          {result.attackerName} の {result.moveName}
        </strong>
        <span className={styles.resultMove}>{result.defenderName} に</span>
      </div>
      <div className={styles.damageOutcomes}>
        <DamageOutcome title="通常" outcome={result.normal} />
        <DamageOutcome title="急所" outcome={result.critical} />
      </div>
    </section>
  );
}
