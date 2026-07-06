"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getPokemonDetail,
  type PokemonDetail,
} from "@/infrastructure/database/pokemon-search-repository";
import { PokemonDetailView } from "./pokemon-detail";
import styles from "./pokemon-search.module.css";

/**
 * ポケモン詳細のClient Loader。
 * catalog.dbへのアクセスはSQLite Worker経由でブラウザ側から行い、結果を表示コンポーネントへ渡す。
 */
export function PokemonDetailLoader({
  pokemonId,
  backHref,
}: {
  /** URL paramsから数値化したフォームID。 */
  pokemonId: number;
  /** 検索結果へ戻るリンク。検索語があればURLに含める。 */
  backHref: string;
}) {
  const [pokemon, setPokemon] = useState<PokemonDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // pokemonIdが変わるたびに詳細を読み直し、古いPromiseの結果はactiveで破棄する。
  useEffect(() => {
    if (!Number.isInteger(pokemonId)) return;

    let active = true;
    void getPokemonDetail(pokemonId)
      .then((detail) => {
        if (active) setPokemon(detail);
      })
      .catch((caught: unknown) => {
        console.error("ポケモン詳細を読み込めませんでした。", caught);
        if (active) setError("ポケモン詳細を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [pokemonId]);

  if (!Number.isInteger(pokemonId)) {
    return (
      <>
        <Link href={backHref} className={styles.backLink}>
          ← 検索結果へもどる
        </Link>
        <p className={styles.empty}>ポケモンが見つかりませんでした。</p>
      </>
    );
  }

  return (
    <>
      <Link href={backHref} className={styles.backLink}>
        ← 検索結果へもどる
      </Link>
      {!loaded ? <p className={styles.empty}>ポケモン詳細を読み込んでいます…</p> : null}
      {loaded && error ? <p className={styles.loadError}>{error}</p> : null}
      {loaded && !error && !pokemon ? (
        <p className={styles.empty}>ポケモンが見つかりませんでした。</p>
      ) : null}
      {pokemon ? <PokemonDetailView pokemon={pokemon} /> : null}
    </>
  );
}
