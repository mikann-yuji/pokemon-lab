import type { TypeMatchup } from "@/domain/type-matchup";
import styles from "../styles/type-matchup-matrix.module.css";

// 攻撃タイプから見た相性を、表に表示する倍率へ変換する。
function getEffectiveness(
  attacker: TypeMatchup,
  defender: TypeMatchup,
): "2" | "½" | "0" | "1" {
  if (attacker.noEffectAgainst.includes(defender.name)) return "0";
  if (attacker.superEffectiveAgainst.includes(defender.name)) return "2";
  if (attacker.notVeryEffectiveAgainst.includes(defender.name)) return "½";
  return "1";
}

/**
 * 行を攻撃側、列を防御側として全タイプの相性を一覧表示する。
 */
export default function TypeMatchupMatrix({
  typeMatchups,
}: {
  typeMatchups: TypeMatchup[];
}) {
  return (
    <section className={styles.matrixSection}>
      <h2>タイプ相性マトリックス</h2>
      <p className={styles.matrixNote}>
        行が攻撃側、列が防御側（2: ばつぐん / ½: いまひとつ / 0:
        効果なし）
      </p>
      <div className={styles.matrixScroller}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">攻＼防</th>
              {typeMatchups.map((defender) => (
                <th scope="col" key={defender.name}>
                  {defender.nameJa}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {typeMatchups.map((attacker) => (
              <tr key={attacker.name}>
                <th scope="row">{attacker.nameJa}</th>
                {typeMatchups.map((defender) => {
                  const effectiveness = getEffectiveness(attacker, defender);

                  return (
                    <td
                      key={defender.name}
                      className={
                        effectiveness === "2"
                          ? styles.superEffective
                          : effectiveness === "½"
                            ? styles.notVeryEffective
                            : effectiveness === "0"
                              ? styles.noEffect
                              : undefined
                      }
                    >
                      {effectiveness}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
