"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  USER_RECORDS_LOCAL_CHANGED_EVENT,
  USER_RECORDS_SYNCED_EVENT,
} from "@/components/sync/user-database-sync";
import {
  normalizePokemonSearchText,
  pokemonNameIncludes,
} from "@/domain/pokemon-name-search";
import {
  getPokemonDetail,
  type PokemonDetail,
} from "@/infrastructure/database/pokemon-search-repository";
import { getTypeBadgeStyle } from "@/presentation/pokemon-type-colors";
import {
  deleteBattleTeam,
  deleteTrainingBuild,
  getAllTrainingBuilds,
  getAllBattleTeams,
  saveBattleTeam,
  updateBattleTeam,
  updateBattleTeamMemo,
  validateBattleTeamBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "../infrastructure/training-build-repository";
import type {
  HeldItem,
  TrainingPokemon,
} from "../infrastructure/training-catalog-repository";
import {
  getHeldItems,
  getTrainingPokemonCatalog,
} from "../infrastructure/training-catalog-repository";
import styles from "../styles/saved-training-builds.module.css";

/**
 * 保存済み育成案の一覧と、必要に応じたバトルチーム編成UI。
 * user.dbの育成案/チームと、catalog.dbのポケモン名/持ち物名を結合して表示する。
 */
export function SavedTrainingBuilds({
  query,
  pokemonCatalog: initialPokemonCatalog,
  heldItems: initialHeldItems,
  teamBuilder = false,
  teamMode = "list",
  editingTeamId: initialEditingTeamId,
  showEmptyState = false,
}: {
  /** 一覧をポケモン名・育成案名で絞り込む検索語。 */
  query: string;
  /** Server Componentで先読み済みのChampions対象ポケモン一覧。未指定ならClient側で読む。 */
  pokemonCatalog?: TrainingPokemon[];
  /** Server Componentで先読み済みの持ち物一覧。未指定ならClient側で読む。 */
  heldItems?: HeldItem[];
  /** trueなら育成案を選択してチーム保存できるUIも表示する。 */
  teamBuilder?: boolean;
  /** バトルチーム画面で表示する一覧/新規/編集モード。 */
  teamMode?: "list" | "create" | "edit";
  /** 編集対象のバトルチームID。 */
  editingTeamId?: number;
  /** trueなら育成案が0件でも空状態セクションを表示する。 */
  showEmptyState?: boolean;
}) {
  const router = useRouter();
  const [builds, setBuilds] = useState<TrainingBuild[]>([]);
  const [teams, setTeams] = useState<BattleTeam[]>([]);
  const [pokemonCatalog, setPokemonCatalog] = useState<TrainingPokemon[]>(
    initialPokemonCatalog ?? [],
  );
  const [heldItems, setHeldItems] = useState<HeldItem[]>(
    initialHeldItems ?? [],
  );
  const [selectedBuildIds, setSelectedBuildIds] = useState<Set<number>>(
    new Set(),
  );
  const [teamName, setTeamName] = useState("");
  const [teamError, setTeamError] = useState("");
  const [teamSaved, setTeamSaved] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<number | undefined>(
    initialEditingTeamId,
  );
  const [loaded, setLoaded] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(
    initialPokemonCatalog !== undefined && initialHeldItems !== undefined,
  );
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoOriginal, setMemoOriginal] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const [teamPokemonDetails, setTeamPokemonDetails] = useState<
    Map<number, PokemonDetail>
  >(new Map());
  const pokemonById = useMemo(
    () => new Map(pokemonCatalog.map((pokemon) => [pokemon.id, pokemon])),
    [pokemonCatalog],
  );
  const itemNameById = useMemo(
    () => new Map(heldItems.map((item) => [item.id, item.name])),
    [heldItems],
  );
  const loadSavedData = useCallback(
    async (active = true) => {
      const [savedBuilds, savedTeams] = await Promise.all([
        getAllTrainingBuilds(),
        teamBuilder ? getAllBattleTeams() : Promise.resolve([]),
      ]);
      if (!active) return;
      setBuilds(savedBuilds);
      if (teamBuilder) {
        setTeams(savedTeams);
        if (teamMode === "edit") {
          const editingTeam = savedTeams.find(
            (team) => team.id === initialEditingTeamId,
          );
          if (!editingTeam) {
            setTeamError("編集するバトルチームが見つかりませんでした。");
            return;
          }
          setTeamName(editingTeam.name);
          setMemoDraft(editingTeam.memo);
          setMemoOriginal(editingTeam.memo);
          setSelectedBuildIds(new Set(editingTeam.buildIds));
          setEditingTeamId(editingTeam.id);
        }
      }
    },
    [initialEditingTeamId, teamBuilder, teamMode],
  );

  // 一覧表示に必要なカタログ名は、未指定の場合だけcatalog.dbから後読みする。
  useEffect(() => {
    if (initialPokemonCatalog && initialHeldItems) return;
    let active = true;
    void Promise.all([getTrainingPokemonCatalog(), getHeldItems()])
      .then(([catalog, items]) => {
        if (!active) return;
        setPokemonCatalog(catalog);
        setHeldItems(items);
        setCatalogLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("catalog.dbから育成カタログを読み込めませんでした。", error);
        if (active) {
          setLoadError("育成カタログを読み込めませんでした。");
        }
      });
    return () => {
      active = false;
    };
  }, [initialHeldItems, initialPokemonCatalog]);
  const buildById = useMemo(
    () =>
      new Map(
        builds.flatMap((build) =>
          build.id === undefined ? [] : [[build.id, build] as const],
        ),
      ),
    [builds],
  );

  // user.dbに保存済みの育成案を初回表示時に読み込む。
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadSavedData(active)
        .catch((error: unknown) => {
          console.error("保存した育成案/チームを読み込めませんでした。", error);
          if (active) {
            setLoadError("保存した育成案/チームを読み込めませんでした。");
          }
        })
        .finally(() => {
          if (active) setLoaded(true);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadSavedData]);

  useEffect(() => {
    if (teamMode !== "edit" || selectedBuildIds.size === 0) return;
    let active = true;
    const pokemonIds = [
      ...new Set(
        [...selectedBuildIds]
          .map((buildId) => buildById.get(buildId)?.pokemonId)
          .filter((pokemonId): pokemonId is number => pokemonId !== undefined),
      ),
    ];
    void Promise.all(pokemonIds.map((pokemonId) => getPokemonDetail(pokemonId)))
      .then((details) => {
        if (!active) return;
        setTeamPokemonDetails(
          new Map(
            details.flatMap((detail) =>
              detail ? [[detail.id, detail] as const] : [],
            ),
          ),
        );
      })
      .catch((error: unknown) => {
        console.error("チームメモ用のポケモン情報を読み込めませんでした。", error);
      });
    return () => {
      active = false;
    };
  }, [buildById, selectedBuildIds, teamMode]);

  useEffect(() => {
    let active = true;
    const handleSynced = () => {
      void loadSavedData(active).catch((error: unknown) => {
        console.error("同期後の保存データを読み込めませんでした。", error);
        if (active) setLoadError("同期後の保存データを読み込めませんでした。");
      });
    };
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    return () => {
      active = false;
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    };
  }, [loadSavedData]);

  function resetTeamForm() {
    setSelectedBuildIds(new Set());
    setTeamName("");
    setTeamError("");
    setTeamSaved(false);
    setEditingTeamId(undefined);
  }

  function showTeamList() {
    resetTeamForm();
    router.push("/battle-team");
  }

  /** チームへ育成案を追加/解除する。追加時は重複ポケモン・重複持ち物を検証する。 */
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

  /** 選択中の育成案IDからバトルチームを保存し、一覧を再取得する。 */
  async function persistTeam() {
    setTeamError("");
    setTeamSaved(false);
    try {
      if (editingTeamId === undefined) {
        await saveBattleTeam(teamName, [...selectedBuildIds]);
      } else {
        await updateBattleTeam(editingTeamId, teamName, [...selectedBuildIds]);
      }
      const nextTeams = await getAllBattleTeams();
      setTeams(nextTeams);
      setTeamSaved(true);
      router.push("/battle-team");
    } catch (error: unknown) {
      setTeamError(
        error instanceof Error ? error.message : "チームを保存できませんでした。",
      );
    }
  }

  /** チームを削除し、削除後の一覧をuser.dbから読み直す。 */
  async function removeTeam(id: number) {
    await deleteBattleTeam(id);
    const nextTeams = await getAllBattleTeams();
    setTeams(nextTeams);
    if (editingTeamId === id) showTeamList();
  }

  async function removeBuild(id: number) {
    if (!window.confirm("この育成案を削除しますか？")) return;
    setActionError("");
    try {
      await deleteTrainingBuild(id);
      setSelectedBuildIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      await loadSavedData();
      window.dispatchEvent(new CustomEvent(USER_RECORDS_LOCAL_CHANGED_EVENT));
    } catch (error: unknown) {
      console.error("Failed to delete training build.", error);
      setActionError("育成案を削除できませんでした。");
    }
  }

  async function closeTeamMemo() {
    if (memoSaving) return;
    if (editingTeamId === undefined || memoDraft === memoOriginal) {
      setMemoOpen(false);
      return;
    }
    setMemoSaving(true);
    setActionError("");
    try {
      await updateBattleTeamMemo(editingTeamId, memoDraft);
      setMemoOriginal(memoDraft);
      setTeams((current) =>
        current.map((team) =>
          team.id === editingTeamId
            ? { ...team, memo: memoDraft, updatedAt: Date.now() }
            : team,
        ),
      );
      window.dispatchEvent(new CustomEvent(USER_RECORDS_LOCAL_CHANGED_EVENT));
      setMemoOpen(false);
    } catch (error: unknown) {
      console.error("バトルチームのメモを保存できませんでした。", error);
      setActionError("メモを保存できませんでした。");
    } finally {
      setMemoSaving(false);
    }
  }

  // 表示上の検索はDBへ再問い合わせせず、読み込み済みの育成案とカタログ名で絞り込む。
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
  const teamListVisible = teamBuilder && teamMode === "list";
  const teamFormVisible =
    teamBuilder && (teamMode === "create" || teamMode === "edit");
  const headerCount = teamBuilder ? teams.length : filteredBuilds.length;

  if (loadError) {
    return (
      <section className={styles.savedSection}>
        <p className={styles.loadError} role="alert">
          {loadError}
        </p>
      </section>
    );
  }
  if (!loaded || !catalogLoaded) return null;
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
        <span>{headerCount}件</span>
      </div>
      {actionError ? (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      ) : null}
      {teamListVisible ? (
        <>
          <div className={styles.teamActions}>
            <Link href="/battle-team/new">
              バトルチーム追加
            </Link>
          </div>
          {teams.length === 0 ? (
            <p className={styles.empty}>保存したバトルチームはありません。</p>
          ) : (
            <div className={styles.teamList}>
              {teams.map((team) => (
                <article className={styles.teamCard} key={team.id}>
                  <Link
                    className={styles.teamCardLink}
                    href={`/battle-team/${team.id}`}
                    aria-label={`${team.name}を編集`}
                  />
                  <div className={styles.teamCardHeader}>
                    <strong>{team.name}</strong>
                    <button
                      className={styles.teamDeleteButton}
                      type="button"
                      onClick={() =>
                        team.id !== undefined && void removeTeam(team.id)
                      }
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
          )}
        </>
      ) : null}
      {teamFormVisible ? (
        <div className={styles.teamBuilder}>
          <div>
            <strong>
              {editingTeamId === undefined
                ? "バトルチームを作る"
                : "バトルチームを編集"}
            </strong>
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
            onClick={() => void persistTeam()}
          >
            チームを保存
          </button>
          {editingTeamId !== undefined ? (
            <button
              className={styles.memoButton}
              type="button"
              onClick={() => setMemoOpen(true)}
            >
              メモ
            </button>
          ) : null}
          {teams.length > 0 ? (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={showTeamList}
            >
              一覧に戻る
            </button>
          ) : null}
          {teamError ? <p role="alert">{teamError}</p> : null}
          {teamSaved ? <p className={styles.success}>保存しました。</p> : null}
        </div>
      ) : null}
      {!teamBuilder && filteredBuilds.length === 0 ? (
        <p className={styles.empty}>検索に一致する保存済み育成案はありません。</p>
      ) : !teamBuilder || teamFormVisible ? (
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
                {!teamBuilder && build.id !== undefined ? (
                  <button
                    className={styles.buildDeleteButton}
                    type="button"
                    onClick={() => void removeBuild(build.id!)}
                  >
                    削除
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
      {memoOpen && editingTeamId !== undefined ? (
        <div className={styles.teamMemoOverlay}>
          <button
            className={styles.teamMemoBackdrop}
            type="button"
            aria-label="メモを閉じる"
            onClick={() => void closeTeamMemo()}
          />
          <section
            className={styles.teamMemoDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-memo-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") void closeTeamMemo();
            }}
          >
            <header>
              <div>
                <small>BATTLE TEAM MEMO</small>
                <h2 id="team-memo-title">{teamName}</h2>
              </div>
              <button
                type="button"
                aria-label="メモを閉じて保存"
                disabled={memoSaving}
                onClick={() => void closeTeamMemo()}
              >
                ×
              </button>
            </header>
            <div className={styles.teamMemoMembers}>
              {[...selectedBuildIds].map((buildId) => {
                const build = buildById.get(buildId);
                const detail = build
                  ? teamPokemonDetails.get(build.pokemonId)
                  : undefined;
                const ability = detail?.abilities.find(
                  (candidate) => candidate.id === build?.abilityId,
                );
                const moves =
                  build?.moveIds
                    .filter(Boolean)
                    .map(
                      (moveId) =>
                        detail?.moves.find((move) => move.id === moveId)?.name ??
                        moveId,
                    ) ?? [];
                return (
                  <article key={buildId}>
                    <strong>{detail?.nameJa ?? build?.name ?? "読込中"}</strong>
                    <span className={styles.teamMemoTypes}>
                      {detail?.types.map((typeName, index) => (
                        <small
                          key={typeName}
                          style={getTypeBadgeStyle(typeName)}
                        >
                          {detail.typeNamesJa[index] ?? typeName}
                        </small>
                      ))}
                    </span>
                    <p>特性: {ability?.name ?? "特性なし"}</p>
                    <p>技: {moves.length > 0 ? moves.join(" / ") : "未設定"}</p>
                  </article>
                );
              })}
            </div>
            <label className={styles.teamMemoField}>
              チームメモ
              <textarea
                autoFocus
                maxLength={5000}
                placeholder="立ち回り、選出、注意点など"
                value={memoDraft}
                onChange={(event) => setMemoDraft(event.target.value)}
              />
            </label>
            <p className={styles.teamMemoHint}>
              {memoSaving
                ? "保存中…"
                : "この画面を閉じると自動でuser.dbへ保存されます。"}
            </p>
          </section>
        </div>
      ) : null}
    </section>
  );
}
