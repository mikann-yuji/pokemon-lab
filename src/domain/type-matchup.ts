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

const FALLBACK_TYPE_EFFECTIVENESS: TypeEffectivenessSource = {
  Normal: {
    Rock: 0.5,
    Ghost: 0,
    Steel: 0.5,
  },
  Fire: {
    Fire: 0.5,
    Water: 0.5,
    Grass: 2,
    Ice: 2,
    Bug: 2,
    Rock: 0.5,
    Dragon: 0.5,
    Steel: 2,
  },
  Water: {
    Fire: 2,
    Water: 0.5,
    Grass: 0.5,
    Ground: 2,
    Rock: 2,
    Dragon: 0.5,
  },
  Electric: {
    Water: 2,
    Electric: 0.5,
    Grass: 0.5,
    Ground: 0,
    Flying: 2,
    Dragon: 0.5,
  },
  Grass: {
    Fire: 0.5,
    Water: 2,
    Grass: 0.5,
    Poison: 0.5,
    Ground: 2,
    Flying: 0.5,
    Bug: 0.5,
    Rock: 2,
    Dragon: 0.5,
    Steel: 0.5,
  },
  Ice: {
    Fire: 0.5,
    Water: 0.5,
    Grass: 2,
    Ice: 0.5,
    Ground: 2,
    Flying: 2,
    Dragon: 2,
    Steel: 0.5,
  },
  Fighting: {
    Normal: 2,
    Ice: 2,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 0.5,
    Bug: 0.5,
    Rock: 2,
    Ghost: 0,
    Dark: 2,
    Steel: 2,
    Fairy: 0.5,
  },
  Poison: {
    Grass: 2,
    Poison: 0.5,
    Ground: 0.5,
    Rock: 0.5,
    Ghost: 0.5,
    Steel: 0,
    Fairy: 2,
  },
  Ground: {
    Fire: 2,
    Electric: 2,
    Grass: 0.5,
    Poison: 2,
    Flying: 0,
    Bug: 0.5,
    Rock: 2,
    Steel: 2,
  },
  Flying: {
    Electric: 0.5,
    Grass: 2,
    Fighting: 2,
    Bug: 2,
    Rock: 0.5,
    Steel: 0.5,
  },
  Psychic: {
    Fighting: 2,
    Poison: 2,
    Psychic: 0.5,
    Dark: 0,
    Steel: 0.5,
  },
  Bug: {
    Fire: 0.5,
    Grass: 2,
    Fighting: 0.5,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 2,
    Ghost: 0.5,
    Dark: 2,
    Steel: 0.5,
    Fairy: 0.5,
  },
  Rock: {
    Fire: 2,
    Ice: 2,
    Fighting: 0.5,
    Ground: 0.5,
    Flying: 2,
    Bug: 2,
    Steel: 0.5,
  },
  Ghost: {
    Normal: 0,
    Psychic: 2,
    Ghost: 2,
    Dark: 0.5,
  },
  Dragon: {
    Dragon: 2,
    Steel: 0.5,
    Fairy: 0,
  },
  Dark: {
    Fighting: 0.5,
    Psychic: 2,
    Ghost: 2,
    Dark: 0.5,
    Fairy: 0.5,
  },
  Steel: {
    Fire: 0.5,
    Water: 0.5,
    Electric: 0.5,
    Ice: 2,
    Rock: 2,
    Steel: 0.5,
    Fairy: 2,
  },
  Fairy: {
    Fire: 0.5,
    Fighting: 2,
    Poison: 0.5,
    Dragon: 2,
    Dark: 2,
    Steel: 0.5,
  },
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
  const source =
    preferredSource ?? catalogTypeEffectiveness ?? FALLBACK_TYPE_EFFECTIVENESS;
  return defendingTypes.reduce(
    (multiplier, defendingType) =>
      multiplier *
      (source[attackingType][defendingType] ??
        FALLBACK_TYPE_EFFECTIVENESS[attackingType][defendingType] ??
        1),
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
