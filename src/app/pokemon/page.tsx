import { PokemonResults } from "./pokemon-results";
import { PokemonSearchForm } from "./pokemon-search-form";
import styles from "./pokemon-search.module.css";

/** /pokemon のURLクエリ。Next.js 16ではsearchParamsがPromiseとして渡る。 */
type PokemonSearchPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    champions?: string | string[];
  }>;
};

/**
 * ポケモン検索ページ。
 * URLクエリをServer Componentで正規化し、検索フォームと結果一覧の初期値として渡す。
 */
export default async function PokemonSearchPage({
  searchParams,
}: PokemonSearchPageProps) {
  const params = await searchParams;
  // q/championsは配列で来る可能性があるため、先頭値だけを採用する。
  const rawQuery = params.q;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "");
  const rawChampions = params.champions;
  const championsOnly =
    (Array.isArray(rawChampions) ? rawChampions[0] : rawChampions) === "1";

  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <div className={styles.container}>
        <div className={styles.searchDock}>
          <PokemonSearchForm
            key={`${query}:${championsOnly}`}
            initialQuery={query}
            initialChampionsOnly={championsOnly}
          />
        </div>

        <section aria-live="polite" aria-label="検索結果">
          <PokemonResults
            key={`${query}:${championsOnly}`}
            query={query}
            championsOnly={championsOnly}
          />
        </section>
      </div>
    </main>
  );
}
