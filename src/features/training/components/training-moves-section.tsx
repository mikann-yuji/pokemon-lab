"use client";

import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import styles from "../styles/training-simulator.module.css";
import { TrainingMoveSelect } from "./training-simulator-controls";

export function TrainingMovesSection({
  moves,
  moveIds,
  onMoveIdsChange,
}: {
  moves: PokemonDetail["moves"];
  moveIds: string[];
  onMoveIdsChange: (moveIds: string[]) => void;
}) {
  return (
    <section className={styles.moves}>
      <h2>技構成</h2>
      {moveIds.map((moveId, index) => {
        const selectedMoveIds = new Set(
          moveIds.filter((id, moveIndex) => id && moveIndex !== index),
        );
        const selectableMoves = moves.filter(
          (move) => !selectedMoveIds.has(move.id),
        );
        return (
          <TrainingMoveSelect
            label={`技 ${index + 1}`}
            moves={selectableMoves}
            selectedMoveId={moveId}
            onChange={(nextMoveId) =>
              onMoveIdsChange(
                moveIds.map((value, moveIndex) =>
                  moveIndex === index ? nextMoveId : value,
                ),
              )
            }
            key={index}
          />
        );
      })}
    </section>
  );
}
