"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import { getPokemonCardStyle } from "@/presentation/pokemon-type-colors";
import {
  createTrainingBuildContentKey,
  findTrainingBuildByContentKey,
  loadLatestTrainingBuild,
  saveTrainingBuild,
} from "../infrastructure/training-build-repository";
import type {
  HeldItem,
  Nature,
} from "../infrastructure/training-repository";
import styles from "../styles/training-simulator.module.css";

const STAT_IDS = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"];
const STAT_NAMES: Record<string, string> = {
  hp: "HP", attack: "こうげき", defense: "ぼうぎょ",
  "special-attack": "とくこう", "special-defense": "とくぼう", speed: "すばやさ",
};
const initialStats = (value: number) =>
  Object.fromEntries(STAT_IDS.map((id) => [id, value]));

export function TrainingSimulator({
  pokemon,
  natures,
  heldItems,
}: {
  pokemon: PokemonDetail;
  natures: Nature[];
  heldItems: HeldItem[];
}) {
  const [nature, setNature] = useState("hardy");
  const [abilityPoints, setAbilityPoints] = useState<Record<string, number>>(
    () => initialStats(0),
  );
  const [moveIds, setMoveIds] = useState<string[]>(["", "", "", ""]);
  const [itemId, setItemId] = useState("");
  const [saved, setSaved] = useState(false);
  const [isNatureMatrixOpen, setNatureMatrixOpen] = useState(false);
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [buildName, setBuildName] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;
    void loadLatestTrainingBuild(pokemon.id).then((build) => {
      if (!active || !build) return;
      setNature(build.nature);
      setAbilityPoints(build.abilityPoints ?? initialStats(0));
      setMoveIds([...build.moveIds, "", "", "", ""].slice(0, 4));
      setItemId(build.itemId ?? "");
      setBuildName(build.name ?? "");
    });
    return () => { active = false; };
  }, [pokemon.id]);

  const selectedNature =
    natures.find(({ id }) => id === nature) ?? natures[0];
  // ChampionsではLv.50・個体値31固定。能力ポイントは性格補正の内側へ直接加算する。
  const actualStats = useMemo(() => Object.fromEntries(
    pokemon.stats.map(({ id, baseStat }) => {
      const base = Math.floor(((2 * baseStat + 31) * 50) / 100);
      const point = abilityPoints[id] ?? 0;
      if (id === "hp") return [id, baseStat === 1 ? 1 : base + 50 + 10 + point];
      const modifier = selectedNature.increasedStatId === id ? 1.1 : selectedNature.decreasedStatId === id ? 0.9 : 1;
      return [id, Math.floor((base + 5 + point) * modifier)];
    }),
  ), [abilityPoints, pokemon.stats, selectedNature]);
  const pointTotal = Object.values(abilityPoints).reduce((sum, value) => sum + value, 0);

  function changeAbilityPoint(id: string, requested: number) {
    const otherTotal = pointTotal - (abilityPoints[id] ?? 0);
    setAbilityPoints((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(32, 66 - otherTotal, requested || 0)),
    }));
    setSaved(false);
  }

  function openSaveDialog() {
    setBuildName((current) => current.trim() || `${pokemon.nameJa}の育成案`);
    setSaveError("");
    setSaveDialogOpen(true);
  }

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
      abilityPoints,
      moveIds,
    };
    const contentKey = createTrainingBuildContentKey(buildData);
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
    setSaveDialogOpen(false);
  }

  return (
    <section className={styles.simulator}>
      <div className={styles.hero} style={getPokemonCardStyle(pokemon.types)}>
        <div><p>CHAMPIONS TRAINING</p><h1>{pokemon.nameJa}</h1><span>{pokemon.name}</span></div>
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
        <div className={styles.statLabels}><b>能力</b><b>種族値</b><b>能力P</b><b>実数値</b></div>
        {pokemon.stats.map((stat) => <div className={styles.statRow} key={stat.id}>
          <strong>{STAT_NAMES[stat.id] ?? stat.name}{selectedNature.increasedStatId === stat.id ? <NatureCaret direction="up" /> : selectedNature.decreasedStatId === stat.id ? <NatureCaret direction="down" /> : null}</strong><span>{stat.baseStat}</span>
          <div className={styles.pointControl}><input aria-label={`${stat.name}の能力ポイント`} type="number" min="0" max="32" value={abilityPoints[stat.id] ?? 0} onChange={(e) => changeAbilityPoint(stat.id, Number(e.target.value))} /><input aria-label={`${stat.name}の能力ポイントスライダー`} type="range" min="0" max="32" value={abilityPoints[stat.id] ?? 0} onChange={(e) => changeAbilityPoint(stat.id, Number(e.target.value))} /></div>
          <b>{actualStats[stat.id]}</b>
        </div>)}
      </div>
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
              <button type="button" onClick={() => setSaveDialogOpen(false)}>
                キャンセル
              </button>
              <button type="submit">保存</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}


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
  const neutralNatures = natures.filter(
    (item) => !item.increasedStatId && !item.decreasedStatId,
  );

  function natureFor(increasedStatId: string, decreasedStatId: string) {
    if (increasedStatId === decreasedStatId) {
      return neutralNatures[stats.indexOf(increasedStatId)] ?? neutralNatures[0];
    }
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
