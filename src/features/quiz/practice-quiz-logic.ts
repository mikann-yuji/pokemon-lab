import type { TypeMatchup, TypeName } from "@/domain/type-matchup";

export type PracticeBattleFormat = "single" | "double";
export type PracticeMultiplier = 4 | 2 | 1 | 0.5 | 0.25;

export const PRACTICE_MULTIPLIERS: PracticeMultiplier[] = [
  2,
  4,
  1,
  0.5,
  0.25,
];

export const PRACTICE_MULTIPLIER_LABELS: Record<
  PracticeMultiplier,
  string
> = {
  4: "ちょうばつぐん",
  2: "ばつぐん",
  1: "等倍",
  0.5: "いまひとつ",
  0.25: "かなりいまひとつ",
};

export type PracticeTarget = {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  types: TypeName[];
  usageRank: number;
};

export type PracticeMove = {
  id: string;
  name: string;
  typeName: TypeName;
};

export type PracticeTeamMember = {
  buildId: number;
  buildName: string;
  pokemonId: number;
  pokemonName: string;
  imageUrl: string | null;
  moves: PracticeMove[];
};

export type PracticeQuestion = {
  key: string;
  target: PracticeTarget;
  multiplier: PracticeMultiplier;
  correctBuildIds: number[];
  matchingMovesByBuildId: Record<number, PracticeMove[]>;
};

function getSingleTypeEffectiveness(
  attackingType: TypeName,
  defendingType: TypeName,
  matchupsByType: Map<TypeName, TypeMatchup>,
) {
  const matchup = matchupsByType.get(attackingType);
  if (matchup?.noEffectAgainst.includes(defendingType)) return 0;
  if (matchup?.superEffectiveAgainst.includes(defendingType)) return 2;
  if (matchup?.notVeryEffectiveAgainst.includes(defendingType)) return 0.5;
  return 1;
}

export function getPracticeMoveEffectiveness(
  moveType: TypeName,
  defendingTypes: TypeName[],
  matchupsByType: Map<TypeName, TypeMatchup>,
) {
  return defendingTypes.reduce(
    (effectiveness, defendingType) =>
      effectiveness *
      getSingleTypeEffectiveness(moveType, defendingType, matchupsByType),
    1,
  );
}

export function createPracticeQuestion(
  targets: PracticeTarget[],
  members: PracticeTeamMember[],
  typeMatchups: TypeMatchup[],
  previousKey = "",
): PracticeQuestion | null {
  const matchupsByType = new Map(
    typeMatchups.map((matchup) => [matchup.name, matchup]),
  );
  const candidates = targets.flatMap((target) =>
    PRACTICE_MULTIPLIERS.flatMap((multiplier) => {
      const matchingMovesByBuildId: Record<number, PracticeMove[]> = {};
      for (const member of members) {
        const matchingMoves = member.moves.filter(
          (move) =>
            getPracticeMoveEffectiveness(
              move.typeName,
              target.types,
              matchupsByType,
            ) === multiplier,
        );
        if (matchingMoves.length > 0) {
          matchingMovesByBuildId[member.buildId] = matchingMoves;
        }
      }

      const correctBuildIds = Object.keys(matchingMovesByBuildId).map(Number);
      if (correctBuildIds.length === 0) return [];
      return [
        {
          key: `${target.formId}:${multiplier}`,
          target,
          multiplier,
          correctBuildIds,
          matchingMovesByBuildId,
        },
      ];
    }),
  );

  if (candidates.length === 0) return null;
  const nextCandidates =
    candidates.length > 1
      ? candidates.filter((candidate) => candidate.key !== previousKey)
      : candidates;
  return nextCandidates[Math.floor(Math.random() * nextCandidates.length)];
}

export function isExactPracticeAnswer(
  selectedBuildIds: Set<number>,
  correctBuildIds: number[],
) {
  const correct = new Set(correctBuildIds);
  return (
    selectedBuildIds.size === correct.size &&
    [...selectedBuildIds].every((buildId) => correct.has(buildId))
  );
}
