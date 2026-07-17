export type BaseStatBattleFormat = "single" | "double";
export type BaseStatId = "hp" | "attack" | "defense" | "special-attack" | "special-defense" | "speed";

export type BaseStatPokemon = {
  formId: number;
  nameJa: string;
  imageUrl: string | null;
  usageRank: number;
  stats: Record<BaseStatId, number>;
};

export type BaseStatOption = {
  pokemon: BaseStatPokemon;
  isCorrect: boolean;
};

export type BaseStatQuestion = {
  target: BaseStatPokemon;
  options: BaseStatOption[];
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

export function createBaseStatQuestion(
  pokemon: BaseStatPokemon[],
  previousKey?: string,
  random: () => number = Math.random,
): BaseStatQuestion | null {
  if (pokemon.length < 4) return null;
  const targets = pokemon.filter((entry) => {
    if (pokemon.length > 1 && String(entry.formId) === previousKey) return false;
    const signatures = new Set(
      pokemon
        .filter((candidate) => candidate.formId !== entry.formId)
        .map((candidate) => formatBaseStats(candidate.stats))
        .filter((signature) => signature !== formatBaseStats(entry.stats)),
    );
    return signatures.size >= 3;
  });
  if (targets.length === 0) return null;
  const target = targets[Math.floor(random() * targets.length)] ?? targets[0];
  const distractorCandidates = shuffle(
    pokemon.filter((entry) => entry.formId !== target.formId),
    random,
  );
  const usedSignatures = new Set([formatBaseStats(target.stats)]);
  const distractors: BaseStatPokemon[] = [];
  for (const candidate of distractorCandidates) {
    const signature = formatBaseStats(candidate.stats);
    if (usedSignatures.has(signature)) continue;
    usedSignatures.add(signature);
    distractors.push(candidate);
    if (distractors.length === 3) break;
  }
  return {
    target,
    options: shuffle(
      [
        { pokemon: target, isCorrect: true },
        ...distractors.map((entry) => ({ pokemon: entry, isCorrect: false })),
      ],
      random,
    ),
    key: String(target.formId),
  };
}

export function formatBaseStats(stats: Record<BaseStatId, number>): string {
  return [
    stats.hp,
    stats.attack,
    stats.defense,
    stats["special-attack"],
    stats["special-defense"],
    stats.speed,
  ].join("-");
}
