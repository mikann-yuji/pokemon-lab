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
  type PokemonSearchResult,
} from "@/infrastructure/database/pokemon-search-repository";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import type { TrainingBuild } from "@/features/training/infrastructure/training-build-repository";
import {
  getPokemonCardStyle,
  getTypeBadgeStyle,
} from "@/presentation/pokemon-type-colors";
import styles from "./pokemon-search.module.css";

const PAGE_SIZE = 25;
const MAX_PAGES = 2;

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
};

/** catalog.dbから1ページぶんを取得し、+1件取得で次ページ有無を判定する。 */
async function fetchPage(
  query: string,
  championsOnly: boolean,
  offset: number,
): Promise<ResultPage> {
  const results = await searchPokemon(query, {
    limit: PAGE_SIZE + 1,
    offset,
    championsOnly,
  });

  return {
    offset,
    items: results.slice(0, PAGE_SIZE),
    hasMore: results.length > PAGE_SIZE,
  };
}

/**
 * ポケモン検索結果リスト。
 * 最大2ページだけDOMに残し、上下スクロールで前後ページを読み替える。
 */
export function PokemonResults({
  query,
  championsOnly,
  initialItems,
  initialHasMore = false,
  resultBasePath = "/pokemon",
  includeTrainingBuilds = false,
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
  const loadingRef = useRef(false);

  // queryや絞り込みが変わったら、先頭ページから検索し直す。
  useEffect(() => {
    let active = true;
    void fetchPage(query, championsOnly, 0)
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
  }, [championsOnly, query]);

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

  /** 下端sentinelに近づいた時、次ページを読み込む。古いページを捨てた分だけスクロール位置を補正する。 */
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
    if (!loaded) return;
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
                    query || championsOnly
                      ? {
                          ...(query ? { q: query } : {}),
                          ...(championsOnly ? { champions: "1" } : {}),
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
