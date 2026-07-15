import type { CSSProperties } from "react";
import type { DamageCalculation } from "../application/smogon-damage-calculator";
import type { CalculationResult } from "./damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

type HpBarStyle = CSSProperties & {
  "--remaining-hp": string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

// 通常ダメージ計算の結果表示。
// 計算処理は持たず、最小/最大ダメージと割合を読みやすい形に整えるだけ。
function DamageOutcome({
  title,
  outcome,
  critical = false,
}: {
  title: string;
  outcome: DamageCalculation;
  critical?: boolean;
}) {
  // 最大ダメージを受けた後の残HPをバーで表す。
  // keyにダメージ範囲を含めることで、再計算ごとにCSSアニメーションを最初から走らせる。
  const remainingHp = clampPercent(100 - outcome.maximumPercent);
  const barStyle: HpBarStyle = { "--remaining-hp": `${remainingHp}%` };

  return (
    <div className={`${styles.outcome} ${critical ? styles.criticalOutcome : ""}`}>
      <span className={styles.outcomeTitle}>{title}</span>
      <strong className={styles.damagePercent}>
        {outcome.minimumPercent.toFixed(1)}-{outcome.maximumPercent.toFixed(1)}%
      </strong>
      <em className={styles.koLabel}>{outcome.koLabel}</em>
      <span
        className={styles.damageBar}
        aria-label={`残りHP ${remainingHp.toFixed(1)}%`}
        key={`${title}-${outcome.minimum}-${outcome.maximum}-${outcome.maximumPercent}`}
      >
        <span className={styles.remainingHpBar} style={barStyle} />
        <span
          className={styles.minimumDamageMarker}
          style={{ left: `${clampPercent(100 - outcome.minimumPercent)}%` }}
        />
      </span>
      <small className={styles.damageRange}>
        {outcome.minimum}-{outcome.maximum} / HP {outcome.defenderHp}
      </small>
    </div>
  );
}

export function DamageResult({ result }: { result: CalculationResult }) {
  // 通常ダメージと急所ダメージを同じ見た目で並べる。
  // 急所結果がない技や条件では通常結果だけを表示する。
  return (
    <section className={styles.result} aria-live="polite">
      <div className={styles.resultHeader}>
        <strong>
          {result.attackerName} の {result.moveName}
        </strong>
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
