"use client";

/**
 * このファイルの役割:
 * ダメージ計算ページの入力状態を管理し、検索欄・技選択・計算結果を組み立てる。
 *
 * 実際の計算式やDBアクセスはこのコンポーネントへ書かず、
 * application層の計算機と、Server Componentから渡されたカタログを利用する。
 */

import Image from "next/image";
import { useState } from "react";
import {
  CHAMPIONS_DAMAGE_RULESET,
  championsDamageCalculator,
} from "../config/champions-damage-ruleset";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import { PokemonCombobox } from "./pokemon-combobox";
import styles from "../styles/damage-calculator.module.css";

type CalculationResult = {
  minimum: number;
  maximum: number;
  defenderHp: number;
  minimumPercent: number;
  maximumPercent: number;
  koChance: string;
  attackerName: string;
  defenderName: string;
  moveName: string;
};

/**
 * ダメージ計算画面の本体。
 *
 * pokemonCatalogはページ生成時にSQLiteから読み込まれている。
 * ブラウザ内では通信せず、この配列だけで検索・技選択・計算を完結させる。
 */
export function DamageCalculator({
  pokemonCatalog,
}: {
  pokemonCatalog: DamageCalculatorPokemon[];
}) {
  const [attacker, setAttacker] = useState<DamageCalculatorPokemon | null>(
    null,
  );
  const [defender, setDefender] = useState<DamageCalculatorPokemon | null>(
    null,
  );
  const [moveId, setMoveId] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  // 攻撃側を変更したら、前のポケモンの技や計算結果を残さない。
  function selectAttacker(pokemon: DamageCalculatorPokemon | null) {
    setAttacker(pokemon);
    setMoveId("");
    setResult(null);
    setError(null);
  }

  // 防御側を変更した場合も、古い相手に対する結果を消す。
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    setDefender(pokemon);
    setResult(null);
    setError(null);
  }

  /**
   * フォーム送信時に、選択中のIDから技データを見つけて計算する。
   * 計算処理は同期的かつローカルなので、オフラインでも同じ結果になる。
   */
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!attacker || !defender || !moveId) return;

    const move = attacker.moves.find(({ id }) => id === moveId);
    if (!move) return;

    setCalculating(true);
    setError(null);
    try {
      setResult({
        ...championsDamageCalculator.calculate({
          attacker,
          defender,
          move,
        }),
        attackerName: attacker.nameJa,
        defenderName: defender.nameJa,
        moveName: move.name,
      });
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "計算に失敗しました。");
    } finally {
      setCalculating(false);
    }
  }

  const selectedMove = attacker?.moves.find(({ id }) => id === moveId);

  return (
    <form className={styles.calculator} onSubmit={submit}>
      <section className={styles.side}>
        <h2>攻撃側</h2>
        <PokemonCombobox
          id="attacker"
          label="攻撃するポケモン"
          pokemonCatalog={pokemonCatalog}
          selectedPokemon={attacker}
          onSelect={selectAttacker}
        />
        <PokemonSummary pokemon={attacker} />
        <label className={styles.moveField}>
          使用する技
          <select
            value={moveId}
            disabled={!attacker}
            onChange={(event) => {
              setMoveId(event.target.value);
              setResult(null);
            }}
          >
            <option value="">技を選択</option>
            {attacker?.moves.map((move) => (
              <option value={move.id} key={move.id}>
                {move.name}（威力 {move.power}）
              </option>
            ))}
          </select>
        </label>
        {selectedMove ? <MoveSummary move={selectedMove} /> : null}
      </section>

      <div className={styles.versus}>VS</div>

      <section className={styles.side}>
        <h2>防御側</h2>
        <PokemonCombobox
          id="defender"
          label="攻撃を受けるポケモン"
          pokemonCatalog={pokemonCatalog}
          selectedPokemon={defender}
          onSelect={selectDefender}
        />
        <PokemonSummary pokemon={defender} />
      </section>

      <div className={styles.conditions}>
        基準式 第{CHAMPIONS_DAMAGE_RULESET.generation}世代・レベル
        {CHAMPIONS_DAMAGE_RULESET.level}
        ・個体値31・努力値0・性格補正なし・HP満タン
      </div>

      <button
        className={styles.calculateButton}
        type="submit"
        disabled={!attacker || !defender || !moveId || calculating}
      >
        {calculating ? "計算中…" : "ダメージを計算"}
      </button>

      {error ? <p className={styles.error}>{error}</p> : null}
      {result ? <DamageResult result={result} /> : null}
    </form>
  );
}

function PokemonSummary({
  pokemon,
}: {
  pokemon: DamageCalculatorPokemon | null;
}) {
  // 未選択時も同じ高さの枠を出し、左右のレイアウトが跳ねないようにする。
  if (!pokemon) return <div className={styles.placeholder}>ポケモンを選択</div>;

  return (
    <div className={styles.pokemonSummary}>
      {pokemon.imageUrl ? (
        <Image
          src={pokemon.imageUrl}
          alt={pokemon.nameJa}
          width={112}
          height={112}
        />
      ) : null}
      <div>
        <strong>{pokemon.nameJa}</strong>
        <small>{pokemon.name}</small>
      </div>
    </div>
  );
}

function MoveSummary({ move }: { move: DamageCalculatorMove }) {
  return (
    <p className={styles.moveSummary}>
      {move.typeName} / {move.damageClass === "physical" ? "物理" : "特殊"} /
      威力 {move.power}
    </p>
  );
}

function DamageResult({ result }: { result: CalculationResult }) {
  // ダメージが大きいほど残りHPは小さいため、最小・最大の対応が逆になる。
  const remainingMinimum = Math.max(0, 100 - result.maximumPercent);
  const remainingMaximum = Math.max(0, 100 - result.minimumPercent);

  return (
    <section className={styles.result} aria-live="polite">
      <p className={styles.resultLabel}>計算結果</p>
      <h2>
        {result.minimum}〜{result.maximum} ダメージ
      </h2>
      <strong>
        HPの {result.minimumPercent.toFixed(1)}〜
        {result.maximumPercent.toFixed(1)}%
      </strong>
      <div className={styles.hpBar} aria-label="攻撃後の残りHP">
        <span style={{ width: `${remainingMaximum}%` }} />
      </div>
      <p>
        {result.defenderName}の残りHP：
        {remainingMinimum.toFixed(1)}〜{remainingMaximum.toFixed(1)}%
      </p>
      <small>{result.koChance}</small>
    </section>
  );
}
