"use client";

import { useRouter } from "next/navigation";
import { useCombobox } from "downshift";
import { useEffect, useState } from "react";
import type { PokemonSearchResult } from "@/infrastructure/database/pokemon-search-repository";
import styles from "./pokemon-search.module.css";

type PokemonSearchFormProps = {
  initialQuery: string;
  initialChampionsOnly: boolean;
  action?: string;
  resultBasePath?: string;
  championsOnlyLocked?: boolean;
};

export function PokemonSearchForm({
  initialQuery,
  initialChampionsOnly,
  action = "/pokemon",
  resultBasePath = "/pokemon",
  championsOnlyLocked = false,
}: PokemonSearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<PokemonSearchResult[]>([]);
  const [championsOnly, setChampionsOnly] = useState(initialChampionsOnly);
  const [showDetails, setShowDetails] = useState(initialChampionsOnly);

  const {
    isOpen,
    highlightedIndex,
    getInputProps,
    getItemProps,
    getMenuProps,
  } = useCombobox({
    items: suggestions,
    // 入力値そのものはDownshiftに任せ、IMEの変換途中にReactから書き戻さない。
    initialInputValue: initialQuery,
    itemToString: (pokemon) => pokemon?.nameJa ?? "",
    onInputValueChange: ({ inputValue }) => {
      const nextQuery = inputValue ?? "";
      setQuery(nextQuery);
      if (
        !nextQuery.trim() ||
        nextQuery.trim() === initialQuery.trim()
      ) {
        setSuggestions([]);
      }
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        router.push(`${resultBasePath}/${selectedItem.id}`);
      }
    },
  });

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery === initialQuery.trim()) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const searchParams = new URLSearchParams({
          q: normalizedQuery,
          offset: "0",
        });
        if (championsOnly) searchParams.set("champions", "1");
        const response = await fetch(`/api/pokemon?${searchParams}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data = (await response.json()) as {
          items: PokemonSearchResult[];
        };
        setSuggestions(data.items.slice(0, 8));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [championsOnly, initialQuery, query]);

  const showSuggestions = isOpen && query.trim() && suggestions.length > 0;

  return (
    <form
      className={styles.searchForm}
      action={action}
      method="get"
    >
      <label className={styles.visuallyHidden} htmlFor="pokemon-query">
        ポケモンの名前
      </label>
      <div className={styles.searchControls}>
        <input
          {...getInputProps({
            id: "pokemon-query",
            name: "q",
            type: "search",
            placeholder:
              "ポケモン名を入力（例：フシギダネ、bulbasaur、mega）",
            autoComplete: "off",
          })}
        />
        <button type="submit">けんさく</button>
        {!championsOnlyLocked ? <button
          type="button"
          className={styles.detailSearchButton}
          aria-expanded={showDetails}
          aria-controls="pokemon-detail-search"
          onClick={() => setShowDetails((current) => !current)}
        >
          詳細検索
        </button> : null}
      </div>

      {!championsOnlyLocked && showDetails ? (
        <div
          id="pokemon-detail-search"
          className={styles.detailSearchPanel}
        >
          <label>
            <input
              type="checkbox"
              name="champions"
              value="1"
              checked={championsOnly}
              onChange={(event) => {
                setChampionsOnly(event.target.checked);
                setSuggestions([]);
              }}
            />
            Pokémon Champions 登場ポケモン
          </label>
        </div>
      ) : championsOnly ? (
        <input type="hidden" name="champions" value="1" />
      ) : null}

      <ul
        {...getMenuProps({
          className: styles.suggestionList,
          "aria-label": "ポケモンの候補",
        })}
        hidden={!showSuggestions}
      >
        {showSuggestions
          ? suggestions.map((pokemon, index) => {
              const itemProps = getItemProps({
                item: pokemon,
                index,
              });

              return (
                <li
                  key={`suggestion-${pokemon.id}-${index}`}
                  {...itemProps}
                  className={
                    highlightedIndex === index
                      ? styles.suggestionHighlighted
                      : ""
                  }
                >
                  <span>{pokemon.nameJa}</span>
                  <small>{pokemon.name}</small>
                </li>
              );
            })
          : null}
      </ul>
    </form>
  );
}
