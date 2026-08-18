export const HIGH_RANDOM_ONE_HIT_THRESHOLD = 0.75;

export function isSurvivalAdvantage({
  movesFirst,
  outgoingMinimumPercent,
  incomingOneHitProbabilities,
}: {
  movesFirst: boolean;
  outgoingMinimumPercent: number;
  incomingOneHitProbabilities: readonly number[];
}) {
  if (movesFirst) {
    if (outgoingMinimumPercent >= 100) return true;
    if (outgoingMinimumPercent < 50) return false;
    return incomingOneHitProbabilities.every(
      (probability) => probability < HIGH_RANDOM_ONE_HIT_THRESHOLD,
    );
  }
  return (
    outgoingMinimumPercent >= 100 &&
    incomingOneHitProbabilities.length > 0 &&
    incomingOneHitProbabilities.every(
      (probability) => probability < HIGH_RANDOM_ONE_HIT_THRESHOLD,
    )
  );
}
