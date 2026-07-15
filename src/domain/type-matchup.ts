/**
 * Pokemon type names and type-effectiveness helpers shared across features.
 */

// Canonical type order used by the app and catalog database.
export const TYPE_NAMES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy",
] as const;

export type TypeName = (typeof TYPE_NAMES)[number];

type TypeEffectivenessValue = 0 | 0.5 | 1 | 2;
export type TypeEffectivenessSource = Record<
  TypeName,
  Partial<Record<TypeName, TypeEffectivenessValue>>
>;

type TypeEffectivenessRow = {
  attackerType: TypeName;
  defenderType: TypeName;
  effectiveness: TypeEffectivenessValue;
};

let catalogTypeEffectiveness: TypeEffectivenessSource | null = null;

export function createTypeEffectivenessSource(
  rows: readonly TypeEffectivenessRow[],
) {
  const source = TYPE_NAMES.reduce((table, typeName) => {
    table[typeName] = {};
    return table;
  }, {} as TypeEffectivenessSource);

  for (const row of rows) {
    source[row.attackerType][row.defenderType] = row.effectiveness;
  }

  return source;
}

export function setTypeEffectivenessSource(source: TypeEffectivenessSource) {
  catalogTypeEffectiveness = source;
}

export function getTypeEffectiveness(
  attackingType: TypeName,
  defendingTypes: readonly TypeName[],
  preferredSource?: TypeEffectivenessSource | null,
) {
  const source = preferredSource ?? catalogTypeEffectiveness;
  if (!source) return 1;

  return defendingTypes.reduce(
    (multiplier, defendingType) =>
      multiplier * (source[attackingType][defendingType] ?? 1),
    1,
  );
}

// Type effectiveness data from the attacker's point of view.
type TypeMatchupSource = {
  name: TypeName;
  nameJa: string;
  superEffectiveAgainst: TypeName[];
  notVeryEffectiveAgainst: TypeName[];
  noEffectAgainst: TypeName[];
};

// Type effectiveness data enriched with the defender's point of view.
export type TypeMatchup = TypeMatchupSource & {
  vulnerableTo: TypeName[];
  resistantTo: TypeName[];
  noEffectTo: TypeName[];
};
