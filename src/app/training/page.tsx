import { searchPokemon } from "@/infrastructure/database/pokemon-search-repository";
import { PokemonSearchForm } from "../pokemon/pokemon-search-form";
import { PokemonResults } from "../pokemon/pokemon-results";
import { SavedTrainingBuilds } from "@/features/training/components/saved-training-builds";
import {
  getHeldItems,
  getTrainingPokemonCatalog,
} from "@/features/training/infrastructure/training-repository";
import styles from "../pokemon/pokemon-search.module.css";

const PAGE_SIZE = 25;

export default async function TrainingSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const rawQuery = (await searchParams).q;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "");
  const results = searchPokemon(query, {
    limit: PAGE_SIZE + 1,
    championsOnly: true,
  });

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
        <SavedTrainingBuilds
          query={query}
          pokemonCatalog={getTrainingPokemonCatalog()}
          heldItems={getHeldItems()}
        />
        <section aria-live="polite" aria-label="育成するポケモンの検索結果">
          <PokemonResults
            key={query}
            query={query}
            championsOnly
            initialItems={results.slice(0, PAGE_SIZE)}
            initialHasMore={results.length > PAGE_SIZE}
            resultBasePath="/training"
          />
        </section>
      </div>
    </main>
  );
}
