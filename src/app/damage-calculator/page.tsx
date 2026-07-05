import { DamageCalculator } from "@/features/damage-calculator/components/damage-calculator";
import { getChampionsDamageCalculatorPokemon } from "@/features/damage-calculator/infrastructure/sqlite-damage-calculator-repository";
import styles from "@/features/damage-calculator/styles/damage-calculator.module.css";

/**
 * ダメージ計算ページのServer Component。
 *
 * SQLiteはサーバー側でのみ読み込み、シリアライズ可能なカタログを
 * Client Componentへ渡す。ブラウザがSQLiteへ直接触れない構成にすることで、
 * DBライブラリをクライアント用JavaScriptへ混ぜずに済む。
 */
export default function DamageCalculatorPage() {
  const pokemonCatalog = getChampionsDamageCalculatorPokemon();

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>Battle Simulator</p>
        <h1>ダメージ計算</h1>
        <span>
          Pokémon Champions登場ポケモンと技を選んで、相手のHPをどれだけ削れるか調べよう。
        </span>
      </header>
      <DamageCalculator pokemonCatalog={pokemonCatalog} />
    </main>
  );
}
