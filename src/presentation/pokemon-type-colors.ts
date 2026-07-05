import type { CSSProperties } from "react";
import type { TypeName } from "@/domain/type-matchup";

const TYPE_COLORS: Record<
  TypeName,
  { background: string; foreground: string }
> = {
  Normal: { background: "#9299a1", foreground: "#ffffff" },
  Fire: { background: "#ff9d55", foreground: "#ffffff" },
  Water: { background: "#5090d6", foreground: "#ffffff" },
  Electric: { background: "#f4d23c", foreground: "#ffffff" },
  Grass: { background: "#63bc5a", foreground: "#ffffff" },
  Ice: { background: "#73cec0", foreground: "#ffffff" },
  Fighting: { background: "#ce416b", foreground: "#ffffff" },
  Poison: { background: "#aa6bc8", foreground: "#ffffff" },
  Ground: { background: "#d97845", foreground: "#ffffff" },
  Flying: { background: "#89aae3", foreground: "#ffffff" },
  Psychic: { background: "#fa7179", foreground: "#ffffff" },
  Bug: { background: "#91c12f", foreground: "#ffffff" },
  Rock: { background: "#c5b78c", foreground: "#ffffff" },
  Ghost: { background: "#5269ad", foreground: "#ffffff" },
  Dragon: { background: "#0b6dc3", foreground: "#ffffff" },
  Dark: { background: "#5a5465", foreground: "#ffffff" },
  Steel: { background: "#5a8ea2", foreground: "#ffffff" },
  Fairy: { background: "#ec8fe6", foreground: "#ffffff" },
};

type TypeBadgeStyle = CSSProperties & {
  "--type-color": string;
  "--type-foreground": string;
};

type PokemonCardStyle = CSSProperties & {
  "--primary-type-color": string;
  "--secondary-type-color": string;
};

export function getTypeBadgeStyle(type: TypeName): TypeBadgeStyle {
  const colors = TYPE_COLORS[type];

  return {
    "--type-color": colors.background,
    "--type-foreground": colors.foreground,
  };
}

export function getPokemonCardStyle(types: TypeName[]): PokemonCardStyle {
  const primaryColor = TYPE_COLORS[types[0]]?.background ?? "#9299a1";
  const secondaryColor = TYPE_COLORS[types[1]]?.background ?? primaryColor;

  return {
    "--primary-type-color": primaryColor,
    "--secondary-type-color": secondaryColor,
  };
}
