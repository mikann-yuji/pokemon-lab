"use client";

import { useEffect } from "react";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import {
  saveDamageHistory,
  type DamageHistoryRecord,
} from "../infrastructure/damage-history-repository";

/**
 * ダメージ計算ページで、攻撃側/防御側の最近使ったポケモン履歴を保存する。
 *
 * @param params - 選択中の攻撃側、防御側、技、履歴更新setter。
 * @returns 戻り値なし。選択状態が揃った時だけuser.dbへ保存する。
 */
export function useDamageHistoryPersistence({
  attacker,
  defender,
  selectedMove,
  setAttackerHistory,
  setDefenderHistory,
}: {
  attacker: DamageCalculatorPokemon | null;
  defender: DamageCalculatorPokemon | null;
  selectedMove: DamageCalculatorMove | undefined;
  setAttackerHistory: (history: DamageHistoryRecord[]) => void;
  setDefenderHistory: (history: DamageHistoryRecord[]) => void;
}) {
  useEffect(() => {
    if (!attacker || !defender || !selectedMove) return;

    // 技まで選ばれて初めて、攻撃側の履歴に「どの技を使ったか」を残せる。
    // 防御側はポケモンIDだけで復元できるのでmoveIdは保存しない。
    let active = true;
    void Promise.all([
      saveDamageHistory("attacker", attacker.id, selectedMove.id),
      saveDamageHistory("defender", defender.id),
    ])
      .then(([savedAttackers, savedDefenders]) => {
        if (!active) return;
        setAttackerHistory(savedAttackers);
        setDefenderHistory(savedDefenders);
      })
      .catch((caught: unknown) => {
        console.error("ダメージ計算履歴を保存できませんでした。", caught);
      });

    return () => {
      active = false;
    };
  }, [attacker, defender, selectedMove, setAttackerHistory, setDefenderHistory]);
}
