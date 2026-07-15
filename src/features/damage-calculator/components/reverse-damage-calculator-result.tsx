import { formatRange, formatRank, type Candidate, type UnknownSide } from "./reverse-damage-calculator-state";
import styles from "../styles/reverse-damage-calculator.module.css";
export function ReverseResultTable({
  unknownSide,
  unknownStatLabel,
  candidates,
}: {
  unknownSide: UnknownSide;
  unknownStatLabel: string;
  candidates: Candidate[];
}) {
  return (
    <div className={styles.resultTable}>
      <div
        className={`${styles.resultHead} ${
          unknownSide === "attacker" ? styles.fiveColumns : ""
        }`}
      >
        {unknownSide === "defender" ? <span>HP</span> : null}
        <span>{unknownStatLabel}</span>
        <span>補正</span>
        <span>ランク</span>
        <span>判定</span>
        <span>ダメージ</span>
      </div>
      {candidates.map((candidate) => (
        <div
          className={`${styles.resultRow} ${
            unknownSide === "attacker" ? styles.fiveColumns : ""
          }`}
          key={candidate.id}
        >
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
              {formatRange(candidate.minimumPercent, candidate.maximumPercent, "%")}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}
