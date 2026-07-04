/**
 * このファイルの役割: URLのポケモンIDをもとに詳細データを取得し、存在しない場合は404へ送る詳細ページ。
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getPokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import { PokemonDetailView } from "../pokemon-detail";
import styles from "../pokemon-search.module.css";

type PokemonDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

// 動的セグメント [id] の値を数値化し、DB上のフォームIDとして詳細を取得する。
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

    // DBに存在しないIDも同様に404扱いにする。
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
