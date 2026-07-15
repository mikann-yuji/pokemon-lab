"use client";

import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import type {
  HeldItem,
  Nature,
} from "../infrastructure/training-catalog-repository";
import styles from "../styles/training-simulator.module.css";
import { TrainingAbilitySelect } from "./training-simulator-controls";

export function TrainingSettingsSection({
  abilities,
  heldItems,
  selectedAbilityId,
  selectedItemId,
  selectedNature,
  onAbilityChange,
  onItemChange,
  onOpenNatureMatrix,
}: {
  abilities: PokemonDetail["abilities"];
  heldItems: HeldItem[];
  selectedAbilityId: string;
  selectedItemId: string;
  selectedNature: Nature | null;
  onAbilityChange: (abilityId: string) => void;
  onItemChange: (itemId: string) => void;
  onOpenNatureMatrix: () => void;
}) {
  return (
    <div className={styles.settings}>
      <div className={styles.natureSetting}>
        <span>性格</span>
        <button
          className={styles.natureSelectButton}
          type="button"
          onClick={onOpenNatureMatrix}
        >
          <span>{selectedNature?.name ?? "性格を選択"}</span>
          <small>マトリックス表から選ぶ</small>
        </button>
      </div>
      <TrainingAbilitySelect
        abilities={abilities}
        selectedAbilityId={selectedAbilityId}
        onChange={onAbilityChange}
      />
      <label>
        持ち物
        <select
          value={selectedItemId}
          onChange={(event) => onItemChange(event.target.value)}
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
  );
}
