import Image from "next/image";
import Link from "next/link";
import {
  getPokemonDetail,
  searchPokemon,
} from "@/infrastructure/database/pokemon-search-repository";
import styles from "./pokemon-search.module.css";

type PokemonSearchPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    selected?: string | string[];
  }>;
};

export default async function PokemonSearchPage({
  searchParams,
}: PokemonSearchPageProps) {
  const params = await searchParams;
  const rawQuery = params.q;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "");
  const rawSelected = params.selected;
  const selectedId = Number(
    Array.isArray(rawSelected) ? rawSelected[0] : rawSelected,
  );
  const selectedPokemon = Number.isFinite(selectedId)
    ? getPokemonDetail(selectedId)
    : null;
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
                  className={`${styles.card} ${
                    selectedPokemon?.id === pokemon.id ? styles.selectedCard : ""
                  }`}
                  href={{
                    pathname: "/pokemon",
                    query: { q: query, selected: pokemon.id },
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

          {selectedPokemon ? (
            <section
              className={styles.detailPanel}
              aria-label={`${selectedPokemon.nameJa}の詳細`}
            >
              <div className={styles.detailHero}>
                <div>
                  <p className={styles.kicker}>BATTLE DETAILS</p>
                  <h2>{selectedPokemon.nameJa}</h2>
                  <p className={styles.englishName}>{selectedPokemon.name}</p>
                  <div className={styles.types}>
                    {selectedPokemon.types.map((type) => (
                      <span key={type}>{type}</span>
                    ))}
                  </div>
                </div>
                {selectedPokemon.imageUrl ? (
                  <Image
                    src={selectedPokemon.imageUrl}
                    alt={selectedPokemon.nameJa}
                    width={220}
                    height={220}
                    sizes="220px"
                  />
                ) : null}
              </div>

              <div className={styles.detailGrid}>
                <section className={styles.detailSection}>
                  <h3>特性</h3>
                  <div className={styles.abilityList}>
                    {selectedPokemon.abilities.map((ability) => (
                      <article className={styles.abilityItem} key={ability.id}>
                        <div>
                          <strong>{ability.name}</strong>
                          {ability.isHidden ? <span>隠れ特性</span> : null}
                        </div>
                        {ability.effect ? <p>{ability.effect}</p> : null}
                      </article>
                    ))}
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>ステータス</h3>
                  <dl className={styles.statList}>
                    {selectedPokemon.stats.map((stat) => (
                      <div className={styles.statRow} key={stat.id}>
                        <dt>{stat.name}</dt>
                        <dd>
                          <span>{stat.baseStat}</span>
                          <meter min="0" max="255" value={stat.baseStat}>
                            {stat.baseStat}
                          </meter>
                        </dd>
                      </div>
                    ))}
                    <div className={styles.statRow}>
                      <dt>合計</dt>
                      <dd>
                        <strong>{selectedPokemon.statTotal}</strong>
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              <section className={styles.detailSection}>
                <div className={styles.movesHeader}>
                  <h3>覚える技</h3>
                  {selectedPokemon.moveVersionGroup ? (
                    <span>{selectedPokemon.moveVersionGroup} 基準</span>
                  ) : null}
                </div>
                <div className={styles.moveTableWrap}>
                  <table className={styles.moveTable}>
                    <thead>
                      <tr>
                        <th>技</th>
                        <th>タイプ</th>
                        <th>分類</th>
                        <th>威力</th>
                        <th>命中</th>
                        <th>PP</th>
                        <th>覚え方</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPokemon.moves.map((move, index) => (
                        <tr
                          key={`${move.id}-${move.learnMethod}-${move.levelLearnedAt}-${index}`}
                        >
                          <td>{move.name}</td>
                          <td>{move.typeName}</td>
                          <td>{move.damageClassName ?? "-"}</td>
                          <td>{move.power ?? "-"}</td>
                          <td>{move.accuracy ?? "-"}</td>
                          <td>{move.pp ?? "-"}</td>
                          <td>
                            {move.learnMethod}
                            {move.levelLearnedAt > 0
                              ? ` Lv.${move.levelLearnedAt}`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
