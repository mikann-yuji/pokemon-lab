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
    setMoveId("");
    setResult(null);
    setError(null);
  }

  // 防御側を変更した場合も、古い相手に対する結果を消す。
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    defenderSelection.select(pokemon);
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
    if (!move) return;

    setCalculating(true);
    setError(null);
    try {
      setResult({
        normal: championsDamageCalculator.calculate({
          attacker,
          defender,
          move,
        }),
        critical: championsDamageCalculator.calculate({
          attacker,
          defender,
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
