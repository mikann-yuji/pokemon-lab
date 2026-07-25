"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  searchPokemon,
  type PokemonAdvancedSearchFilters,
  type PokemonSearchResult,
} from "@/infrastructure/database/pokemon-search-repository";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import type { TrainingBuild } from "@/features/training/infrastructure/training-build-repository";
import {
  getPokemonCardStyle,
  getTypeBadgeStyle,
} from "@/presentation/pokemon-type-colors";
import styles from "./pokemon-search.module.css";

// 24はスマホ2列・タブレット3列・PC4列のいずれでも端数が出ない。
const PAGE_SIZE = 24;
// 先読みしたページをすぐ捨てないよう、最大72件をDOMに保持する。
const MAX_PAGES = 3;
// 下端へ到達する約2画面前から次ページを取得する。
const PRELOAD_DISTANCE_PX = 1800;

/** 無限スクロールで保持する1ページ分の検索結果。 */
type ResultPage = {
  offset: number;
  items: PokemonSearchResult[];
  hasMore: boolean;
};

type PokemonResultsProps = {
  /** 検索語。空文字の場合は先頭から一覧表示する。 */
  query: string;
  /** trueならChampions対象フォームだけへ絞り込む。 */
  championsOnly: boolean;
  /** Server Componentなどで先読み済みの初期結果。未指定ならマウント後に読む。 */
  initialItems?: PokemonSearchResult[];
  initialHasMore?: boolean;
  /** 結果カードをクリックした時の遷移先ベースパス。検索画面と育成画面で切り替える。 */
  resultBasePath?: string;
  /** trueなら保存済み育成案を結果カードへ統合して表示する。 */
  includeTrainingBuilds?: boolean;
  advancedFilters?: PokemonAdvancedSearchFilters;
  advancedQueryParams?: Record<string, string>;
};

/** catalog.dbから1ページぶんを取得し、+1件取得で次ページ有無を判定する。 */
async function fetchPage(
  query: string,
  championsOnly: boolean,
  offset: number,
  advancedFilters?: PokemonAdvancedSearchFilters,
): Promise<ResultPage> {
  const results = await searchPokemon(query, {
    limit: PAGE_SIZE + 1,
    offset,
    championsOnly,
    advancedFilters,
  });

  return {
    offset,
    items: results.slice(0, PAGE_SIZE),
    hasMore: results.length > PAGE_SIZE,
  };
}

/**
 * ポケモン検索結果リスト。
 * 最大3ページだけDOMに残し、上下スクロールで前後ページを読み替える。
 */
export function PokemonResults({
  query,
  championsOnly,
  initialItems,
  initialHasMore = false,
  resultBasePath = "/pokemon",
  includeTrainingBuilds = false,
  advancedFilters,
  advancedQueryParams,
}: PokemonResultsProps) {
  const [pages, setPages] = useState<ResultPage[]>([
    {
      offset: 0,
      items: initialItems ?? [],
      hasMore: initialHasMore,
    },
  ]);
  const [loaded, setLoaded] = useState(initialItems !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const loadingPreviousRef = useRef(false);
  const loadingNextRef = useRef(false);
  const nextPagePrefetchRef = useRef<{
    offset: number;
    promise: Promise<ResultPage | null>;
  } | null>(null);

  // queryや絞り込みが変わったら、先頭ページから検索し直す。
  useEffect(() => {
    let active = true;
    void fetchPage(query, championsOnly, 0, advancedFilters)
      .then((page) => {
        if (!active) return;
        setPages([page]);
      })
      .catch(() => {
        if (active) setError("ポケモンを読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [advancedFilters, championsOnly, query]);

  // 表示中ページを読んでいる間に次ページをバックグラウンド取得する。
  // DOMへはまだ追加しないため、初期描画量を増やさず下端で即座に展開できる。
  useEffect(() => {
    const lastPage = pages.at(-1);
    if (!loaded || !lastPage?.hasMore) {
      nextPagePrefetchRef.current = null;
      return;
    }

    const nextOffset = lastPage.offset + PAGE_SIZE;
    if (nextPagePrefetchRef.current?.offset === nextOffset) return;

    nextPagePrefetchRef.current = {
      offset: nextOffset,
      promise: fetchPage(
        query,
        championsOnly,
        nextOffset,
        advancedFilters,
      ).catch(() => null),
    };
  }, [advancedFilters, championsOnly, loaded, pages, query]);

  // 育成画面では保存済み育成案へのショートカットを表示するため、必要な時だけ動的importする。
  useEffect(() => {
    if (!includeTrainingBuilds) return;

    let active = true;
    const loadTrainingBuilds = () =>
      import("@/features/training/infrastructure/training-build-repository")
        .then(({ getAllTrainingBuilds }) => getAllTrainingBuilds())
        .then((savedBuilds) => {
          if (active) setTrainingBuilds(savedBuilds);
        })
        .catch((caught: unknown) => {
          console.error("保存した育成案を一覧へ統合できませんでした。", caught);
        });
    const timer = window.setTimeout(() => void loadTrainingBuilds(), 0);
    const handleSynced = () => void loadTrainingBuilds();
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    };
  }, [includeTrainingBuilds]);

  /** 上端sentinelに近づいた時、現在保持している最初のページより前を読み込む。 */
  const loadPrevious = useCallback(async () => {
    const firstPage = pages[0];
    if (
      !firstPage ||
      firstPage.offset === 0 ||
      loadingPreviousRef.current
    ) {
      return;
    }

    loadingPreviousRef.current = true;
    setError(null);
    const previousOffset = Math.max(0, firstPage.offset - PAGE_SIZE);

    try {
      const previousPage = await fetchPage(
        query,
        championsOnly,
        previousOffset,
        advancedFilters,
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
      loadingPreviousRef.current = false;
    }
  }, [advancedFilters, championsOnly, pages, query]);

  /** 下端sentinelに近づいた時、次ページを読み込む。古いページを捨てた分だけスクロール位置を補正する。 */
  const loadNext = useCallback(async () => {
    const lastPage = pages.at(-1);
    if (!lastPage?.hasMore || loadingNextRef.current) return;

    loadingNextRef.current = true;
    setError(null);
    const nextOffset = lastPage.offset + PAGE_SIZE;
    const removedHeight =
      pages.length >= MAX_PAGES
        ? document.querySelector<HTMLElement>(
            `[data-result-page="${pages[0].offset}"]`,
          )?.offsetHeight ?? 0
        : 0;

    try {
      const prefetchedPage =
        nextPagePrefetchRef.current?.offset === nextOffset
          ? await nextPagePrefetchRef.current.promise
          : null;
      const nextPage =
        prefetchedPage ??
        (await fetchPage(
          query,
          championsOnly,
          nextOffset,
          advancedFilters,
        ));
      nextPagePrefetchRef.current = null;
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
      loadingNextRef.current = false;
    }
  }, [advancedFilters, championsOnly, pages, query]);

  useEffect(() => {
    if (!loaded) return;
    const topSentinel = topSentinelRef.current;
    const bottomSentinel = bottomSentinelRef.current;
    const previousObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadPrevious();
      },
      { rootMargin: `${PRELOAD_DISTANCE_PX}px 0px 0px` },
    );
    const nextObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadNext();
      },
      { rootMargin: `0px 0px ${PRELOAD_DISTANCE_PX}px` },
    );

    if (topSentinel) previousObserver.observe(topSentinel);
    if (bottomSentinel) nextObserver.observe(bottomSentinel);

    return () => {
      previousObserver.disconnect();
      nextObserver.disconnect();
    };
  }, [loadNext, loadPrevious, loaded]);

  const visiblePokemonIds = useMemo(
    () => new Set(pages.flatMap((page) => page.items.map(({ id }) => id))),
    [pages],
  );
  const visibleTrainingBuildCount = trainingBuilds.filter((build) =>
    visiblePokemonIds.has(build.pokemonId),
  ).length;
  const trainingBuildsByPokemonId = useMemo(() => {
    const buildsByPokemonId = new Map<number, TrainingBuild[]>();
    for (const build of trainingBuilds) {
      const builds = buildsByPokemonId.get(build.pokemonId) ?? [];
      builds.push(build);
      buildsByPokemonId.set(build.pokemonId, builds);
    }
    return buildsByPokemonId;
  }, [trainingBuilds]);
  const visibleCount = pages.reduce(
    (count, page) => count + page.items.length,
    0,
  ) + visibleTrainingBuildCount;

  if (!loaded) {
    return <p className={styles.empty}>ポケモンを読み込んでいます…</p>;
  }

  if (pages.every((page) => page.items.length === 0)) {
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
            <Fragment key={pokemon.id}>
              <Link
                className={styles.card}
                style={getPokemonCardStyle(pokemon.types)}
                href={{
                  pathname: `${resultBasePath}/${pokemon.id}`,
                  query:
                    query || championsOnly || advancedQueryParams
                      ? {
                          ...(query ? { q: query } : {}),
                          ...(championsOnly ? { champions: "1" } : {}),
                          ...advancedQueryParams,
                        }
                      : undefined,
                }}
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
              {(trainingBuildsByPokemonId.get(pokemon.id) ?? []).map(
                (build) =>
                  build.id !== undefined ? (
                    <Link
                      className={`${styles.card} ${styles.savedBuildCard}`}
                      style={getPokemonCardStyle(pokemon.types)}
                      href={`${resultBasePath}/${pokemon.id}?build=${build.id}`}
                      key={`build-${build.id}`}
                    >
                      <div className={styles.imageArea}>
                        {pokemon.imageUrl ? (
                          <Image
                            src={pokemon.imageUrl}
                            alt=""
                            width={200}
                            height={200}
                            sizes="(max-width: 560px) 42vw, 200px"
                          />
                        ) : null}
                        <span className={styles.savedBuildBadge}>保存済み</span>
                      </div>
                      <div className={styles.cardBody}>
                        <h3>{build.name}</h3>
                        <p>{pokemon.nameJa}の育成案</p>
                      </div>
                    </Link>
                  ) : null,
              )}
            </Fragment>
          ))}
        </div>
      ))}
      <div ref={bottomSentinelRef} className={styles.scrollSentinel} />
      {error ? <p className={styles.loadError}>{error}</p> : null}
    </>
  );
}
