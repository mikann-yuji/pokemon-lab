import { SavedTrainingBuilds } from "@/features/training/components/saved-training-builds";
import {
  getHeldItems,
  getTrainingPokemonCatalog,
} from "@/features/training/infrastructure/training-repository";
import styles from "../pokemon/pokemon-search.module.css";

/**
 * 保存済み育成案を組み合わせ、端末内にバトルチームを保存する専用ページ。
 */
export default function BattleTeamPage() {
  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <div className={styles.container}>
        <SavedTrainingBuilds
          query=""
          pokemonCatalog={getTrainingPokemonCatalog()}
          heldItems={getHeldItems()}
          teamBuilder
        />
      </div>
    </main>
  );
}
