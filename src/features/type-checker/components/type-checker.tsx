"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import type { TypeEffectivenessSource } from "@/domain/type-matchup";
import type { DamageCalculation } from "@/features/damage-calculator/application/smogon-damage-calculator";
import { championsDamageCalculator } from "@/features/damage-calculator/config/champions-damage-ruleset";
import { useDamageCalculatorCatalogStore } from "@/features/damage-calculator/components/damage-calculator-catalog-store";
import {
  applyHeldItemSpeedModifier,
  applyTrainingBuildToPokemon,
  calculateActualStat,
} from "@/features/damage-calculator/components/damage-calculator-state";
import {
  BASE_STAT_LABELS,
  STAT_IDS,
} from "@/features/damage-calculator/components/damage-calculator-display";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "@/features/damage-calculator/domain/damage-calculator-types";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import { getNatures } from "@/features/training/infrastructure/training-catalog-repository";
import { getTypeMatchups } from "@/features/quiz/infrastructure/quiz-catalog-repository";
import {
  getTopRankedPokemon,
  type RankedPokemon,
  type TypeCheckerBattleFormat,
} from "../infrastructure/type-checker-repository";
import {
  findSharedWeaknesses,
  getBestMoveMultiplier,
  getDefensiveMultiplier,
  MULTIPLIER_DISPLAY,
  type TypeCheckerMultiplier,
} from "../type-checker-model";
import styles from "../styles/type-checker.module.css";

type TeamMember = {
  buildId: number;
  buildName: string;
  pokemonName: string;
  imageUrl: string | null;
  types: TypeName[];
  pokemon: DamageCalculatorPokemon;
  moves: DamageCalculatorMove[];
};

type KnockoutCandidate = {
  rank: number;
  defender: DamageCalculatorPokemon;
  move: DamageCalculatorMove;
  result: DamageCalculation;
  usageRate: number | null;
  attackerSpeed: number;
  defenderSpeed: number;
  turnOrder: "先攻" | "後攻" | "同速";
};

function applyRankedAbilityPoints(
  pokemon: DamageCalculatorPokemon,
  abilityPoints: Record<string, number>,
) {
  return {
    ...pokemon,
    actualStats: Object.fromEntries(
      STAT_IDS.map((statId) => [
        statId,
        calculateActualStat(pokemon, statId, abilityPoints[statId] ?? 0),
      ]),
    ),
  };
}

function VerticalTypeLabel({ children }: { children: string }) {
  return (
    <span className={styles.verticalType}>
      {Array.from(children).map((character, index) => (
        <span key={`${character}-${index}`}>{character}</span>
      ))}
    </span>
  );
}

function EffectivenessMark({
  multiplier,
  detail,
}: {
  multiplier: TypeCheckerMultiplier | null;
  detail: string;
}) {
  if (multiplier === null) {
    return <span title={detail}>—</span>;
  }
  const display = MULTIPLIER_DISPLAY[multiplier];
  return (
    <span
      className={styles[`multiplier${String(multiplier).replace(".", "_")}`]}
      title={`${detail}: ${display.label}（${multiplier}倍）`}
      aria-label={`${detail}、${display.label}、${multiplier}倍`}
    >
      {display.symbol}
    </span>
  );
}

function PokemonHeader({ member }: { member: TeamMember }) {
  return (
    <div className={styles.pokemonHeader} title={`${member.pokemonName} / ${member.buildName}`}>
      {member.imageUrl ? (
        <Image
          src={member.imageUrl}
          alt={member.pokemonName}
          width={32}
          height={32}
          unoptimized
        />
      ) : (
        <span className={styles.imageFallback}>?</span>
      )}
      <span>{member.pokemonName}</span>
    </div>
  );
}

function Matrix({
  title,
  description,
  members,
  typeMatchups,
  mode,
}: {
  title: string;
  description: string;
  members: TeamMember[];
  typeMatchups: TypeMatchup[];
  mode: "defense" | "offense";
}) {
  const matchupsByType = useMemo(
    () => new Map(typeMatchups.map((type) => [type.name, type])),
    [typeMatchups],
  );

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.tableScroller}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">防＼攻</th>
              {typeMatchups.map((type) => (
                <th scope="col" key={type.name}>
                  <VerticalTypeLabel>{type.nameJa}</VerticalTypeLabel>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.buildId}>
                <th scope="row">
                  <PokemonHeader member={member} />
                </th>
                {typeMatchups.map((type) => {
                  const multiplier =
                    mode === "defense"
                      ? getDefensiveMultiplier(
                          type.name,
                          member.types,
                          matchupsByType,
                        )
                      : getBestMoveMultiplier(
                          member.moves,
                          type.name,
                          matchupsByType,
                        );
                  return (
                    <td key={type.name}>
                      <EffectivenessMark
                        multiplier={multiplier}
                        detail={
                          mode === "defense"
                            ? `${type.nameJa}技を受ける`
                            : `${type.nameJa}タイプへの最良打点`
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MoveMatrix({
  member,
  typeMatchups,
}: {
  member: TeamMember;
  typeMatchups: TypeMatchup[];
}) {
  const matchupsByType = useMemo(
    () => new Map(typeMatchups.map((type) => [type.name, type])),
    [typeMatchups],
  );
  return (
    <div className={styles.tableScroller}>
      <table className={`${styles.matrix} ${styles.moveMatrix}`}>
        <thead>
          <tr>
            <th scope="col">技＼防</th>
            {typeMatchups.map((type) => (
              <th scope="col" key={type.name}>
                <VerticalTypeLabel>{type.nameJa}</VerticalTypeLabel>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {member.moves.map((move) => (
            <tr key={move.id}>
              <th scope="row" title={move.name}>
                {move.name}
              </th>
              {typeMatchups.map((type) => (
                <td key={type.name}>
                  <EffectivenessMark
                    multiplier={getBestMoveMultiplier(
                      [move],
                      type.name,
                      matchupsByType,
                    )}
                    detail={`${move.name}→${type.nameJa}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getKnockoutCandidates(
  member: TeamMember,
  rankings: RankedPokemon[],
  pokemonCatalog: DamageCalculatorPokemon[],
  typeEffectivenessSource: TypeEffectivenessSource | null,
) {
  if (!typeEffectivenessSource || member.moves.length === 0) return [];
  const pokemonById = new Map(
    pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]),
  );
  const attackerSpeed = applyHeldItemSpeedModifier(
    member.pokemon,
    member.pokemon.actualStats?.speed ??
      member.pokemon.stats.speed ??
      0,
    member.pokemon.heldItem?.id ?? "",
  );
  return rankings.flatMap((ranking): KnockoutCandidate[] => {
    const sourceDefender = pokemonById.get(ranking.formId);
    if (!sourceDefender) return [];
    const defender = applyRankedAbilityPoints(
      sourceDefender,
      ranking.abilityPoints,
    );
    const defenderSpeed =
      defender.actualStats?.speed ?? defender.stats.speed ?? 0;
    const results = member.moves.flatMap((move) => {
      try {
        return [
          {
            move,
            result: championsDamageCalculator.calculate({
              attacker: member.pokemon,
              defender,
              move,
              typeEffectivenessSource,
            }),
          },
        ];
      } catch {
        return [];
      }
    });
    const best = results
      .sort((left, right) => {
        const minimum =
          right.result.minimumPercent - left.result.minimumPercent;
        if (minimum !== 0) return minimum;
        return right.result.maximumPercent - left.result.maximumPercent;
      })[0];
    return best
      ? [{
          rank: ranking.rank,
          defender,
          move: best.move,
          result: best.result,
          usageRate: ranking.usageRate,
          attackerSpeed,
          defenderSpeed,
          turnOrder:
            attackerSpeed > defenderSpeed
              ? "先攻"
              : attackerSpeed < defenderSpeed
                ? "後攻"
                : "同速",
        }]
      : [];
  });
}

function PokemonDetail({
  member,
  typeMatchups,
  candidates,
}: {
  member: TeamMember;
  typeMatchups: TypeMatchup[];
  candidates: KnockoutCandidate[];
}) {
  const typeLabels = new Map(
    typeMatchups.map((type) => [type.name, type.nameJa]),
  );
  const itemName = member.pokemon.heldItem?.name ?? "なし";
  const abilityName = member.pokemon.selectedAbility?.name ?? "なし";
  return (
    <section className={styles.pokemonDetail}>
      <header className={styles.pokemonDetailHeader}>
        {member.imageUrl ? (
          <Image
            src={member.imageUrl}
            alt={member.pokemonName}
            width={56}
            height={56}
            unoptimized
          />
        ) : (
          <span className={styles.detailImageFallback}>?</span>
        )}
        <div>
          <h3>{member.pokemonName}</h3>
          <p>{member.buildName}</p>
        </div>
        <dl className={styles.buildFacts}>
          <div>
            <dt>タイプ</dt>
            <dd>
              {member.types.map((type) => typeLabels.get(type) ?? type).join(" / ")}
            </dd>
          </div>
          <div>
            <dt>特性</dt>
            <dd>{abilityName}</dd>
          </div>
          <div>
            <dt>持ち物</dt>
            <dd>{itemName}</dd>
          </div>
        </dl>
      </header>

      <dl className={styles.actualStats}>
        {Object.entries(BASE_STAT_LABELS).map(([statId, label]) => (
          <div key={statId}>
            <dt>{label}</dt>
            <dd>
              {member.pokemon.actualStats?.[statId] ??
                member.pokemon.stats[statId] ??
                "—"}
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.subsectionHeading}>
        <h4>技ごとのタイプ相性</h4>
        <p>縦軸が採用技、横軸が防御側の単タイプです。</p>
      </div>
      {member.moves.length > 0 ? (
        <MoveMatrix member={member} typeMatchups={typeMatchups} />
      ) : (
        <p className={styles.emptyInline}>攻撃技が登録されていません。</p>
      )}

      <div className={styles.subsectionHeading}>
        <h4>採用率上位30位＋メガシンカへのダメージ</h4>
        <p>
          メガシンカできる相手はメガシンカ後も含めます。防御側は採用率1位の能力ポイント配分、攻撃側は保存した能力値・特性・持ち物を反映しています。
        </p>
      </div>
      {candidates.length > 0 ? (
        <div className={`${styles.knockoutList} ${styles.damageResultScroller}`}>
          {candidates.map(({
            rank,
            defender,
            move,
            result,
            usageRate,
            attackerSpeed,
            defenderSpeed,
            turnOrder,
          }) => (
            <article key={defender.id}>
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
                  {rank}位 {defender.nameJa}
                </strong>
                <span>
                  {move.name}
                  {usageRate === null
                    ? "・能力ポイント配分を更新待ち"
                    : `・配分採用率 ${usageRate.toFixed(1)}%`}
                </span>
                <span className={styles.defenderStats}>
                  {STAT_IDS.map(
                    (statId) =>
                      `${BASE_STAT_LABELS[statId]} ${defender.actualStats?.[statId] ?? "—"}`,
                  ).join(" / ")}
                </span>
              </div>
              <div className={styles.damageSummary}>
                <strong>{result.koLabel}</strong>
                <span>
                  {result.minimumPercent.toFixed(1)}〜
                  {result.maximumPercent.toFixed(1)}%
                </span>
                <span
                  className={
                    turnOrder === "先攻"
                      ? styles.turnOrderFirst
                      : turnOrder === "後攻"
                        ? styles.turnOrderLater
                        : styles.turnOrderTie
                  }
                >
                  {turnOrder}（{attackerSpeed} / 相手 {defenderSpeed}）
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyInline}>ダメージを計算できる相手がいません。</p>
      )}
    </section>
  );
}

function prepareMembers(
  team: BattleTeam | undefined,
  builds: TrainingBuild[],
  pokemonCatalog: DamageCalculatorPokemon[],
  natures: Awaited<ReturnType<typeof getNatures>>,
  heldItems: ReturnType<
    typeof useDamageCalculatorCatalogStore.getState
  >["heldItems"],
) {
  if (!team) return [];
  const buildsById = new Map(
    builds.flatMap((build) =>
      build.id === undefined ? [] : ([[build.id, build]] as const),
    ),
  );
  const pokemonById = new Map(
    pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]),
  );
  return team.buildIds.flatMap((buildId): TeamMember[] => {
    const build = buildsById.get(buildId);
    const pokemon = build ? pokemonById.get(build.pokemonId) : undefined;
    if (!build || !pokemon) return [];
    const trainedPokemon = applyTrainingBuildToPokemon(
      pokemon,
      build,
      natures,
      heldItems,
    );
    return [
      {
        buildId,
        buildName: build.name,
        pokemonName: pokemon.nameJa,
        imageUrl: pokemon.imageUrl ?? pokemon.fallbackImageUrl,
        types: trainedPokemon.types,
        pokemon: trainedPokemon,
        moves: trainedPokemon.moves,
      },
    ];
  });
}

export default function TypeChecker() {
  const pokemonCatalog = useDamageCalculatorCatalogStore(
    (state) => state.pokemonCatalog,
  );
  const heldItems = useDamageCalculatorCatalogStore((state) => state.heldItems);
  const typeEffectivenessSource = useDamageCalculatorCatalogStore(
    (state) => state.typeEffectivenessSource,
  );
  const catalogStatus = useDamageCalculatorCatalogStore((state) => state.status);
  const ensureCatalogLoaded = useDamageCalculatorCatalogStore(
    (state) => state.ensureLoaded,
  );
  const [teams, setTeams] = useState<BattleTeam[]>([]);
  const [builds, setBuilds] = useState<TrainingBuild[]>([]);
  const [natures, setNatures] = useState<
    Awaited<ReturnType<typeof getNatures>>
  >([]);
  const [typeMatchups, setTypeMatchups] = useState<TypeMatchup[]>([]);
  const [rankingsByFormat, setRankingsByFormat] = useState<
    Record<TypeCheckerBattleFormat, RankedPokemon[]>
  >({ single: [], double: [] });
  const [battleFormat, setBattleFormat] =
    useState<TypeCheckerBattleFormat>("single");
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await ensureCatalogLoaded();
        const [
          loadedTeams,
          loadedBuilds,
          loadedNatures,
          loadedMatchups,
          singleRankings,
          doubleRankings,
        ] = await Promise.all([
          getAllBattleTeams(),
          getAllTrainingBuilds(),
          getNatures(),
          getTypeMatchups(),
          getTopRankedPokemon("single"),
          getTopRankedPokemon("double"),
        ]);
        if (!active) return;
        setTeams(loadedTeams);
        setBuilds(loadedBuilds);
        setNatures(loadedNatures);
        setTypeMatchups(loadedMatchups);
        setRankingsByFormat({
          single: singleRankings,
          double: doubleRankings,
        });
        setSelectedTeamId((current) =>
          loadedTeams.some((team) => team.id === current)
            ? current
            : (loadedTeams[0]?.id ?? null),
        );
        setError("");
      } catch (cause) {
        console.error("タイプチェッカーのデータを読み込めませんでした。", cause);
        if (active) setError("タイプチェッカーのデータを読み込めませんでした。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, load);
    };
  }, [ensureCatalogLoaded]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const members = useMemo(
    () =>
      prepareMembers(
        selectedTeam,
        builds,
        pokemonCatalog,
        natures,
        heldItems,
      ),
    [builds, heldItems, natures, pokemonCatalog, selectedTeam],
  );
  const sharedWeaknesses = useMemo(
    () => findSharedWeaknesses(members, typeMatchups),
    [members, typeMatchups],
  );
  const candidatesByBuildId = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.buildId,
          getKnockoutCandidates(
            member,
            rankingsByFormat[battleFormat],
            pokemonCatalog,
            typeEffectivenessSource,
          ),
        ]),
      ),
    [
      battleFormat,
      members,
      pokemonCatalog,
      rankingsByFormat,
      typeEffectivenessSource,
    ],
  );
  const teamWalls = useMemo(() => {
    const resultsByFormId = new Map<number, KnockoutCandidate[]>();
    for (const candidates of candidatesByBuildId.values()) {
      for (const candidate of candidates) {
        const current = resultsByFormId.get(candidate.defender.id) ?? [];
        current.push(candidate);
        resultsByFormId.set(candidate.defender.id, current);
      }
    }
    return rankingsByFormat[battleFormat].flatMap((ranking) => {
      const results = resultsByFormId.get(ranking.formId) ?? [];
      if (
        results.some(
          (candidate) =>
            candidate.turnOrder === "先攻" &&
            candidate.result.minimumPercent >= 50,
        )
      ) {
        return [];
      }
      const representative = results[0];
      return representative ? [representative] : [];
    });
  }, [battleFormat, candidatesByBuildId, rankingsByFormat]);

  if (loading || catalogStatus === "loading") {
    return <p className={styles.status}>ローカルDBを読み込み中…</p>;
  }
  if (error) return <p className={styles.status}>{error}</p>;

  return (
    <div className={styles.content}>
      <section className={styles.teamSelector}>
        <div>
          <label htmlFor="type-checker-team">バトルチーム</label>
          <select
            id="type-checker-team"
            value={selectedTeamId ?? ""}
            onChange={(event) => setSelectedTeamId(Number(event.target.value))}
          >
            {teams.length === 0 ? (
              <option value="">チームがありません</option>
            ) : null}
            {teams.map((team) => (
              <option value={team.id} key={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="type-checker-format">採用率ランキング</label>
          <select
            id="type-checker-format"
            value={battleFormat}
            onChange={(event) =>
              setBattleFormat(event.target.value as TypeCheckerBattleFormat)
            }
          >
            <option value="single">シングル</option>
            <option value="double">ダブル</option>
          </select>
        </div>
      </section>

      {members.length === 0 ? (
        <p className={styles.empty}>
          ポケモンを登録したバトルチームを作成すると相性を確認できます。
        </p>
      ) : (
        <>
          <div className={styles.legend} aria-label="相性記号">
            {(
              Object.entries(MULTIPLIER_DISPLAY) as Array<
                [string, { symbol: string; label: string }]
              >
            ).map(([multiplier, display]) => (
              <span key={multiplier}>
                <strong>{display.symbol}</strong>
                {display.label}
              </span>
            ))}
          </div>

          {sharedWeaknesses.length > 0 ? (
            <aside className={styles.warnings}>
              {sharedWeaknesses.map((weakness) => (
                <p key={weakness.typeName}>
                  <strong>{weakness.nameJa}タイプが一貫しています</strong>
                  <span>（{weakness.count}体が弱点）</span>
                </p>
              ))}
            </aside>
          ) : (
            <p className={styles.noWarning}>3体以上に一貫する弱点はありません。</p>
          )}

          <Matrix
            title="防御相性"
            description="縦軸が防御側のポケモン、横軸が攻撃側の技タイプです。"
            members={members}
            typeMatchups={typeMatchups}
            mode="defense"
          />
          <Matrix
            title="攻撃技の通り"
            description="縦軸のポケモンが覚えている攻撃技から、横軸の防御タイプへ最も効果の高い技を表示します。"
            members={members}
            typeMatchups={typeMatchups}
            mode="offense"
          />
          <section className={styles.memberDetails}>
            <div className={styles.memberDetailsHeading}>
              <h2>ポケモン別の技とダメージ</h2>
              <p>
                保存済み育成案の実数値・特性・持ち物を使い、ダメージ計算ページと同じロジックで計算します。
              </p>
            </div>
            {members.map((member) => (
              <PokemonDetail
                key={member.buildId}
                member={member}
                typeMatchups={typeMatchups}
                candidates={candidatesByBuildId.get(member.buildId) ?? []}
              />
            ))}
          </section>
          <section className={`${styles.panel} ${styles.teamWalls}`}>
            <div className={styles.panelHeading}>
              <h2>チームで先攻して確定2発にできないポケモン</h2>
              <p>
                チーム内に、相手より速く、最大打点の最低ダメージが50%以上になるポケモンがいない相手です。
              </p>
            </div>
            {teamWalls.length > 0 ? (
              <div className={styles.teamWallList}>
                {teamWalls.map(({ rank, defender }) => (
                  <article key={defender.id}>
                    {defender.imageUrl ?? defender.fallbackImageUrl ? (
                      <Image
                        src={(defender.imageUrl ??
                          defender.fallbackImageUrl) as string}
                        alt={defender.nameJa}
                        width={40}
                        height={40}
                        unoptimized
                      />
                    ) : null}
                    <strong>
                      {rank}位 {defender.nameJa}
                    </strong>
                    <span>
                      {STAT_IDS.map(
                        (statId) =>
                          `${BASE_STAT_LABELS[statId]} ${defender.actualStats?.[statId] ?? "—"}`,
                      ).join(" / ")}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyInline}>
                採用率上位30位と該当するメガシンカすべてを、チーム内の誰かが先攻して確定2発以内にできます。
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
