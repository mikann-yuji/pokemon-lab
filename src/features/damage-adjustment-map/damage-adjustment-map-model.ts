export type DamageZone =
  | "certain-one"
  | "random-one-high"
  | "random-one-mid"
  | "random-one-low"
  | "certain-two"
  | "random-two"
  | "three-plus";

export type DamageSummary = {
  minimum: number;
  maximum: number;
  defenderHp: number;
  oneHitProbability: number;
  twoHitProbability: number;
};

export const DAMAGE_ZONE_LABELS: Record<DamageZone, string> = {
  "certain-one": "確定1発",
  "random-one-high": "高乱数1発",
  "random-one-mid": "中乱数1発",
  "random-one-low": "低乱数1発",
  "certain-two": "確定2発",
  "random-two": "乱数2発",
  "three-plus": "確定3発以下",
};

export function classifyDamageZone(result: DamageSummary): DamageZone {
  if (result.minimum >= result.defenderHp) return "certain-one";
  if (result.maximum >= result.defenderHp) {
    if (result.oneHitProbability >= 0.75) return "random-one-high";
    if (result.oneHitProbability >= 0.375) return "random-one-mid";
    return "random-one-low";
  }
  if (result.minimum * 2 >= result.defenderHp) return "certain-two";
  if (result.maximum * 2 >= result.defenderHp) return "random-two";
  return "three-plus";
}

export function rankMultiplier(rank: number) {
  return rank >= 0 ? (2 + rank) / 2 : 2 / (2 - rank);
}

export function firepowerIndex(
  actualStat: number,
  movePower: number,
  rank: number,
) {
  return Math.floor(actualStat * rankMultiplier(rank)) * Math.max(1, movePower);
}

export function durabilityIndex(
  hp: number,
  defenseStat: number,
  rank: number,
) {
  return hp * Math.floor(defenseStat * rankMultiplier(rank));
}
