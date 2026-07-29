"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import type { TypeMatchup, TypeName } from "@/domain/type-matchup";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  getPracticeMemberCatalog,
  type PracticeMemberCatalog,
} from "@/features/quiz/infrastructure/practice-quiz-repository";
import type { PracticeMove } from "@/features/quiz/practice-quiz-logic";
import { getTypeMatchups } from "@/features/quiz/infrastructure/quiz-catalog-repository";
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
  moves: PracticeMove[];
};

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

function prepareMembers(
  team: BattleTeam | undefined,
  builds: TrainingBuild[],
  catalog: PracticeMemberCatalog,
) {
  if (!team) return [];
  const buildsById = new Map(
    builds.flatMap((build) =>
      build.id === undefined ? [] : ([[build.id, build]] as const),
    ),
  );
  return team.buildIds.flatMap((buildId): TeamMember[] => {
    const build = buildsById.get(buildId);
    const pokemon = build
      ? catalog.pokemonByFormId.get(build.pokemonId)
      : undefined;
    if (!build || !pokemon) return [];
    const selectedMoveIds = new Set(build.moveIds);
    return [
      {
        buildId,
        buildName: build.name,
        pokemonName: pokemon.nameJa,
        imageUrl: pokemon.imageUrl,
        types: pokemon.types,
        moves: (catalog.movesByFormId.get(build.pokemonId) ?? []).filter(
          (move) => selectedMoveIds.has(move.id),
        ),
      },
    ];
  });
}

export default function TypeChecker() {
  const [teams, setTeams] = useState<BattleTeam[]>([]);
  const [builds, setBuilds] = useState<TrainingBuild[]>([]);
  const [catalog, setCatalog] = useState<PracticeMemberCatalog>({
    pokemonByFormId: new Map(),
    movesByFormId: new Map(),
  });
  const [typeMatchups, setTypeMatchups] = useState<TypeMatchup[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [loadedTeams, loadedBuilds, loadedMatchups] = await Promise.all([
          getAllBattleTeams(),
          getAllTrainingBuilds(),
          getTypeMatchups(),
        ]);
        const loadedCatalog = await getPracticeMemberCatalog(
          loadedBuilds.map((build) => build.pokemonId),
        );
        if (!active) return;
        setTeams(loadedTeams);
        setBuilds(loadedBuilds);
        setCatalog(loadedCatalog);
        setTypeMatchups(loadedMatchups);
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
  }, []);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const members = useMemo(
    () => prepareMembers(selectedTeam, builds, catalog),
    [builds, catalog, selectedTeam],
  );
  const sharedWeaknesses = useMemo(
    () => findSharedWeaknesses(members, typeMatchups),
    [members, typeMatchups],
  );

  if (loading) return <p className={styles.status}>ローカルDBを読み込み中…</p>;
  if (error) return <p className={styles.status}>{error}</p>;

  return (
    <div className={styles.content}>
      <section className={styles.teamSelector}>
        <label htmlFor="type-checker-team">バトルチーム</label>
        <select
          id="type-checker-team"
          value={selectedTeamId ?? ""}
          onChange={(event) => setSelectedTeamId(Number(event.target.value))}
        >
          {teams.length === 0 ? <option value="">チームがありません</option> : null}
          {teams.map((team) => (
            <option value={team.id} key={team.id}>
              {team.name}
            </option>
          ))}
        </select>
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
        </>
      )}
    </div>
  );
}
