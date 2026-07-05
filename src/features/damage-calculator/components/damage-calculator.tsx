"use client";

/**
 * このファイルの役割:
 * ダメージ計算ページの入力状態を管理し、検索欄・技選択・計算結果を組み立てる。
 *
 * 実際の計算式やDBアクセスはこのコンポーネントへ書かず、
 * application層の計算機と、Server Componentから渡されたカタログを利用する。
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  CHAMPIONS_DAMAGE_RULESET,
  championsDamageCalculator,
} from "../config/champions-damage-ruleset";
import type { DamageCalculation } from "../application/smogon-damage-calculator";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import { PokemonCombobox } from "./pokemon-combobox";
import {
  getDamageHistory,
  saveDamageHistory,
  type DamageHistoryRecord,
  type DamageHistorySide,
} from "../infrastructure/damage-history-repository";
import styles from "../styles/damage-calculator.module.css";

type CalculationResult = {
  normal: DamageCalculation;
  critical: DamageCalculation;
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
  const [attackerQuery, setAttackerQuery] = useState("");
  const [defenderQuery, setDefenderQuery] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [attackerHistory, setAttackerHistory] = useState<
    DamageHistoryRecord[]
  >([]);
  const [defenderHistory, setDefenderHistory] = useState<
    DamageHistoryRecord[]
  >([]);

  // IndexedDBはブラウザ専用なので、初回表示後に最近使った履歴を読み込む。
  useEffect(() => {
    let active = true;

    Promise.all([
      getDamageHistory("attacker"),
      getDamageHistory("defender"),
    ])
      .then(([savedAttackers, savedDefenders]) => {
        if (!active) return;
        setAttackerHistory(savedAttackers);
        setDefenderHistory(savedDefenders);
      })
      .catch((caught: unknown) => {
        console.error("ダメージ計算履歴を読み込めませんでした。", caught);
      });

    return () => {
      active = false;
    };
  }, []);

  // 攻撃側を変更したら、前のポケモンの技や計算結果を残さない。
  function selectAttacker(pokemon: DamageCalculatorPokemon | null) {
    setAttacker(pokemon);
    setAttackerQuery(pokemon?.nameJa ?? "");
    setMoveId("");
    setResult(null);
    setError(null);
  }

  // 防御側を変更した場合も、古い相手に対する結果を消す。
  function selectDefender(pokemon: DamageCalculatorPokemon | null) {
    setDefender(pokemon);
    setDefenderQuery(pokemon?.nameJa ?? "");
    setResult(null);
    setError(null);
  }

  function changeAttackerQuery(value: string) {
    setAttackerQuery(value);
  }

  function changeDefenderQuery(value: string) {
    setDefenderQuery(value);
  }

  /**
   * 履歴画像からポケモンを復元する。
   * SQLite由来の最新カタログに存在しない古いIDは何もせず無視する。
   */
  function restoreHistory(
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) {
    const pokemon =
      pokemonCatalog.find(({ id }) => id === history.pokemonId) ?? null;
    if (!pokemon) return;

    if (side === "attacker") {
      setAttacker(pokemon);
      setAttackerQuery(pokemon.nameJa);
      setMoveId(
        pokemon.moves.some(({ id }) => id === history.moveId)
          ? (history.moveId ?? "")
          : "",
      );
    } else {
      setDefender(pokemon);
      setDefenderQuery(pokemon.nameJa);
    }
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
        normal: championsDamageCalculator.calculate({
          attacker,
          defender,
          move,
        }),
        critical: championsDamageCalculator.calculate({
          attacker,
          defender,
          move,
          isCritical: true,
        }),
        attackerName: attacker.nameJa,
        defenderName: defender.nameJa,
        moveName: move.name,
      });
      // 計算に成功した組み合わせだけを履歴へ残す。
      void Promise.all([
        saveDamageHistory("attacker", attacker.id, move.id),
        saveDamageHistory("defender", defender.id),
      ])
        .then(([savedAttackers, savedDefenders]) => {
          setAttackerHistory(savedAttackers);
          setDefenderHistory(savedDefenders);
        })
        .catch((caught: unknown) => {
          console.error("ダメージ計算履歴を保存できませんでした。", caught);
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
          inputValue={attackerQuery}
          onInputValueChange={changeAttackerQuery}
          onSelect={selectAttacker}
        />
        <RecentPokemonList
          side="attacker"
          history={attackerHistory}
          pokemonCatalog={pokemonCatalog}
          onRestore={restoreHistory}
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
          inputValue={defenderQuery}
          onInputValueChange={changeDefenderQuery}
          onSelect={selectDefender}
        />
        <RecentPokemonList
          side="defender"
          history={defenderHistory}
          pokemonCatalog={pokemonCatalog}
          onRestore={restoreHistory}
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

function RecentPokemonList({
  side,
  history,
  pokemonCatalog,
  onRestore,
}: {
  side: DamageHistorySide;
  history: DamageHistoryRecord[];
  pokemonCatalog: DamageCalculatorPokemon[];
  onRestore: (
    side: DamageHistorySide,
    history: DamageHistoryRecord,
  ) => void;
}) {
  const availableHistory = history.flatMap((record) => {
    const pokemon = pokemonCatalog.find(({ id }) => id === record.pokemonId);
    return pokemon ? [{ record, pokemon }] : [];
  });

  if (availableHistory.length === 0) return null;

  return (
    <div className={styles.recentPokemon}>
      <small>最近使ったポケモン</small>
      <div className={styles.recentPokemonList}>
        {availableHistory.map(({ record, pokemon }) => (
          <button
            type="button"
            title={`${pokemon.nameJa}を選択`}
            aria-label={`${pokemon.nameJa}を選択`}
            onClick={() => onRestore(side, record)}
            key={record.id}
          >
            {pokemon.imageUrl ? (
              <Image
                src={pokemon.imageUrl}
                alt=""
                width={48}
                height={48}
              />
            ) : (
              <span>{pokemon.nameJa.slice(0, 1)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
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
  return (
    <section className={styles.result} aria-live="polite">
      <p className={styles.resultLabel}>計算結果</p>
      <h2>
        {result.attackerName}の{result.moveName}
      </h2>
      <div className={styles.outcomeGrid}>
        <DamageOutcome
          title="通常ダメージ"
          calculation={result.normal}
          defenderName={result.defenderName}
        />
        <DamageOutcome
          title="急所に当たった場合"
          calculation={result.critical}
          defenderName={result.defenderName}
          critical
        />
      </div>
    </section>
  );
}

function DamageOutcome({
  title,
  calculation,
  defenderName,
  critical = false,
}: {
  title: string;
  calculation: DamageCalculation;
  defenderName: string;
  critical?: boolean;
}) {
  // ダメージが大きいほど残りHPは小さいため、最小・最大の対応が逆になる。
  const remainingMinimum = Math.max(0, 100 - calculation.maximumPercent);
  const remainingMaximum = Math.max(0, 100 - calculation.minimumPercent);

  return (
    <article
      className={`${styles.outcome} ${critical ? styles.criticalOutcome : ""}`}
    >
      <h3>{title}</h3>
      <p className={styles.koLabel}>{calculation.koLabel}</p>
      <h4>
        {calculation.minimum}〜{calculation.maximum} ダメージ
      </h4>
      <strong>
        HPの {calculation.minimumPercent.toFixed(1)}〜
        {calculation.maximumPercent.toFixed(1)}%
      </strong>
      <div
        className={styles.remainingHpBar}
        role="img"
        aria-label={`防御側の残りHPは、最低乱数時 ${remainingMaximum.toFixed(1)}%、最高乱数時 ${remainingMinimum.toFixed(1)}%`}
      >
        <span
          className={styles.maximumRemainingHp}
          style={{ width: `${remainingMaximum}%` }}
        />
        <span
          className={styles.minimumRemainingHp}
          style={{ width: `${remainingMinimum}%` }}
        />
      </div>
      <div className={styles.remainingHpLegend}>
        <span className={styles.maximumRemainingLegend}>
          最低乱数時 {remainingMaximum.toFixed(1)}%
        </span>
        <span className={styles.minimumRemainingLegend}>
          最高乱数時 {remainingMinimum.toFixed(1)}%
        </span>
      </div>
      <p>
        {defenderName}の残りHP：
        {remainingMinimum.toFixed(1)}〜{remainingMaximum.toFixed(1)}%
      </p>
    </article>
  );
}
