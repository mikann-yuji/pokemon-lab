import { PokemonDetailLoader } from "../pokemon-detail-loader";
import styles from "../pokemon-search.module.css";

type PokemonDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function PokemonDetailPage({
  params,
  searchParams,
}: PokemonDetailPageProps) {
  const { id } = await params;
  const { q } = await searchParams;
  const pokemonId = Number(id);
  const rawQuery = Array.isArray(q) ? q[0] : q;
  const backHref = rawQuery ? `/pokemon?q=${encodeURIComponent(rawQuery)}` : "/pokemon";

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <PokemonDetailLoader pokemonId={pokemonId} backHref={backHref} />
      </div>
    </main>
  );
}
