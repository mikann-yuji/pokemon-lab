"use client";

import Image from "next/image";
import Link from "next/link";
import type { DamageCalculatorPokemon } from "../domain/damage-calculator-types";
import type {
  DamageHistoryRecord,
  DamageHistorySide,
} from "../infrastructure/damage-history-repository";
import type { BattleTeam, TrainingBuild } from "@/features/training/infrastructure/training-build-repository";
import { getTypeBadgeStyle } from "@/presentation/pokemon-type-colors";
import { BASE_STAT_LABELS, STAT_IDS, TYPE_LABELS } from "./damage-calculator-display";
import type { SpeedComparisonRow } from "./damage-calculator-types";
import styles from "../styles/damage-calculator.module.css";

// ダメージ計算画面の「ポケモンを見せる部品」を集めたファイル。
// 入力フォームと分けることで、チーム選択・履歴・ヒーロー表示・モーダルをまとめて追える。

export function SpeedComparisonModal({
  rows,
  attackerName,
  defenderName,
  onClose,
}: {
  rows: SpeedComparisonRow[];
  attackerName: string;
  defenderName: string;
  onClose: () => void;
}) {
  // すばやさ比較は計算結果ではなく、選出中の判断材料として使う補助モーダル。
  return (
    <div className={styles.speedModalOverlay} role="dialog" aria-modal="true">
      <button
        className={styles.speedModalBackdrop}
        type="button"
        aria-label="すばやさ比較を閉じる"
        onClick={onClose}
      />
      <section className={styles.speedModalPanel}>
        <div className={styles.speedModalHeader}>
          <div>
            <p>SPEED CHECK</p>
            <h2>すばやさ比較</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className={styles.speedTable}>
          <div className={styles.speedTableHead}>
            <span>条件</span>
            <strong>{attackerName}</strong>
            <strong>{defenderName}</strong>
          </div>
          {rows.map((row) => (
            <div className={styles.speedTableRow} key={row.id}>
              <span>{row.label}</span>
              <SpeedValue value={row.attacker} opponent={row.defender} />
              <SpeedValue value={row.defender} opponent={row.attacker} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SpeedValue({
  value,
  opponent,
}: {
  value: number | null;
  opponent: number | null;
}) {
  const faster =
    typeof value === "number" &&
    typeof opponent === "number" &&
    value > opponent;

  return (
    <span className={`${styles.speedValue} ${faster ? styles.fasterSpeedValue : ""}`}>
      <strong>{value ?? "-"}</strong>
      <small>{faster ? "先手" : " "}</small>
    </span>
  );
}

export function BattleTeamModal({
  teams,
  selectedTeamId,
  onSelect,
  onClose,
}: {
  teams: BattleTeam[];
  selectedTeamId: number | null;
  onSelect: (team: BattleTeam) => void;
  onClose: () => void;
}) {
  // 保存済みバトルチームから攻撃側/防御側へ反映するための選択モーダル。
  // チームの中身はこの後の teamMembers 表示でアイコンとして出す。
  return (
    <div className={styles.teamModalOverlay} role="dialog" aria-modal="true">
      <button
        className={styles.teamModalBackdrop}
        type="button"
        aria-label="バトルチーム一覧を閉じる"
        onClick={onClose}
      />
      <section className={styles.teamModalPanel}>
        <div className={styles.teamModalHeader}>
          <div>
            <p>BATTLE TEAMS</p>
            <h2>バトルチーム一覧</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {teams.length === 0 ? (
          <p className={styles.teamModalEmpty}>
            保存したバトルチームはありません。
          </p>
        ) : (
          <div className={styles.teamModalList}>
            {teams.map((team) => (
              <button
                className={
                  team.id === selectedTeamId ? styles.selectedTeamButton : ""
                }
                type="button"
                onClick={() => onSelect(team)}
                key={team.id}
              >
                <strong>{team.name}</strong>
                <small>{team.buildIds.length}体</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function RecentPokemonList({
  side,
  history,
  pokemonCatalog,
  onRestore,
}: {
  side: DamageHistorySide;
  history: DamageHistoryRecord[];
  pokemonCatalog: DamageCalculatorPokemon[];
  onRestore: (side: DamageHistorySide, history: DamageHistoryRecord) => void;
}) {
  // チーム未選択時だけ出す履歴ショートカット。
  // 最近使ったポケモンをワンタップで戻せるようにする。
  const availableHistory = history.flatMap((record) => {
    const pokemon = pokemonCatalog.find(({ id }) => id === record.pokemonId);
    return pokemon ? [{ record, pokemon }] : [];
  });

  if (availableHistory.length === 0) return null;

  return (
    <div className={styles.recentPokemon}>
      <small>最近使ったポケモン</small>
      <div className={styles.recentPokemonList}>
        {availableHistory.map(({ record, pokemon }) => (
          <button
            type="button"
            title={`${pokemon.nameJa}を選択`}
            aria-label={`${pokemon.nameJa}を選択`}
            onClick={() => onRestore(side, record)}
            key={record.id}
          >
            {pokemon.imageUrl ? (
              <PokemonImage pokemon={pokemon} alt="" size={48} preferFallback />
            ) : (
              <SmallPokemonName name={pokemon.nameJa} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SmallPokemonName({ name }: { name: string }) {
  return <span className={styles.smallPokemonName}>{name}</span>;
}

export function PokemonImage({
  pokemon,
  size,
  alt,
  preferFallback = false,
}: {
  pokemon: DamageCalculatorPokemon;
  size: number;
  alt: string;
  preferFallback?: boolean;
}) {
  // catalog.dbに保存されたローカル画像URLを優先し、必要ならfallbackへ倒す。
  // 画像URLが無い場合でもレイアウトが崩れないよう名前表示にする。
  const primaryUrl =
    preferFallback && pokemon.fallbackImageUrl
      ? pokemon.fallbackImageUrl
      : pokemon.imageUrl;
  const fallbackUrl =
    primaryUrl === pokemon.fallbackImageUrl
      ? pokemon.imageUrl
      : pokemon.fallbackImageUrl;
  const src = primaryUrl || fallbackUrl;

  if (!src) {
    return <SmallPokemonName name={pokemon.nameJa} />;
  }

  return <Image src={src} alt={alt} width={size} height={size} />;
}

export function PokemonSummary({
  pokemon,
  href,
}: {
  pokemon: DamageCalculatorPokemon | null;
  href?: string;
}) {
  // 選択中ポケモンの小さなヒーロー表示。
  // 英語名は出さず、画像・日本語名・タイプ・種族値だけに絞る。
  if (!pokemon) {
    return <div className={styles.placeholder}>ポケモンを選択</div>;
  }

  const content = (
    <>
      <div className={styles.pokemonArtwork}>
        {pokemon.imageUrl ? (
          <PokemonImage pokemon={pokemon} alt={pokemon.nameJa} size={72} />
        ) : (
          <SmallPokemonName name={pokemon.nameJa} />
        )}
      </div>
      <div className={styles.pokemonSummaryBody}>
        <strong>{pokemon.nameJa}</strong>
        <div className={styles.pokemonMeta}>
          <div className={styles.typeBadges} aria-label={`${pokemon.nameJa}のタイプ`}>
            {pokemon.types.map((typeName) => (
              <TypeBadge typeName={typeName} key={typeName} />
            ))}
          </div>
          <dl className={styles.baseStats}>
            {STAT_IDS.map((statId) => (
              <div key={statId}>
                <dt>{BASE_STAT_LABELS[statId]}</dt>
                <dd>{pokemon.stats[statId] ?? "-"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  );

  return href ? (
    <Link className={styles.pokemonSummary} href={href}>
      {content}
    </Link>
  ) : (
    <div className={styles.pokemonSummary}>{content}</div>
  );
}

export function TypeBadge({
  typeName,
}: {
  typeName: DamageCalculatorPokemon["types"][number];
}) {
  return (
    <span className={styles.typeBadge} style={getTypeBadgeStyle(typeName)}>
      {TYPE_LABELS[typeName]}
    </span>
  );
}

export type TeamMemberOption = {
  build: TrainingBuild;
  pokemon: DamageCalculatorPokemon;
};
