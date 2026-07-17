export type MoveQuizBattleFormat = "single" | "double";

export type MoveQuizMove = {
  id: string;
  name: string;
  usageRate: number;
};

export type MoveQuizPokemon = {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  usageRank: number;
  moves: MoveQuizMove[];
};

export type MoveQuizQuestion = {
  pokemon: MoveQuizPokemon;
  correctMoveIds: string[];
  key: string;
};

export function createMoveQuizQuestion(
  pokemon: MoveQuizPokemon[],
  previousKey?: string,
  random: () => number = Math.random,
): MoveQuizQuestion | null {
  const eligible = pokemon.filter((entry) => entry.moves.length >= 10);
  if (eligible.length === 0) return null;
  const candidates =
    eligible.length > 1
      ? eligible.filter((entry) => String(entry.formId) !== previousKey)
      : eligible;
  const selected =
    candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
  return {
    pokemon: selected,
    correctMoveIds: selected.moves.slice(0, 4).map((move) => move.id),
    key: String(selected.formId),
  };
}

export function isMoveQuizAnswerCorrect(
  selectedMoveIds: string[],
  correctMoveIds: string[],
): boolean {
  if (selectedMoveIds.length !== correctMoveIds.length) return false;
  const selected = new Set(selectedMoveIds);
  return correctMoveIds.every((moveId) => selected.has(moveId));
}
