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
  return (
    <div className={styles.teamModalOverlay} role="dialog" aria-modal="true">
      <button
        className={styles.teamModalBackdrop}
        type="button"
        aria-label="すばやさ比較を閉じる"
        onClick={onClose}
      />
      <section className={styles.teamModalPanel}>
        <div className={styles.teamModalHeader}>
          <div>
            <p>SPEED CHECK</p>
            <h2>すばやさ比較</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className={styles.speedTable}>
          <div className={styles.speedHeader}>
            <span>条件</span>
            <span>{attackerName}</span>
            <span>{defenderName}</span>
          </div>
          {rows.map((row) => (
            <div className={styles.speedRow} key={row.id}>
              <strong>{row.label}</strong>
              <SpeedValue value={row.attacker} />
              <SpeedValue value={row.defender} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SpeedValue({ value }: { value: number | null }) {
  return <span>{value ?? "-"}</span>;
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
