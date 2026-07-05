"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import { getPokemonCardStyle } from "@/presentation/pokemon-type-colors";
import {
  loadTrainingBuild,
  saveTrainingBuild,
} from "../infrastructure/training-build-repository";
import type { Nature } from "../infrastructure/training-repository";
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
}: {
  pokemon: PokemonDetail;
  natures: Nature[];
}) {
  const [nature, setNature] = useState("hardy");
  const [abilityPoints, setAbilityPoints] = useState<Record<string, number>>(
    () => initialStats(0),
  );
  const [moveIds, setMoveIds] = useState<string[]>(["", "", "", ""]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void loadTrainingBuild(pokemon.id).then((build) => {
      if (!active || !build) return;
      setNature(build.nature);
      setAbilityPoints(build.abilityPoints ?? initialStats(0));
      setMoveIds([...build.moveIds, "", "", "", ""].slice(0, 4));
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

  async function save() {
    await saveTrainingBuild({
      pokemonId: pokemon.id, nature, abilityPoints, moveIds, updatedAt: Date.now(),
    });
    setSaved(true);
  }

  return (
    <section className={styles.simulator}>
      <div className={styles.hero} style={getPokemonCardStyle(pokemon.types)}>
        <div><p>CHAMPIONS TRAINING</p><h1>{pokemon.nameJa}</h1><span>{pokemon.name}</span></div>
        {pokemon.imageUrl ? <Image src={pokemon.imageUrl} alt={pokemon.nameJa} width={190} height={190} /> : null}
      </div>
      <div className={styles.settings}>
        <label>性格<select value={nature} onChange={(e) => { setNature(e.target.value); setSaved(false); }}>{natures.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <p>レベル50・個体値31（6V）固定</p>
      </div>
      <div className={styles.statHeader}><h2>能力値</h2><span>能力ポイント {pointTotal} / 66</span></div>
      <div className={styles.statTable}>
        <div className={styles.statLabels}><b>能力</b><b>種族値</b><b>能力P</b><b>実数値</b></div>
        {pokemon.stats.map((stat) => <div className={styles.statRow} key={stat.id}>
          <strong>{STAT_NAMES[stat.id] ?? stat.name}{selectedNature.increasedStatId === stat.id ? <i className={styles.statUp}>↑</i> : selectedNature.decreasedStatId === stat.id ? <i className={styles.statDown}>↓</i> : null}</strong><span>{stat.baseStat}</span>
          <div className={styles.pointControl}><input aria-label={`${stat.name}の能力ポイント`} type="number" min="0" max="32" value={abilityPoints[stat.id] ?? 0} onChange={(e) => changeAbilityPoint(stat.id, Number(e.target.value))} /><input aria-label={`${stat.name}の能力ポイントスライダー`} type="range" min="0" max="32" value={abilityPoints[stat.id] ?? 0} onChange={(e) => changeAbilityPoint(stat.id, Number(e.target.value))} /></div>
          <b>{actualStats[stat.id]}</b>
        </div>)}
      </div>
      <NatureMatrix natures={natures} selectedNatureId={nature} />
      <p className={styles.formulaNote}>
        能力ポイントは1ポイントにつき実数値へ+1されます。HP以外は能力ポイントを
        加えた後に、性格の上昇補正（×1.1）または下降補正（×0.9）を掛け、
        小数点以下を切り捨てます。
      </p>
      <section className={styles.moves}><h2>技構成</h2>{moveIds.map((moveId, index) => <label key={index}>技 {index + 1}<select value={moveId} onChange={(e) => { setMoveIds((current) => current.map((value, i) => i === index ? e.target.value : value)); setSaved(false); }}><option value="">未選択</option>{pokemon.moves.map((move) => <option value={move.id} key={move.id}>{move.name}</option>)}</select></label>)}</section>
      <button className={styles.saveButton} type="button" onClick={() => void save()}>{saved ? "保存しました" : "この育成案を保存"}</button>
    </section>
  );
}

function NatureMatrix({
  natures,
  selectedNatureId,
}: {
  natures: Nature[];
  selectedNatureId: string;
}) {
  return (
    <section className={styles.natureMatrix}>
      <h2>性格補正一覧</h2>
      <div className={styles.natureTableWrap}>
        <table>
          <thead><tr><th>性格</th><th>上がる能力</th><th>下がる能力</th></tr></thead>
          <tbody>{natures.map((item) => (
            <tr className={item.id === selectedNatureId ? styles.selectedNature : undefined} key={item.id}>
              <th>{item.name}</th>
              <td className={styles.statUp}>{item.increasedStatId ? `${STAT_NAMES[item.increasedStatId]} ↑` : "補正なし"}</td>
              <td className={styles.statDown}>{item.decreasedStatId ? `${STAT_NAMES[item.decreasedStatId]} ↓` : "補正なし"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
