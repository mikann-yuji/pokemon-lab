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
