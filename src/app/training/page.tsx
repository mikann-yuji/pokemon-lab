import Link from "next/link";
import { PokemonSearchForm } from "../pokemon/pokemon-search-form";
import { PokemonResults } from "../pokemon/pokemon-results";
import styles from "../pokemon/pokemon-search.module.css";

/**
 * 育成対象ポケモンの検索ページ。
 * ポケモン検索画面を流用しつつ、Champions対象だけに固定して育成画面へ遷移させる。
 */
export default async function TrainingSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const rawQuery = (await searchParams).q;
  // qは配列で来る可能性があるため、検索フォームの初期値には先頭値だけを使う。
  const query = Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "");

  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <div className={styles.container}>
        <div className={styles.searchDock}>
          <PokemonSearchForm
            initialQuery={query}
            initialChampionsOnly
            action="/training"
            resultBasePath="/training"
            championsOnlyLocked
          />
        </div>
        <div className={styles.trainingNavigation}>
          <Link href="/training-builds">保存した育成案の一覧を見る</Link>
        </div>
        <section aria-live="polite" aria-label="育成するポケモンの検索結果">
          <PokemonResults
            key={query}
            query={query}
            championsOnly
            resultBasePath="/training"
            includeTrainingBuilds
          />
        </section>
      </div>
    </main>
  );
}
