"use client";

import { getTypeBadgeStyle } from "@/presentation/pokemon-type-colors";
import type { DamageCalculatorPokemon } from "../domain/damage-calculator-types";
import damageStyles from "../styles/damage-calculator.module.css";
import { TYPE_LABELS } from "./reverse-damage-calculator-state";

export function TypeBadge({
  typeName,
}: {
  typeName: DamageCalculatorPokemon["types"][number];
}) {
  return (
    <span className={damageStyles.typeBadge} style={getTypeBadgeStyle(typeName)}>
      {TYPE_LABELS[typeName]}
    </span>
  );
}
