"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  getTopRankedPokemon,
  type RankedPokemon,
  type TypeCheckerBattleFormat,
} from "@/features/type-checker/infrastructure/type-checker-repository";
import type { TrainingBuild } from "@/features/training/infrastructure/training-build-repository";
import { championsDamageCalculator } from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import {
  applyHeldItemSpeedModifier,
  calculateActualStat,
} from "./damage-calculator-state";
import {
  BASE_STAT_LABELS,
  STAT_IDS,
} from "./damage-calculator-display";
import type { TypeEffectivenessSource } from "@/domain/type-matchup";
import styles from "../styles/damage-calculator.module.css";

type SurvivalTeamMember = {
  build: TrainingBuild;
  pokemon: DamageCalculatorPokemon;
};

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
  canRemove: boolean;
};

function applyRankedStats(
  pokemon: DamageCalculatorPokemon,
  ranking: RankedPokemon,
) {
  return {
    ...pokemon,
    actualStats: Object.fromEntries(
      STAT_IDS.map((statId) => [
        statId,
        calculateActualStat(
          pokemon,
          statId,
          ranking.abilityPoints[statId] ?? 0,
        ),
      ]),
    ),
  };
}

function calculateMemberResults(
  member: SurvivalTeamMember,
  rankings: RankedPokemon[],
  pokemonCatalog: DamageCalculatorPokemon[],
  typeEffectivenessSource: TypeEffectivenessSource,
): SurvivalResult[] {
  const attacker = member.pokemon;
  const attackerSpeed = applyHeldItemSpeedModifier(
    attacker,
    attacker.actualStats?.speed ?? attacker.stats.speed ?? 0,
    attacker.heldItem?.id ?? "",
  );
  const pokemonById = new Map(
    pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]),
  );

  return rankings.flatMap((ranking): SurvivalResult[] => {
    const sourceDefender = pokemonById.get(ranking.formId);
    if (!sourceDefender) return [];
    const defender = applyRankedStats(sourceDefender, ranking);
    const defenderSpeed =
      defender.actualStats?.speed ?? defender.stats.speed ?? 0;
    const turnOrder =
      attackerSpeed > defenderSpeed
        ? "先攻"
        : attackerSpeed < defenderSpeed
          ? "後攻"
          : "同速";
    const best = attacker.moves
      .flatMap((move) => {
        try {
          const calculation = championsDamageCalculator.calculate({
            attacker,
            defender,
            move,
            typeEffectivenessSource,
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
        canRemove:
          turnOrder === "先攻" &&
          (best?.calculation.minimumPercent ?? 0) >= 50,
      },
    ];
  });
}

export function DamageSurvivalCheck({
  members,
  pokemonCatalog,
  typeEffectivenessSource,
}: {
  members: SurvivalTeamMember[];
  pokemonCatalog: DamageCalculatorPokemon[];
  typeEffectivenessSource: TypeEffectivenessSource;
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
  const results = useMemo(
    () =>
      currentMember
        ? calculateMemberResults(
            currentMember,
            remainingRankings,
            pokemonCatalog,
            typeEffectivenessSource,
          )
        : [],
    [
      currentMember,
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
    setOpen(true);
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
      setCompleted(true);
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
    setCompleted(false);
  }

  const nextMember = members[memberIndex + 1] ?? null;

  return (
    <>
      <button
        className={styles.survivalCheckButton}
        type="button"
        disabled={members.length === 0}
        title={
          members.length === 0
            ? "攻撃側のバトルチームを選択してください"
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
                <small>BATTLE TEAM SURVIVAL CHECK</small>
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
                  <strong>チーム確認完了</strong>
                  <span>
                    最後まで残った相手は{remainingRankings.length}体です。
                  </span>
                </div>
                <div className={styles.survivalList}>
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
                        <span>チームで対応候補に残りました</span>
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
                  <div>
                    <strong>
                      {memberIndex + 1}/{members.length}　
                      {currentMember.build.name ||
                        currentMember.pokemon.nameJa}
                    </strong>
                    <span>
                      対象 {results.length}体。不利にした相手と、先攻確定2発にできない相手を次へ持ち越します。
                    </span>
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
    </>
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
    canRemove,
  } = result;
  return (
    <article>
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
        </strong>
        <span>
          {move?.name ?? "攻撃技なし"}・{koLabel}
          {minimumPercent !== null && maximumPercent !== null
            ? `・${minimumPercent.toFixed(1)}〜${maximumPercent.toFixed(1)}%`
            : ""}
        </span>
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
