"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getKnowledgePokemon,
  type KnowledgePokemon,
  type KnowledgeStatId,
} from "../infrastructure/knowledge-repository";
import {
  selectKnowledgeExamples,
  type KnowledgeStatExample,
} from "../knowledge-model";
import styles from "../styles/knowledge.module.css";

type Guide = {
  id: string;
  title: string;
  lanes: { statId: KnowledgeStatId; label: string }[];
  min: number;
  max: number;
  marks: { value: number; label: string }[];
};

const GUIDES: Guide[] = [
  {
    id: "hp",
    title: "HP",
    lanes: [{ statId: "hp", label: "HP" }],
    min: 100,
    max: 240,
    marks: [
      { value: 160, label: "普通" },
      { value: 180, label: "高耐久" },
      { value: 200, label: "超高耐久" },
    ],
  },
  {
    id: "offense",
    title: "攻撃・特攻",
    lanes: [
      { statId: "attack", label: "攻撃" },
      { statId: "special-attack", label: "特攻" },
    ],
    min: 90,
    max: 230,
    marks: [
      { value: 140, label: "普通" },
      { value: 170, label: "高火力" },
      { value: 200, label: "超火力" },
    ],
  },
  {
    id: "defense",
    title: "防御・特防",
    lanes: [
      { statId: "defense", label: "防御" },
      { statId: "special-defense", label: "特防" },
    ],
    min: 80,
    max: 210,
    marks: [
      { value: 120, label: "普通" },
      { value: 150, label: "硬い" },
      { value: 180, label: "要塞級" },
    ],
  },
  {
    id: "speed",
    title: "素早さ",
    lanes: [{ statId: "speed", label: "素早さ" }],
    min: 60,
    max: 220,
    marks: [
      { value: 100, label: "かなり遅い" },
      { value: 130, label: "遅め" },
      { value: 150, label: "普通" },
      { value: 170, label: "速い" },
      { value: 200, label: "最速クラス" },
    ],
  },
];

export default function KnowledgeBoard() {
  const [pokemon, setPokemon] = useState<KnowledgePokemon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getKnowledgePokemon()
      .then((rows) => {
        if (!active) return;
        setPokemon(rows);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        console.error("ナレッジ用のポケモンを読み込めませんでした。", cause);
        if (!active) return;
        setError("ポケモンデータを読み込めませんでした。");
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const examples = useMemo(() => {
    if (pokemon.length === 0) return new Map<KnowledgeStatId, KnowledgeStatExample[]>();
    return new Map(
      GUIDES.flatMap((guide) =>
        guide.lanes.map(
          ({ statId }) =>
            [statId, selectKnowledgeExamples(pokemon, statId)] as const,
        ),
      ),
    );
  }, [pokemon]);

  if (!loaded) return <p className={styles.status}>データを読み込んでいます…</p>;
  if (error) return <p className={styles.status} role="alert">{error}</p>;

  return (
    <div className={styles.board}>
      <p className={styles.condition}>
        アイコンの実数値：Lv.50・個体値31・無振り・性格補正なし
        （シングル採用順位100位以内＋対応メガ）
      </p>
      {GUIDES.map((guide) => (
        <section className={styles.guideCard} key={guide.id}>
          <header>
            <h2>{guide.title}</h2>
            <div className={styles.markSummary}>
              {guide.marks.map((mark) => (
                <span key={mark.value}>
                  <strong>{mark.value}</strong>：{mark.label}
                </span>
              ))}
            </div>
          </header>
          {guide.lanes.map((lane) => (
            <StatLane
              key={lane.statId}
              label={lane.label}
              min={guide.min}
              max={guide.max}
              marks={guide.marks}
              examples={examples.get(lane.statId) ?? []}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function StatLane({
  label,
  min,
  max,
  marks,
  examples,
}: {
  label: string;
  min: number;
  max: number;
  marks: Guide["marks"];
  examples: KnowledgeStatExample[];
}) {
  const position = (value: number) =>
    Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className={styles.statLane}>
      <strong className={styles.laneLabel}>{label}</strong>
      <div className={styles.scale}>
        {marks.map((mark) => (
          <div
            className={styles.marker}
            key={mark.value}
            style={{ left: `${position(mark.value)}%` }}
          >
            <span>{mark.value}</span>
          </div>
        ))}
        {examples.map((pokemon, index) => (
          <Link
            href={`/training/${pokemon.formId}`}
            className={styles.pokemonIcon}
            key={pokemon.formId}
            style={{
              left: `${position(pokemon.actualValue)}%`,
              top: `${8 + (index % 3) * 28}px`,
            }}
            title={`${pokemon.nameJa}：${pokemon.actualValue}`}
            aria-label={`${pokemon.nameJa} 実数値${pokemon.actualValue}の育成シミュレーターを開く`}
          >
            {pokemon.imageUrl ? (
              <Image
                src={pokemon.imageUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
              />
            ) : (
              <span>?</span>
            )}
            <small>{pokemon.actualValue}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
