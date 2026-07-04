import Link from "next/link";
import { notFound } from "next/navigation";
import { getPokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import { PokemonDetailView } from "../pokemon-detail";
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

  if (!Number.isInteger(pokemonId)) {
    notFound();
  }

  const pokemon = getPokemonDetail(pokemonId);

  if (!pokemon) {
    notFound();
  }

  const rawQuery = Array.isArray(q) ? q[0] : q;
  const backHref = rawQuery ? `/pokemon?q=${encodeURIComponent(rawQuery)}` : "/pokemon";

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href={backHref} className={styles.backLink}>
          ← 検索結果へもどる
        </Link>
        <PokemonDetailView pokemon={pokemon} />
      </div>
    </main>
  );
}
