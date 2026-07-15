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
    if (!attacker || !defender || !selectedMove) return [];

    const rows: Candidate[] = [];
    const criticalOptions = [false, true];

    if (unknownSide === "attacker") {
      const knownDefender = applyBattleOptions({
        pokemon: defender,
        heldItems,
        relevantStat: relevantStatIds.defender,
        adjustments: statAdjustments.defender,
      });

      for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
        for (const nature of [false, true]) {
          for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
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
      const knownAttacker = applyBattleOptions({
        pokemon: attacker,
        heldItems,
        relevantStat: relevantStatIds.attacker,
        adjustments: statAdjustments.attacker,
      });

      for (let hpPoint = POINT_MIN; hpPoint <= POINT_MAX; hpPoint += 1) {
        for (let point = POINT_MIN; point <= POINT_MAX; point += 1) {
          for (const nature of [false, true]) {
            for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) {
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
