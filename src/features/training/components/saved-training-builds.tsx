"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  normalizePokemonSearchText,
  pokemonNameIncludes,
} from "@/domain/pokemon-name-search";
import {
  deleteBattleTeam,
  getAllTrainingBuilds,
  getAllBattleTeams,
  saveBattleTeam,
  validateBattleTeamBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "../infrastructure/training-build-repository";
import type {
  HeldItem,
  TrainingPokemon,
} from "../infrastructure/training-repository";
import styles from "../styles/saved-training-builds.module.css";

export function SavedTrainingBuilds({
  query,
  pokemonCatalog,
  heldItems,
  teamBuilder = false,
  showEmptyState = false,
}: {
  query: string;
  pokemonCatalog: TrainingPokemon[];
  heldItems: HeldItem[];
  teamBuilder?: boolean;
  showEmptyState?: boolean;
}) {
  const [builds, setBuilds] = useState<TrainingBuild[]>([]);
  const [teams, setTeams] = useState<BattleTeam[]>([]);
  const [selectedBuildIds, setSelectedBuildIds] = useState<Set<number>>(
    new Set(),
  );
  const [teamName, setTeamName] = useState("");
  const [teamError, setTeamError] = useState("");
  const [teamSaved, setTeamSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const pokemonById = useMemo(
    () => new Map(pokemonCatalog.map((pokemon) => [pokemon.id, pokemon])),
    [pokemonCatalog],
  );
  const itemNameById = useMemo(
    () => new Map(heldItems.map((item) => [item.id, item.name])),
    [heldItems],
  );
  const buildById = useMemo(
    () =>
      new Map(
        builds.flatMap((build) =>
          build.id === undefined ? [] : [[build.id, build] as const],
        ),
      ),
    [builds],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([getAllTrainingBuilds(), getAllBattleTeams()])
      .then(([savedBuilds, savedTeams]) => {
        if (!active) return;
        setBuilds(savedBuilds);
        setTeams(savedTeams);
      })
      .catch((error: unknown) => {
        console.error("保存した育成案を読み込めませんでした。", error);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function toggleBuild(build: TrainingBuild) {
    if (build.id === undefined) return;
    setTeamError("");
    setTeamSaved(false);
    setSelectedBuildIds((current) => {
      const next = new Set(current);
      if (next.has(build.id!)) {
        next.delete(build.id!);
        return next;
      }
      const nextBuilds = [...next]
        .map((id) => buildById.get(id))
        .filter((item): item is TrainingBuild => Boolean(item));
      try {
        validateBattleTeamBuilds([...nextBuilds, build]);
      } catch (error: unknown) {
        setTeamError(
          error instanceof Error ? error.message : "育成案を追加できません。",
        );
        return current;
      }
      next.add(build.id!);
      return next;
    });
  }

  async function createTeam() {
    setTeamError("");
    setTeamSaved(false);
    try {
      await saveBattleTeam(teamName, [...selectedBuildIds]);
      setTeams(await getAllBattleTeams());
      setSelectedBuildIds(new Set());
      setTeamName("");
      setTeamSaved(true);
    } catch (error: unknown) {
      setTeamError(
        error instanceof Error ? error.message : "チームを保存できませんでした。",
      );
    }
  }

  async function removeTeam(id: number) {
    await deleteBattleTeam(id);
    setTeams(await getAllBattleTeams());
  }

  const normalizedQuery = normalizePokemonSearchText(query.trim());
  const filteredBuilds = builds.filter((build) => {
    if (!normalizedQuery) return true;
    const pokemon = pokemonById.get(build.pokemonId);
    return (
      pokemonNameIncludes(build.name, normalizedQuery) ||
      pokemonNameIncludes(pokemon?.name ?? "", normalizedQuery) ||
      pokemonNameIncludes(pokemon?.nameJa ?? "", normalizedQuery)
    );
  });

  if (!loaded) return null;
  if (builds.length === 0) {
    return teamBuilder || showEmptyState ? (
      <section className={styles.savedSection}>
        <div className={styles.savedHeader}>
          <div>
            <p>{teamBuilder ? "BATTLE TEAMS" : "SAVED BUILDS"}</p>
            <h1>
              {teamBuilder ? "バトルチーム編成" : "保存した育成案"}
            </h1>
          </div>
        </div>
        <p className={styles.empty}>
          保存した育成案はまだありません。育成シミュレーターで育成案を作成してください。
        </p>
        <Link className={styles.trainingLink} href="/training">
          育成シミュレーターへ
        </Link>
      </section>
    ) : null;
  }

  return (
    <section className={styles.savedSection} aria-labelledby="saved-builds-title">
      <div className={styles.savedHeader}>
        <div>
          <p>{teamBuilder ? "BATTLE TEAMS" : "SAVED BUILDS"}</p>
          {teamBuilder ? (
            <h1 id="saved-builds-title">バトルチーム編成</h1>
          ) : (
            <h2 id="saved-builds-title">保存した育成案</h2>
          )}
        </div>
        <span>{filteredBuilds.length}件</span>
      </div>
      {teamBuilder && teams.length > 0 ? (
        <div className={styles.teamList}>
          {teams.map((team) => (
            <article className={styles.teamCard} key={team.id}>
              <div className={styles.teamCardHeader}>
                <strong>{team.name}</strong>
                <button
                  type="button"
                  onClick={() => team.id !== undefined && void removeTeam(team.id)}
                >
                  削除
                </button>
              </div>
              <div className={styles.teamMembers}>
                {team.buildIds.map((buildId) => {
                  const build = buildById.get(buildId);
                  const pokemon = build
                    ? pokemonById.get(build.pokemonId)
                    : undefined;
                  return (
                    <span key={buildId}>
                      {pokemon?.imageUrl ? (
                        <Image
                          src={pokemon.imageUrl}
                          alt=""
                          width={42}
                          height={42}
                        />
                      ) : null}
                      <small>{build?.name ?? "削除済みの育成案"}</small>
                    </span>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {teamBuilder ? (
        <div className={styles.teamBuilder}>
          <div>
            <strong>バトルチームを作る</strong>
            <small>
              育成案を最大6体選択。同じポケモン・持ち物は登録できません。
            </small>
          </div>
          <span>{selectedBuildIds.size} / 6</span>
          <input
            aria-label="チーム名"
            maxLength={80}
            placeholder="チーム名"
            value={teamName}
            onChange={(event) => {
              setTeamName(event.target.value);
              setTeamError("");
              setTeamSaved(false);
            }}
          />
          <button
            type="button"
            disabled={selectedBuildIds.size === 0}
            onClick={() => void createTeam()}
          >
            チームを保存
          </button>
          {teamError ? <p role="alert">{teamError}</p> : null}
          {teamSaved ? <p className={styles.success}>保存しました。</p> : null}
        </div>
      ) : null}
      {filteredBuilds.length === 0 ? (
        <p className={styles.empty}>検索に一致する保存済み育成案はありません。</p>
      ) : (
        <div className={styles.savedGrid}>
          {filteredBuilds.map((build) => {
            const pokemon = pokemonById.get(build.pokemonId);
            return (
              <article
                className={`${styles.savedCard} ${
                  build.id !== undefined && selectedBuildIds.has(build.id)
                    ? styles.selectedCard
                    : ""
                }`}
                key={build.id}
              >
                {teamBuilder ? (
                  <label className={styles.buildSelector}>
                    <input
                      type="checkbox"
                      checked={
                        build.id !== undefined && selectedBuildIds.has(build.id)
                      }
                      onChange={() => toggleBuild(build)}
                    />
                    <span>チームに追加</span>
                  </label>
                ) : null}
                <Link href={`/training/${build.pokemonId}?build=${build.id}`}>
                  {pokemon?.imageUrl ? (
                    <Image
                      src={pokemon.imageUrl}
                      alt=""
                      width={72}
                      height={72}
                    />
                  ) : null}
                  <span>
                    <strong>{build.name}</strong>
                    <small>
                      {pokemon?.nameJa ?? `ポケモン #${build.pokemonId}`}
                    </small>
                    <small>
                      {build.itemId
                        ? (itemNameById.get(build.itemId) ?? build.itemId)
                        : "持ち物なし"}
                    </small>
                  </span>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
