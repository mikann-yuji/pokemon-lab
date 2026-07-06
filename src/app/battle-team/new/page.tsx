import { SavedTrainingBuilds } from "@/features/training/components/saved-training-builds";
import styles from "../../pokemon/pokemon-search.module.css";

/** バトルチーム新規作成ページ。 */
export default function NewBattleTeamPage() {
  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <div className={styles.container}>
        <SavedTrainingBuilds
          query=""
          teamBuilder
          teamMode="create"
        />
      </div>
    </main>
  );
}
