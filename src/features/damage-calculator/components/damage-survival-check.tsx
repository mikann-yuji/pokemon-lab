"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  getTopRankedPokemon,
  type RankedPokemon,
  type TypeCheckerBattleFormat,
} from "@/features/type-checker/infrastructure/type-checker-repository";
import type {
  BattleTeam,
  TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import { USER_RECORDS_LOCAL_CHANGED_EVENT } from "@/components/sync/user-database-sync";
import { championsDamageCalculator } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import {
  applyHeldItemSpeedModifier,
  applyPopularStatPointsToPokemon,
} from "./damage-calculator-state";
import { BASE_STAT_LABELS, STAT_IDS } from "./damage-calculator-display";
import { hasManualAbilityCondition } from "./damage-calculator-form-widgets";
import {
  getSurvivalCheckHistories,
  saveSurvivalCheckHistory,
  type SurvivalCheckHistory,
} from "../infrastructure/survival-check-history-repository";
import type { TypeEffectivenessSource } from "@/domain/type-matchup";
import {
  HIGH_RANDOM_ONE_HIT_THRESHOLD,
  isSurvivalAdvantage,
} from "../domain/survival-check-logic";
import { applyDefaultVariableMovePower } from "../domain/variable-move-power";
import styles from "../styles/damage-calculator.module.css";

type SurvivalTeamMember = {
  build: Pick<TrainingBuild, "id" | "name">;
  pokemon: DamageCalculatorPokemon;
};

type SurvivalCheckScope = "team" | "single-pokemon";

type SurvivalResult = {
  ranking: RankedPokemon;
  defender: DamageCalculatorPokemon;
  move: DamageCalculatorMove | null;
  minimumPercent: number | null;
  maximumPercent: number | null;
  koLabel: string;
  attackerSpeed: number;
  defenderSpeed: number;
  turnOrder: "先攻" | "後攻" | "同速";
  incomingMove: DamageCalculatorMove | null;
  incomingMinimumPercent: number | null;
  incomingMaximumPercent: number | null;
  incomingOneHitProbability: number | null;
  safeLaterGuaranteedOneHit: boolean;
  canRemove: boolean;
};

const SURVIVAL_RANK_STAT_IDS = [
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;

type SurvivalRankStatId = (typeof SURVIVAL_RANK_STAT_IDS)[number];

type SurvivalMemberCondition = {
  ranks: Record<SurvivalRankStatId, number>;
  abilityEnabled: boolean;
};

const SURVIVAL_RANK_LABELS: Record<SurvivalRankStatId, string> = {
  attack: "攻撃",
  defense: "防御",
  "special-attack": "特攻",
  "special-defense": "特防",
  speed: "素早さ",
};

const DEFAULT_MEMBER_CONDITION: SurvivalMemberCondition = {
  ranks: {
    attack: 0,
    defense: 0,
    "special-attack": 0,
    "special-defense": 0,
    speed: 0,
  },
  abilityEnabled: false,
};

function applyRankMultiplier(value: number, rank: number) {
  return Math.floor(
    value * (rank >= 0 ? (2 + rank) / 2 : 2 / (2 - rank)),
  );
}

function calculateMemberResults(
  member: SurvivalTeamMember,
  rankings: RankedPokemon[],
  pokemonCatalog: DamageCalculatorPokemon[],
  typeEffectivenessSource: TypeEffectivenessSource,
  condition: SurvivalMemberCondition,
): SurvivalResult[] {
  const attacker: DamageCalculatorPokemon = {
    ...member.pokemon,
    boosts: {
      ...member.pokemon.boosts,
      ...condition.ranks,
    },
  };
  const rankedAttackerSpeed = applyRankMultiplier(
    attacker.actualStats?.speed ?? attacker.stats.speed ?? 0,
    condition.ranks.speed,
  );
  const attackerSpeed = applyHeldItemSpeedModifier(
    attacker,
    rankedAttackerSpeed,
    attacker.heldItem?.id ?? "",
  );
  const pokemonById = new Map(
    pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]),
  );

  return rankings.flatMap((ranking): SurvivalResult[] => {
    const sourceDefender = pokemonById.get(ranking.formId);
    if (!sourceDefender) return [];
    const defender = applyPopularStatPointsToPokemon(
      sourceDefender,
      ranking.abilityPoints,
      ranking.nature,
    );
    const defenderSpeed =
      defender.actualStats?.speed ?? defender.stats.speed ?? 0;
    const turnOrder =
      attackerSpeed > defenderSpeed
        ? "先攻"
        : attackerSpeed < defenderSpeed
          ? "後攻"
          : "同速";
    const best = attacker.moves
      .flatMap((sourceMove) => {
        const move = applyDefaultVariableMovePower(sourceMove);
        try {
          const calculation = championsDamageCalculator.calculate({
            attacker,
            defender,
            move,
            typeEffectivenessSource,
            abilityConditionEnabled: {
              attacker: condition.abilityEnabled,
            },
          });
          return [{ move, calculation }];
        } catch {
          return [];
        }
      })
      .sort(
        (left, right) =>
          right.calculation.minimumPercent -
            left.calculation.minimumPercent ||
          right.calculation.maximumPercent -
            left.calculation.maximumPercent,
      )[0];

    const rankedIncomingMoves = defender.moves
      .filter(
        (move) => move.usageRank !== null && move.usageRank !== undefined,
      )
      .sort(
        (left, right) =>
          (left.usageRank ?? Number.MAX_SAFE_INTEGER) -
          (right.usageRank ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 4);
    const incomingMoves = (
      rankedIncomingMoves.length > 0
        ? rankedIncomingMoves
        : defender.moves.slice(0, 4)
    )
      .flatMap((sourceMove) => {
        const move = applyDefaultVariableMovePower(sourceMove);
        try {
          const calculation = championsDamageCalculator.calculate({
            attacker: defender,
            defender: attacker,
            move,
            typeEffectivenessSource,
            abilityConditionEnabled: {
              defender: condition.abilityEnabled,
            },
          });
          return [{ move, calculation }];
        } catch {
          return [];
        }
      })
      .sort(
        (left, right) =>
          right.calculation.oneHitProbability -
            left.calculation.oneHitProbability ||
          right.calculation.maximumPercent -
            left.calculation.maximumPercent ||
          right.calculation.minimumPercent - left.calculation.minimumPercent,
      );
    const strongestIncoming = incomingMoves[0];
    const outgoingMinimumPercent = best?.calculation.minimumPercent ?? 0;
    const safeLaterGuaranteedOneHit =
      turnOrder === "後攻" &&
      outgoingMinimumPercent >= 100 &&
      incomingMoves.length > 0 &&
      incomingMoves.every(
        ({ calculation }) =>
          calculation.oneHitProbability < HIGH_RANDOM_ONE_HIT_THRESHOLD,
      );

    return [
      {
        ranking,
        defender,
        move: best?.move ?? null,
        minimumPercent: best?.calculation.minimumPercent ?? null,
        maximumPercent: best?.calculation.maximumPercent ?? null,
        koLabel: best?.calculation.koLabel ?? "計算できません",
        attackerSpeed,
        defenderSpeed,
        turnOrder,
        incomingMove: strongestIncoming?.move ?? null,
        incomingMinimumPercent:
          strongestIncoming?.calculation.minimumPercent ?? null,
        incomingMaximumPercent:
          strongestIncoming?.calculation.maximumPercent ?? null,
        incomingOneHitProbability:
          strongestIncoming?.calculation.oneHitProbability ?? null,
        safeLaterGuaranteedOneHit,
        canRemove: isSurvivalAdvantage({
          movesFirst: turnOrder === "先攻",
          outgoingMinimumPercent,
          incomingOneHitProbabilities: incomingMoves.map(
            ({ calculation }) => calculation.oneHitProbability,
          ),
        }),
      },
    ];
  });
}

export function DamageSurvivalCheck({
  team,
  members,
  pokemonCatalog,
  typeEffectivenessSource,
  scope = "team",
  subjectName,
}: {
  team: BattleTeam | null;
  members: SurvivalTeamMember[];
  pokemonCatalog: DamageCalculatorPokemon[];
  typeEffectivenessSource: TypeEffectivenessSource;
  scope?: SurvivalCheckScope;
  subjectName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [battleFormat, setBattleFormat] =
    useState<TypeCheckerBattleFormat>("single");
  const [rankingsByFormat, setRankingsByFormat] = useState<
    Record<TypeCheckerBattleFormat, RankedPokemon[]>
  >({ single: [], double: [] });
  const [remainingRankings, setRemainingRankings] = useState<RankedPokemon[]>(
    [],
  );
  const [memberIndex, setMemberIndex] = useState(0);
  const [unfavorableFormIds, setUnfavorableFormIds] = useState<Set<number>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [memberConditions, setMemberConditions] = useState<
    Record<number, SurvivalMemberCondition>
  >({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [histories, setHistories] = useState<SurvivalCheckHistory[]>([]);
  const [selectedHistory, setSelectedHistory] =
    useState<SurvivalCheckHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySaveStatus, setHistorySaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [completedAt, setCompletedAt] = useState(0);
  const isSinglePokemon = scope === "single-pokemon";
  const checkName =
    subjectName ||
    team?.name ||
    members[0]?.build.name ||
    members[0]?.pokemon.nameJa ||
    (isSinglePokemon ? "育成対象" : "バトルチーム");

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.all([
      getTopRankedPokemon("single", 100),
      getTopRankedPokemon("double", 100),
    ])
      .then(([single, double]) => {
        if (!active) return;
        const nextRankings = { single, double };
        setRankingsByFormat(nextRankings);
        setRemainingRankings(nextRankings[battleFormat]);
        setMemberIndex(0);
        setUnfavorableFormIds(new Set());
        setMemberConditions({});
        setCompleted(false);
      })
      .catch((error: unknown) => {
        console.error("勝ち残り確認データを読み込めませんでした。", error);
        if (active) {
          setLoadError("採用率上位のポケモンを読み込めませんでした。");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [battleFormat, open]);

  const currentMember = members[memberIndex] ?? null;
  const currentCondition =
    memberConditions[memberIndex] ?? DEFAULT_MEMBER_CONDITION;
  const results = useMemo(
    () =>
      currentMember
        ? calculateMemberResults(
            currentMember,
            remainingRankings,
            pokemonCatalog,
            typeEffectivenessSource,
            currentCondition,
          )
        : [],
    [
      currentMember,
      currentCondition,
      pokemonCatalog,
      remainingRankings,
      typeEffectivenessSource,
    ],
  );

  function close() {
    setOpen(false);
  }

  function openCheck() {
    setLoading(true);
    setLoadError("");
    setMemberConditions({});
    setHistorySaveStatus("idle");
    setCompletedAt(0);
    setOpen(true);
  }

  function openHistory() {
    setOpen(false);
    setHistoryOpen(true);
    setSelectedHistory(null);
    setHistoryLoading(true);
    setHistoryError("");
    void getSurvivalCheckHistories()
      .then(setHistories)
      .catch((error: unknown) => {
        console.error("勝ち残り確認履歴を読み込めませんでした。", error);
        setHistoryError("確認履歴を読み込めませんでした。");
      })
      .finally(() => setHistoryLoading(false));
  }

  async function persistCompletedHistory(
    rankings: RankedPokemon[],
    checkedAt: number,
  ) {
    setHistorySaveStatus("saving");
    try {
      const pokemonById = new Map(
        pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]),
      );
      const saved = await saveSurvivalCheckHistory({
        checkedAt,
        teamName: checkName,
        battleFormat,
        members: members.map(({ build, pokemon }) => ({
          pokemonId: pokemon.id,
          pokemonName: pokemon.nameJa,
          buildName: build.name || pokemon.nameJa,
        })),
        remainingTargets: rankings.flatMap((ranking) => {
          const pokemon = pokemonById.get(ranking.formId);
          return pokemon
            ? [
                {
                  pokemonId: pokemon.id,
                  pokemonName: pokemon.nameJa,
                  rank: ranking.rank,
                },
              ]
            : [];
        }),
      });
      setHistories((current) => [
        saved,
        ...current.filter(({ id }) => id !== saved.id),
      ]);
      setHistorySaveStatus("saved");
      window.dispatchEvent(
        new CustomEvent(USER_RECORDS_LOCAL_CHANGED_EVENT),
      );
    } catch (error) {
      console.error("勝ち残り確認結果を保存できませんでした。", error);
      setHistorySaveStatus("error");
    }
  }

  function updateCurrentRank(statId: SurvivalRankStatId, rank: number) {
    setMemberConditions((current) => {
      const condition = current[memberIndex] ?? DEFAULT_MEMBER_CONDITION;
      return {
        ...current,
        [memberIndex]: {
          ...condition,
          ranks: {
            ...condition.ranks,
            [statId]: rank,
          },
        },
      };
    });
  }

  function updateCurrentAbility(enabled: boolean) {
    setMemberConditions((current) => {
      const condition = current[memberIndex] ?? DEFAULT_MEMBER_CONDITION;
      return {
        ...current,
        [memberIndex]: {
          ...condition,
          abilityEnabled: enabled,
        },
      };
    });
  }

  function moveToNextMember() {
    const nextRemaining = results
      .filter(
        ({ canRemove, defender }) =>
          !canRemove || unfavorableFormIds.has(defender.id),
      )
      .map(({ ranking }) => ranking);
    setRemainingRankings(nextRemaining);
    setUnfavorableFormIds(new Set());
    if (memberIndex >= members.length - 1) {
      const checkedAt = Date.now();
      setCompleted(true);
      setCompletedAt(checkedAt);
      void persistCompletedHistory(nextRemaining, checkedAt);
      return;
    }
    setMemberIndex((current) => current + 1);
  }

  function resetForFormat(nextFormat: TypeCheckerBattleFormat) {
    setLoading(true);
    setLoadError("");
    setBattleFormat(nextFormat);
    setRemainingRankings(rankingsByFormat[nextFormat]);
    setMemberIndex(0);
    setUnfavorableFormIds(new Set());
    setMemberConditions({});
    setHistorySaveStatus("idle");
    setCompletedAt(0);
    setCompleted(false);
  }

  const nextMember = members[memberIndex + 1] ?? null;

  return (
    <>
      <button
        className={styles.survivalHistoryButton}
        type="button"
        onClick={openHistory}
      >
        履歴確認
      </button>
      <button
        className={styles.survivalCheckButton}
        type="button"
        disabled={members.length === 0}
        title={
          members.length === 0
            ? isSinglePokemon
              ? "育成対象を読み込んでいます"
              : "攻撃側のバトルチームを選択してください"
            : isSinglePokemon
              ? "育成対象1匹のダメージ勝ち残り確認"
              : "バトルチームのダメージ勝ち残り確認"
        }
        onClick={openCheck}
      >
        勝ち残り確認
      </button>
      {open ? (
        <div
          className={styles.survivalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="survival-check-title"
        >
          <button
            className={styles.survivalBackdrop}
            type="button"
            aria-label="勝ち残り確認を閉じる"
            onClick={close}
          />
          <section className={styles.survivalPanel}>
            <header className={styles.survivalHeader}>
              <div>
                <small>
                  {isSinglePokemon
                    ? "SINGLE POKEMON SURVIVAL CHECK"
                    : "BATTLE TEAM SURVIVAL CHECK"}
                </small>
                <h2 id="survival-check-title">ダメージ勝ち残り確認</h2>
              </div>
              <label>
                採用率
                <select
                  value={battleFormat}
                  onChange={(event) =>
                    resetForFormat(
                      event.target.value as TypeCheckerBattleFormat,
                    )
                  }
                >
                  <option value="single">シングル</option>
                  <option value="double">ダブル</option>
                </select>
              </label>
              <button type="button" aria-label="閉じる" onClick={close}>
                ×
              </button>
            </header>

            {loading ? (
              <p className={styles.survivalStatus}>100位まで読み込み中…</p>
            ) : null}
            {loadError ? (
              <p className={styles.survivalStatus} role="alert">
                {loadError}
              </p>
            ) : null}

            {!loading && !loadError && completed ? (
              <>
                <div className={styles.survivalProgress}>
                  <div className={styles.survivalUsedPokemon}>
                    {members.map(({ build, pokemon }) => (
                      pokemon.imageUrl ?? pokemon.fallbackImageUrl ? (
                        <Image
                          key={build.id ?? pokemon.id}
                          src={
                            (pokemon.imageUrl ??
                              pokemon.fallbackImageUrl) as string
                          }
                          alt={pokemon.nameJa}
                          title={build.name || pokemon.nameJa}
                          width={30}
                          height={30}
                          unoptimized
                        />
                      ) : null
                    ))}
                  </div>
                  <div className={styles.survivalMemberSummary}>
                    <strong>
                      {checkName}　確認完了
                    </strong>
                    <span>
                      {completedAt ? `${formatHistoryDate(completedAt)}　` : ""}
                      最後まで残った相手は{remainingRankings.length}体です。
                      {historySaveStatus === "saving"
                        ? " 履歴へ保存中…"
                        : historySaveStatus === "saved"
                          ? " 履歴へ自動保存しました。"
                          : historySaveStatus === "error"
                            ? " 履歴の自動保存に失敗しました。"
                            : ""}
                    </span>
                  </div>
                </div>
                <div className={styles.survivalList}>
                  {results.length === 0 ? (
                    <p className={styles.survivalEmptyResult}>
                      最後まで残った相手はいません。
                    </p>
                  ) : null}
                  {results.map(({ ranking, defender }) => (
                    <article key={defender.id}>
                      {defender.imageUrl ?? defender.fallbackImageUrl ? (
                        <Image
                          src={
                            (defender.imageUrl ??
                              defender.fallbackImageUrl) as string
                          }
                          alt={defender.nameJa}
                          width={34}
                          height={34}
                          unoptimized
                        />
                      ) : null}
                      <div>
                        <strong>
                          {ranking.rank}位 {defender.nameJa}
                        </strong>
                        <span>
                          {isSinglePokemon
                            ? "このポケモンで対応候補に残りました"
                            : "チームで対応候補に残りました"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}

            {!loading && !loadError && !completed && currentMember ? (
              <>
                <div className={styles.survivalProgress}>
                  {currentMember.pokemon.imageUrl ??
                  currentMember.pokemon.fallbackImageUrl ? (
                    <Image
                      src={
                        (currentMember.pokemon.imageUrl ??
                          currentMember.pokemon.fallbackImageUrl) as string
                      }
                      alt={currentMember.pokemon.nameJa}
                      width={42}
                      height={42}
                      unoptimized
                    />
                  ) : null}
                  <div className={styles.survivalMemberSummary}>
                    <strong>
                      {memberIndex + 1}/{members.length}　
                      {currentMember.build.name ||
                        currentMember.pokemon.nameJa}
                    </strong>
                    <span>
                      {isSinglePokemon
                        ? `対象 ${results.length}体。この1匹で先攻確定2発にできない相手を確認します。`
                        : `対象 ${results.length}体。不利にした相手と、先攻確定2発にできない相手を次へ持ち越します。`}
                    </span>
                  </div>
                  <div className={styles.survivalMemberControls}>
                    {SURVIVAL_RANK_STAT_IDS.map((statId) => (
                      <label key={statId}>
                        {SURVIVAL_RANK_LABELS[statId]}
                        <select
                          aria-label={`${SURVIVAL_RANK_LABELS[statId]}の能力ランク`}
                          value={currentCondition.ranks[statId]}
                          onChange={(event) =>
                            updateCurrentRank(
                              statId,
                              Number(event.target.value),
                            )
                          }
                        >
                          {Array.from({ length: 13 }, (_, index) => index - 6).map(
                            (rank) => (
                              <option key={rank} value={rank}>
                                {rank > 0 ? `+${rank}` : rank}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    ))}
                    {hasManualAbilityCondition(
                      currentMember.pokemon.selectedAbility ?? null,
                    ) ? (
                      <label className={styles.survivalAbilityToggle}>
                        <input
                          type="checkbox"
                          checked={currentCondition.abilityEnabled}
                          onChange={(event) =>
                            updateCurrentAbility(event.target.checked)
                          }
                        />
                        特性を適用
                        <small>
                          {currentMember.pokemon.selectedAbility?.name}
                        </small>
                      </label>
                    ) : null}
                  </div>
                </div>
                <div className={styles.survivalList}>
                  {results.map((result) => (
                    <SurvivalResultRow
                      key={result.defender.id}
                      result={result}
                      unfavorable={unfavorableFormIds.has(result.defender.id)}
                      onUnfavorableChange={(checked) => {
                        setUnfavorableFormIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(result.defender.id);
                          else next.delete(result.defender.id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
                <footer className={styles.survivalFooter}>
                  <span>
                    次へ持ち越し予定：
                    {
                      results.filter(
                        ({ canRemove, defender }) =>
                          !canRemove ||
                          unfavorableFormIds.has(defender.id),
                      ).length
                    }
                    体
                  </span>
                  <button type="button" onClick={moveToNextMember}>
                    {nextMember ? (
                      <>
                        {nextMember.pokemon.imageUrl ??
                        nextMember.pokemon.fallbackImageUrl ? (
                          <Image
                            src={
                              (nextMember.pokemon.imageUrl ??
                                nextMember.pokemon.fallbackImageUrl) as string
                            }
                            alt=""
                            width={26}
                            height={26}
                            unoptimized
                          />
                        ) : null}
                        {nextMember.pokemon.nameJa}に移る
                      </>
                    ) : (
                      "確認を完了"
                    )}
                  </button>
                </footer>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
      {historyOpen ? (
        <div
          className={styles.survivalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="survival-history-title"
        >
          <button
            className={styles.survivalBackdrop}
            type="button"
            aria-label="勝ち残り確認履歴を閉じる"
            onClick={() => setHistoryOpen(false)}
          />
          <section
            className={`${styles.survivalPanel} ${styles.survivalHistoryPanel}`}
          >
            <header className={styles.survivalHeader}>
              <div>
                <small>BATTLE TEAM SURVIVAL HISTORY</small>
                <h2 id="survival-history-title">
                  {selectedHistory ? "勝ち残り確認結果" : "勝ち残り確認履歴"}
                </h2>
              </div>
              <span className={styles.survivalHistoryHeaderMeta}>
                {selectedHistory
                  ? selectedHistory.battleFormat === "single"
                    ? "シングル"
                    : "ダブル"
                  : `${histories.length}件`}
              </span>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setHistoryOpen(false)}
              >
                ×
              </button>
            </header>

            <div className={styles.survivalHistoryBody}>
              {selectedHistory ? (
                <>
                <div className={styles.survivalHistoryDetailHeader}>
                  <button
                    className={styles.survivalHistoryBackButton}
                    type="button"
                    onClick={() => setSelectedHistory(null)}
                  >
                    ← 履歴一覧
                  </button>
                  <div className={styles.survivalHistoryDetailTitle}>
                    <strong>{selectedHistory.teamName}</strong>
                    <span>{formatHistoryDate(selectedHistory.checkedAt)}</span>
                  </div>
                  <HistoryPokemonImages
                    pokemonIds={selectedHistory.members.map(
                      ({ pokemonId }) => pokemonId,
                    )}
                    pokemonCatalog={pokemonCatalog}
                  />
                </div>
                <div className={styles.survivalList}>
                  {selectedHistory.remainingTargets.length === 0 ? (
                    <p className={styles.survivalEmptyResult}>
                      最後まで残った相手はいません。
                    </p>
                  ) : null}
                  {selectedHistory.remainingTargets.map((target) => {
                    const pokemon = pokemonCatalog.find(
                      ({ id }) => id === target.pokemonId,
                    );
                    return (
                      <article key={`${target.rank}:${target.pokemonId}`}>
                        {pokemon ? (
                          <HistoryPokemonImage
                            pokemon={pokemon}
                            alt={target.pokemonName}
                            size={34}
                          />
                        ) : null}
                        <div>
                          <strong>
                            {target.rank}位 {target.pokemonName}
                          </strong>
                          <span>対応候補に残りました</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
                </>
              ) : (
                <>
                {historyLoading ? (
                  <p className={styles.survivalStatus}>履歴を読み込み中…</p>
                ) : null}
                {historyError ? (
                  <p className={styles.survivalStatus} role="alert">
                    {historyError}
                  </p>
                ) : null}
                {!historyLoading && !historyError ? (
                  <div className={styles.survivalHistoryList}>
                    {histories.length === 0 ? (
                      <p className={styles.survivalEmptyResult}>
                        保存された確認履歴はありません。
                      </p>
                    ) : null}
                    {histories.map((history) => (
                      <button
                        key={history.id}
                        className={styles.survivalHistoryEntry}
                        type="button"
                        onClick={() => setSelectedHistory(history)}
                      >
                        <span className={styles.survivalHistoryEntryText}>
                          <strong>{formatHistoryDate(history.checkedAt)}</strong>
                          <small>
                            {history.teamName}・
                            {history.battleFormat === "single"
                              ? "シングル"
                              : "ダブル"}
                          </small>
                        </span>
                        <HistoryPokemonImages
                          pokemonIds={history.members.map(
                            ({ pokemonId }) => pokemonId,
                          )}
                          pokemonCatalog={pokemonCatalog}
                        />
                        <span className={styles.survivalHistoryEntryCount}>
                          残り{history.remainingTargets.length}体
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatHistoryDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function HistoryPokemonImage({
  pokemon,
  alt,
  size,
}: {
  pokemon: DamageCalculatorPokemon;
  alt: string;
  size: number;
}) {
  const imageUrl = pokemon.imageUrl ?? pokemon.fallbackImageUrl;
  return imageUrl ? (
    <Image
      src={imageUrl}
      alt={alt}
      width={size}
      height={size}
      unoptimized
    />
  ) : null;
}

function HistoryPokemonImages({
  pokemonIds,
  pokemonCatalog,
}: {
  pokemonIds: number[];
  pokemonCatalog: DamageCalculatorPokemon[];
}) {
  const pokemonById = new Map(
    pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]),
  );
  return (
    <span className={styles.survivalHistoryPokemonImages}>
      {pokemonIds.map((pokemonId, index) => {
        const pokemon = pokemonById.get(pokemonId);
        return pokemon ? (
          <HistoryPokemonImage
            key={`${pokemonId}:${index}`}
            pokemon={pokemon}
            alt={pokemon.nameJa}
            size={26}
          />
        ) : null;
      })}
    </span>
  );
}

function SurvivalResultRow({
  result,
  unfavorable,
  onUnfavorableChange,
}: {
  result: SurvivalResult;
  unfavorable: boolean;
  onUnfavorableChange: (checked: boolean) => void;
}) {
  const {
    ranking,
    defender,
    move,
    minimumPercent,
    maximumPercent,
    koLabel,
    attackerSpeed,
    defenderSpeed,
    turnOrder,
    incomingMove,
    incomingMinimumPercent,
    incomingMaximumPercent,
    incomingOneHitProbability,
    safeLaterGuaranteedOneHit,
    canRemove,
  } = result;
  const isGuaranteedFirstTurnOneHit =
    turnOrder === "先攻" && (minimumPercent ?? 0) >= 100;
  const isHighlightedOneHit =
    isGuaranteedFirstTurnOneHit || safeLaterGuaranteedOneHit;
  return (
    <article
      className={
        isHighlightedOneHit
          ? styles.survivalGuaranteedOneHitRow
          : undefined
      }
    >
      {defender.imageUrl ?? defender.fallbackImageUrl ? (
        <Image
          src={(defender.imageUrl ?? defender.fallbackImageUrl) as string}
          alt={defender.nameJa}
          width={34}
          height={34}
          unoptimized
        />
      ) : null}
      <div>
        <strong>
          {ranking.rank}位 {defender.nameJa}
          {isGuaranteedFirstTurnOneHit ? (
            <mark className={styles.survivalGuaranteedOneHitBadge}>
              先攻確定1発
            </mark>
          ) : safeLaterGuaranteedOneHit ? (
            <mark className={styles.survivalGuaranteedOneHitBadge}>
              後攻確1・高乱数耐え
            </mark>
          ) : null}
        </strong>
        <span>
          {move?.name ?? "攻撃技なし"}・{koLabel}
          {minimumPercent !== null && maximumPercent !== null
            ? `・${minimumPercent.toFixed(1)}〜${maximumPercent.toFixed(1)}%`
            : ""}
        </span>
        {incomingMove &&
        incomingMinimumPercent !== null &&
        incomingMaximumPercent !== null &&
        incomingOneHitProbability !== null ? (
          <span className={styles.survivalIncomingDamage}>
            相手最大: {incomingMove.name}・
            {incomingMinimumPercent.toFixed(1)}〜
            {incomingMaximumPercent.toFixed(1)}%・1発率
            {(incomingOneHitProbability * 100).toFixed(1)}%
          </span>
        ) : null}
        <small>
          {STAT_IDS.map(
            (statId) =>
              `${BASE_STAT_LABELS[statId]} ${defender.actualStats?.[statId] ?? "—"}`,
          ).join(" / ")}
        </small>
      </div>
      <div className={styles.survivalOutcome}>
        <span
          data-order={
            turnOrder === "先攻"
              ? "first"
              : turnOrder === "後攻"
                ? "later"
                : "tie"
          }
        >
          {turnOrder}（{attackerSpeed} / 相手 {defenderSpeed}）
        </span>
        {canRemove ? (
          <label>
            <input
              type="checkbox"
              checked={unfavorable}
              onChange={(event) =>
                onUnfavorableChange(event.target.checked)
              }
            />
            不利
          </label>
        ) : (
          <small>自動で持ち越し</small>
        )}
      </div>
    </article>
  );
}
// 連続被弾、回復、乱数を考慮し、指定回数を耐える確率と調整候補を求める。
