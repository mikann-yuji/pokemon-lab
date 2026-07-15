"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useState } from "react";
import type {
  DamageCalculatorHeldItem,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import type { DamageHistoryRecord, DamageHistorySide } from "../infrastructure/damage-history-repository";
import type { BattleTeam, TrainingBuild } from "@/features/training/infrastructure/training-build-repository";
import { PokemonCombobox } from "./pokemon-combobox";
import {
  AbilityField,
  DamageStatControls,
  HeldItemField,
} from "./reverse-damage-calculator-form";
import {
  BASE_STAT_LABELS,
  STAT_IDS,
  usePokemonSelection,
  type DamageSide,
  type StatAdjustment,
  type UnknownSide,
} from "./reverse-damage-calculator-state";
import { TypeBadge } from "./reverse-damage-calculator-type-badge";
import damageStyles from "../styles/damage-calculator.module.css";
import styles from "../styles/reverse-damage-calculator.module.css";

// 逆引き画面の左右パネルを構成する表示部品。
// 通常計算側と似ているが、未知側では補正入力を隠して「ここを逆引きする」と示す。
export function SideContent({
  side,
  title,
  unknownSide,
  pokemonCatalog,
  heldItems,
  selection,
  history,
  selectedTeam,
  selectedTeamMembers,
  selectedBuildId,
  teamLoadError,
  statAdjustment,
  hpAdjustment,
  statLabel,
  showControls,
  children,
  onOpenTeam,
  onSelectTeamMember,
  onSelectPokemon,
  onRestore,
  onAbilityChange,
  onHeldItemChange,
  onStatChange,
  onHpChange,
}: {
  side: DamageSide;
  title: string;
  unknownSide: UnknownSide;
  pokemonCatalog: DamageCalculatorPokemon[];
  heldItems: DamageCalculatorHeldItem[];
  selection: ReturnType<typeof usePokemonSelection>;
  history: DamageHistoryRecord[];
  selectedTeam: BattleTeam | null;
  selectedTeamMembers: { build: TrainingBuild; pokemon: DamageCalculatorPokemon }[];
  selectedBuildId: number | null;
  teamLoadError: string;
  statAdjustment: StatAdjustment;
  hpAdjustment?: StatAdjustment;
  statLabel: string;
  showControls: boolean;
  children?: ReactNode;
  onOpenTeam: () => void;
  onSelectTeamMember: (build: TrainingBuild) => void;
  onSelectPokemon: (pokemon: DamageCalculatorPokemon | null) => void;
  onRestore: (side: DamageHistorySide, history: DamageHistoryRecord) => void;
  onAbilityChange: (abilityId: string) => void;
  onHeldItemChange: (itemId: string) => void;
  onStatChange: (values: Partial<StatAdjustment>) => void;
  onHpChange?: (values: Partial<StatAdjustment>) => void;
}) {
  // 攻撃側/防御側の共通レイアウト。
  // チーム選択、ポケモン検索、履歴、特性/持ち物、補正欄を同じ順番で並べる。
  const pokemon = selection.pokemon;
  return (
    <>
      <h2>{title}</h2>
      <div className={damageStyles.teamPicker}>
        <button type="button" onClick={onOpenTeam}>
          バトルチームを選択
        </button>
        <span>{selectedTeam?.name ?? "未選択"}</span>
      </div>
      {teamLoadError ? (
        <p className={damageStyles.teamError} role="alert">
          {teamLoadError}
        </p>
      ) : null}
      {selectedTeamMembers.length > 0 ? (
        <div className={damageStyles.teamPokemon}>
          {selectedTeamMembers.map(({ build, pokemon: member }) => (
            <button
              type="button"
              title={`${build.name || member.nameJa}を反映`}
              aria-label={`${build.name || member.nameJa}を反映`}
              onClick={() => onSelectTeamMember(build)}
              key={build.id}
            >
              {member.imageUrl ? (
                <PokemonImage pokemon={member} alt="" size={48} preferFallback />
              ) : (
                <SmallPokemonName name={member.nameJa} />
              )}
            </button>
          ))}
        </div>
      ) : null}
      <PokemonCombobox
        id={`reverse-${side}`}
        label={`${title}ポケモン`}
        pokemonCatalog={pokemonCatalog}
        selectedPokemon={pokemon}
        inputValue={selection.query}
        onInputValueChange={selection.setQuery}
        onSelect={onSelectPokemon}
      />
      <RecentPokemonList
        side={side}
        history={history}
        pokemonCatalog={pokemonCatalog}
        onRestore={onRestore}
      />
      <PokemonSummary pokemon={pokemon} />
      <AbilityField pokemon={pokemon} onAbilityChange={onAbilityChange} />
      <HeldItemField
        pokemon={pokemon}
        heldItems={heldItems}
        onChange={onHeldItemChange}
      />
      {children}
      {showControls ? (
        <>
          {side === "defender" && hpAdjustment ? (
            <DamageStatControls
              title={`${title}のHP`}
              statLabel="HP"
              value={hpAdjustment}
              showRank={false}
              showNature={false}
              onChange={onHpChange ?? (() => undefined)}
            />
          ) : null}
          <DamageStatControls
            title={`${title}の補正`}
            statLabel={statLabel}
            value={statAdjustment}
            onChange={onStatChange}
          />
        </>
      ) : (
        <p className={styles.unknownHint}>
          {unknownSide === "attacker" && side === "attacker"
            ? "この攻撃側の能力ポイントを逆引きします。"
            : "この防御側のHPと防御能力ポイントを逆引きします。"}
        </p>
      )}
      {selectedBuildId ? null : null}
    </>
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
  // 保存済みバトルチームから、逆引き条件へ使うメンバーを選ぶためのモーダル。
  return (
    <div
      className={damageStyles.teamModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reverse-battle-team-modal-title"
    >
      <button
        className={damageStyles.teamModalBackdrop}
        type="button"
        aria-label="バトルチーム一覧を閉じる"
        onClick={onClose}
      />
      <section className={damageStyles.teamModalPanel}>
        <div className={damageStyles.teamModalHeader}>
          <div>
            <p>BATTLE TEAMS</p>
            <h2 id="reverse-battle-team-modal-title">バトルチーム一覧</h2>
          </div>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {teams.length === 0 ? (
          <p className={damageStyles.teamModalEmpty}>
            保存したバトルチームはありません。
          </p>
        ) : (
          <div className={damageStyles.teamModalList}>
            {teams.map((team) => (
              <button
                className={
                  team.id === selectedTeamId ? damageStyles.selectedTeamButton : ""
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

function RecentPokemonList({
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
  // 逆引きでも履歴から素早くポケモンを戻せるようにする。
  // historyにはIDしかないので、表示前にcatalogから名前と画像を引き直す。
  const availableHistory = history.flatMap((record) => {
    const pokemon = pokemonCatalog.find(({ id }) => id === record.pokemonId);
    return pokemon ? [{ record, pokemon }] : [];
  });

  if (availableHistory.length === 0) return null;

  return (
    <div className={damageStyles.recentPokemon}>
      <small>最近使ったポケモン</small>
      <div className={damageStyles.recentPokemonList}>
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

function SmallPokemonName({ name }: { name: string }) {
  return <span className={damageStyles.smallPokemonName}>{name}</span>;
}

function PokemonImage({
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
  // ローカル画像URLを優先し、読み込みに失敗したらfallbackへ切り替える。
  const primaryUrl =
    preferFallback && pokemon.fallbackImageUrl
      ? pokemon.fallbackImageUrl
      : pokemon.imageUrl;
  const fallbackUrl =
    primaryUrl === pokemon.fallbackImageUrl
      ? pokemon.imageUrl
      : pokemon.fallbackImageUrl;
  const [failedPrimaryUrl, setFailedPrimaryUrl] = useState<string | null>(null);
  const src =
    primaryUrl && failedPrimaryUrl === primaryUrl && fallbackUrl
      ? fallbackUrl
      : primaryUrl;

  if (!src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="" alt={alt} width={size} height={size} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => {
        if (primaryUrl && fallbackUrl && src === primaryUrl) {
          setFailedPrimaryUrl(primaryUrl);
        }
      }}
    />
  );
}

function PokemonSummary({ pokemon }: { pokemon: DamageCalculatorPokemon | null }) {
  // 逆引き側の簡易ポケモン概要。候補探索前にタイプと種族値を確認できる。
  if (!pokemon) {
    return <div className={damageStyles.placeholder}>ポケモンを選択</div>;
  }

  return (
    <div className={damageStyles.pokemonSummary}>
      <div className={damageStyles.pokemonArtwork}>
        {pokemon.imageUrl ? (
          <PokemonImage pokemon={pokemon} alt={pokemon.nameJa} size={112} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="" alt={pokemon.nameJa} width={112} height={112} />
        )}
      </div>
      <div className={damageStyles.pokemonSummaryBody}>
        <div>
          <strong>{pokemon.nameJa}</strong>
          <small>{pokemon.name}</small>
        </div>
        <div className={damageStyles.typeBadges} aria-label={`${pokemon.nameJa}のタイプ`}>
          {pokemon.types.map((typeName) => (
            <TypeBadge typeName={typeName} key={typeName} />
          ))}
        </div>
        <dl className={damageStyles.baseStats}>
          {STAT_IDS.map((statId) => (
            <div key={statId}>
              <dt>{BASE_STAT_LABELS[statId]}</dt>
              <dd>{pokemon.stats[statId] ?? "-"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

