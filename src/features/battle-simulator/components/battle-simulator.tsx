"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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
import type {
  DamageCalculatorAbility,
  DamageCalculatorHeldItem,
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "@/features/damage-calculator/domain/damage-calculator-types";
import { championsDamageCalculator } from "@/features/damage-calculator/config/champions-damage-ruleset";
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
    damageClass: move.damageClass,
    power: move.power,
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

  const player1Pokemon = toTeam(player1Team);
  const player2Pokemon = toTeam(player2Team);

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
        team: player1Pokemon,
      },
      player2: {
        id: "player2",
        label: PLAYER_LABELS.player2,
        teamId: player2Team.id ?? 0,
        teamName: player2Team.name,
        activeIndex: 0,
        team: player2Pokemon,
      },
    },
    field: {
      weatherId: "",
      terrainId: "",
    },
    pendingCommands: {
      player1: null,
      player2: null,
    },
    log: [
      {
        id: "setup",
        turn: 0,
        message: `${player1Team.name} と ${player2Team.name} の対戦準備ができました。`,
      },
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
      [playerId]: {
        ...player,
        activeIndex: targetIndex,
      },
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
    log.unshift(createLogEntry(state.turn, `${defender.buildName} はひんしになりました。`));
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
        activeIndex: nextActiveIndex >= 0 ? nextActiveIndex : defenderPlayer.activeIndex,
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
  if (!state.pendingCommands.player1 || !state.pendingCommands.player2) return state;

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
      const leftSpeed =
        leftPlayer.team[leftPlayer.activeIndex]?.stats.speed ?? 0;
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
    pendingCommands: {
      player1: null,
      player2: null,
    },
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

function TeamPreview({
  playerId,
  state,
}: {
  playerId: BattlePlayerId;
  state: BattleState;
}) {
  const player = state.players[playerId];
  const active = player.team[player.activeIndex] ?? null;

  return (
    <section className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <span>{player.label}</span>
        <h2>{player.teamName}</h2>
      </div>
      {active ? (
        <div className={styles.activePokemon}>
          {active.imageUrl ? (
            <Image
              src={active.imageUrl}
              alt={active.nameJa}
              width={120}
              height={120}
            />
          ) : null}
          <div>
            <strong>{active.buildName}</strong>
            <small>{active.nameJa}</small>
            <meter min="0" max={active.maxHp} value={active.currentHp} />
            <span>
              HP {active.currentHp} / {active.maxHp}
            </span>
          </div>
        </div>
      ) : (
        <p className={styles.emptyState}>先頭に出せるポケモンがいません。</p>
      )}
      <div className={styles.roster}>
        {player.team.map((pokemon, index) => (
          <article
            className={index === player.activeIndex ? styles.activeSlot : ""}
            key={pokemon.buildId}
          >
            {pokemon.imageUrl ? (
              <Image
                src={pokemon.imageUrl}
                alt=""
                width={52}
                height={52}
              />
            ) : null}
            <div>
              <strong>{pokemon.buildName}</strong>
              <span>{pokemon.moves.length}技 / {pokemon.itemName}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommandPanel({
  playerId,
  state,
  onCommand,
}: {
  playerId: BattlePlayerId;
  state: BattleState;
  onCommand: (playerId: BattlePlayerId, command: BattleCommand) => void;
}) {
  const player = state.players[playerId];
  const active = player.team[player.activeIndex] ?? null;
  const command = state.pendingCommands[playerId];
  const switchTargets = player.team
    .map((pokemon, index) => ({ pokemon, index }))
    .filter(
      ({ pokemon, index }) =>
        index !== player.activeIndex && pokemon.status === "healthy",
    );

  return (
    <section className={styles.commandPanel}>
      <div className={styles.previewHeader}>
        <span>{player.label}</span>
        <h2>行動選択</h2>
      </div>
      {!active || active.status === "fainted" ? (
        <p className={styles.emptyState}>行動できるポケモンがいません。</p>
      ) : (
        <>
          <div className={styles.commandGroup}>
            <strong>技</strong>
            <div className={styles.moveButtons}>
              {active.moves.length === 0 ? (
                <p className={styles.emptyState}>選択できる技がありません。</p>
              ) : (
                active.moves.map((move) => (
                  <button
                    className={
                      command?.type === "move" && command.moveId === move.id
                        ? styles.selectedCommand
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      onCommand(playerId, { type: "move", moveId: move.id })
                    }
                    key={move.id}
                  >
                    <span>{move.name}</span>
                    <small>
                      {move.typeName} / {move.power}
                    </small>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className={styles.commandGroup}>
            <strong>交代</strong>
            <div className={styles.switchButtons}>
              {switchTargets.length === 0 ? (
                <p className={styles.emptyState}>交代先がいません。</p>
              ) : (
                switchTargets.map(({ pokemon, index }) => (
                  <button
                    className={
                      command?.type === "switch" &&
                      command.targetIndex === index
                        ? styles.selectedCommand
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      onCommand(playerId, { type: "switch", targetIndex: index })
                    }
                    key={pokemon.buildId}
                  >
                    {pokemon.imageUrl ? (
                      <Image
                        src={pokemon.imageUrl}
                        alt=""
                        width={36}
                        height={36}
                      />
                    ) : null}
                    <span>{pokemon.buildName}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <p className={styles.commandStatus}>
            {command
              ? command.type === "move"
                ? `選択中: ${active.moves.find((move) => move.id === command.moveId)?.name ?? "技"}`
                : `選択中: ${player.team[command.targetIndex]?.buildName ?? "交代"} に交代`
              : "未選択"}
          </p>
        </>
      )}
    </section>
  );
}

export function BattleSimulator() {
  const [teams, setTeams] = useState<BattleTeam[]>([]);
  const [builds, setBuilds] = useState<TrainingBuild[]>([]);
  const [pokemonCatalog, setPokemonCatalog] = useState<
    DamageCalculatorPokemon[]
  >([]);
  const [heldItems, setHeldItems] = useState<DamageCalculatorHeldItem[]>([]);
  const [natures, setNatures] = useState<Nature[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<
    Record<BattlePlayerId, number | "">
  >({
    player1: "",
    player2: "",
  });
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getAllBattleTeams(),
      getAllTrainingBuilds(),
      getChampionsDamageCalculatorPokemon(),
      getChampionsDamageCalculatorHeldItems(),
      getNatures(),
    ])
      .then(([loadedTeams, loadedBuilds, loadedPokemon, loadedItems, loadedNatures]) => {
        if (!active) return;
        setTeams(loadedTeams);
        setBuilds(loadedBuilds);
        setPokemonCatalog(loadedPokemon);
        setHeldItems(loadedItems);
        setNatures(loadedNatures);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("対戦シミュレータ用データを読み込めませんでした。", error);
        if (!active) return;
        setLoadError("対戦シミュレータ用データを読み込めませんでした。");
        setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const buildsById = useMemo(
    () =>
      new Map(
        builds.flatMap((build) =>
          build.id === undefined ? [] : [[build.id, build] as const],
        ),
      ),
    [builds],
  );
  const pokemonById = useMemo(
    () => new Map(pokemonCatalog.map((pokemon) => [pokemon.id, pokemon])),
    [pokemonCatalog],
  );
  const selectedTeams = useMemo(
    () => ({
      player1:
        teams.find((team) => team.id === selectedTeamIds.player1) ?? null,
      player2:
        teams.find((team) => team.id === selectedTeamIds.player2) ?? null,
    }),
    [selectedTeamIds, teams],
  );
  const canCreateBattle = Boolean(selectedTeams.player1 && selectedTeams.player2);

  function updateSelectedTeam(playerId: BattlePlayerId, teamId: number | "") {
    setSelectedTeamIds((current) => ({
      ...current,
      [playerId]: teamId,
    }));
    setBattleState(null);
  }

  function prepareBattle() {
    if (!selectedTeams.player1 || !selectedTeams.player2) return;
    setBattleState(
      createBattleState({
        player1Team: selectedTeams.player1,
        player2Team: selectedTeams.player2,
        buildsById,
        pokemonById,
        heldItems,
        natures,
      }),
    );
  }

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
        ? executeTurn({
            state: current,
            heldItems,
            pokemonById,
          })
        : current,
    );
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
          <p>Step 1</p>
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
              disabled={!canCreateBattle}
              onClick={prepareBattle}
            >
              対戦準備を作成
            </button>
          </>
        )}
      </section>

      {battleState ? (
        <>
          <section className={styles.stateSummary}>
            <div className={styles.sectionHeading}>
              <p>Step 2</p>
              <h2>対戦状態の土台</h2>
            </div>
            <dl>
              <div>
                <dt>フェーズ</dt>
                <dd>{battleState.phase}</dd>
              </div>
              <div>
                <dt>ターン</dt>
                <dd>{battleState.turn}</dd>
              </div>
              <div>
                <dt>天候</dt>
                <dd>未設定</dd>
              </div>
              <div>
                <dt>フィールド</dt>
                <dd>未設定</dd>
              </div>
            </dl>
            <div className={styles.turnActions}>
              {battleState.phase === "team-preview" ? (
                <button type="button" onClick={beginBattle}>
                  対戦開始
                </button>
              ) : null}
              {battleState.phase === "command" ? (
                <button
                  type="button"
                  disabled={
                    !battleState.pendingCommands.player1 ||
                    !battleState.pendingCommands.player2
                  }
                  onClick={runTurn}
                >
                  ターン実行
                </button>
              ) : null}
              {battleState.phase === "finished" ? <strong>対戦終了</strong> : null}
            </div>
          </section>
          <div className={styles.previewGrid}>
            <TeamPreview playerId="player1" state={battleState} />
            <TeamPreview playerId="player2" state={battleState} />
          </div>
          {battleState.phase === "command" ? (
            <div className={styles.commandGrid}>
              <CommandPanel
                playerId="player1"
                state={battleState}
                onCommand={chooseCommand}
              />
              <CommandPanel
                playerId="player2"
                state={battleState}
                onCommand={chooseCommand}
              />
            </div>
          ) : null}
          <section className={styles.logPanel}>
            <div className={styles.sectionHeading}>
              <p>Battle Log</p>
              <h2>ログ</h2>
            </div>
            {battleState.log.map((entry) => (
              <p key={entry.id}>{entry.message}</p>
            ))}
          </section>
        </>
      ) : (
        <section className={styles.placeholderPanel}>
          <div className={styles.sectionHeading}>
            <p>Next</p>
            <h2>ここに対戦画面のガワが表示されます</h2>
          </div>
          <p>
            今回はチーム選択と対戦状態モデルまでです。ターン処理、技選択、
            ダメージ処理、オフライン実行の細部は次の段階で追加します。
          </p>
        </section>
      )}
    </div>
  );
}
