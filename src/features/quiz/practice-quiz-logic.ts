import type { TypeMatchup, TypeName } from "@/domain/type-matchup";

export type PracticeBattleFormat = "single" | "double";
export type PracticeQuizSide = "attack" | "defense";
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
  popularMoves: PracticeMove[];
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
  types: TypeName[];
  moves: PracticeMove[];
};

type PracticeQuestionBase = {
  key: string;
  target: PracticeTarget;
  multiplier: PracticeMultiplier;
  correctBuildIds: number[];
  matchingMovesByBuildId: Record<number, PracticeMove[]>;
};

export type PracticeQuestion =
  | (PracticeQuestionBase & {
      side: "attack";
      selectedMove: null;
    })
  | (PracticeQuestionBase & {
      side: "defense";
      selectedMove: PracticeMove;
    });

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

export function createAttackPracticeQuestion(
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
      return [
        {
          key: `attack:${target.formId}:${multiplier}`,
          side: "attack" as const,
          target,
          multiplier,
          correctBuildIds,
          matchingMovesByBuildId,
          selectedMove: null,
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

export function createDefensePracticeQuestion(
  targets: PracticeTarget[],
  members: PracticeTeamMember[],
  typeMatchups: TypeMatchup[],
  previousKey = "",
): PracticeQuestion | null {
  const matchupsByType = new Map(
    typeMatchups.map((matchup) => [matchup.name, matchup]),
  );
  const candidates = targets.flatMap((target) =>
    target.popularMoves.flatMap((selectedMove) =>
      PRACTICE_MULTIPLIERS.map((multiplier) => {
        const correctMembers = members.filter(
          (member) =>
            getPracticeMoveEffectiveness(
              selectedMove.typeName,
              member.types,
              matchupsByType,
            ) === multiplier,
        );
        return {
          key: `defense:${target.formId}:${selectedMove.id}:${multiplier}`,
          side: "defense" as const,
          target,
          multiplier,
          correctBuildIds: correctMembers.map((member) => member.buildId),
          matchingMovesByBuildId: {},
          selectedMove,
        };
      }),
    ),
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
