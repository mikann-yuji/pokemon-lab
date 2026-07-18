import type {
  KnowledgePokemon,
  KnowledgeStatId,
} from "./infrastructure/knowledge-repository";

export type KnowledgeStatExample = KnowledgePokemon & {
  actualValue: number;
};

export function calculateUninvestedStat(
  baseStat: number,
  statId: KnowledgeStatId,
) {
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  return statId === "hp" ? base + 60 : base + 5;
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function selectKnowledgeExamples(
  pokemon: KnowledgePokemon[],
  statId: KnowledgeStatId,
  count = 15,
): KnowledgeStatExample[] {
  return shuffle(pokemon)
    .slice(0, count)
    .map((entry) => ({
      ...entry,
      actualValue: calculateUninvestedStat(entry.stats[statId], statId),
    }));
}
