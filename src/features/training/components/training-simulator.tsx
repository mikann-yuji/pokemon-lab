"use client";

import Image from "next/image";
import { useCombobox } from "downshift";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { normalizePokemonSearchText } from "@/domain/pokemon-name-search";
import type { TypeName } from "@/domain/type-matchup";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import {
  getPokemonCardStyle,
  getTypeBadgeStyle,
} from "@/presentation/pokemon-type-colors";
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
  type TrainingBuild,
  type TrainingMatchupKind,
  type TrainingMatchupNote,
} from "../infrastructure/training-build-repository";
import type {
  HeldItem,
  Nature,
  TrainingPokemonStatProfile,
} from "../infrastructure/training-catalog-repository";
import {
  getHeldItems,
  getNatures,
} from "../infrastructure/training-catalog-repository";
import styles from "../styles/training-simulator.module.css";

const STAT_IDS = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"];
const STAT_NAMES: Record<string, string> = {
  hp: "HP", attack: "こうげき", defense: "ぼうぎょ",
  "special-attack": "とくこう", "special-defense": "とくぼう", speed: "すばやさ",
};
const DEFAULT_NATURE: Nature = {
  id: "serious",
  name: "まじめ",
  increasedStatId: "attack",
  decreasedStatId: "attack",
};
type StatRankingRow = {
  profile: TrainingPokemonStatProfile;
  uninvested: number;
  maximum: number;
};
type DisplayStatRankingRow = {
  id: string;
  name: string;
  searchName: string;
  uninvested: number;
  maximum: number;
  isTrainingTarget: boolean;
};
type StatCompareMode = "uninvested" | "maximum";
type MatchupSearchOption =
  | {
      key: string;
      kind: "pokemon";
      pokemonId: number;
      name: string;
      subLabel: string;
      searchName: string;
      buildId: null;
    }
  | {
      key: string;
      kind: "build";
      pokemonId: number;
      name: string;
      subLabel: string;
      searchName: string;
      buildId: number;
    };

const TYPE_LABELS: Record<TypeName, string> = {
  Normal: "ノーマル",
  Fire: "ほのお",
  Water: "みず",
  Electric: "でんき",
  Grass: "くさ",
  Ice: "こおり",
  Fighting: "かくとう",
  Poison: "どく",
  Ground: "じめん",
  Flying: "ひこう",
  Psychic: "エスパー",
  Bug: "むし",
  Rock: "いわ",
  Ghost: "ゴースト",
  Dragon: "ドラゴン",
  Dark: "あく",
  Steel: "はがね",
  Fairy: "フェアリー",
};

/** 6能力すべてに同じ初期値を入れた能力ポイント表を作る。 */
const initialStats = (value: number) =>
  Object.fromEntries(STAT_IDS.map((id) => [id, value]));

function calculateActualStat(baseStat: number, statId: string, point = 0, nature = false) {
  const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
  if (statId === "hp") return baseStat === 1 ? 1 : base + 50 + 10 + point;
  return Math.floor((base + 5 + point) * (nature ? 1.1 : 1));
}

function rankCurrentValue(values: number[], currentValue: number) {
  return 1 + values.filter((value) => value > currentValue).length;
}

function formatUsageRate(usageRate: number | null) {
  return usageRate === null ? "" : ` / 採用率 ${usageRate.toFixed(1)}%`;
}

function formatMovePower(move: PokemonDetail["moves"][number]) {
  return move.power === null ? "変化" : `威力 ${move.power}`;
}

function compareMoveUsageRate(
  left: PokemonDetail["moves"][number],
  right: PokemonDetail["moves"][number],
) {
  const leftRate = left.usageRate ?? -1;
  const rightRate = right.usageRate ?? -1;
  if (leftRate !== rightRate) return rightRate - leftRate;
  return left.name.localeCompare(right.name, "ja") || left.id.localeCompare(right.id);
}

function createMatchupSearchOptions(
  pokemonCatalog: TrainingPokemonStatProfile[],
  builds: TrainingBuild[],
): MatchupSearchOption[] {
  const pokemonById = new Map(pokemonCatalog.map((pokemon) => [pokemon.id, pokemon]));
  const pokemonOptions: MatchupSearchOption[] = pokemonCatalog.map((pokemon) => ({
    key: `pokemon-${pokemon.id}`,
    kind: "pokemon",
    pokemonId: pokemon.id,
    name: pokemon.nameJa,
    subLabel: `チャンピオンズ登場ポケモン / ${pokemon.name}`,
    searchName: normalizePokemonSearchText(`${pokemon.nameJa} ${pokemon.name}`),
    buildId: null,
  }));
  const buildOptions: MatchupSearchOption[] = builds.flatMap((build) => {
    if (build.id === undefined) return [];
    const pokemon = pokemonById.get(build.pokemonId);
    if (!pokemon) return [];
    return [
      {
        key: `build-${build.id}`,
        kind: "build" as const,
        pokemonId: build.pokemonId,
        name: build.name,
        subLabel: `${pokemon.nameJa}の保存済み育成案`,
        searchName: normalizePokemonSearchText(
          `${build.name} ${pokemon.nameJa} ${pokemon.name}`,
        ),
        buildId: build.id,
      },
    ];
  });
  return [...pokemonOptions, ...buildOptions];
}

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
  const [natures, setNatures] = useState<Nature[]>(initialNatures ?? []);
  const [heldItems, setHeldItems] = useState<HeldItem[]>(initialHeldItems ?? []);
  const [catalogError, setCatalogError] = useState("");
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
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const [matchupNotes, setMatchupNotes] = useState<TrainingMatchupNote[]>([]);
  const [matchupError, setMatchupError] = useState("");
  const [matchupSavingKind, setMatchupSavingKind] =
    useState<TrainingMatchupKind | null>(null);
  const pendingMatchupNoteIdRef = useRef(-1);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // 保存完了/失敗の一時メッセージは短時間だけ表示する。
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    void getAllTrainingBuilds()
      .then((builds) => {
        if (active) setTrainingBuilds(builds);
      })
      .catch((error: unknown) => {
        console.error("保存済み育成案を読み込めませんでした。", error);
        if (active) setMatchupError("保存済み育成案を読み込めませんでした。");
      });
    return () => {
      active = false;
    };
  }, []);

  // 先読みされていないカタログだけをブラウザ側で取得する。画面単体でも動けるようにする。
  useEffect(() => {
    if (initialNatures && initialHeldItems) return;
    let active = true;
    void Promise.all([getNatures(), getHeldItems()])
      .then(([loadedNatures, loadedItems]) => {
        if (!active) return;
        setNatures(loadedNatures);
        setHeldItems(loadedItems);
      })
      .catch((error: unknown) => {
        console.error("catalog.dbから育成シミュレータ用データを読み込めませんでした。", error);
        if (active) {
          setCatalogError("育成シミュレータ用データを読み込めませんでした。");
        }
      });
    return () => {
      active = false;
    };
  }, [initialHeldItems, initialNatures]);

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
      setNature(
        natures.some(({ id }) => id === build.nature)
          ? build.nature
          : "serious",
      );
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
  }, [activeBuildId]);

  // 性格IDが古い保存データなどで見つからない場合は、まじめ/先頭性格へフォールバックする。
  const selectedNature =
    natures.find(({ id }) => id === nature) ??
    natures.find(({ id }) => id === "serious") ??
    natures[0] ??
    DEFAULT_NATURE;
  const hasNatureModifier =
    selectedNature.increasedStatId !== selectedNature.decreasedStatId;
  // ChampionsではLv.50・個体値31固定。能力ポイントは性格補正の内側へ直接加算する。
  const actualStats = useMemo(() => Object.fromEntries(
    pokemon.stats.map(({ id, baseStat }) => {
      const point = abilityPoints[id] ?? 0;
      const natureModifier =
        hasNatureModifier && selectedNature.increasedStatId === id
          ? true
          : false;
      if (hasNatureModifier && selectedNature.decreasedStatId === id) {
        const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
        return [id, Math.floor((base + 5 + point) * 0.9)];
      }
      return [id, calculateActualStat(baseStat, id, point, natureModifier)];
    }),
  ), [abilityPoints, hasNatureModifier, pokemon.stats, selectedNature]);
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
      <div className={styles.settings}>
        <div className={styles.natureSetting}>
          <span>性格</span>
          <button
            className={styles.natureSelectButton}
            type="button"
            onClick={() => setNatureMatrixOpen(true)}
          >
            <span>{selectedNature.name}</span>
            <small>マトリックス表から選ぶ</small>
          </button>
        </div>
        <TrainingAbilitySelect
          abilities={pokemon.abilities}
          selectedAbilityId={abilityId}
          onChange={(nextAbilityId) => {
            setAbilityId(nextAbilityId);
            setSaved(false);
          }}
        />
        <label>
          持ち物
          <select
            value={itemId}
            onChange={(event) => {
              setItemId(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">持ち物なし</option>
            {heldItems.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <p>レベル50・個体値31（6V）固定</p>
      </div>
      <div className={styles.statHeader}><h2>能力値</h2><span>能力ポイント {pointTotal} / 66</span></div>
      <div className={styles.statTable}>
        <div className={styles.statLabels}><b>能力</b><b>種族値</b><b>順位</b><b>能力P</b><b>実数値</b><b>ランキング</b></div>
        {pokemon.stats.map((stat) => <div className={styles.statRow} key={stat.id}>
          <strong>{STAT_NAMES[stat.id] ?? stat.name}{hasNatureModifier && selectedNature.increasedStatId === stat.id ? <NatureCaret direction="up" /> : hasNatureModifier && selectedNature.decreasedStatId === stat.id ? <NatureCaret direction="down" /> : null}</strong><span>{stat.baseStat}</span><span className={styles.rankBadge}>{baseStatRanks[stat.id] ? `${baseStatRanks[stat.id]}位` : "-"}</span>
          <div className={styles.pointControl}><input aria-label={`${stat.name}の能力ポイント`} type="number" min="0" max="32" value={abilityPoints[stat.id] ?? 0} onChange={(e) => changeAbilityPoint(stat.id, Number(e.target.value))} /><input aria-label={`${stat.name}の能力ポイントスライダー`} type="range" min="0" max="32" value={abilityPoints[stat.id] ?? 0} onChange={(e) => changeAbilityPoint(stat.id, Number(e.target.value))} /></div>
          <b>{actualStats[stat.id]}</b>
          <button className={styles.statRankingButton} type="button" onClick={() => setRankingStatId(stat.id)}>
            {STAT_NAMES[stat.id] ?? stat.name}ランキング
          </button>
        </div>)}
      </div>
      {rankingStatId && selectedRankingStat ? (
        <StatRankingOverlay
          pokemonName={pokemon.nameJa}
          statName={STAT_NAMES[rankingStatId] ?? selectedRankingStat.name}
          actualValue={actualStats[rankingStatId] as number}
          abilityPoint={abilityPoints[rankingStatId] ?? 0}
          pointTotal={pointTotal}
          rows={statRankingRows}
          onPointChange={(value) => changeAbilityPoint(rankingStatId, value)}
          onClose={() => setRankingStatId(null)}
        />
      ) : null}
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
      <p className={styles.formulaNote}>
        能力ポイントは1ポイントにつき実数値へ+1されます。HP以外は能力ポイントを
        加えた後に、性格の上昇補正（×1.1）または下降補正（×0.9）を掛け、
        小数点以下を切り捨てます。
      </p>
      <section className={styles.moves}>
        <h2>技構成</h2>
        {moveIds.map((moveId, index) => {
          const selectedMoveIds = new Set(
            moveIds.filter((id, moveIndex) => id && moveIndex !== index),
          );
          const selectableMoves = sortedMovesByUsage.filter(
            (move) => !selectedMoveIds.has(move.id),
          );
          return (
            <TrainingMoveSelect
              label={`技 ${index + 1}`}
              moves={selectableMoves}
              selectedMoveId={moveId}
              onChange={(nextMoveId) => {
                setMoveIds((current) =>
                  current.map((value, moveIndex) =>
                    moveIndex === index ? nextMoveId : value,
                  ),
                );
                setSaved(false);
              }}
              key={index}
            />
          );
        })}
      </section>
      <button className={styles.saveButton} type="button" onClick={openSaveDialog}>{saved ? "保存しました" : "この育成案を保存"}</button>
      <section className={styles.matchupNotes}>
        <div className={styles.matchupNotesHeader}>
          <h2>有利・不利メモ</h2>
          <span>{activeBuildId ? "この育成案に保存" : "育成案保存時に一緒に保存"}</span>
        </div>
        {matchupError ? (
          <p className={styles.matchupError} role="alert">
            {matchupError}
          </p>
        ) : null}
        <div className={styles.matchupColumns}>
          <MatchupNotePanel
            title="有利なポケモン"
            matchupKind="favorable"
            options={matchupSearchOptions}
            notes={matchupNotes.filter(
              (note) => note.matchupKind === "favorable",
            )}
            disabled={false}
            saving={matchupSavingKind === "favorable"}
            onSave={saveMatchup}
            onDelete={(noteId) => void deleteMatchupNote(noteId)}
          />
          <MatchupNotePanel
            title="不利なポケモン"
            matchupKind="unfavorable"
            options={matchupSearchOptions}
            notes={matchupNotes.filter(
              (note) => note.matchupKind === "unfavorable",
            )}
            disabled={false}
            saving={matchupSavingKind === "unfavorable"}
            onSave={saveMatchup}
            onDelete={(noteId) => void deleteMatchupNote(noteId)}
          />
        </div>
      </section>
      {toast ? (
        <div
          className={`${styles.toast} ${
            toast.type === "success" ? styles.toastSuccess : styles.toastError
          }`}
          role={toast.type === "error" ? "alert" : "status"}
          aria-live={toast.type === "error" ? "assertive" : "polite"}
        >
          {toast.message}
        </div>
      ) : null}
      {isSaveDialogOpen ? (
        <div
          className={styles.saveOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-dialog-title"
        >
          <button
            className={styles.saveBackdrop}
            type="button"
            aria-label="保存ダイアログを閉じる"
            onClick={() => setSaveDialogOpen(false)}
          />
          <form
            className={styles.saveDialog}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h2 id="save-dialog-title">育成案を保存</h2>
            <label>
              保存名
              <input
                autoFocus
                maxLength={80}
                value={buildName}
                onChange={(event) => {
                  setBuildName(event.target.value);
                  setSaveError("");
                }}
              />
            </label>
            {saveError ? <p role="alert">{saveError}</p> : null}
            <div className={styles.saveDialogActions}>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setSaveDialogOpen(false)}
              >
                キャンセル
              </button>
              <button type="submit" disabled={isSaving}>
                {isSaving ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function TrainingTypeBadge({ typeName }: { typeName: TypeName }) {
  return (
    <span className={styles.typeBadge} style={getTypeBadgeStyle(typeName)}>
      {TYPE_LABELS[typeName]}
    </span>
  );
}

function TrainingAbilitySelect({
  abilities,
  selectedAbilityId,
  onChange,
}: {
  abilities: PokemonDetail["abilities"];
  selectedAbilityId: string;
  onChange: (abilityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedAbility =
    abilities.find((ability) => ability.id === selectedAbilityId) ?? null;

  function selectAbility(abilityId: string) {
    onChange(abilityId);
    setOpen(false);
  }

  return (
    <div className={styles.abilitySelectField}>
      <span>特性</span>
      <div
        className={styles.moveSelect}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={styles.moveSelectButton}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {selectedAbility ? (
            <TrainingAbilityOptionContent ability={selectedAbility} />
          ) : (
            <span className={styles.movePlaceholder}>特性なし</span>
          )}
        </button>
        {open ? (
          <div className={styles.moveOptions} role="listbox" aria-label="特性">
            <button
              type="button"
              role="option"
              aria-selected={selectedAbilityId === ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectAbility("")}
            >
              <span className={styles.movePlaceholder}>特性なし</span>
            </button>
            {abilities.map((ability) => (
              <button
                type="button"
                role="option"
                aria-selected={ability.id === selectedAbilityId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectAbility(ability.id)}
                key={ability.id}
              >
                <TrainingAbilityOptionContent ability={ability} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TrainingAbilityOptionContent({
  ability,
}: {
  ability: PokemonDetail["abilities"][number];
}) {
  return (
    <span className={styles.abilityOptionContent}>
      <strong>
        {ability.name}
        {ability.isHidden ? " (隠れ特性)" : ""}
      </strong>
      {ability.effect ? <small>{ability.effect}</small> : null}
    </span>
  );
}

function TrainingMoveDescription({
  description,
}: {
  description: string | null;
}) {
  return description ? (
    <span className={styles.moveDescription}>{description}</span>
  ) : null;
}

function TrainingMoveSelect({
  label,
  moves,
  selectedMoveId,
  onChange,
}: {
  label: string;
  moves: PokemonDetail["moves"];
  selectedMoveId: string;
  onChange: (moveId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedMove =
    moves.find((move) => move.id === selectedMoveId) ?? null;

  function selectMove(moveId: string) {
    onChange(moveId);
    setOpen(false);
  }

  return (
    <div className={styles.moveSelectField}>
      <span>{label}</span>
      <div
        className={styles.moveSelect}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={styles.moveSelectButton}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {selectedMove ? (
            <span className={styles.moveOptionContent}>
              <TrainingTypeBadge typeName={selectedMove.typeName} />
              <strong>{selectedMove.name}</strong>
              <small>
                {formatMovePower(selectedMove)}
                {formatUsageRate(selectedMove.usageRate)}
              </small>
              <TrainingMoveDescription description={selectedMove.description} />
            </span>
          ) : (
            <span className={styles.movePlaceholder}>未選択</span>
          )}
        </button>
        {open ? (
          <div className={styles.moveOptions} role="listbox" aria-label={label}>
            <button
              type="button"
              role="option"
              aria-selected={selectedMoveId === ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMove("")}
            >
              <span className={styles.movePlaceholder}>未選択</span>
            </button>
            {moves.map((move) => (
              <button
                type="button"
                role="option"
                aria-selected={move.id === selectedMoveId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMove(move.id)}
                key={move.id}
              >
                <span className={styles.moveOptionContent}>
                  <TrainingTypeBadge typeName={move.typeName} />
                  <strong>{move.name}</strong>
                  <small>
                    {formatMovePower(move)}
                    {formatUsageRate(move.usageRate)}
                  </small>
                  <TrainingMoveDescription description={move.description} />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MatchupNotePanel({
  title,
  matchupKind,
  options,
  notes,
  disabled,
  saving,
  onSave,
  onDelete,
}: {
  title: string;
  matchupKind: TrainingMatchupKind;
  options: MatchupSearchOption[];
  notes: TrainingMatchupNote[];
  disabled: boolean;
  saving: boolean;
  onSave: (input: {
    matchupKind: TrainingMatchupKind;
    target: MatchupSearchOption | null;
    note: string;
  }) => Promise<boolean>;
  onDelete: (noteId: number) => void;
}) {
  const [selectedTarget, setSelectedTarget] =
    useState<MatchupSearchOption | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [note, setNote] = useState("");
  const normalizedInput = normalizePokemonSearchText(inputValue);
  const filteredOptions = normalizedInput
    ? options
        .filter((option) => option.searchName.includes(normalizedInput))
        .slice(0, 12)
    : options.slice(0, 12);
  const {
    getInputProps,
    getItemProps,
    getLabelProps,
    getMenuProps,
    highlightedIndex,
    isOpen,
  } = useCombobox({
    items: filteredOptions,
    inputValue,
    itemToString: (item) => item?.name ?? "",
    selectedItem: selectedTarget,
    onInputValueChange: ({ inputValue: nextInputValue = "" }) => {
      setInputValue(nextInputValue);
      if (selectedTarget && nextInputValue !== selectedTarget.name) {
        setSelectedTarget(null);
      }
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      setSelectedTarget(selectedItem);
      setInputValue(selectedItem.name);
    },
  });

  async function submit() {
    const saved = await onSave({ matchupKind, target: selectedTarget, note });
    if (!saved) return;
    setSelectedTarget(null);
    setInputValue("");
    setNote("");
  }

  return (
    <section className={styles.matchupPanel}>
      <h3>{title}</h3>
      <label className={styles.matchupSearch}>
        <span {...getLabelProps()}>ポケモン・育成案</span>
        <input
          {...getInputProps({
            disabled,
            placeholder: disabled ? "先に育成案を保存" : "名前で検索",
          })}
        />
        <ul {...getMenuProps()}>
          {isOpen
            ? filteredOptions.map((option, index) => (
                <li
                  {...getItemProps({ item: option, index })}
                  className={
                    highlightedIndex === index
                      ? styles.highlightedSuggestion
                      : undefined
                  }
                  key={option.key}
                >
                  <strong>{option.name}</strong>
                  <small>{option.subLabel}</small>
                </li>
              ))
            : null}
        </ul>
      </label>
      <label className={styles.matchupMemo}>
        メモ
        <textarea
          disabled={disabled}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button
        className={styles.matchupSaveButton}
        type="button"
        disabled={disabled || saving}
        onClick={() => void submit()}
      >
        {saving ? "保存中..." : "メモを保存"}
      </button>
      <div className={styles.matchupList}>
        {notes.length === 0 ? (
          <p>保存したメモはありません。</p>
        ) : (
          notes.map((savedNote) => (
            <article key={savedNote.id}>
              <div>
                <strong>{savedNote.targetName}</strong>
                <small>
                  {savedNote.targetKind === "build" ? "保存済み育成案" : "ポケモン"}
                </small>
              </div>
              <p>{savedNote.note}</p>
              {savedNote.id !== undefined ? (
                <button type="button" onClick={() => onDelete(savedNote.id!)}>
                  削除
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function StatRankingOverlay({
  pokemonName,
  statName,
  actualValue,
  abilityPoint,
  pointTotal,
  rows,
  onPointChange,
  onClose,
}: {
  pokemonName: string;
  statName: string;
  actualValue: number;
  abilityPoint: number;
  pointTotal: number;
  rows: StatRankingRow[];
  onPointChange: (value: number) => void;
  onClose: () => void;
}) {
  const [compareMode, setCompareMode] =
    useState<StatCompareMode>("uninvested");
  const [selectedRankRowId, setSelectedRankRowId] = useState("training-target");
  const rankRowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const sortedRows = useMemo(
    () => {
      const displayRows: DisplayStatRankingRow[] = [
        ...rows.map((row) => ({
          id: String(row.profile.id),
          name: row.profile.nameJa,
          searchName: `${row.profile.nameJa} ${row.profile.name}`,
          uninvested: row.uninvested,
          maximum: row.maximum,
          isTrainingTarget: false,
        })),
        {
          id: "training-target",
          name: `${pokemonName}（育成中）`,
          searchName: pokemonName,
          uninvested: actualValue,
          maximum: actualValue,
          isTrainingTarget: true,
        },
      ];
      return displayRows.sort(
        (left, right) =>
          right[compareMode] - left[compareMode] ||
          right.maximum - left.maximum ||
          right.uninvested - left.uninvested ||
          (right.isTrainingTarget ? 1 : 0) -
            (left.isTrainingTarget ? 1 : 0) ||
          left.name.localeCompare(right.name, "ja"),
      );
    },
    [actualValue, compareMode, pokemonName, rows],
  );
  const selectedRankRow = sortedRows.find((row) => row.id === selectedRankRowId);
  const actualRank =
    sortedRows.length > 0
      ? rankCurrentValue(
          sortedRows.map((row) => row[compareMode]),
          actualValue,
        )
      : null;

  useEffect(() => {
    rankRowRefs.current.get(selectedRankRowId)?.scrollIntoView({ block: "center" });
  }, [selectedRankRowId, sortedRows]);

  return (
    <div className={styles.statRankingOverlay} role="dialog" aria-modal="true" aria-labelledby="stat-ranking-title">
      <button className={styles.statRankingBackdrop} type="button" aria-label="実数値順位表を閉じる" onClick={onClose} />
      <section className={styles.statRankingPanel}>
        <div className={styles.statRankingHeader}>
          <div>
            <p>LV.50 / IV31</p>
            <h2 id="stat-ranking-title">実数値順位表</h2>
          </div>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        <div className={styles.statRankingControls}>
          <div className={styles.statRankingSummary}>
            <strong>{pokemonName}</strong>
            <span>{statName}: {actualValue}</span>
            {actualRank ? (
              <small>
                {compareMode === "uninvested" ? "無振り" : "最大値"}基準 {actualRank}位
              </small>
            ) : null}
          </div>
          <RankingPokemonSearch
            rows={sortedRows}
            selectedRow={selectedRankRow ?? null}
            onSelect={(row) => setSelectedRankRowId(row.id)}
          />
          <label className={styles.statRankingPointControl}>
            <span>{statName} 能力P</span>
            <input
              aria-label={`${statName}の能力ポイント`}
              type="number"
              min="0"
              max="32"
              value={abilityPoint}
              onChange={(event) => onPointChange(Number(event.target.value))}
            />
            <input
              aria-label={`${statName}の能力ポイントスライダー`}
              type="range"
              min="0"
              max="32"
              value={abilityPoint}
              onChange={(event) => onPointChange(Number(event.target.value))}
            />
            <small>合計 {pointTotal} / 66</small>
          </label>
          <div className={styles.statCompareToggle} role="group" aria-label="比較基準">
            <button
              className={compareMode === "uninvested" ? styles.activeCompareMode : undefined}
              type="button"
              onClick={() => setCompareMode("uninvested")}
            >
              無振りで比較
            </button>
            <button
              className={compareMode === "maximum" ? styles.activeCompareMode : undefined}
              type="button"
              onClick={() => setCompareMode("maximum")}
            >
              最大値で比較
            </button>
          </div>
        </div>
        <div className={styles.statRankingTableWrap}>
          <table className={styles.statRankingTable}>
            <thead>
              <tr>
                <th scope="col">順位</th>
                <th scope="col">ポケモン</th>
                <th scope="col">無振り</th>
                <th scope="col">最大</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  className={
                    row.id === selectedRankRowId
                      ? `${styles.selectedRankRow} ${row.isTrainingTarget ? styles.targetRankRow : ""}`
                      : row.isTrainingTarget
                        ? styles.targetRankRow
                        : undefined
                  }
                  key={row.id}
                  ref={(element) => {
                    if (element) {
                      rankRowRefs.current.set(row.id, element);
                    } else {
                      rankRowRefs.current.delete(row.id);
                    }
                  }}
                >
                  <td>{rankCurrentValue(sortedRows.map((item) => item[compareMode]), row[compareMode])}位</td>
                  <th scope="row">{row.name}</th>
                  <td>{row.uninvested}</td>
                  <td>{row.maximum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RankingPokemonSearch({
  rows,
  selectedRow,
  onSelect,
}: {
  rows: DisplayStatRankingRow[];
  selectedRow: DisplayStatRankingRow | null;
  onSelect: (row: DisplayStatRankingRow) => void;
}) {
  const [inputValue, setInputValue] = useState(selectedRow?.name ?? "");
  const suggestions = useMemo(() => {
    const normalizedQuery = normalizePokemonSearchText(inputValue);
    if (!normalizedQuery) return rows.slice(0, 8);
    return rows
      .filter((row) =>
        normalizePokemonSearchText(row.searchName).includes(normalizedQuery),
      )
      .slice(0, 8);
  }, [inputValue, rows]);
  const {
    getInputProps,
    getItemProps,
    getLabelProps,
    getMenuProps,
    highlightedIndex,
    isOpen,
  } = useCombobox({
    inputValue,
    items: suggestions,
    itemToString: (item) => item?.name ?? "",
    onInputValueChange: ({ inputValue: nextInputValue }) => {
      setInputValue(nextInputValue ?? "");
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      setInputValue(selectedItem.name);
      onSelect(selectedItem);
    },
  });
  const showSuggestions = isOpen && suggestions.length > 0;

  return (
    <div className={styles.statRankingSearch}>
      <label {...getLabelProps()}>ポケモン検索</label>
      <input
        {...getInputProps({
          placeholder: "ポケモン名を入力",
        })}
      />
      <ul {...getMenuProps()} hidden={!showSuggestions}>
        {showSuggestions
          ? suggestions.map((row, index) => (
              <li
                className={
                  highlightedIndex === index ? styles.highlightedSuggestion : undefined
                }
                key={row.id}
                {...getItemProps({ item: row, index })}
              >
                <span>{row.name}</span>
                <small>{row.isTrainingTarget ? "育成中" : row.searchName}</small>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}

/** 性格補正の上昇/下降を小さな矢印アイコンとして表示する。 */
function NatureCaret({ direction }: { direction: "up" | "down" }) {
  return (
    <i className={direction === "up" ? styles.statUp : styles.statDown} aria-label={direction === "up" ? "上昇補正" : "下降補正"}>
      <span className={styles.natureCaret} aria-hidden="true">
        <span>{direction === "up" ? "^" : "v"}</span>
        <span>{direction === "up" ? "^" : "v"}</span>
      </span>
    </i>
  );
}

/**
 * 性格を「上がる能力 x 下がる能力」の表で選ぶモーダル。
 * naturesから該当する組み合わせを探し、存在しないマスはdisabledにする。
 */
function NatureMatrixOverlay({
  natures,
  selectedNatureId,
  onSelect,
  onClose,
}: {
  natures: Nature[];
  selectedNatureId: string;
  onSelect: (natureId: string) => void;
  onClose: () => void;
}) {
  const stats = STAT_IDS.filter((id) => id !== "hp");
  /** 上昇能力と下降能力の組み合わせから性格を1件探す。 */
  function natureFor(increasedStatId: string, decreasedStatId: string) {
    return natures.find(
      (item) => item.increasedStatId === increasedStatId && item.decreasedStatId === decreasedStatId,
    );
  }

  return (
    <div className={styles.natureOverlay} role="dialog" aria-modal="true" aria-labelledby="nature-matrix-title">
      <button className={styles.natureBackdrop} type="button" aria-label="性格マトリックスを閉じる" onClick={onClose} />
      <section className={styles.natureMatrixPanel}>
        <div className={styles.natureMatrixHeader}>
          <div>
            <p>能力補正を選んでください</p>
            <h2 id="nature-matrix-title">性格マトリックス</h2>
          </div>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        <div className={styles.natureMatrixGrid}>
          <div className={styles.cornerCell}>上がる能力 ↓<br />下がる能力 →</div>
          {stats.map((statId) => <div className={styles.matrixAxis} key={statId}>{STAT_NAMES[statId]} <NatureCaret direction="down" /></div>)}
          {stats.map((increasedStatId) => (
            <Fragment key={increasedStatId}>
              <div className={styles.matrixAxis}>{STAT_NAMES[increasedStatId]} <NatureCaret direction="up" /></div>
              {stats.map((decreasedStatId) => {
                const item = natureFor(increasedStatId, decreasedStatId);
                return (
                  <button
                    className={item?.id === selectedNatureId ? styles.selectedNatureButton : undefined}
                    type="button"
                    key={`${increasedStatId}-${decreasedStatId}`}
                    onClick={() => item ? onSelect(item.id) : undefined}
                    disabled={!item}
                  >
                    {item?.name ?? "-"}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}
