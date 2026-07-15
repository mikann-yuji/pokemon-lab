"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import { getPokemonCardStyle } from "@/presentation/pokemon-type-colors";
import {
  createTrainingBuildContentKey,
  deleteTrainingMatchupNote,
  findTrainingBuildByContentKey,
  getAllTrainingBuilds,
  getTrainingMatchupNotes,
  loadLatestTrainingBuild,
  loadTrainingBuild,
  saveTrainingMatchupNote,
  saveTrainingBuild,
  type TrainingMatchupKind,
  type TrainingMatchupNote,
} from "../infrastructure/training-build-repository";
import type {
  HeldItem,
  Nature,
  TrainingPokemonStatProfile,
} from "../infrastructure/training-catalog-repository";
import styles from "../styles/training-simulator.module.css";
import {
  NatureMatrixOverlay,
} from "./training-nature-matrix-overlay";
import { TrainingMatchupSection } from "./training-matchup-section";
import { TrainingMovesSection } from "./training-moves-section";
import { TrainingSettingsSection } from "./training-settings-section";
import {
  STAT_IDS,
  calculateActualStat,
  compareMoveUsageRate,
  createMatchupSearchOptions,
  initialStats,
  rankCurrentValue,
  type MatchupSearchOption,
  type StatRankingRow,
} from "./training-simulator-model";
import { TrainingSaveDialog } from "./training-save-dialog";
import { TrainingStatEditor } from "./training-stat-editor";
import { TrainingToast, type TrainingToastState } from "./training-toast";
import {
  useTrainingBuildList,
  useTrainingCatalogOptions,
} from "./use-training-simulator-data";

/**
 * Pokémon Champions向けの育成案編集画面。
 * 種族値、性格、能力ポイント、持ち物、技構成を編集し、user.dbへ保存する。
 */
export function TrainingSimulator({
  pokemon,
  statProfiles,
  natures: initialNatures,
  heldItems: initialHeldItems,
  initialBuildId,
}: {
  /** 詳細ページや一覧から渡される、育成対象のポケモン詳細。 */
  pokemon: PokemonDetail;
  /** Champions登場ポケモン全体の順位計算に使うステータス一覧。 */
  statProfiles: TrainingPokemonStatProfile[];
  /** Server Componentで先読み済みなら渡される性格一覧。未指定ならブラウザ側でcatalog.dbから読む。 */
  natures?: Nature[];
  /** Server Componentで先読み済みなら渡される持ち物一覧。未指定ならブラウザ側でcatalog.dbから読む。 */
  heldItems?: HeldItem[];
  /** 保存済み育成案ページから開いた場合に復元するbuild ID。 */
  initialBuildId?: number;
}) {
  const { catalogError, heldItems, natures } = useTrainingCatalogOptions({
    initialHeldItems,
    initialNatures,
  });
  const [nature, setNature] = useState("serious");
  const [abilityPoints, setAbilityPoints] = useState<Record<string, number>>(
    () => initialStats(0),
  );
  const [moveIds, setMoveIds] = useState<string[]>(["", "", "", ""]);
  const [itemId, setItemId] = useState("");
  const [abilityId, setAbilityId] = useState("");
  const [saved, setSaved] = useState(false);
  const [isNatureMatrixOpen, setNatureMatrixOpen] = useState(false);
  const [rankingStatId, setRankingStatId] = useState<string | null>(null);
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [buildName, setBuildName] = useState("");
  const [savedBuildName, setSavedBuildName] = useState<string | null>(null);
  const [activeBuildId, setActiveBuildId] = useState<number | null>(
    initialBuildId ?? null,
  );
  const [matchupNotes, setMatchupNotes] = useState<TrainingMatchupNote[]>([]);
  const {
    matchupError,
    setMatchupError,
    setTrainingBuilds,
    trainingBuilds,
  } = useTrainingBuildList();
  const [matchupSavingKind, setMatchupSavingKind] =
    useState<TrainingMatchupKind | null>(null);
  const pendingMatchupNoteIdRef = useRef(-1);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<TrainingToastState>(null);

  // 保存完了/失敗の一時メッセージは短時間だけ表示する。
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  // URLで指定された育成案、または同じポケモンの最新育成案を画面状態へ復元する。
  useEffect(() => {
    if (natures.length === 0) return;
    let active = true;
    const buildPromise = initialBuildId
      ? loadTrainingBuild(initialBuildId)
      : loadLatestTrainingBuild(pokemon.id);
    void buildPromise.then((build) => {
      if (!active || !build) return;
      if (build.pokemonId !== pokemon.id) return;
      setNature(build.nature);
      setAbilityPoints(build.abilityPoints ?? initialStats(0));
      setMoveIds([...build.moveIds, "", "", "", ""].slice(0, 4));
      setItemId(build.itemId ?? "");
      setAbilityId(
        pokemon.abilities.some(({ id }) => id === build.abilityId)
          ? build.abilityId
          : "",
      );
      setBuildName(build.name ?? "");
      setSavedBuildName(build.name ?? "");
      setActiveBuildId(build.id ?? null);
    });
    return () => { active = false; };
  }, [initialBuildId, natures, pokemon.abilities, pokemon.id]);

  useEffect(() => {
    if (!activeBuildId) return;
    let active = true;
    void getTrainingMatchupNotes(activeBuildId)
      .then((notes) => {
        if (active) setMatchupNotes(notes);
      })
      .catch((error: unknown) => {
        console.error("相性メモを読み込めませんでした。", error);
        if (active) setMatchupError("相性メモを読み込めませんでした。");
      });
    return () => {
      active = false;
    };
  }, [activeBuildId, setMatchupError]);

  const selectedNature = natures.find(({ id }) => id === nature) ?? null;
  const hasNatureModifier = Boolean(
    selectedNature &&
      selectedNature.increasedStatId !== selectedNature.decreasedStatId,
  );
  const orderedStats = useMemo(
    () =>
      STAT_IDS.map((statId) =>
        pokemon.stats.find((stat) => stat.id === statId),
      ).filter((stat): stat is (typeof pokemon.stats)[number] =>
        Boolean(stat),
      ),
    [pokemon],
  );
  // ChampionsではLv.50・個体値31固定。能力ポイントは性格補正の内側へ直接加算する。
  const actualStats = useMemo(() => Object.fromEntries(
    orderedStats.map(({ id, baseStat }) => {
      const point = abilityPoints[id] ?? 0;
      const natureModifier =
        hasNatureModifier && selectedNature?.increasedStatId === id
          ? true
          : false;
      if (hasNatureModifier && selectedNature?.decreasedStatId === id) {
        const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
        return [id, Math.floor((base + 5 + point) * 0.9)];
      }
      return [id, calculateActualStat(baseStat, id, point, natureModifier)];
    }),
  ), [abilityPoints, hasNatureModifier, orderedStats, selectedNature]);
  const baseStatRanks = useMemo(
    () =>
      Object.fromEntries(
        STAT_IDS.map((statId) => {
          const currentBaseStat =
            pokemon.stats.find((stat) => stat.id === statId)?.baseStat ?? null;
          if (currentBaseStat === null) return [statId, null];
          return [
            statId,
            rankCurrentValue(
              statProfiles
                .map((profile) => profile.stats[statId])
                .filter((value): value is number => value !== undefined),
              currentBaseStat,
            ),
          ];
        }),
      ) as Record<string, number | null>,
    [pokemon.stats, statProfiles],
  );
  const selectedRankingStat = rankingStatId
    ? pokemon.stats.find((stat) => stat.id === rankingStatId) ?? null
    : null;
  const statRankingRows = useMemo<StatRankingRow[]>(() => {
    if (!rankingStatId) return [];
    return statProfiles
      .filter((profile) => profile.stats[rankingStatId] !== undefined)
      .map((profile) => {
        const baseStat = profile.stats[rankingStatId];
        return {
          profile,
          uninvested: calculateActualStat(baseStat, rankingStatId, 0, false),
          maximum: calculateActualStat(
            baseStat,
            rankingStatId,
            32,
            rankingStatId !== "hp",
          ),
        };
      });
  }, [rankingStatId, statProfiles]);
  const sortedMovesByUsage = useMemo(
    () => [...pokemon.moves].sort(compareMoveUsageRate),
    [pokemon.moves],
  );
  const matchupSearchOptions = useMemo(
    () => createMatchupSearchOptions(statProfiles, trainingBuilds),
    [statProfiles, trainingBuilds],
  );
  const pointTotal = Object.values(abilityPoints).reduce((sum, value) => sum + value, 0);

  /**
   * 能力ポイントを変更する。
   * 1能力32、合計66の上限をここで丸め、入力欄とスライダーのどちらから来ても同じ制約にする。
   */
  function changeAbilityPoint(id: string, requested: number) {
    const otherTotal = pointTotal - (abilityPoints[id] ?? 0);
    setAbilityPoints((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(32, 66 - otherTotal, requested || 0)),
    }));
    setSaved(false);
  }

  /** 保存ダイアログを開く前に、空の保存名へポケモン名ベースの初期値を入れる。 */
  function openSaveDialog() {
    setBuildName((current) => current.trim() || `${pokemon.nameJa}の育成案`);
    setSaveError("");
    setSaveDialogOpen(true);
  }

  /**
   * 編集中の育成案をuser.dbへ保存する。
   * 同じ内容の育成案が既にある場合は、ユーザー確認後にそのレコードを更新する。
   */
  async function save() {
    const normalizedName = buildName.trim();
    if (!normalizedName) {
      setSaveError("保存名を入力してください。");
      return;
    }
    const buildData = {
      pokemonId: pokemon.id,
      nature,
      itemId,
      abilityId,
      abilityPoints,
      moveIds,
    };
    const contentKey = createTrainingBuildContentKey(buildData);
    setToast(null);
    setIsSaving(true);
    try {
      const existing = await findTrainingBuildByContentKey(contentKey);
      if (
        existing &&
        !window.confirm(
          `同じ内容の「${existing.name}」が保存されています。上書きしますか？`,
        )
      ) {
        return;
      }

      const savedBuild = await saveTrainingBuild({
        ...buildData,
        id: existing?.id,
        name: normalizedName,
        contentKey,
        updatedAt: Date.now(),
      });
      const savedBuildId = savedBuild.id ?? null;
      if (savedBuildId) {
        const pendingMatchupNotes = matchupNotes.filter(
          (matchupNote) => (matchupNote.id ?? 0) < 0,
        );
        for (const pendingMatchupNote of pendingMatchupNotes) {
          await saveTrainingMatchupNote({
            sourceBuildId: savedBuildId,
            matchupKind: pendingMatchupNote.matchupKind,
            targetKind: pendingMatchupNote.targetKind,
            targetPokemonId: pendingMatchupNote.targetPokemonId,
            targetBuildId: pendingMatchupNote.targetBuildId,
            targetName: pendingMatchupNote.targetName,
            note: pendingMatchupNote.note,
          });
        }
        setMatchupNotes(await getTrainingMatchupNotes(savedBuildId));
      }
      setActiveBuildId(savedBuildId);
      setTrainingBuilds(await getAllTrainingBuilds());
      setSaved(true);
      setSavedBuildName(normalizedName);
      setSaveDialogOpen(false);
      setToast({ type: "success", message: "保存しました" });
    } catch (error: unknown) {
      console.error("育成案を保存できませんでした。", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "育成案を保存できませんでした。",
      );
      setToast({ type: "error", message: "保存に失敗しました" });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMatchup({
    matchupKind,
    target,
    note,
  }: {
    matchupKind: TrainingMatchupKind;
    target: MatchupSearchOption | null;
    note: string;
  }) {
    if (!target) {
      setMatchupError("対象ポケモンを選択してください。");
      return false;
    }
    const normalizedNote = note.trim();
    if (!normalizedNote) {
      setMatchupError("メモを入力してください。");
      return false;
    }

    setMatchupError("");
    setMatchupSavingKind(matchupKind);
    try {
      if (!activeBuildId) {
        const pendingId = pendingMatchupNoteIdRef.current;
        pendingMatchupNoteIdRef.current -= 1;
        setMatchupNotes((current) => [
          {
            id: pendingId,
            sourceBuildId: 0,
            matchupKind,
            targetKind: target.kind,
            targetPokemonId: target.pokemonId,
            targetBuildId: target.buildId,
            targetName: target.name,
            note: normalizedNote,
            updatedAt: Date.now(),
          },
          ...current,
        ]);
        setToast({ type: "success", message: "育成案の保存時に一緒に保存します" });
        return true;
      }
      await saveTrainingMatchupNote({
        sourceBuildId: activeBuildId,
        matchupKind,
        targetKind: target.kind,
        targetPokemonId: target.pokemonId,
        targetBuildId: target.buildId,
        targetName: target.name,
        note: normalizedNote,
      });
      setMatchupNotes(await getTrainingMatchupNotes(activeBuildId));
      setToast({ type: "success", message: "相性メモを保存しました" });
      return true;
    } catch (error: unknown) {
      console.error("相性メモを保存できませんでした。", error);
      setMatchupError(
        error instanceof Error
          ? error.message
          : "相性メモを保存できませんでした。",
      );
      setToast({ type: "error", message: "相性メモの保存に失敗しました" });
      return false;
    } finally {
      setMatchupSavingKind(null);
    }
  }

  async function deleteMatchupNote(noteId: number) {
    if (noteId < 0) {
      setMatchupNotes((current) =>
        current.filter((matchupNote) => matchupNote.id !== noteId),
      );
      return;
    }
    if (!activeBuildId) return;
    try {
      await deleteTrainingMatchupNote(noteId);
      setMatchupNotes(await getTrainingMatchupNotes(activeBuildId));
    } catch (error: unknown) {
      console.error("相性メモを削除できませんでした。", error);
      setMatchupError("相性メモを削除できませんでした。");
    }
  }

  return (
    <section className={styles.simulator}>
      {catalogError ? <p role="alert">{catalogError}</p> : null}
      <div className={styles.hero} style={getPokemonCardStyle(pokemon.types)}>
        <div>
          <p>CHAMPIONS TRAINING</p>
          <h1>{savedBuildName || pokemon.nameJa}</h1>
          <span>
            {savedBuildName
              ? `元のポケモン: ${pokemon.nameJa} / ${pokemon.name}`
              : pokemon.name}
          </span>
        </div>
        {pokemon.imageUrl ? <Image src={pokemon.imageUrl} alt={pokemon.nameJa} width={190} height={190} /> : null}
      </div>
      <TrainingSettingsSection
        abilities={pokemon.abilities}
        heldItems={heldItems}
        selectedAbilityId={abilityId}
        selectedItemId={itemId}
        selectedNature={selectedNature}
        onAbilityChange={(nextAbilityId) => {
          setAbilityId(nextAbilityId);
          setSaved(false);
        }}
        onItemChange={(nextItemId) => {
          setItemId(nextItemId);
          setSaved(false);
        }}
        onOpenNatureMatrix={() => setNatureMatrixOpen(true)}
      />
      <TrainingStatEditor
        pokemonName={pokemon.nameJa}
        orderedStats={orderedStats}
        selectedNature={selectedNature}
        hasNatureModifier={hasNatureModifier}
        abilityPoints={abilityPoints}
        actualStats={actualStats as Record<string, number>}
        baseStatRanks={baseStatRanks}
        pointTotal={pointTotal}
        rankingStatId={rankingStatId}
        selectedRankingStat={selectedRankingStat}
        statRankingRows={statRankingRows}
        onAbilityPointChange={changeAbilityPoint}
        onRankingStatChange={setRankingStatId}
      />
      {isNatureMatrixOpen ? (
        <NatureMatrixOverlay
          natures={natures}
          selectedNatureId={nature}
          onSelect={(natureId) => {
            setNature(natureId);
            setSaved(false);
            setNatureMatrixOpen(false);
          }}
          onClose={() => setNatureMatrixOpen(false)}
        />
      ) : null}
      <TrainingMovesSection
        moves={sortedMovesByUsage}
        moveIds={moveIds}
        onMoveIdsChange={(nextMoveIds) => {
          setMoveIds(nextMoveIds);
          setSaved(false);
        }}
      />
      <button className={styles.saveButton} type="button" onClick={openSaveDialog}>{saved ? "保存しました" : "この育成案を保存"}</button>
      <TrainingMatchupSection
        activeBuildId={activeBuildId}
        matchupError={matchupError}
        matchupNotes={matchupNotes}
        matchupOptions={matchupSearchOptions}
        savingKind={matchupSavingKind}
        onSave={saveMatchup}
        onDelete={(noteId) => void deleteMatchupNote(noteId)}
      />
      <TrainingToast toast={toast} />
      {isSaveDialogOpen ? (
        <TrainingSaveDialog
          buildName={buildName}
          saveError={saveError}
          isSaving={isSaving}
          onBuildNameChange={setBuildName}
          onSaveErrorClear={() => setSaveError("")}
          onClose={() => setSaveDialogOpen(false)}
          onSubmit={() => void save()}
        />
      ) : null}
    </section>
  );
}
