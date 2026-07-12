"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  getNatures,
  type Nature,
} from "@/features/training/infrastructure/training-catalog-repository";
import {
  getChampionsDamageCalculatorHeldItems,
  getChampionsDamageCalculatorPokemon,
} from "@/features/damage-calculator/infrastructure/damage-calculator-catalog-repository";
import { championsDamageCalculator } from "@/features/damage-calculator/config/champions-damage-ruleset";
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "@/features/damage-calculator/domain/damage-calculator-types";
import type {
  BattleCommand,
  BattlePlayerId,
  BattlePokemon,
  BattleState,
} from "../domain/battle-simulator-types";
import styles from "../styles/battle-simulator.module.css";

const STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;

const PLAYER_LABELS: Record<BattlePlayerId, string> = {
  player1: "Player 1",
  player2: "Player 2",
};

type SelectedTeamIds = Record<BattlePlayerId, number | "">;

function createBattleHref(teamIds: SelectedTeamIds) {
  return `/battle-simulator/battle?player1=${teamIds.player1}&player2=${teamIds.player2}`;
}

function opponentOf(playerId: BattlePlayerId): BattlePlayerId {
  return playerId === "player1" ? "player2" : "player1";
}

function createLogEntry(turn: number, message: string) {
  return {
    id: `${turn}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    turn,
    message,
  };
}

function calculateActualStat(
  pokemon: DamageCalculatorPokemon,
  statId: (typeof STAT_IDS)[number],
  point: number,
  natureModifier: number,
) {
  const baseStat = pokemon.stats[statId] ?? 1;
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * natureModifier);
}

function createActualStats(
  pokemon: DamageCalculatorPokemon,
  build: TrainingBuild,
  natures: Nature[],
) {
  const nature = natures.find((item) => item.id === build.nature) ?? null;
  const hasNatureModifier =
    Boolean(nature) && nature?.increasedStatId !== nature?.decreasedStatId;

  return Object.fromEntries(
    STAT_IDS.map((statId) => {
      const modifier =
        hasNatureModifier && nature?.increasedStatId === statId
          ? 1.1
          : hasNatureModifier && nature?.decreasedStatId === statId
            ? 0.9
            : 1;
      return [
        statId,
        calculateActualStat(
          pokemon,
          statId,
          build.abilityPoints[statId] ?? 0,
          modifier,
        ),
      ];
    }),
  );
}

function toBattlePokemon(
  build: TrainingBuild,
  pokemon: DamageCalculatorPokemon,
  heldItems: DamageCalculatorHeldItem[],
  natures: Nature[],
): BattlePokemon {
  const stats = createActualStats(pokemon, build, natures);
  const maxHp = stats.hp ?? 1;
  const learnedMoveIds = new Set(build.moveIds.filter(Boolean));
  const moves = pokemon.moves
    .filter((move) => learnedMoveIds.has(move.id))
    .map((move) => ({
      id: move.id,
      name: move.name,
      typeName: move.typeName,
      damageClass: move.damageClass,
      power: move.power,
      accuracy: move.accuracy,
    }));
  const item = heldItems.find((heldItem) => heldItem.id === build.itemId);
  const ability = pokemon.abilities.find(
    (pokemonAbility) => pokemonAbility.id === build.abilityId,
  );

  return {
    buildId: build.id ?? 0,
    buildName: build.name || pokemon.nameJa,
    pokemonId: pokemon.id,
    name: pokemon.name,
    nameJa: pokemon.nameJa,
    imageUrl: pokemon.imageUrl,
    types: pokemon.types,
    stats,
    currentHp: maxHp,
    maxHp,
    itemId: build.itemId,
    itemName: item?.name ?? "持ち物なし",
    abilityId: build.abilityId,
    abilityName: ability?.name ?? "特性なし",
    moves,
    status: "healthy",
  };
}

function toDamagePokemon(
  pokemon: BattlePokemon,
  heldItems: DamageCalculatorHeldItem[],
  sourcePokemon: DamageCalculatorPokemon | undefined,
): DamageCalculatorPokemon {
  const heldItem = heldItems.find((item) => item.id === pokemon.itemId) ?? null;
  const selectedAbility =
    sourcePokemon?.abilities.find((ability) => ability.id === pokemon.abilityId) ??
    null;

  return {
    id: pokemon.pokemonId,
    name: pokemon.name,
    nameJa: pokemon.nameJa,
    imageUrl: pokemon.imageUrl,
    fallbackImageUrl: sourcePokemon?.fallbackImageUrl ?? null,
    weightKg: sourcePokemon?.weightKg ?? 1,
    types: pokemon.types,
    stats: pokemon.stats,
    actualStats: pokemon.stats,
    boosts: {},
    heldItem,
    selectedAbility: selectedAbility as DamageCalculatorAbility | null,
    moves: sourcePokemon?.moves ?? [],
    abilities: sourcePokemon?.abilities ?? [],
  };
}

function toDamageMove(move: BattlePokemon["moves"][number]): DamageCalculatorMove {
  return {
    id: move.id,
    name: move.name,
    typeName: move.typeName,
    description: null,
    damageClass: move.damageClass,
    power: move.power,
    accuracy: move.accuracy,
    usageRate: null,
  };
}

function firstHealthyIndex(team: BattlePokemon[], excludedIndex = -1) {
  return team.findIndex(
    (pokemon, index) => index !== excludedIndex && pokemon.status === "healthy",
  );
}

function createBattleState({
  player1Team,
  player2Team,
  buildsById,
  pokemonById,
  heldItems,
  natures,
}: {
  player1Team: BattleTeam;
  player2Team: BattleTeam;
  buildsById: Map<number, TrainingBuild>;
  pokemonById: Map<number, DamageCalculatorPokemon>;
  heldItems: DamageCalculatorHeldItem[];
  natures: Nature[];
}): BattleState {
  const toTeam = (team: BattleTeam) =>
    team.buildIds.flatMap((buildId) => {
      const build = buildsById.get(buildId);
      if (!build) return [];
      const pokemon = pokemonById.get(build.pokemonId);
      if (!pokemon || build.id === undefined) return [];
      return [toBattlePokemon(build, pokemon, heldItems, natures)];
    });

  return {
    id: `battle-${Date.now()}`,
    phase: "team-preview",
    turn: 0,
    players: {
      player1: {
        id: "player1",
        label: PLAYER_LABELS.player1,
        teamId: player1Team.id ?? 0,
        teamName: player1Team.name,
        activeIndex: 0,
        team: toTeam(player1Team),
      },
      player2: {
        id: "player2",
        label: PLAYER_LABELS.player2,
        teamId: player2Team.id ?? 0,
        teamName: player2Team.name,
        activeIndex: 0,
        team: toTeam(player2Team),
      },
    },
    field: { weatherId: "", terrainId: "" },
    pendingCommands: { player1: null, player2: null },
    log: [
      createLogEntry(
        0,
        `${player1Team.name} と ${player2Team.name} の対戦準備ができました。`,
      ),
    ],
  };
}

function setPendingCommand(
  state: BattleState,
  playerId: BattlePlayerId,
  command: BattleCommand,
): BattleState {
  return {
    ...state,
    pendingCommands: {
      ...state.pendingCommands,
      [playerId]: command,
    },
  };
}

function startBattle(state: BattleState): BattleState {
  return {
    ...state,
    phase: "command",
    turn: 1,
    log: [
      createLogEntry(1, "対戦開始。Player 1とPlayer 2の行動を選んでください。"),
      ...state.log,
    ],
  };
}

function applySwitchCommand(
  state: BattleState,
  playerId: BattlePlayerId,
  targetIndex: number,
  log: BattleState["log"],
): BattleState {
  const player = state.players[playerId];
  const target = player.team[targetIndex];
  if (!target || target.status !== "healthy" || targetIndex === player.activeIndex) {
    return state;
  }

  log.unshift(
    createLogEntry(
      state.turn,
      `${player.label} は ${target.buildName} に交代しました。`,
    ),
  );

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, activeIndex: targetIndex },
    },
  };
}

function applyMoveCommand({
  state,
  playerId,
  moveId,
  heldItems,
  pokemonById,
  log,
}: {
  state: BattleState;
  playerId: BattlePlayerId;
  moveId: string;
  heldItems: DamageCalculatorHeldItem[];
  pokemonById: Map<number, DamageCalculatorPokemon>;
  log: BattleState["log"];
}): BattleState {
  const attackerPlayer = state.players[playerId];
  const defenderPlayer = state.players[opponentOf(playerId)];
  const attacker = attackerPlayer.team[attackerPlayer.activeIndex];
  const defender = defenderPlayer.team[defenderPlayer.activeIndex];
  if (!attacker || !defender) return state;
  if (attacker.status === "fainted") {
    log.unshift(
      createLogEntry(state.turn, `${attacker.buildName} はひんしで動けません。`),
    );
    return state;
  }
  if (defender.status === "fainted") return state;

  const move = attacker.moves.find((item) => item.id === moveId);
  if (!move) {
    log.unshift(
      createLogEntry(state.turn, `${attacker.buildName} は技を選べませんでした。`),
    );
    return state;
  }

  const calculation = championsDamageCalculator.calculate({
    attacker: toDamagePokemon(
      attacker,
      heldItems,
      pokemonById.get(attacker.pokemonId),
    ),
    defender: toDamagePokemon(
      defender,
      heldItems,
      pokemonById.get(defender.pokemonId),
    ),
    move: toDamageMove(move),
  });
  const damage = Math.max(
    1,
    Math.floor((calculation.minimum + calculation.maximum) / 2),
  );
  const nextHp = Math.max(0, defender.currentHp - damage);
  const fainted = nextHp === 0;
  const nextDefenderTeam = defenderPlayer.team.map((pokemon, index) =>
    index === defenderPlayer.activeIndex
      ? {
          ...pokemon,
          currentHp: nextHp,
          status: fainted ? ("fainted" as const) : pokemon.status,
        }
      : pokemon,
  );
  const nextActiveIndex = fainted
    ? firstHealthyIndex(nextDefenderTeam, defenderPlayer.activeIndex)
    : defenderPlayer.activeIndex;
  const hasWinner = fainted && nextActiveIndex === -1;

  log.unshift(
    createLogEntry(
      state.turn,
      `${attacker.buildName} の ${move.name}。${defender.buildName} に ${damage} ダメージ。`,
    ),
  );
  if (fainted) {
    log.unshift(
      createLogEntry(state.turn, `${defender.buildName} はひんしになりました。`),
    );
    if (nextActiveIndex >= 0) {
      log.unshift(
        createLogEntry(
          state.turn,
          `${defenderPlayer.label} は ${nextDefenderTeam[nextActiveIndex].buildName} を出しました。`,
        ),
      );
    } else {
      log.unshift(
        createLogEntry(state.turn, `${attackerPlayer.label} の勝ちです。`),
      );
    }
  }

  return {
    ...state,
    phase: hasWinner ? "finished" : state.phase,
    players: {
      ...state.players,
      [defenderPlayer.id]: {
        ...defenderPlayer,
        activeIndex:
          nextActiveIndex >= 0 ? nextActiveIndex : defenderPlayer.activeIndex,
        team: nextDefenderTeam,
      },
    },
  };
}

function executeTurn({
  state,
  heldItems,
  pokemonById,
}: {
  state: BattleState;
  heldItems: DamageCalculatorHeldItem[];
  pokemonById: Map<number, DamageCalculatorPokemon>;
}): BattleState {
  if (state.phase !== "command") return state;
  if (!state.pendingCommands.player1 || !state.pendingCommands.player2) {
    return state;
  }

  let nextState = state;
  const log: BattleState["log"] = [];
  const commands = state.pendingCommands;

  (["player1", "player2"] as const).forEach((playerId) => {
    const command = commands[playerId];
    if (command?.type === "switch") {
      nextState = applySwitchCommand(nextState, playerId, command.targetIndex, log);
    }
  });

  const movePlayers = (["player1", "player2"] as const)
    .filter((playerId) => commands[playerId]?.type === "move")
    .sort((left, right) => {
      const leftPlayer = nextState.players[left];
      const rightPlayer = nextState.players[right];
      const leftSpeed = leftPlayer.team[leftPlayer.activeIndex]?.stats.speed ?? 0;
      const rightSpeed =
        rightPlayer.team[rightPlayer.activeIndex]?.stats.speed ?? 0;
      return rightSpeed - leftSpeed;
    });

  for (const playerId of movePlayers) {
    if (nextState.phase === "finished") break;
    const command = commands[playerId];
    if (command?.type !== "move") continue;
    nextState = applyMoveCommand({
      state: nextState,
      playerId,
      moveId: command.moveId,
      heldItems,
      pokemonById,
      log,
    });
  }

  return {
    ...nextState,
    turn: nextState.phase === "finished" ? nextState.turn : nextState.turn + 1,
    pendingCommands: { player1: null, player2: null },
    log: [...log, ...nextState.log],
  };
}

function TeamSelect({
  id,
  label,
  value,
  teams,
  onChange,
}: {
  id: BattlePlayerId;
  label: string;
  value: number | "";
  teams: BattleTeam[];
  onChange: (teamId: number | "") => void;
}) {
  return (
    <label className={styles.teamSelect}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : "")
        }
      >
        <option value="">バトルチームを選択</option>
        {teams.map((team) => (
          <option value={team.id} key={`${id}-${team.id}`}>
            {team.name} / {team.buildIds.length}体
          </option>
        ))}
      </select>
    </label>
  );
}

export function BattleSimulatorTeamSelect() {
  const router = useRouter();
  const [teams, setTeams] = useState<BattleTeam[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<SelectedTeamIds>({
    player1: "",
    player2: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const canStart = Boolean(selectedTeamIds.player1 && selectedTeamIds.player2);
  const loadTeams = useCallback(async (active = true) => {
    const loadedTeams = await getAllBattleTeams();
    if (!active) return;
    setTeams(loadedTeams);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadTeams(active).catch((error: unknown) => {
        console.error("バトルチームを読み込めませんでした。", error);
        if (!active) return;
        setLoadError("バトルチームを読み込めませんでした。");
        setLoaded(true);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadTeams]);

  useEffect(() => {
    let active = true;
    const handleSynced = () => {
      void loadTeams(active).catch((error: unknown) => {
        console.error("同期後のバトルチームを読み込めませんでした。", error);
        if (active) setLoadError("同期後のバトルチームを読み込めませんでした。");
      });
    };
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    return () => {
      active = false;
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    };
  }, [loadTeams]);

  function updateSelectedTeam(playerId: BattlePlayerId, teamId: number | "") {
    setSelectedTeamIds((current) => ({ ...current, [playerId]: teamId }));
  }

  function openBattle() {
    if (!canStart) return;
    router.push(createBattleHref(selectedTeamIds));
  }

  if (!loaded) {
    return <p className={styles.statusMessage}>データを読み込んでいます...</p>;
  }

  if (loadError) {
    return (
      <p className={styles.statusMessage} role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <div className={styles.simulator}>
      <section className={styles.setupPanel} aria-labelledby="setup-title">
        <div className={styles.sectionHeading}>
          <p>Team Select</p>
          <h2 id="setup-title">バトルチームを2つ選択</h2>
        </div>
        {teams.length === 0 ? (
          <p className={styles.emptyState}>
            保存済みのバトルチームがありません。先にバトルチームを作成してください。
          </p>
        ) : (
          <>
            <div className={styles.teamSelectGrid}>
              <TeamSelect
                id="player1"
                label="Player 1"
                value={selectedTeamIds.player1}
                teams={teams}
                onChange={(teamId) => updateSelectedTeam("player1", teamId)}
              />
              <TeamSelect
                id="player2"
                label="Player 2"
                value={selectedTeamIds.player2}
                teams={teams}
                onChange={(teamId) => updateSelectedTeam("player2", teamId)}
              />
            </div>
            <button
              className={styles.prepareButton}
              type="button"
              disabled={!canStart}
              onClick={openBattle}
            >
              対戦画面へ進む
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function HpPanel({
  playerId,
  state,
}: {
  playerId: BattlePlayerId;
  state: BattleState;
}) {
  const player = state.players[playerId];
  const active = player.team[player.activeIndex] ?? null;
  const hpPercent = active
    ? Math.max(0, (active.currentHp / active.maxHp) * 100)
    : 0;

  return (
    <div
      className={`${styles.hpPanel} ${
        playerId === "player1" ? styles.playerOneHp : styles.playerTwoHp
      }`}
    >
      <div className={styles.hpHeader}>
        <span>{player.label}</span>
        <strong>{active?.buildName ?? "未選出"}</strong>
      </div>
      <div className={styles.hpTrack} aria-label={`${player.label} HP`}>
        <span style={{ width: `${hpPercent}%` }} />
      </div>
      <small>
        HP {active?.currentHp ?? 0} / {active?.maxHp ?? 0}
      </small>
    </div>
  );
}

function BattleField({ state }: { state: BattleState }) {
  const player1 = state.players.player1;
  const player2 = state.players.player2;
  const player1Active = player1.team[player1.activeIndex] ?? null;
  const player2Active = player2.team[player2.activeIndex] ?? null;

  return (
    <section className={styles.battleField} aria-label="対戦中のポケモン">
      <HpPanel playerId="player1" state={state} />
      <HpPanel playerId="player2" state={state} />
      <div className={styles.pokemonStage}>
        <div className={styles.playerOnePokemon}>
          {player1Active?.imageUrl ? (
            <Image
              src={player1Active.imageUrl}
              alt={player1Active.nameJa}
              width={132}
              height={132}
              priority
            />
          ) : null}
        </div>
        <div className={styles.playerTwoPokemon}>
          {player2Active?.imageUrl ? (
            <Image
              src={player2Active.imageUrl}
              alt={player2Active.nameJa}
              width={132}
              height={132}
              priority
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function BattleLog({
  entries,
  logRef,
}: {
  entries: BattleState["log"];
  logRef: RefObject<HTMLDivElement | null>;
}) {
  const displayedEntries = [...entries].reverse();

  return (
    <section className={styles.battleLog} aria-label="対戦ログ">
      <div className={styles.battleLogBody} ref={logRef}>
        {displayedEntries.map((entry) => (
          <p key={entry.id}>{entry.message}</p>
        ))}
      </div>
    </section>
  );
}

function ActionTabs({
  state,
  activePlayerId,
  onTabChange,
  onMove,
  onOpenSwitch,
}: {
  state: BattleState;
  activePlayerId: BattlePlayerId;
  onTabChange: (playerId: BattlePlayerId) => void;
  onMove: (playerId: BattlePlayerId, moveId: string) => void;
  onOpenSwitch: (playerId: BattlePlayerId) => void;
}) {
  const player = state.players[activePlayerId];
  const active = player.team[player.activeIndex] ?? null;
  const command = state.pendingCommands[activePlayerId];
  const [moveSelectPlayer, setMoveSelectPlayer] =
    useState<BattlePlayerId | null>(null);
  const isMoveSelectOpen = moveSelectPlayer === activePlayerId;

  return (
    <section className={styles.actionPanel} aria-label="行動選択">
      <div className={styles.playerTabs} role="tablist" aria-label="操作するプレイヤー">
        {(["player1", "player2"] as const).map((playerId) => (
          <button
            className={activePlayerId === playerId ? styles.activeTab : ""}
            type="button"
            role="tab"
            aria-selected={activePlayerId === playerId}
            onClick={() => onTabChange(playerId)}
            key={playerId}
          >
            {state.players[playerId].label}
            {state.pendingCommands[playerId] ? <span>選択済み</span> : null}
          </button>
        ))}
      </div>
      <div className={styles.actionBody}>
        <div className={styles.actionHeader}>
          <div>
            <span>{player.label}</span>
            <strong>{active?.buildName ?? "行動できるポケモンなし"}</strong>
          </div>
          <div className={styles.actionButtons}>
            <button
              type="button"
              disabled={
                !active || active.status === "fainted" || active.moves.length === 0
              }
              onClick={() => setMoveSelectPlayer(activePlayerId)}
            >
              技選択
            </button>
            <button type="button" onClick={() => onOpenSwitch(activePlayerId)}>
              交代
            </button>
          </div>
        </div>
        {!active || active.status === "fainted" ? (
          <p className={styles.emptyState}>行動できるポケモンがいません。</p>
        ) : isMoveSelectOpen ? (
          <label className={styles.moveSelect}>
            <span>使用する技</span>
            <select
              value={command?.type === "move" ? command.moveId : ""}
              onChange={(event) => {
                if (event.target.value) {
                  onMove(activePlayerId, event.target.value);
                }
              }}
            >
              <option value="">技を選択</option>
              {active.moves.map((move) => (
                <option value={move.id} key={move.id}>
                  {move.name} / {move.typeName} / {move.power}
                </option>
              ))}
            </select>
          </label>
        ) : active.moves.length === 0 ? (
          <p className={styles.emptyState}>選択できる技がありません。</p>
        ) : (
          <p className={styles.commandStatus}>
            技を選ぶ場合は「技選択」を押してください。
          </p>
        )}
        <p className={styles.commandStatus}>
          {command
            ? command.type === "move"
              ? `選択中: ${
                  active?.moves.find((move) => move.id === command.moveId)?.name ?? "技"
                }`
              : `選択中: ${
                  player.team[command.targetIndex]?.buildName ?? "交代先"
                } に交代`
            : "未選択"}
        </p>
      </div>
    </section>
  );
}

function SwitchModal({
  playerId,
  state,
  onSelect,
  onClose,
}: {
  playerId: BattlePlayerId;
  state: BattleState;
  onSelect: (targetIndex: number) => void;
  onClose: () => void;
}) {
  const player = state.players[playerId];
  const switchTargets = player.team
    .map((pokemon, index) => ({ pokemon, index }))
    .filter(
      ({ pokemon, index }) =>
        index !== player.activeIndex && pokemon.status === "healthy",
    );

  return (
    <div className={styles.switchModalOverlay} role="dialog" aria-modal="true">
      <button
        className={styles.switchModalBackdrop}
        type="button"
        aria-label="交代先選択を閉じる"
        onClick={onClose}
      />
      <section className={styles.switchModalPanel}>
        <div className={styles.switchModalHeader}>
          <div>
            <span>{player.label}</span>
            <h2>交代先を選択</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className={styles.switchRoster}>
          {switchTargets.length === 0 ? (
            <p className={styles.emptyState}>交代できるポケモンがいません。</p>
          ) : (
            switchTargets.map(({ pokemon, index }) => (
              <button
                type="button"
                onClick={() => onSelect(index)}
                key={pokemon.buildId}
              >
                {pokemon.imageUrl ? (
                  <Image src={pokemon.imageUrl} alt="" width={48} height={48} />
                ) : null}
                <div>
                  <strong>{pokemon.buildName}</strong>
                  <span>
                    HP {pokemon.currentHp} / {pokemon.maxHp}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export function BattleSimulator({
  player1TeamId,
  player2TeamId,
}: {
  player1TeamId: number | null;
  player2TeamId: number | null;
}) {
  const [pokemonCatalog, setPokemonCatalog] = useState<
    DamageCalculatorPokemon[]
  >([]);
  const [heldItems, setHeldItems] = useState<DamageCalculatorHeldItem[]>([]);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [activeCommandPlayer, setActiveCommandPlayer] =
    useState<BattlePlayerId>("player1");
  const [switchModalPlayer, setSwitchModalPlayer] =
    useState<BattlePlayerId | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getAllBattleTeams(),
      getAllTrainingBuilds(),
      getChampionsDamageCalculatorPokemon(),
      getChampionsDamageCalculatorHeldItems(),
      getNatures(),
    ])
      .then(
        ([
          loadedTeams,
          loadedBuilds,
          loadedPokemon,
          loadedItems,
          loadedNatures,
        ]) => {
          if (!active) return;
          const nextBuildsById = new Map(
            loadedBuilds.flatMap((build) =>
              build.id === undefined ? [] : [[build.id, build] as const],
            ),
          );
          const nextPokemonById = new Map(
            loadedPokemon.map((pokemon) => [pokemon.id, pokemon]),
          );
          const player1Team =
            loadedTeams.find((team) => team.id === player1TeamId) ?? null;
          const player2Team =
            loadedTeams.find((team) => team.id === player2TeamId) ?? null;

          setPokemonCatalog(loadedPokemon);
          setHeldItems(loadedItems);
          if (player1Team && player2Team) {
            setBattleState(
              createBattleState({
                player1Team,
                player2Team,
                buildsById: nextBuildsById,
                pokemonById: nextPokemonById,
                heldItems: loadedItems,
                natures: loadedNatures,
              }),
            );
          } else {
            setBattleState(null);
          }
          setLoaded(true);
        },
      )
      .catch((error: unknown) => {
        console.error("対戦シミュレータ用データを読み込めませんでした。", error);
        if (!active) return;
        setLoadError("対戦シミュレータ用データを読み込めませんでした。");
        setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [player1TeamId, player2TeamId]);

  useEffect(() => {
    if (!logRef.current || !battleState) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battleState?.log.length, battleState]);

  const pokemonById = useMemo(
    () => new Map(pokemonCatalog.map((pokemon) => [pokemon.id, pokemon])),
    [pokemonCatalog],
  );
  const canRunTurn = Boolean(
    battleState?.phase === "command" &&
      battleState.pendingCommands.player1 &&
      battleState.pendingCommands.player2,
  );

  function chooseCommand(playerId: BattlePlayerId, command: BattleCommand) {
    setBattleState((current) =>
      current ? setPendingCommand(current, playerId, command) : current,
    );
  }

  function beginBattle() {
    setBattleState((current) => (current ? startBattle(current) : current));
  }

  function runTurn() {
    setBattleState((current) =>
      current
        ? executeTurn({ state: current, heldItems, pokemonById })
        : current,
    );
  }

  function selectSwitchTarget(targetIndex: number) {
    if (!switchModalPlayer) return;
    chooseCommand(switchModalPlayer, { type: "switch", targetIndex });
    setActiveCommandPlayer(switchModalPlayer);
    setSwitchModalPlayer(null);
  }

  if (!loaded) {
    return <p className={styles.statusMessage}>データを読み込んでいます...</p>;
  }

  if (loadError) {
    return (
      <p className={styles.statusMessage} role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <div className={styles.simulator}>
      {battleState ? (
        <div className={styles.battleLayout}>
          <BattleField state={battleState} />
          <BattleLog entries={battleState.log} logRef={logRef} />
          {battleState.phase === "team-preview" ? (
            <section className={styles.startPanel}>
              <button type="button" onClick={beginBattle}>
                対戦開始
              </button>
            </section>
          ) : null}
          {battleState.phase === "command" ? (
            <>
              <ActionTabs
                state={battleState}
                activePlayerId={activeCommandPlayer}
                onTabChange={setActiveCommandPlayer}
                onMove={(playerId, moveId) =>
                  chooseCommand(playerId, { type: "move", moveId })
                }
                onOpenSwitch={setSwitchModalPlayer}
              />
              <section className={styles.turnPanel}>
                <button type="button" disabled={!canRunTurn} onClick={runTurn}>
                  ターン実行
                </button>
              </section>
            </>
          ) : null}
          {battleState.phase === "finished" ? (
            <section className={styles.turnPanel}>
              <strong>対戦終了</strong>
            </section>
          ) : null}
          {switchModalPlayer ? (
            <SwitchModal
              playerId={switchModalPlayer}
              state={battleState}
              onSelect={selectSwitchTarget}
              onClose={() => setSwitchModalPlayer(null)}
            />
          ) : null}
        </div>
      ) : (
        <section className={styles.placeholderPanel}>
          <div className={styles.sectionHeading}>
            <p>Battle Board</p>
            <h2>対戦準備を作成できませんでした</h2>
          </div>
          <p>
            チーム選択画面に戻り、Player 1とPlayer 2のバトルチームを選び直してください。
          </p>
          <Link className={styles.backLink} href="/battle-simulator">
            チーム選択へ戻る
          </Link>
        </section>
      )}
    </div>
  );
}
