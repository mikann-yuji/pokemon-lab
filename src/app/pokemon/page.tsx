/**
 * このファイルの役割: 検索クエリを受け取り、サーバー側でポケモン検索結果を表示するページ。
 */

import Link from "next/link";
import { searchPokemon } from "@/infrastructure/database/pokemon-search-repository";
import { PokemonResults } from "./pokemon-results";
import { PokemonSearchForm } from "./pokemon-search-form";
import styles from "./pokemon-search.module.css";

const PAGE_SIZE = 25;

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
  // URLの ?q= を検索語として扱い、未指定なら空文字で全件寄りの表示にする。
  const query = Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "");
  const rawChampions = params.champions;
  const championsOnly =
    (Array.isArray(rawChampions) ? rawChampions[0] : rawChampions) === "1";
  // 検索はサーバー側でSQLiteへ問い合わせ、クライアントへ必要な表示データだけ渡す。
  const initialResults = searchPokemon(query, {
    limit: PAGE_SIZE + 1,
    championsOnly,
  });
  const initialItems = initialResults.slice(0, PAGE_SIZE);
  const initialHasMore = initialResults.length > PAGE_SIZE;

  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <div className={styles.container}>
        <div className={styles.searchDock}>
          <div className={styles.compactHeader}>
            <Link href="/" className={styles.backLink}>
              ← ホーム
            </Link>
            <h1>ポケモンを さがす</h1>
          </div>
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
            initialItems={initialItems}
            initialHasMore={initialHasMore}
          />
        </section>
      </div>
    </main>
  );
}
