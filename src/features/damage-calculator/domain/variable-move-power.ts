import type { DamageCalculatorMove } from "./damage-calculator-types";

const range = (start: number, end: number, step: number) =>
  Array.from(
    { length: Math.floor((end - start) / step) + 1 },
    (_, index) => start + index * step,
  );

/** 条件によって基本威力が変わる技と、画面から選べる実効威力候補。 */
const VARIABLE_MOVE_POWERS: Record<string, readonly number[]> = {
  "last-respects": [50, 100, 150],
  "rage-fist": range(50, 350, 50),
  "stored-power": range(20, 620, 20),
  "power-trip": range(20, 620, 20),
  flail: [20, 40, 80, 100, 150, 200],
  reversal: [20, 40, 80, 100, 150, 200],
  magnitude: [10, 30, 50, 70, 90, 110, 150],
  "spit-up": [100, 200, 300],
  rollout: [30, 60, 120, 240, 480],
  "ice-ball": [30, 60, 120, 240, 480],
  "fury-cutter": [40, 80, 160],
  "echoed-voice": [40, 80, 120, 160, 200],
  round: [60, 120],
  "electro-ball": [40, 60, 80, 120, 150],
  "trump-card": [40, 50, 60, 80, 200],
  punishment: range(60, 200, 20),
};

export function getVariableMovePowers(
  move: DamageCalculatorMove | null | undefined,
) {
  return move ? (VARIABLE_MOVE_POWERS[move.id] ?? null) : null;
}
