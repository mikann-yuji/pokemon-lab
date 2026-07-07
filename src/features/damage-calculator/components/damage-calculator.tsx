"use client";

/**
 * このファイルの役割:
 * ダメージ計算ページの入力状態を管理し、検索欄・技選択・計算結果を組み立てる。
 *
 * 実際の計算式やDBアクセスはこのコンポーネントへ書かず、
 * application層の計算機と、Server Componentから渡されたカタログを利用する。
 */

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  CHAMPIONS_DAMAGE_RULESET,
  championsDamageCalculator,
} from "../config/champions-damage-ruleset";
import type { DamageCalculation } from "../application/smogon-damage-calculator";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import { PokemonCombobox } from "./pokemon-combobox";
import {
  getDamageHistory,
  saveDamageHistory,
  type DamageHistoryRecord,
  type DamageHistorySide,
} from "../infrastructure/damage-history-repository";
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
import styles from "../styles/damage-calculator.module.css";

type CalculationResult = {
  /** 通常ヒット時のダメージ範囲。 */
  normal: DamageCalculation;
  /** 急所ヒット時のダメージ範囲。通常結果と並べて比較表示する。 */
  critical: DamageCalculation;
  /** 計算後に選択を変えても結果見出しがぶれないよう、表示名をスナップショットする。 */
  attackerName: string;
  defenderName: string;
  moveName: string;
};

const STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;

type AdjustableStatId =
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense";
type DamageSide = "attacker" | "defender";
type StatAdjustment = {
  point: number;
  rank: number;
  nature: boolean;
};
type StatAdjustmentState = Record<
  DamageSide,
  Record<AdjustableStatId, StatAdjustment>
>;

const STAT_LABELS: Record<AdjustableStatId, string> = {
  attack: "こうげき",
  defense: "ぼうぎょ",
  "special-attack": "とくこう",
  "special-defense": "とくぼう",
};

const ADJUSTABLE_STAT_IDS = [
  "attack",
  "defense",
  "special-attack",
  "special-defense",
] as const satisfies readonly AdjustableStatId[];

function createDefaultAdjustment(): StatAdjustment {
  return { point: 0, rank: 0, nature: false };
}

function createDefaultAdjustmentState(): StatAdjustmentState {
  return {
    attacker: {
      attack: createDefaultAdjustment(),
      defense: createDefaultAdjustment(),
      "special-attack": createDefaultAdjustment(),
      "special-defense": createDefaultAdjustment(),
    },
    defender: {
      attack: createDefaultAdjustment(),
      defense: createDefaultAdjustment(),
      "special-attack": createDefaultAdjustment(),
      "special-defense": createDefaultAdjustment(),
    },
  };
}

function calculateActualStat(
  pokemon: DamageCalculatorPokemon,
  statId: (typeof STAT_IDS)[number],
  point = 0,
  nature = false,
) {
  const baseStat = pokemon.stats[statId] ?? 1;
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * (nature ? 1.1 : 1));
}

function createNeutralActualStats(pokemon: DamageCalculatorPokemon) {
  return Object.fromEntries(
    STAT_IDS.map((statId) => [statId, calculateActualStat(pokemon, statId)]),
  );
}

function applyStatAdjustment(
  pokemon: DamageCalculatorPokemon | null,
  statId: AdjustableStatId | null,
  adjustment: StatAdjustment | null,
): DamageCalculatorPokemon | null {
  if (!pokemon || !statId || !adjustment) return pokemon;

  return {
    ...pokemon,
    actualStats: {
      ...createNeutralActualStats(pokemon),
      ...pokemon.actualStats,
      [statId]: calculateActualStat(
        pokemon,
        statId,
        adjustment.point,
        adjustment.nature,
      ),
    },
    boosts: {
      ...pokemon.boosts,
      [statId]: adjustment.rank,
    },
  };
}

function getRelevantStatIds(move: DamageCalculatorMove | undefined) {
  if (!move) return { attacker: null, defender: null };
  return move.damageClass === "physical"
    ? ({ attacker: "attack", defender: "defense" } as const)
    : ({ attacker: "special-attack", defender: "special-defense" } as const);
}

function hasPositiveNatureForStat(
  build: TrainingBuild,
  statId: AdjustableStatId,
  natures: Nature[],
) {
  const selectedNature = natures.find(({ id }) => id === build.nature);
  return (
    selectedNature?.increasedStatId === statId &&
    selectedNature.increasedStatId !== selectedNature.decreasedStatId
  );
}

const DEFAULT_NATURE: Nature = {
  id: "serious",
  name: "まじめ",
  increasedStatId: "attack",
  decreasedStatId: "attack",
};

function toActualStats(
  pokemon: DamageCalculatorPokemon,
  build: TrainingBuild,
  natures: Nature[],
) {
  const selectedNature =
    natures.find(({ id }) => id === build.nature) ??
    natures.find(({ id }) => id === "serious") ??
    DEFAULT_NATURE;
  const hasNatureModifier =
    selectedNature.increasedStatId !== selectedNature.decreasedStatId;

  return Object.fromEntries(
    STAT_IDS.map((id) => {
      const baseStat = pokemon.stats[id] ?? 1;
      const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
      const point = build.abilityPoints[id] ?? 0;
      if (id === "hp") {
        return [id, baseStat === 1 ? 1 : base + 50 + 10 + point];
      }
      const modifier =
        hasNatureModifier && selectedNature.increasedStatId === id
          ? 1.1
          : hasNatureModifier && selectedNature.decreasedStatId === id
            ? 0.9
            : 1;
      return [id, Math.floor((base + 5 + point) * modifier)];
    }),
  );
}

function applyTrainingBuildToPokemon(
  pokemon: DamageCalculatorPokemon,
  build: TrainingBuild,
  natures: Nature[],
): DamageCalculatorPokemon {
  const learnedMoveIds = new Set(build.moveIds.filter(Boolean));
  const learnedDamageMoves =
    learnedMoveIds.size === 0
      ? []
      : pokemon.moves.filter((move) => learnedMoveIds.has(move.id));

  return {
    ...pokemon,
    nameJa: build.name || pokemon.nameJa,
    actualStats: toActualStats(pokemon, build, natures),
    moves: learnedDamageMoves,
  };
}

/**
 * ポケモン選択欄1つ分の状態をまとめる小さなhook。
 * 選択済みポケモンと入力中テキストを常に同期させる。
 */
function usePokemonSelection() {
  const [pokemon, setPokemon] = useState<DamageCalculatorPokemon | null>(null);
  const [query, setQuery] = useState("");

  function select(nextPokemon: DamageCalculatorPokemon | null) {
    setPokemon(nextPokemon);
    setQuery(nextPokemon?.nameJa ?? "");
  }

  return { pokemon, query, setQuery, select };
}

/**
 * ダメージ計算画面の本体。
 *
 * pokemonCatalogはページ生成時にSQLiteから読み込まれている。
 * ブラウザ内では通信せず、この配列だけで検索・技選択・計算を完結させる。
 */
export function DamageCalculator({
  pokemonCatalog,
}: {
  /** Server Component側でcatalog.dbから読み込んだ、計算対象ポケモンの全データ。 */
  pokemonCatalog: DamageCalculatorPokemon[];
}) {
  const attackerSelection = usePokemonSelection();
  const defenderSelection = usePokemonSelection();
  const attacker = attackerSelection.pokemon;
  const defender = defenderSelection.pokemon;
  const [moveId, setMoveId] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [attackerHistory, setAttackerHistory] = useState<
    DamageHistoryRecord[]
  >([]);
  const [defenderHistory, setDefenderHistory] = useState<
    DamageHistoryRecord[]
  >([]);
  const [battleTeams, setBattleTeams] = useState<BattleTeam[]>([]);
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const [natures, setNatures] = useState<Nature[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState("");
  const [statAdjustments, setStatAdjustments] =
    useState<StatAdjustmentState>(() => createDefaultAdjustmentState());
  const buildById = useMemo(
    () =>
      new Map(
        trainingBuilds.flatMap((build) =>
          build.id === undefined ? [] : [[build.id, build] as const],
        ),
      ),
    [trainingBuilds],
  );
  const selectedTeam =
    battleTeams.find((team) => team.id === selectedTeamId) ?? null;
  const selectedTeamBuilds = useMemo(
    () =>
      selectedTeam?.buildIds
        .map((buildId) => buildById.get(buildId))
        .filter((build): build is TrainingBuild => Boolean(build)) ?? [],
    [buildById, selectedTeam],
  );
  const selectedTeamMembers = useMemo(
    () =>
      selectedTeamBuilds.flatMap((build) => {
        const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
        return pokemon ? [{ build, pokemon }] : [];
      }),
    [pokemonCatalog, selectedTeamBuilds],
  );

  // user.dbはブラウザ専用なので、初回表示後に最近使った履歴を読み込む。
  useEffect(() => {
    let active = true;

    Promise.all([
      getDamageHistory("attacker"),
      getDamageHistory("defender"),
    ])
      .then(([savedAttackers, savedDefenders]) => {
        if (!active) return;
        setAttackerHistory(savedAttackers);
        setDefenderHistory(savedDefenders);
      })
      .catch((caught: unknown) => {
        console.error("ダメージ計算履歴を読み込めませんでした。", caught);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([getAllBattleTeams(), getAllTrainingBuilds(), getNatures()])
      .then(([teams, builds, loadedNatures]) => {
        if (!active) return;
        setBattleTeams(teams);
        setTrainingBuilds(builds);
        setNatures(loadedNatures);
      })
      .catch((caught: unknown) => {
        console.error("バトルチームを読み込めませんでした。", caught);
        if (active) {
          setTeamLoadError("バトルチームを読み込めませんでした。");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // 攻撃側を変更したら、前のポケモンの技や計算結果を残さない。
  function selectAttacker(pokemon: DamageCalculatorPokemon | null) {
    attackerSelection.select(pokemon);
    setStatAdjustments((current) => ({
      ...current,
      attacker: createDefaultAdjustmentState().attacker,
    }));
    setMoveId("");
    setResult(null);
    setError(null);
  }

  // 防御側を変更した場合も、古い相手に対する結果を消す。
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    defenderSelection.select(pokemon);
    setStatAdjustments((current) => ({
      ...current,
      defender: createDefaultAdjustmentState().defender,
    }));
    setResult(null);
    setError(null);
  }

  function changeStatAdjustment(
    side: DamageSide,
    statId: AdjustableStatId,
    values: Partial<StatAdjustment>,
  ) {
    setStatAdjustments((current) => ({
      ...current,
      [side]: {
        ...current[side],
        [statId]: {
          ...current[side][statId],
          ...values,
        },
      },
    }));
    setResult(null);
    setError(null);
  }

  function selectBattleTeam(team: BattleTeam) {
    setSelectedTeamId(team.id ?? null);
    setTeamModalOpen(false);
    setResult(null);
    setError(null);
  }

  function selectTeamMember(build: TrainingBuild) {
    const pokemon = pokemonCatalog.find(({ id }) => id === build.pokemonId);
    if (!pokemon) return;

    const trainedPokemon = applyTrainingBuildToPokemon(pokemon, build, natures);
    attackerSelection.select(trainedPokemon);
    setStatAdjustments((current) => ({
      ...current,
      attacker: Object.fromEntries(
        ADJUSTABLE_STAT_IDS.map((statId) => [
          statId,
          {
            point: build.abilityPoints[statId] ?? 0,
            rank: 0,
            nature: hasPositiveNatureForStat(build, statId, natures),
          },
        ]),
      ) as Record<AdjustableStatId, StatAdjustment>,
    }));
    setMoveId(trainedPokemon.moves[0]?.id ?? "");
    setResult(null);
    setError(null);
  }

  /**
   * 履歴画像からポケモンを復元する。
   * SQLite由来の最新カタログに存在しない古いIDは何もせず無視する。
   */
  function restoreHistory(
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) {
    const pokemon =
      pokemonCatalog.find(({ id }) => id === history.pokemonId) ?? null;
    if (!pokemon) return;

    if (side === "attacker") {
      attackerSelection.select(pokemon);
      setMoveId(
        pokemon.moves.some(({ id }) => id === history.moveId)
          ? (history.moveId ?? "")
          : "",
      );
    } else {
      defenderSelection.select(pokemon);
    }
    setResult(null);
    setError(null);
  }

  /**
   * フォーム送信時に、選択中のIDから技データを見つけて計算する。
   * 計算処理は同期的かつローカルなので、オフラインでも同じ結果になる。
   */
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!attacker || !defender || !moveId) return;

    const move = attacker.moves.find(({ id }) => id === moveId);
    if (!move || !adjustedAttacker || !adjustedDefender) return;

    setCalculating(true);
    setError(null);
    try {
      setResult({
        normal: championsDamageCalculator.calculate({
          attacker: adjustedAttacker,
          defender: adjustedDefender,
          move,
        }),
        critical: championsDamageCalculator.calculate({
          attacker: adjustedAttacker,
          defender: adjustedDefender,
          move,
          isCritical: true,
        }),
        attackerName: attacker.nameJa,
        defenderName: defender.nameJa,
        moveName: move.name,
      });
      // 計算に成功した組み合わせだけを履歴へ残す。
      void Promise.all([
        saveDamageHistory("attacker", attacker.id, move.id),
        saveDamageHistory("defender", defender.id),
      ])
        .then(([savedAttackers, savedDefenders]) => {
          setAttackerHistory(savedAttackers);
          setDefenderHistory(savedDefenders);
        })
        .catch((caught: unknown) => {
          console.error("ダメージ計算履歴を保存できませんでした。", caught);
        });
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "計算に失敗しました。");
    } finally {
      setCalculating(false);
    }
  }

  const selectedMove = attacker?.moves.find(({ id }) => id === moveId);
  const relevantStatIds = getRelevantStatIds(selectedMove);
  const adjustedAttacker = applyStatAdjustment(
    attacker,
    relevantStatIds.attacker,
    relevantStatIds.attacker
      ? statAdjustments.attacker[relevantStatIds.attacker]
      : null,
  );
  const adjustedDefender = applyStatAdjustment(
    defender,
    relevantStatIds.defender,
    relevantStatIds.defender
      ? statAdjustments.defender[relevantStatIds.defender]
      : null,
  );

  return (
    <form className={styles.calculator} onSubmit={submit}>
      <section className={styles.side}>
        <h2>攻撃側</h2>
        <div className={styles.teamPicker}>
          <button type="button" onClick={() => setTeamModalOpen(true)}>
            バトルチームを選択
          </button>
          <span>{selectedTeam?.name ?? "未選択"}</span>
        </div>
        {teamLoadError ? (
          <p className={styles.teamError} role="alert">
            {teamLoadError}
          </p>
        ) : null}
        {selectedTeamMembers.length > 0 ? (
          <div className={styles.teamPokemon}>
            {selectedTeamMembers.map(({ build, pokemon }) => (
              <button
                type="button"
                title={`${build.name || pokemon.nameJa}を攻撃側に反映`}
                aria-label={`${build.name || pokemon.nameJa}を攻撃側に反映`}
                onClick={() => selectTeamMember(build)}
                key={build.id}
              >
                {pokemon.imageUrl ? (
                  <Image
                    src={pokemon.imageUrl}
                    alt=""
                    width={48}
                    height={48}
                  />
                ) : (
                  <span>{pokemon.nameJa.slice(0, 1)}</span>
                )}
              </button>
            ))}
          </div>
        ) : null}
        <PokemonCombobox
          id="attacker"
          label="攻撃するポケモン"
          pokemonCatalog={pokemonCatalog}
          selectedPokemon={attacker}
          inputValue={attackerSelection.query}
          onInputValueChange={attackerSelection.setQuery}
          onSelect={selectAttacker}
        />
        <RecentPokemonList
          side="attacker"
          history={attackerHistory}
          pokemonCatalog={pokemonCatalog}
          onRestore={restoreHistory}
        />
        <PokemonSummary pokemon={attacker} />
        <label className={styles.moveField}>
          使用する技
          <select
            value={moveId}
            disabled={!attacker}
            onChange={(event) => {
              setMoveId(event.target.value);
              setResult(null);
            }}
          >
            <option value="">技を選択</option>
            {attacker?.moves.map((move) => (
              <option value={move.id} key={move.id}>
                {move.name}（威力 {move.power}）
              </option>
            ))}
          </select>
        </label>
        {selectedMove ? <MoveSummary move={selectedMove} /> : null}
        {selectedMove && relevantStatIds.attacker ? (
          <DamageStatControls
            title="攻撃側の補正"
            statLabel={STAT_LABELS[relevantStatIds.attacker]}
            value={statAdjustments.attacker[relevantStatIds.attacker]}
            onChange={(values) =>
              changeStatAdjustment(
                "attacker",
                relevantStatIds.attacker,
                values,
              )
            }
          />
        ) : null}
      </section>

      <div className={styles.versus}>VS</div>

      <section className={styles.side}>
        <h2>防御側</h2>
        <PokemonCombobox
          id="defender"
          label="攻撃を受けるポケモン"
          pokemonCatalog={pokemonCatalog}
          selectedPokemon={defender}
          inputValue={defenderSelection.query}
          onInputValueChange={defenderSelection.setQuery}
          onSelect={selectDefender}
        />
        <RecentPokemonList
          side="defender"
          history={defenderHistory}
          pokemonCatalog={pokemonCatalog}
          onRestore={restoreHistory}
        />
        <PokemonSummary pokemon={defender} />
        {selectedMove && relevantStatIds.defender ? (
          <DamageStatControls
            title="防御側の補正"
            statLabel={STAT_LABELS[relevantStatIds.defender]}
            value={statAdjustments.defender[relevantStatIds.defender]}
            onChange={(values) =>
              changeStatAdjustment(
                "defender",
                relevantStatIds.defender,
                values,
              )
            }
          />
        ) : null}
      </section>

      <div className={styles.conditions}>
        基準式 第{CHAMPIONS_DAMAGE_RULESET.generation}世代・レベル
        {CHAMPIONS_DAMAGE_RULESET.level}
        ・個体値31・努力値0・性格補正なし・HP満タン
      </div>

      <button
        className={styles.calculateButton}
        type="submit"
        disabled={!attacker || !defender || !moveId || calculating}
      >
        {calculating ? "計算中…" : "ダメージを計算"}
      </button>

      {error ? <p className={styles.error}>{error}</p> : null}
      {result ? <DamageResult result={result} /> : null}
      {teamModalOpen ? (
        <BattleTeamModal
          teams={battleTeams}
          selectedTeamId={selectedTeamId}
          onSelect={selectBattleTeam}
          onClose={() => setTeamModalOpen(false)}
        />
      ) : null}
    </form>
  );
}

function BattleTeamModal({
  teams,
  selectedTeamId,
  onSelect,
  onClose,
}: {
  teams: BattleTeam[];
  selectedTeamId: number | null;
  onSelect: (team: BattleTeam) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={styles.teamModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-team-modal-title"
    >
      <button
        className={styles.teamModalBackdrop}
        type="button"
        aria-label="バトルチーム一覧を閉じる"
        onClick={onClose}
      />
      <section className={styles.teamModalPanel}>
        <div className={styles.teamModalHeader}>
          <div>
            <p>BATTLE TEAMS</p>
            <h2 id="battle-team-modal-title">バトルチーム一覧</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {teams.length === 0 ? (
          <p className={styles.teamModalEmpty}>
            保存したバトルチームはありません。
          </p>
        ) : (
          <div className={styles.teamModalList}>
            {teams.map((team) => (
              <button
                className={
                  team.id === selectedTeamId ? styles.selectedTeamButton : ""
                }
                type="button"
                onClick={() => onSelect(team)}
                key={team.id}
              >
                <strong>{team.name}</strong>
                <small>{team.buildIds.length}体</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RecentPokemonList({
  side,
  history,
  pokemonCatalog,
  onRestore,
}: {
  /** 攻撃側/防御側のどちらの履歴を復元するか。 */
  side: DamageHistorySide;
  /** user.dbから読み込んだ最近使った履歴。 */
  history: DamageHistoryRecord[];
  /** 履歴のpokemonIdを現在のカタログ情報へ解決するために使う。 */
  pokemonCatalog: DamageCalculatorPokemon[];
  /** 履歴ボタンを押した時、親コンポーネントの選択状態へ反映する。 */
  onRestore: (
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) => void;
}) {
  // 履歴に残っていても現在のcatalog.dbに存在しないフォームは表示しない。
  const availableHistory = history.flatMap((record) => {
    const pokemon = pokemonCatalog.find(({ id }) => id === record.pokemonId);
    return pokemon ? [{ record, pokemon }] : [];
  });

  if (availableHistory.length === 0) return null;

  return (
    <div className={styles.recentPokemon}>
      <small>最近使ったポケモン</small>
      <div className={styles.recentPokemonList}>
        {availableHistory.map(({ record, pokemon }) => (
          <button
            type="button"
            title={`${pokemon.nameJa}を選択`}
            aria-label={`${pokemon.nameJa}を選択`}
            onClick={() => onRestore(side, record)}
            key={record.id}
          >
            {pokemon.imageUrl ? (
              <Image
                src={pokemon.imageUrl}
                alt=""
                width={48}
                height={48}
              />
            ) : (
              <span>{pokemon.nameJa.slice(0, 1)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 選択中ポケモンの画像と名前を表示し、未選択時は同じ高さのプレースホルダーを出す。 */
function PokemonSummary({
  pokemon,
}: {
  pokemon: DamageCalculatorPokemon | null;
}) {
  // 未選択時も同じ高さの枠を出し、左右のレイアウトが跳ねないようにする。
  if (!pokemon) return <div className={styles.placeholder}>ポケモンを選択</div>;

  return (
    <div className={styles.pokemonSummary}>
      {pokemon.imageUrl ? (
        <Image
          src={pokemon.imageUrl}
          alt={pokemon.nameJa}
          width={112}
          height={112}
        />
      ) : null}
      <div>
        <strong>{pokemon.nameJa}</strong>
        <small>{pokemon.name}</small>
      </div>
    </div>
  );
}

/** 技のタイプ、分類、威力を選択欄の直下に確認用として表示する。 */
function MoveSummary({ move }: { move: DamageCalculatorMove }) {
  return (
    <p className={styles.moveSummary}>
      {move.typeName} / {move.damageClass === "physical" ? "物理" : "特殊"} /
      威力 {move.power}
    </p>
  );
}

function DamageStatControls({
  title,
  statLabel,
  value,
  onChange,
}: {
  title: string;
  statLabel: string;
  value: StatAdjustment;
  onChange: (values: Partial<StatAdjustment>) => void;
}) {
  return (
    <div className={styles.statControls}>
      <div className={styles.statControlsHeader}>
        <strong>{title}</strong>
        <span>{statLabel}</span>
      </div>
      <label>
        能力ポイント
        <input
          type="number"
          min="0"
          max="32"
          value={value.point}
          onChange={(event) =>
            onChange({
              point: Math.min(32, Math.max(0, Number(event.target.value))),
            })
          }
        />
      </label>
      <label>
        能力ランク
        <span className={styles.rankValue}>
          {value.rank > 0 ? `+${value.rank}` : value.rank}
        </span>
        <input
          type="range"
          min="-6"
          max="6"
          step="1"
          value={value.rank}
          onChange={(event) => onChange({ rank: Number(event.target.value) })}
        />
      </label>
      <label className={styles.natureToggle}>
        <input
          type="checkbox"
          checked={value.nature}
          onChange={(event) => onChange({ nature: event.target.checked })}
        />
        性格補正あり
      </label>
    </div>
  );
}

/** 通常ダメージと急所ダメージをまとめて表示する結果パネル。 */
function DamageResult({ result }: { result: CalculationResult }) {
  return (
    <section className={styles.result} aria-live="polite">
      <p className={styles.resultLabel}>計算結果</p>
      <h2>
        {result.attackerName}の{result.moveName}
      </h2>
      <div className={styles.outcomeGrid}>
        <DamageOutcome
          title="通常ダメージ"
          calculation={result.normal}
          defenderName={result.defenderName}
        />
        <DamageOutcome
          title="急所に当たった場合"
          calculation={result.critical}
          defenderName={result.defenderName}
          critical
        />
      </div>
    </section>
  );
}

/**
 * 1種類のダメージ結果を表示する。
 * 残りHPバーは最小乱数/最大乱数の両端を重ねて、乱数幅が見えるようにする。
 */
function DamageOutcome({
  title,
  calculation,
  defenderName,
  critical = false,
}: {
  title: string;
  calculation: DamageCalculation;
  defenderName: string;
  critical?: boolean;
}) {
  // ダメージが大きいほど残りHPは小さいため、最小・最大の対応が逆になる。
  const remainingMinimum = Math.max(0, 100 - calculation.maximumPercent);
  const remainingMaximum = Math.max(0, 100 - calculation.minimumPercent);

  return (
    <article
      className={`${styles.outcome} ${critical ? styles.criticalOutcome : ""}`}
    >
      <h3>{title}</h3>
      <p className={styles.koLabel}>{calculation.koLabel}</p>
      <h4>
        {calculation.minimum}〜{calculation.maximum} ダメージ
      </h4>
      <strong>
        HPの {calculation.minimumPercent.toFixed(1)}〜
        {calculation.maximumPercent.toFixed(1)}%
      </strong>
      <div
        className={styles.remainingHpBar}
        role="img"
        aria-label={`防御側の残りHPは、最低乱数時 ${remainingMaximum.toFixed(1)}%、最高乱数時 ${remainingMinimum.toFixed(1)}%`}
      >
        <span
          className={styles.maximumRemainingHp}
          style={{ width: `${remainingMaximum}%` }}
        />
        <span
          className={styles.minimumRemainingHp}
          style={{ width: `${remainingMinimum}%` }}
        />
      </div>
      <div className={styles.remainingHpLegend}>
        <span className={styles.maximumRemainingLegend}>
          最低乱数時 {remainingMaximum.toFixed(1)}%
        </span>
        <span className={styles.minimumRemainingLegend}>
          最高乱数時 {remainingMinimum.toFixed(1)}%
        </span>
      </div>
      <p>
        {defenderName}の残りHP：
        {remainingMinimum.toFixed(1)}〜{remainingMaximum.toFixed(1)}%
      </p>
    </article>
  );
}
