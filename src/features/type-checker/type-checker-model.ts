import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import type { PracticeMove } from "@/features/quiz/practice-quiz-logic";

export type TypeCheckerMultiplier = 0 | 0.25 | 0.5 | 1 | 2 | 4;

export const MULTIPLIER_DISPLAY: Record<
  TypeCheckerMultiplier,
  { symbol: string; label: string }
> = {
  0: { symbol: "✖︎", label: "こうかなし" },
  0.25: { symbol: "▼", label: "かなりいまひとつ" },
  0.5: { symbol: "△", label: "いまひとつ" },
  1: { symbol: "◯", label: "等倍" },
  2: { symbol: "◎", label: "ばつぐん" },
  4: { symbol: "⭐︎", label: "ちょうばつぐん" },
};

function getSingleTypeMultiplier(
  attackingType: TypeName,
  defendingType: TypeName,
  matchupsByType: ReadonlyMap<TypeName, TypeMatchup>,
) {
  const matchup = matchupsByType.get(attackingType);
  if (matchup?.noEffectAgainst.includes(defendingType)) return 0;
  if (matchup?.superEffectiveAgainst.includes(defendingType)) return 2;
  if (matchup?.notVeryEffectiveAgainst.includes(defendingType)) return 0.5;
  return 1;
}

export function getDefensiveMultiplier(
  attackingType: TypeName,
  defendingTypes: readonly TypeName[],
  matchupsByType: ReadonlyMap<TypeName, TypeMatchup>,
): TypeCheckerMultiplier {
  return defendingTypes.reduce<number>(
    (multiplier, defendingType) =>
      multiplier *
      getSingleTypeMultiplier(attackingType, defendingType, matchupsByType),
    1,
  ) as TypeCheckerMultiplier;
}

export function getBestMoveMultiplier(
  moves: readonly PracticeMove[],
  defendingType: TypeName,
  matchupsByType: ReadonlyMap<TypeName, TypeMatchup>,
) {
  if (moves.length === 0) return null;
  return Math.max(
    ...moves.map((move) =>
      getSingleTypeMultiplier(move.typeName, defendingType, matchupsByType),
    ),
  ) as TypeCheckerMultiplier;
}

export function findSharedWeaknesses(
  members: ReadonlyArray<{ types: readonly TypeName[] }>,
  typeMatchups: readonly TypeMatchup[],
) {
  const matchupsByType = new Map(
    typeMatchups.map((matchup) => [matchup.name, matchup]),
  );
  return typeMatchups.flatMap((type) => {
    const count = members.filter(
      (member) =>
        getDefensiveMultiplier(type.name, member.types, matchupsByType) > 1,
    ).length;
    return count >= 3 ? [{ typeName: type.name, nameJa: type.nameJa, count }] : [];
  });
}
// タイプ相性チェッカーの入力を、検索・集計しやすい表示モデルへ変換する。
