"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import { getPokemonCardStyle } from "@/presentation/pokemon-type-colors";
import {
  createTrainingBuildContentKey,
  findTrainingBuildByContentKey,
  loadLatestTrainingBuild,
  loadTrainingBuild,
  saveTrainingBuild,
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
type StatCompareMode = "uninvested" | "maximum";

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
    });
    return () => { active = false; };
  }, [initialBuildId, natures, pokemon.abilities, pokemon.id]);

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

      await saveTrainingBuild({
        ...buildData,
        id: existing?.id,
        name: normalizedName,
        contentKey,
        updatedAt: Date.now(),
      });
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
        <label>
          特性
          <select
            value={abilityId}
            onChange={(event) => {
              setAbilityId(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">特性なし</option>
            {pokemon.abilities.map((ability) => (
              <option value={ability.id} key={ability.id}>
                {ability.name}
                {ability.isHidden ? " (隠れ特性)" : ""}
              </option>
            ))}
          </select>
        </label>
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
      <section className={styles.moves}><h2>技構成</h2>{moveIds.map((moveId, index) => {
        const selectedMoveIds = new Set(moveIds.filter((id, i) => id && i !== index));
        const selectableMoves = pokemon.moves.filter((move) => !selectedMoveIds.has(move.id));
        return <label key={index}>技 {index + 1}<select value={moveId} onChange={(e) => { setMoveIds((current) => current.map((value, i) => i === index ? e.target.value : value)); setSaved(false); }}><option value="">未選択</option>{selectableMoves.map((move) => <option value={move.id} key={move.id}>{move.name}</option>)}</select></label>;
      })}</section>
      <button className={styles.saveButton} type="button" onClick={openSaveDialog}>{saved ? "保存しました" : "この育成案を保存"}</button>
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
  const targetRowRef = useRef<HTMLTableRowElement | null>(null);
  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (left, right) =>
          right[compareMode] - left[compareMode] ||
          right.maximum - left.maximum ||
          right.uninvested - left.uninvested ||
          left.profile.nameJa.localeCompare(right.profile.nameJa, "ja"),
      ),
    [compareMode, rows],
  );
  const actualRank =
    sortedRows.length > 0
      ? rankCurrentValue(
          sortedRows.map((row) => row[compareMode]),
          actualValue,
        )
      : null;
  const targetRowIndex =
    actualRank === null
      ? -1
      : Math.min(sortedRows.length - 1, Math.max(0, actualRank - 1));

  useEffect(() => {
    targetRowRef.current?.scrollIntoView({ block: "center" });
  }, [actualRank, actualValue, compareMode]);

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
                <th scope="col">シミュレート中</th>
                <th scope="col">ポケモン</th>
                <th scope="col">無振り</th>
                <th scope="col">最大</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => (
                <tr
                  className={index === targetRowIndex ? styles.targetRankRow : undefined}
                  key={row.profile.id}
                  ref={index === targetRowIndex ? targetRowRef : null}
                >
                  <th scope="row">
                    <strong>{pokemonName}</strong>
                    <span>{statName}: {actualValue}</span>
                    {actualRank ? (
                      <small>
                        {compareMode === "uninvested" ? "無振り" : "最大値"}基準 {actualRank}位
                      </small>
                    ) : null}
                  </th>
                  <td>{row.profile.nameJa}</td>
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
