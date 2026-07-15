import type { DamageCalculation } from "../application/smogon-damage-calculator";

export type DamageSide = "attacker" | "defender";

export type AdjustableStatId =
  | "hp"
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense";

export type StatAdjustment = {
  point: number;
  rank: number;
  nature: boolean;
};

export type SpeedComparisonRow = {
  id: string;
  label: string;
  attacker: number | null;
  defender: number | null;
};

export type CalculationResult = {
  normal: DamageCalculation;
  critical: DamageCalculation;
  attackerName: string;
  defenderName: string;
  moveName: string;
  moveEffectiveness: number;
};
