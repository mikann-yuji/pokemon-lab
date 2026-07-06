import { SavedTrainingBuilds } from "@/features/training/components/saved-training-builds";
import styles from "../../pokemon/pokemon-search.module.css";

/** バトルチーム編集ページ。 */
export default async function EditBattleTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <div className={styles.container}>
        <SavedTrainingBuilds
          query=""
          teamBuilder
          teamMode="edit"
          editingTeamId={Number(id)}
        />
      </div>
    </main>
  );
}
