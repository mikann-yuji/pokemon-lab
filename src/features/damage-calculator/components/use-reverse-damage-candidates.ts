"use client";

import { useMemo } from "react";
import type { TypeEffectivenessSource } from "@/domain/type-matchup";
import { championsDamageCalculator } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import type { DamageCalculationInput } from "../application/smogon-damage-calculator";
import {
  POINT_MAX,
  POINT_MIN,
  RANK_MAX,
  RANK_MIN,
  applyBattleOptions,
  calculateActualStat,
  observedValueMatches,
  withCandidateAdjustment,
  type Candidate,
  type NonHpStatId,
  type StatAdjustmentState,
  type UnknownSide,
} from "./reverse-damage-calculator-state";

type FieldOptions = DamageCalculationInput["field"];

/**
 * 逆引きダメージ計算ページで、観測値に一致する能力補正候補を全探索する。
 *
 * @param params - 攻撃側/防御側、選択技、未知側、補正入力、観測値、場の条件。
 * @returns 観測値に合う能力ポイント、性格補正、ランク、急所有無の候補一覧。
 */
export function useReverseDamageCandidates({
  attacker,
  defender,
  selectedMove,
  unknownSide,
  heldItems,
  relevantStatIds,
  statAdjustments,
  observedDamageValue,
  observedPercentValue,
  percentTolerance,
  fieldOptions,
  typeEffectivenessSource,
}: {
  attacker: DamageCalculatorPokemon | null;
  defender: DamageCalculatorPokemon | null;
  selectedMove: DamageCalculatorMove | null;
  unknownSide: UnknownSide;
  heldItems: DamageCalculatorHeldItem[];
  relevantStatIds: Record<UnknownSide, NonHpStatId>;
  statAdjustments: StatAdjustmentState;
  observedDamageValue: number;
  observedPercentValue: number;
  percentTolerance: number;
  fieldOptions: FieldOptions;
  typeEffectivenessSource: TypeEffectivenessSource | null;
}) {
  return useMemo(() => {
    // ポケモンか技が不足している間は探索できない。
    // 空配列にしておくと、画面側は候補表を単純に非表示/空表示へ切り替えられる。
    if (!attacker || !defender || !selectedMove) return [];

    const rows: Candidate[] = [];
    // 急所かどうかは画面入力に持たせず、両方の可能性を候補として出す。
    const criticalOptions = [false, true];

    if (unknownSide === "attacker") {
      // 攻撃側を逆引きする場合、防御側は画面入力どおりに固定する。
      // 探索対象は攻撃側の能力ポイント、性格補正、ランク補正。
      const knownDefender = applyBattleOptions({
        pokemon: defender,
        heldItems,
        relevantStat: relevantStatIds.defender,
        adjustments: statAdjustments.defender,
      });

      for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
        // 攻撃側逆引きは、A/Cの能力ポイント・性格・ランクを全組み合わせで試す。
        // HPはダメージ量に影響しないため、この分岐では探索しない。
        for (const nature of [false, true]) {
          for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
            // 1候補ごとに攻撃側だけを差し替え、通常のダメージ計算に流す。
            const candidateAttacker = withCandidateAdjustment({
              pokemon: attacker,
              heldItems,
              baseAdjustments: statAdjustments.attacker,
              statId: relevantStatIds.attacker,
              point,
              nature,
              rank,
            });

            for (const critical of criticalOptions) {
              const result = championsDamageCalculator.calculate({
                attacker: candidateAttacker,
                defender: knownDefender,
                move: selectedMove,
                isCritical: critical,
                field: fieldOptions,
                typeEffectivenessSource,
              });
              const candidate = {
                minimum: result.minimum,
                maximum: result.maximum,
                minimumPercent: result.minimumPercent,
                maximumPercent: result.maximumPercent,
              };
              if (
                observedValueMatches({
                  unknownSide,
                  observedDamage: observedDamageValue,
                  observedPercent: observedPercentValue,
                  tolerance: percentTolerance,
                  candidate,
                })
              ) {
                // 観測ダメージ範囲に一致した組み合わせだけを表へ残す。
                rows.push({
                  id: `a-${point}-${nature}-${rank}-${critical}`,
                  hpPoint: null,
                  statPoint: point,
                  statValue: calculateActualStat(
                    attacker,
                    relevantStatIds.attacker,
                    point,
                    nature,
                  ),
                  hpValue: calculateActualStat(attacker, "hp"),
                  nature,
                  rank,
                  critical,
                  ...candidate,
                });
              }
            }
          }
        }
      }
    } else {
      // 防御側を逆引きする場合、攻撃側は画面入力どおりに固定する。
      // 防御側はHP実数値も効くため、HPポイントと防御能力ポイントの両方を探索する。
      const knownAttacker = applyBattleOptions({
        pokemon: attacker,
        heldItems,
        relevantStat: relevantStatIds.attacker,
        adjustments: statAdjustments.attacker,
      });

      for (let hpPoint = POINT_MIN; hpPoint <= POINT_MAX; hpPoint += 1) {
        // 防御側逆引きは「受け側HP」と「受け側B/D」の両方で割合が変わる。
        // そのため攻撃側より探索範囲が広く、HPポイントも外側のループで試す。
        for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
          for (const nature of [false, true]) {
            for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
              // 防御側候補は「HP」と「該当防御能力」を同時に差し替える。
              const candidateDefender = withCandidateAdjustment({
                pokemon: defender,
                heldItems,
                baseAdjustments: statAdjustments.defender,
                statId: relevantStatIds.defender,
                point,
                nature,
                rank,
                hpPoint,
              });

              for (const critical of criticalOptions) {
                const result = championsDamageCalculator.calculate({
                  attacker: knownAttacker,
                  defender: candidateDefender,
                  move: selectedMove,
                  isCritical: critical,
                  field: fieldOptions,
                  typeEffectivenessSource,
                });
                const candidate = {
                  minimum: result.minimum,
                  maximum: result.maximum,
                  minimumPercent: result.minimumPercent,
                  maximumPercent: result.maximumPercent,
                };
                if (
                  observedValueMatches({
                    unknownSide,
                    observedDamage: observedDamageValue,
                    observedPercent: observedPercentValue,
                    tolerance: percentTolerance,
                    candidate,
                  })
                ) {
                  // 観測HP割合に合った候補だけを返す。許容誤差は observedValueMatches 側で見る。
                  rows.push({
                    id: `d-${hpPoint}-${point}-${nature}-${rank}-${critical}`,
                    hpPoint,
                    statPoint: point,
                    statValue: calculateActualStat(
                      defender,
                      relevantStatIds.defender,
                      point,
                      nature,
                    ),
                    hpValue: calculateActualStat(defender, "hp", hpPoint),
                    nature,
                    rank,
                    critical,
                    ...candidate,
                  });
                }
              }
            }
          }
        }
      }
    }

    // 表示は通常判定、HPポイント、能力ポイント、ランク、性格補正の順に安定ソートする。
    // 入力値を少し変えたときに候補表が不必要に揺れないようにするため。
    return rows.sort((a, b) => {
      if (a.critical !== b.critical) return Number(a.critical) - Number(b.critical);
      if ((a.hpPoint ?? -1) !== (b.hpPoint ?? -1)) return (a.hpPoint ?? -1) - (b.hpPoint ?? -1);
      if (a.statPoint !== b.statPoint) return a.statPoint - b.statPoint;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return Number(a.nature) - Number(b.nature);
    });
  }, [
    attacker,
    defender,
    fieldOptions,
    heldItems,
    observedDamageValue,
    observedPercentValue,
    percentTolerance,
    relevantStatIds.attacker,
    relevantStatIds.defender,
    selectedMove,
    statAdjustments.attacker,
    statAdjustments.defender,
    typeEffectivenessSource,
    unknownSide,
  ]);
}
