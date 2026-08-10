// 特性が技タイプや一致補正を変える規則を、ダメージ計算用に正規化する。
import type { TypeName } from "@/domain/type-matchup";

type AbilityMoveConversion = {
  fromType: TypeName | null;
  toType: TypeName;
  powerMultiplier: number;
};

// 皮膚系特性は「変換元」「変換先」「威力補正」を同じ表で管理する。
// ノーマルスキンだけは全タイプを対象にするため、fromTypeをnullにする。
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

// へんげんじざい系は技自体ではなく、攻撃側の現在タイプを変化させる。
const MOVE_TYPE_CHANGING_ABILITIES = new Set(["protean", "libero"]);

export function hasAbilityMoveConversion(abilityId: string | null | undefined) {
  return Boolean(abilityId && ABILITY_MOVE_CONVERSIONS[abilityId]);
}

export function resolveAbilityMoveConversion(
  abilityId: string | null | undefined,
  moveType: TypeName,
) {
  // 未対応特性は変換なしとして扱い、呼び出し側の分岐を増やさない。
  const conversion = abilityId
    ? ABILITY_MOVE_CONVERSIONS[abilityId]
    : undefined;
  const applies = Boolean(
    conversion &&
      (conversion.fromType === null || conversion.fromType === moveType),
  );
  // 相性計算とタイプ一致判定は、ここで確定した実効タイプを共通利用する。
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
  // 条件OFF時は元配列を複製し、呼び出し側からの意図しない変更を防ぐ。
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
  // 元からタイプ一致する技は通常の一致計算に任せ、ここでは重複加算しない。
  if (
    !conditionEnabled ||
    !abilityId ||
    !MOVE_TYPE_CHANGING_ABILITIES.has(abilityId) ||
    originalTypes.includes(moveType)
  ) {
    return 1;
  }

  // 変化後の攻撃側タイプと技タイプが一致するため、通常のSTABを明示的に補う。
  return 1.5;
}

export function hasMoveTypeChangingAbility(
  abilityId: string | null | undefined,
) {
  return Boolean(abilityId && MOVE_TYPE_CHANGING_ABILITIES.has(abilityId));
}

/**
 * ちからずくによる技威力補正を返す。
 *
 * PokeAPIのeffect_chanceは、ひるみ・状態異常・相手の能力低下など、
 * ちからずくが取り除く追加効果を持つ攻撃技で正の値になる。
 */
export function resolveSheerForcePowerMultiplier(
  abilityId: string | null | undefined,
  effectChance: number | null | undefined,
) {
  return abilityId === "sheer-force" && (effectChance ?? 0) > 0 ? 1.3 : 1;
}
