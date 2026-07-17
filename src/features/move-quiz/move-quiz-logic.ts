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

export type MoveComparisonQuestion = {
  pokemon: MoveQuizPokemon;
  moves: [MoveQuizMove, MoveQuizMove];
  correctMoveId: string;
  key: string;
};

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

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
  const topTenMoves = selected.moves.slice(0, 10);
  return {
    pokemon: { ...selected, moves: shuffle(topTenMoves, random) },
    correctMoveIds: topTenMoves.slice(0, 4).map((move) => move.id),
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

export function createMoveComparisonQuestion(
  pokemon: MoveQuizPokemon[],
  previousKey?: string,
  random: () => number = Math.random,
): MoveComparisonQuestion | null {
  const eligible = pokemon.filter(
    (entry) =>
      entry.moves.length >= 2 &&
      new Set(entry.moves.slice(0, 15).map((move) => move.usageRate)).size >= 2,
  );
  if (eligible.length === 0) return null;
  const pokemonCandidates =
    eligible.length > 1
      ? eligible.filter((entry) => String(entry.formId) !== previousKey)
      : eligible;
  const selectedPokemon =
    pokemonCandidates[Math.floor(random() * pokemonCandidates.length)] ??
    pokemonCandidates[0];
  const topFifteen = selectedPokemon.moves.slice(0, 15);
  const pairs = topFifteen.flatMap((first, firstIndex) =>
    topFifteen
      .slice(firstIndex + 1)
      .filter((second) => second.usageRate !== first.usageRate)
      .map((second) => [first, second] as const),
  );
  if (pairs.length === 0) return null;
  const [first, second] =
    pairs[Math.floor(random() * pairs.length)] ?? pairs[0];
  const shuffledMoves = shuffle([first, second], random);
  const moves: [MoveQuizMove, MoveQuizMove] = [
    shuffledMoves[0],
    shuffledMoves[1],
  ];
  return {
    pokemon: selectedPokemon,
    moves,
    correctMoveId:
      first.usageRate >= second.usageRate ? first.id : second.id,
    key: String(selectedPokemon.formId),
  };
}
