import type { TypeName } from "@/domain/type-matchup";

type AbilityMoveConversion = {
  fromType: TypeName | null;
  toType: TypeName;
  powerMultiplier: number;
};

const ABILITY_MOVE_CONVERSIONS: Readonly<
  Record<string, AbilityMoveConversion>
> = {
  "normalize": {
    fromType: null,
    toType: "Normal",
    powerMultiplier: 1.2,
  },
  "refrigerate": {
    fromType: "Normal",
    toType: "Ice",
    powerMultiplier: 1.2,
  },
  "pixilate": {
    fromType: "Normal",
    toType: "Fairy",
    powerMultiplier: 1.2,
  },
  "aerilate": {
    fromType: "Normal",
    toType: "Flying",
    powerMultiplier: 1.2,
  },
  "galvanize": {
    fromType: "Normal",
    toType: "Electric",
    powerMultiplier: 1.2,
  },
  "dragonize": {
    fromType: "Normal",
    toType: "Dragon",
    powerMultiplier: 1.2,
  },
};

export function hasAbilityMoveConversion(abilityId: string | null | undefined) {
  return Boolean(abilityId && ABILITY_MOVE_CONVERSIONS[abilityId]);
}

export function resolveAbilityMoveConversion(
  abilityId: string | null | undefined,
  moveType: TypeName,
) {
  const conversion = abilityId
    ? ABILITY_MOVE_CONVERSIONS[abilityId]
    : undefined;
  const applies = Boolean(
    conversion &&
      (conversion.fromType === null || conversion.fromType === moveType),
  );
  const effectiveType = applies ? conversion!.toType : moveType;

  return {
    applies,
    effectiveType,
    typeChanged: effectiveType !== moveType,
    powerMultiplier: applies ? conversion!.powerMultiplier : 1,
  };
}
