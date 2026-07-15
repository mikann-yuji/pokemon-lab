"use client";

import { useState } from "react";
import type { TypeName } from "@/domain/type-matchup";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import { getTypeBadgeStyle } from "@/presentation/pokemon-type-colors";
import styles from "../styles/training-simulator.module.css";
import { TYPE_LABELS, formatMovePower, formatUsageRate } from "./training-simulator-model";

// 育成シミュレータの「候補を開いて選ぶ」系UIを集めたファイル。
// 特性と技は表示内容が似ているので、同じ自作セレクトの作法に揃える。

export function TrainingTypeBadge({ typeName }: { typeName: TypeName }) {
  return (
    <span className={styles.typeBadge} style={getTypeBadgeStyle(typeName)}>
      {TYPE_LABELS[typeName]}
    </span>
  );
}

export function TrainingAbilitySelect({
  abilities,
  selectedAbilityId,
  onChange,
}: {
  abilities: PokemonDetail["abilities"];
  selectedAbilityId: string;
  onChange: (abilityId: string) => void;
}) {
  // 特性は効果説明も候補内に出すため、通常のselectではなく自作リストにする。
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
  // 候補1行分。夢特性かどうかと効果説明をここでまとめて表示する。
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
  // 技説明は長くなりやすいので、表示有無を小さな部品に閉じ込める。
  return description ? (
    <span className={styles.moveDescription}>{description}</span>
  ) : null;
}

export function TrainingMoveSelect({
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
  // 技選択も自作リスト。タイプ、威力、採用率、説明を候補内で確認できる。
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

