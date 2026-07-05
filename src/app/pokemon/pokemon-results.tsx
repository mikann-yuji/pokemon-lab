"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PokemonSearchResult } from "@/infrastructure/database/pokemon-search-repository";
import {
  getPokemonCardStyle,
  getTypeBadgeStyle,
} from "@/presentation/pokemon-type-colors";
import styles from "./pokemon-search.module.css";

const PAGE_SIZE = 25;
const MAX_PAGES = 2;

type ResultPage = {
  offset: number;
  items: PokemonSearchResult[];
  hasMore: boolean;
};

type PokemonResultsProps = {
  query: string;
  championsOnly: boolean;
  initialItems: PokemonSearchResult[];
  initialHasMore: boolean;
  resultBasePath?: string;
};

async function fetchPage(
  query: string,
  championsOnly: boolean,
  offset: number,
): Promise<ResultPage> {
  const searchParams = new URLSearchParams({
    q: query,
    offset: String(offset),
  });
  if (championsOnly) searchParams.set("champions", "1");
  const response = await fetch(`/api/pokemon?${searchParams}`);

  if (!response.ok) {
    throw new Error("ポケモンの読み込みに失敗しました。");
  }

  const data = (await response.json()) as {
    items: PokemonSearchResult[];
    hasMore: boolean;
  };

  return { offset, ...data };
}

export function PokemonResults({
  query,
  championsOnly,
  initialItems,
  initialHasMore,
  resultBasePath = "/pokemon",
}: PokemonResultsProps) {
  const [pages, setPages] = useState<ResultPage[]>([
    { offset: 0, items: initialItems, hasMore: initialHasMore },
  ]);
  const [error, setError] = useState<string | null>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadPrevious = useCallback(async () => {
    const firstPage = pages[0];
    if (!firstPage || firstPage.offset === 0 || loadingRef.current) return;

    loadingRef.current = true;
    setError(null);
    const previousOffset = Math.max(0, firstPage.offset - PAGE_SIZE);

    try {
      const previousPage = await fetchPage(
        query,
        championsOnly,
        previousOffset,
      );
      setPages((currentPages) => [
        previousPage,
        ...currentPages,
      ].slice(0, MAX_PAGES));
      requestAnimationFrame(() => {
        const prependedPage = document.querySelector<HTMLElement>(
          `[data-result-page="${previousOffset}"]`,
        );
        if (prependedPage) {
          window.scrollBy({ top: prependedPage.offsetHeight + 16 });
        }
      });
    } catch {
      setError("前のポケモンを読み込めませんでした。");
    } finally {
      loadingRef.current = false;
    }
  }, [championsOnly, pages, query]);

  const loadNext = useCallback(async () => {
    const lastPage = pages.at(-1);
    if (!lastPage?.hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setError(null);
    const nextOffset = lastPage.offset + PAGE_SIZE;
    const removedHeight =
      pages.length >= MAX_PAGES
        ? document.querySelector<HTMLElement>(
            `[data-result-page="${pages[0].offset}"]`,
          )?.offsetHeight ?? 0
        : 0;

    try {
      const nextPage = await fetchPage(query, championsOnly, nextOffset);
      setPages((currentPages) =>
        [...currentPages, nextPage].slice(-MAX_PAGES),
      );
      if (removedHeight > 0) {
        requestAnimationFrame(() => {
          window.scrollBy({ top: -(removedHeight + 16) });
        });
      }
    } catch {
      setError("次のポケモンを読み込めませんでした。");
    } finally {
      loadingRef.current = false;
    }
  }, [championsOnly, pages, query]);

  useEffect(() => {
    const topSentinel = topSentinelRef.current;
    const bottomSentinel = bottomSentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === topSentinel) void loadPrevious();
          if (entry.target === bottomSentinel) void loadNext();
        }
      },
      { rootMargin: "500px 0px" },
    );

    if (topSentinel) observer.observe(topSentinel);
    if (bottomSentinel) observer.observe(bottomSentinel);

    return () => observer.disconnect();
  }, [loadNext, loadPrevious]);

  const visibleCount = pages.reduce(
    (count, page) => count + page.items.length,
    0,
  );

  if (initialItems.length === 0) {
    return (
      <p className={styles.empty}>
        条件に合うポケモンが見つかりませんでした。
      </p>
    );
  }

  return (
    <>
      <div className={styles.resultHeader}>
        <h2>{query ? `「${query}」の検索結果` : "登録ポケモン"}</h2>
        <span>表示中 {visibleCount}件</span>
      </div>

      <div ref={topSentinelRef} className={styles.scrollSentinel} />
      {pages.map((page) => (
        <div
          className={styles.grid}
          data-result-page={page.offset}
          key={page.offset}
        >
          {page.items.map((pokemon) => (
            <Link
              className={styles.card}
              style={getPokemonCardStyle(pokemon.types)}
              href={{
                pathname: `${resultBasePath}/${pokemon.id}`,
                query:
                  query || championsOnly
                    ? {
                        ...(query ? { q: query } : {}),
                        ...(championsOnly ? { champions: "1" } : {}),
                      }
                    : undefined,
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
                  {pokemon.types.map((type, index) => (
                    <span key={type} style={getTypeBadgeStyle(type)}>
                      {pokemon.typeNamesJa[index] ?? type}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ))}
      <div ref={bottomSentinelRef} className={styles.scrollSentinel} />
      {error ? <p className={styles.loadError}>{error}</p> : null}
    </>
  );
}
