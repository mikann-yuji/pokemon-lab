import { SavedTrainingBuilds } from "@/features/training/components/saved-training-builds";
import {
  getHeldItems,
  getTrainingPokemonCatalog,
} from "@/features/training/infrastructure/training-repository";
import styles from "../pokemon/pokemon-search.module.css";

/**
 * IndexedDBに保存された育成案をまとめて確認する専用ページ。
 */
export default function TrainingBuildsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <SavedTrainingBuilds
          query=""
          pokemonCatalog={getTrainingPokemonCatalog()}
          heldItems={getHeldItems()}
          showEmptyState
        />
      </div>
    </main>
  );
}
