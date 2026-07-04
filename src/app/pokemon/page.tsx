/**
 * このファイルの役割: 検索クエリを受け取り、サーバー側でポケモン検索結果を表示するページ。
 */

import Image from "next/image";
import Link from "next/link";
import { searchPokemon } from "@/infrastructure/database/pokemon-search-repository";
import styles from "./pokemon-search.module.css";

type PokemonSearchPageProps = {
  searchParams: Promise<{
    q?: string | string[];
  }>;
};

export default async function PokemonSearchPage({
  searchParams,
}: PokemonSearchPageProps) {
  const params = await searchParams;
  const rawQuery = params.q;
  // URLの ?q= を検索語として扱い、未指定なら空文字で全件寄りの表示にする。
  const query = Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "");
  // 検索はサーバー側でSQLiteへ問い合わせ、クライアントへ必要な表示データだけ渡す。
  const results = searchPokemon(query);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.backLink}>
          ← ホームへもどる
        </Link>

        <header className={styles.header}>
          <p className={styles.kicker}>POKÉMON SEARCH</p>
          <h1>ポケモンを さがす</h1>
          <p>日本語名・英語名・フォーム名から検索できます。</p>
        </header>

        <form className={styles.searchForm} action="/pokemon" method="get">
          <label htmlFor="pokemon-query">ポケモンの名前</label>
          <div className={styles.searchControls}>
            <input
              id="pokemon-query"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="例：フシギダネ / bulbasaur / mega"
            />
            <button type="submit">けんさく</button>
          </div>
        </form>

        <section aria-live="polite" aria-label="検索結果">
          <div className={styles.resultHeader}>
            <h2>{query ? `「${query}」の検索結果` : "登録ポケモン"}</h2>
            <span>{results.length}件</span>
          </div>

          {results.length > 0 ? (
            <div className={styles.grid}>
              {results.map((pokemon) => (
                <Link
                  className={styles.card}
                  href={{
                    pathname: `/pokemon/${pokemon.id}`,
                    query: query ? { q: query } : undefined,
                  }}
                  key={pokemon.id}
                >
                  <div className={styles.imageArea}>
                    {pokemon.imageUrl ? (
                      <Image
                        src={pokemon.imageUrl}
                        alt={pokemon.nameJa}
                        width={200}
                        height={200}
                        sizes="(max-width: 560px) 42vw, 200px"
                      />
                    ) : null}
                  </div>
                  <div className={styles.cardBody}>
                    <h3>{pokemon.nameJa}</h3>
                    <p>{pokemon.name}</p>
                    <div className={styles.types}>
                      {pokemon.types.map((type) => (
                        <span key={type}>{type}</span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              条件に合うポケモンが見つかりませんでした。
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
