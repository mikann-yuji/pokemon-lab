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

const MOVE_TYPE_CHANGING_ABILITIES = new Set(["protean", "libero"]);

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

export function resolveAbilityAttackerTypes(
  abilityId: string | null | undefined,
  moveType: TypeName,
  conditionEnabled: boolean,
  originalTypes: readonly TypeName[],
): TypeName[] {
  return conditionEnabled && abilityId && MOVE_TYPE_CHANGING_ABILITIES.has(abilityId)
    ? [moveType]
    : [...originalTypes];
}

export function resolveMoveTypeChangingAbilityStabMultiplier(
  abilityId: string | null | undefined,
  moveType: TypeName,
  conditionEnabled: boolean,
  originalTypes: readonly TypeName[],
) {
  if (
    !conditionEnabled ||
    !abilityId ||
    !MOVE_TYPE_CHANGING_ABILITIES.has(abilityId) ||
    originalTypes.includes(moveType)
  ) {
    return 1;
  }

  return 1.5;
}

export function hasMoveTypeChangingAbility(
  abilityId: string | null | undefined,
) {
  return Boolean(abilityId && MOVE_TYPE_CHANGING_ABILITIES.has(abilityId));
}
