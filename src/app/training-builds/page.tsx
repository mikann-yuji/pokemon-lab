import { SavedTrainingBuilds } from "@/features/training/components/saved-training-builds";
import styles from "../pokemon/pokemon-search.module.css";

/**
 * user.dbに保存された育成案をまとめて確認する専用ページ。
 */
export default function TrainingBuildsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <SavedTrainingBuilds
          query=""
          showEmptyState
        />
      </div>
    </main>
  );
}
