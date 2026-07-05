"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  normalizePokemonSearchText,
  pokemonNameIncludes,
} from "@/domain/pokemon-name-search";
import {
  getAllTrainingBuilds,
  type TrainingBuild,
} from "../infrastructure/training-build-repository";
import type { TrainingPokemon } from "../infrastructure/training-repository";
import styles from "../styles/saved-training-builds.module.css";

export function SavedTrainingBuilds({
  query,
  pokemonCatalog,
}: {
  query: string;
  pokemonCatalog: TrainingPokemon[];
}) {
  const [builds, setBuilds] = useState<TrainingBuild[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pokemonById = useMemo(
    () => new Map(pokemonCatalog.map((pokemon) => [pokemon.id, pokemon])),
    [pokemonCatalog],
  );

  useEffect(() => {
    let active = true;
    void getAllTrainingBuilds()
      .then((savedBuilds) => {
        if (active) setBuilds(savedBuilds);
      })
      .catch((error: unknown) => {
        console.error("保存した育成案を読み込めませんでした。", error);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const normalizedQuery = normalizePokemonSearchText(query.trim());
  const filteredBuilds = builds.filter((build) => {
    if (!normalizedQuery) return true;
    const pokemon = pokemonById.get(build.pokemonId);
    return (
      pokemonNameIncludes(build.name, normalizedQuery) ||
      pokemonNameIncludes(pokemon?.name ?? "", normalizedQuery) ||
      pokemonNameIncludes(pokemon?.nameJa ?? "", normalizedQuery)
    );
  });

  if (!loaded || builds.length === 0) return null;

  return (
    <section className={styles.savedSection} aria-labelledby="saved-builds-title">
      <div className={styles.savedHeader}>
        <div>
          <p>SAVED BUILDS</p>
          <h2 id="saved-builds-title">保存した育成案</h2>
        </div>
        <span>{filteredBuilds.length}件</span>
      </div>
      {filteredBuilds.length === 0 ? (
        <p className={styles.empty}>検索に一致する保存済み育成案はありません。</p>
      ) : (
        <div className={styles.savedGrid}>
          {filteredBuilds.map((build) => {
            const pokemon = pokemonById.get(build.pokemonId);
            return (
              <Link
                className={styles.savedCard}
                href={`/training/${build.pokemonId}?build=${build.id}`}
                key={build.id}
              >
                {pokemon?.imageUrl ? (
                  <Image
                    src={pokemon.imageUrl}
                    alt=""
                    width={72}
                    height={72}
                  />
                ) : null}
                <span>
                  <strong>{build.name}</strong>
                  <small>{pokemon?.nameJa ?? `ポケモン #${build.pokemonId}`}</small>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
