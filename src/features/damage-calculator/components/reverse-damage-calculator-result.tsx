import { formatRange, formatRank, type Candidate, type UnknownSide } from "./reverse-damage-calculator-state";
import styles from "../styles/reverse-damage-calculator.module.css";
// 逆引き候補の結果表。
// 候補探索hookが返した行を、攻撃側逆引き/防御側逆引きで列数を変えて表示する。
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
      {/* 防御側を逆引きする時だけHPポイント列を追加する。 */}
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
