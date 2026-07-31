export type SitrusBerryKoResult = {
  hits: number;
  probability: number;
  label: string;
};

type RemainingHpState = {
  hp: number;
  berryUsed: boolean;
};

const CERTAIN_EPSILON = 1e-10;

function stateKey({ hp, berryUsed }: RemainingHpState) {
  return `${hp}:${berryUsed ? 1 : 0}`;
}

function formatRandomPercentage(probability: number) {
  return Math.min(
    99.9,
    Math.max(0.1, Math.round(probability * 1_000) / 10),
  );
}

/**
 * オボンのみを一度だけ使える状態で、同じ技を繰り返し受けた時のKO発数を求める。
 * 攻撃後に生存し、残りHPが最大HPの1/2以下なら最大HPの1/4を回復する。
 */
export function calculateSitrusBerryKo(
  damageRollGroups: number[][],
  maximumHp: number,
  maximumHits = 99,
): SitrusBerryKoResult {
  const maxHp = Math.max(1, Math.trunc(maximumHp));
  const rollGroups = damageRollGroups
    .map((rolls) =>
      rolls.map((damage) => Math.max(0, Math.trunc(damage))),
    )
    .filter((rolls) => rolls.length > 0);
  if (
    rollGroups.length === 0 ||
    rollGroups.every((rolls) => rolls.every((damage) => damage === 0))
  ) {
    return {
      hits: 0,
      probability: 0,
      label: "ダメージなし（オボンのみ込み）",
    };
  }

  const triggerHp = Math.floor(maxHp / 2);
  const recovery = Math.floor(maxHp / 4);
  let aliveStates = new Map<string, RemainingHpState & { probability: number }>([
    [stateKey({ hp: maxHp, berryUsed: false }), {
      hp: maxHp,
      berryUsed: false,
      probability: 1,
    }],
  ]);
  let knockoutProbability = 0;

  for (let hits = 1; hits <= maximumHits; hits += 1) {
    for (const rolls of rollGroups) {
      const nextStates = new Map<
        string,
        RemainingHpState & { probability: number }
      >();

      for (const state of aliveStates.values()) {
        for (const damage of rolls) {
          const branchProbability = state.probability / rolls.length;
          let remainingHp = state.hp - damage;
          if (remainingHp <= 0) {
            knockoutProbability += branchProbability;
            continue;
          }

          let berryUsed = state.berryUsed;
          if (!berryUsed && remainingHp <= triggerHp) {
            remainingHp = Math.min(maxHp, remainingHp + recovery);
            berryUsed = true;
          }

          const key = stateKey({ hp: remainingHp, berryUsed });
          const existing = nextStates.get(key);
          nextStates.set(key, {
            hp: remainingHp,
            berryUsed,
            probability: (existing?.probability ?? 0) + branchProbability,
          });
        }
      }
      aliveStates = nextStates;
      if (aliveStates.size === 0) break;
    }

    if (knockoutProbability > 0) {
      const certain = knockoutProbability >= 1 - CERTAIN_EPSILON;
      return {
        hits,
        probability: certain ? 1 : knockoutProbability,
        label: certain
          ? `確定${hits}発（オボンのみ込み）`
          : `乱数${hits}発（${formatRandomPercentage(knockoutProbability)}%・オボンのみ込み）`,
      };
    }
  }

  return {
    hits: maximumHits + 1,
    probability: 0,
    label: `${maximumHits + 1}発以上（オボンのみ込み）`,
  };
}
