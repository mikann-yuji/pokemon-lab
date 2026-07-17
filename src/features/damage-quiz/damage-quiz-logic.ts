import type { TypeEffectivenessSource } from "@/domain/type-matchup";
import type { DamageCalculation } from "@/features/damage-calculator/application/smogon-damage-calculator";
import { championsDamageCalculator } from "@/features/damage-calculator/config/champions-damage-ruleset";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "@/features/damage-calculator/domain/damage-calculator-types";

export type DamageQuizBattleFormat = "single" | "double";
export type DamageQuizMode = "knockout" | "best-move";
export type KnockoutAnswer =
  | "certain-one"
  | "random-one"
  | "certain-two"
  | "random-two"
  | "three-plus";

export const KNOCKOUT_OPTIONS: { id: KnockoutAnswer; label: string }[] = [
  { id: "certain-one", label: "確定1発" },
  { id: "random-one", label: "乱数1発" },
  { id: "certain-two", label: "確定2発" },
  { id: "random-two", label: "乱数2発" },
  { id: "three-plus", label: "3発以上" },
];

export type DamageQuizMoveResult = {
  move: DamageCalculatorMove;
  result: DamageCalculation;
};

export type DamageQuizQuestion = {
  attacker: DamageCalculatorPokemon;
  defender: DamageCalculatorPokemon;
  moveResults: DamageQuizMoveResult[];
  selectedMoveResult: DamageQuizMoveResult;
  knockoutOptions: { id: KnockoutAnswer; label: string }[];
  correctKnockoutAnswer: KnockoutAnswer;
  bestMoveIds: string[];
  key: string;
};

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function classifyKnockout(
  result: DamageCalculation,
): KnockoutAnswer {
  if (result.koHits <= 1) {
    return result.koProbability === 1 ? "certain-one" : "random-one";
  }
  if (result.koHits === 2) {
    return result.koProbability === 1 ? "certain-two" : "random-two";
  }
  return "three-plus";
}

export function createDamageQuizQuestion({
  attackers,
  defenders,
  typeEffectivenessSource,
  previousKey,
  random = Math.random,
}: {
  attackers: DamageCalculatorPokemon[];
  defenders: DamageCalculatorPokemon[];
  typeEffectivenessSource: TypeEffectivenessSource;
  previousKey?: string;
  random?: () => number;
}): DamageQuizQuestion | null {
  const eligibleAttackers = attackers.filter((pokemon) => pokemon.moves.length > 0);
  if (eligibleAttackers.length === 0 || defenders.length === 0) return null;

  const pairs = eligibleAttackers.flatMap((attacker) =>
    defenders
      .filter((defender) => defender.id !== attacker.id)
      .map((defender) => ({ attacker, defender })),
  );
  const candidates =
    pairs.length > 1
      ? pairs.filter(
          ({ attacker, defender }) =>
            `${attacker.id}:${defender.id}` !== previousKey,
        )
      : pairs;
  const pair = candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
  if (!pair) return null;

  const moveResults = shuffle(pair.attacker.moves, random).flatMap((move) => {
    try {
      return [{
        move,
        result: championsDamageCalculator.calculate({
          attacker: pair.attacker,
          defender: pair.defender,
          move,
          typeEffectivenessSource,
        }),
      }];
    } catch {
      return [];
    }
  });
  if (moveResults.length === 0) return null;
  const selectedMoveResult =
    moveResults[Math.floor(random() * moveResults.length)] ?? moveResults[0];
  const highestMaximum = Math.max(
    ...moveResults.map(({ result }) => result.maximumPercent),
  );

  return {
    attacker: pair.attacker,
    defender: pair.defender,
    moveResults,
    selectedMoveResult,
    knockoutOptions: shuffle(KNOCKOUT_OPTIONS, random),
    correctKnockoutAnswer: classifyKnockout(selectedMoveResult.result),
    bestMoveIds: moveResults
      .filter(({ result }) => result.maximumPercent === highestMaximum)
      .map(({ move }) => move.id),
    key: `${pair.attacker.id}:${pair.defender.id}`,
  };
}
