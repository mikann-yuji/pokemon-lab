/**
 * このファイルの役割: ポケモン詳細ページの見た目を構成し、タイプ・特性・種族値・技を表示するコンポーネント。
 */

import Image from "next/image";
import type { PokemonDetail } from "@/infrastructure/database/pokemon-search-repository";
import {
  getPokemonCardStyle,
  getTypeBadgeStyle,
} from "@/presentation/pokemon-type-colors";
import styles from "./pokemon-search.module.css";

type PokemonDetailViewProps = {
  pokemon: PokemonDetail;
};

export function PokemonDetailView({ pokemon }: PokemonDetailViewProps) {
  return (
    <section className={styles.detailPanel} aria-label={`${pokemon.nameJa}の詳細`}>
      <div
        className={styles.detailHero}
        style={getPokemonCardStyle(pokemon.types)}
      >
        <div>
          <p className={styles.kicker}>BATTLE DETAILS</p>
          <h1>{pokemon.nameJa}</h1>
          <p className={styles.englishName}>{pokemon.name}</p>
          <div className={styles.types}>
            {pokemon.types.map((type, index) => (
              <span
                key={type}
                style={getTypeBadgeStyle(type)}
              >
                {pokemon.typeNamesJa[index] ?? type}
              </span>
            ))}
          </div>
        </div>
        {pokemon.imageUrl ? (
          <Image
            src={pokemon.imageUrl}
            alt={pokemon.nameJa}
            width={220}
            height={220}
            sizes="220px"
          />
        ) : null}
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.detailSection}>
          <h2>特性</h2>
          <div className={styles.abilityList}>
            {pokemon.abilities.map((ability) => (
              <article className={styles.abilityItem} key={ability.id}>
                <div>
                  <strong>{ability.name}</strong>
                  {ability.isHidden ? <span>隠れ特性</span> : null}
                </div>
                {ability.effect ? <p>{ability.effect}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.detailSection}>
          <h2>ステータス</h2>
          <dl className={styles.statList}>
            {pokemon.stats.map((stat) => (
              <div className={styles.statRow} key={stat.id}>
                <dt>{stat.name}</dt>
                <dd>
                  <span>{stat.baseStat}</span>
                  <meter min="0" max="255" value={stat.baseStat}>
                    {stat.baseStat}
                  </meter>
                </dd>
              </div>
            ))}
            <div className={styles.statRow}>
              <dt>合計</dt>
              <dd>
                <strong>{pokemon.statTotal}</strong>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className={styles.detailSection}>
        <div className={styles.movesHeader}>
          <h2>覚える技</h2>
          {pokemon.moveVersionGroup ? (
            <span>{pokemon.moveVersionGroup} 基準</span>
          ) : null}
        </div>
        <div className={styles.moveTableWrap}>
          <table className={styles.moveTable}>
            <thead>
              <tr>
                <th>技</th>
                <th>タイプ</th>
                <th>分類</th>
                <th>威力</th>
                <th>命中</th>
                <th>PP</th>
                <th>説明</th>
              </tr>
            </thead>
            <tbody>
              {pokemon.moves.map((move) => (
                <tr
                  key={move.id}
                >
                  <td>{move.name}</td>
                  <td>
                    <span
                      className={styles.moveType}
                      style={getTypeBadgeStyle(move.typeName)}
                    >
                      {move.typeNameJa}
                    </span>
                  </td>
                  <td>{move.damageClassName ?? "-"}</td>
                  <td>{move.power ?? "-"}</td>
                  <td>{move.accuracy ?? "-"}</td>
                  <td>{move.pp ?? "-"}</td>
                  <td className={styles.moveDescription}>
                    {move.description ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
