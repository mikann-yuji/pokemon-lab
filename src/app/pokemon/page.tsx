import { PokemonResults } from "./pokemon-results";
import { PokemonSearchForm } from "./pokemon-search-form";
import styles from "./pokemon-search.module.css";

type PokemonSearchPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    champions?: string | string[];
  }>;
};

export default async function PokemonSearchPage({
  searchParams,
}: PokemonSearchPageProps) {
  const params = await searchParams;
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
