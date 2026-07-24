import Link from "next/link";
import { PokemonSearchForm } from "../pokemon/pokemon-search-form";
import { PokemonResults } from "../pokemon/pokemon-results";
import styles from "../pokemon/pokemon-search.module.css";
import type {
  PokemonAdvancedSearchFilters,
  PokemonStatRange,
} from "@/infrastructure/database/pokemon-search-repository";
import { TYPE_NAMES, type TypeName } from "@/domain/type-matchup";

type TrainingSearchParams = {
  q?: string | string[];
  type1?: string | string[];
  type2?: string | string[];
  move?: string | string[];
  moveName?: string | string[];
} & Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

function parseBound(value: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(255, Math.round(parsed)))
    : undefined;
}

/**
 * 育成対象ポケモンの検索ページ。
 * ポケモン検索画面を流用しつつ、Champions対象だけに固定して育成画面へ遷移させる。
 */
export default async function TrainingSearchPage({
  searchParams,
}: {
  searchParams: Promise<TrainingSearchParams>;
}) {
  const params = await searchParams;
  const rawQuery = params.q;
  // qは配列で来る可能性があるため、検索フォームの初期値には先頭値だけを使う。
  const query = Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "");
  const selectedTypes = [first(params.type1), first(params.type2)].filter(
    (typeName): typeName is TypeName =>
      TYPE_NAMES.includes(typeName as TypeName),
  );
  const statParameters = {
    hp: "h",
    attack: "a",
    defense: "b",
    "special-attack": "c",
    "special-defense": "d",
    speed: "s",
  } as const;
  const stats = Object.fromEntries(
    Object.entries(statParameters).flatMap(([statId, parameter]) => {
      const range: PokemonStatRange = {
        min: parseBound(first(params[`${parameter}Min`])),
        max: parseBound(first(params[`${parameter}Max`])),
      };
      return range.min === undefined && range.max === undefined
        ? []
        : [[statId, range]];
    }),
  ) as PokemonAdvancedSearchFilters["stats"];
  const advancedFilters: PokemonAdvancedSearchFilters = {
    types: selectedTypes,
    stats,
    moveId: first(params.move) || undefined,
  };
  const moveName = first(params.moveName);
  const resultKey = JSON.stringify({ query, advancedFilters });

  return (
    <main className={`${styles.page} ${styles.searchPage}`}>
      <div className={styles.container}>
        <div className={styles.searchDock}>
          <PokemonSearchForm
            key={resultKey}
            initialQuery={query}
            initialChampionsOnly
            action="/training"
            resultBasePath="/training"
            championsOnlyLocked
            advancedSearch={{
              initialFilters: advancedFilters,
              initialMoveName: moveName,
            }}
          />
        </div>
        <div className={styles.trainingNavigation}>
          <Link href="/training-builds">保存した育成案の一覧を見る</Link>
        </div>
        <section aria-live="polite" aria-label="育成するポケモンの検索結果">
          <PokemonResults
            key={resultKey}
            query={query}
            championsOnly
            advancedFilters={advancedFilters}
            advancedQueryParams={Object.fromEntries(
              Object.entries(params).flatMap(([key, value]) => {
                const normalized = first(value);
                return key === "q" || !normalized ? [] : [[key, normalized]];
              }),
            )}
            resultBasePath="/training"
            includeTrainingBuilds
          />
        </section>
      </div>
    </main>
  );
}
