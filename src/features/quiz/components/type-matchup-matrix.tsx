"use client";

/**
 * このファイルの役割: 全タイプの攻撃側・防御側相性を一覧表として表示するコンポーネント。
 */

import { useState } from "react";
import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
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
function DefenderTypeLabel({ label }: { label: string }) {
  return (
    <span className={styles.defenderTypeLabel} aria-label={label}>
      {Array.from(label).map((character, index) => (
        <span aria-hidden="true" key={`${character}-${index}`}>
          {character}
        </span>
      ))}
    </span>
  );
}

function buildClassName(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export default function TypeMatchupMatrix({
  typeMatchups,
}: {
  /** getTypeMatchupsで攻撃側/防御側の両観点に整形済みのタイプ一覧。 */
  typeMatchups: TypeMatchup[];
}) {
  const [highlightedAttacker, setHighlightedAttacker] =
    useState<TypeName | null>(null);
  const [highlightedDefender, setHighlightedDefender] =
    useState<TypeName | null>(null);

  return (
    <section className={styles.matrixSection}>
      <div className={styles.matrixScroller}>
        <table className={styles.matrix}>
          <colgroup>
            <col className={styles.rowHeaderColumn} />
            {typeMatchups.map((type) => (
              <col className={styles.typeColumn} key={type.name} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">攻＼防</th>
              {typeMatchups.map((defender) => (
                <th
                  className={
                    highlightedDefender === defender.name
                      ? styles.highlightedHeader
                      : undefined
                  }
                  scope="col"
                  key={defender.name}
                >
                  <button
                    type="button"
                    className={styles.headerSelectButton}
                    aria-pressed={highlightedDefender === defender.name}
                    onClick={() => setHighlightedDefender(defender.name)}
                  >
                    <DefenderTypeLabel label={defender.nameJa} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {typeMatchups.map((attacker) => (
              <tr key={attacker.name}>
                <th
                  className={
                    highlightedAttacker === attacker.name
                      ? styles.highlightedHeader
                      : undefined
                  }
                  scope="row"
                >
                  <button
                    type="button"
                    className={styles.headerSelectButton}
                    aria-pressed={highlightedAttacker === attacker.name}
                    onClick={() => setHighlightedAttacker(attacker.name)}
                  >
                    {attacker.nameJa}
                  </button>
                </th>
                {typeMatchups.map((defender) => {
                  const effectiveness = getEffectiveness(attacker, defender);
                  const highlighted =
                    highlightedAttacker === attacker.name ||
                    highlightedDefender === defender.name;

                  return (
                    <td
                      key={defender.name}
                      className={buildClassName(
                        effectiveness === "2"
                          ? styles.superEffective
                          : effectiveness === "½"
                            ? styles.notVeryEffective
                            : effectiveness === "0"
                              ? styles.noEffect
                              : undefined,
                        highlighted && styles.highlightedCell,
                      )}
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
