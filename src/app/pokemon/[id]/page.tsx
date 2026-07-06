import { PokemonDetailLoader } from "../pokemon-detail-loader";
import styles from "../pokemon-search.module.css";

/** /pokemon/[id] のroute paramsと、検索一覧へ戻るためのURLクエリ。 */
type PokemonDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

/**
 * ポケモン詳細ページ。
 * Server ComponentではURL値だけを整え、実データ取得と表示はClient側Loaderへ委譲する。
 */
export default async function PokemonDetailPage({
  params,
  searchParams,
}: PokemonDetailPageProps) {
  const { id } = await params;
  const { q } = await searchParams;
  const pokemonId = Number(id);
  const rawQuery = Array.isArray(q) ? q[0] : q;
  // 一覧から来た検索語があれば、戻るリンクにその検索条件を引き継ぐ。
  const backHref = rawQuery ? `/pokemon?q=${encodeURIComponent(rawQuery)}` : "/pokemon";

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <PokemonDetailLoader pokemonId={pokemonId} backHref={backHref} />
      </div>
    </main>
  );
}
