import type { CSSProperties } from "react";
import type { DamageCalculation } from "../application/smogon-damage-calculator";
import type { CalculationResult } from "./damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

type HpBarStyle = CSSProperties & {
  "--minimum-damage": string;
  "--maximum-damage": string;
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
  // ダメージ幅をHPバー上に重ねる。
  // 薄い最大乱数バーの上に濃い最低乱数バーを描くと、乱数の広がりを小さい面積で読める。
  const minimumDamage = clampPercent(outcome.minimumPercent);
  const maximumDamage = clampPercent(outcome.maximumPercent);
  const barStyle: HpBarStyle = {
    "--minimum-damage": `${minimumDamage}%`,
    "--maximum-damage": `${maximumDamage}%`,
  };

  return (
    <div className={`${styles.outcome} ${critical ? styles.criticalOutcome : ""}`}>
      <span className={styles.outcomeTitle}>{title}</span>
      <span className={styles.damagePercent}>
        {outcome.minimumPercent.toFixed(1)}-{outcome.maximumPercent.toFixed(1)}%
      </span>
      <span className={styles.koLabel}>{outcome.koLabel}</span>
      <span
        className={styles.damageBar}
        aria-label={`ダメージ ${minimumDamage.toFixed(1)}%から${maximumDamage.toFixed(1)}%`}
        key={`${title}-${outcome.minimum}-${outcome.maximum}-${outcome.maximumPercent}`}
      >
        <span className={styles.maximumDamageBar} style={barStyle} />
        <span className={styles.minimumDamageBar} style={barStyle} />
      </span>
    </div>
  );
}

export function DamageResult({ result }: { result: CalculationResult }) {
  // 通常ダメージと急所ダメージを同じ見た目で並べる。
  // 急所結果がない技や条件では通常結果だけを表示する。
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
