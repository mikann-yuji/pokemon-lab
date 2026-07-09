import type { TypeName } from "@/domain/type-matchup";

export type BattlePlayerId = "player1" | "player2";

export type BattleMoveSlot = {
  id: string;
  name: string;
  typeName: TypeName;
  damageClass: "physical" | "special";
  power: number;
  accuracy: number | null;
};

export type BattleCommand =
  | {
      type: "move";
      moveId: string;
    }
  | {
      type: "switch";
      targetIndex: number;
    };

export type BattlePokemon = {
  buildId: number;
  buildName: string;
  pokemonId: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  types: TypeName[];
  stats: Record<string, number>;
  currentHp: number;
  maxHp: number;
  itemId: string;
  itemName: string;
  abilityId: string;
  abilityName: string;
  moves: BattleMoveSlot[];
  status: "healthy" | "fainted";
};

export type BattlePlayerState = {
  id: BattlePlayerId;
  label: string;
  teamId: number;
  teamName: string;
  activeIndex: number;
  team: BattlePokemon[];
};

export type BattleLogEntry = {
  id: string;
  turn: number;
  message: string;
};

export type BattleState = {
  id: string;
  phase: "team-preview" | "command" | "finished";
  turn: number;
  players: Record<BattlePlayerId, BattlePlayerState>;
  field: {
    weatherId: string;
    terrainId: string;
  };
  pendingCommands: Record<BattlePlayerId, BattleCommand | null>;
  log: BattleLogEntry[];
};
