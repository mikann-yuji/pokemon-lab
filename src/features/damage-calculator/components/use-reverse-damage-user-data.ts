"use client";

import { useCallback, useEffect, useState } from "react";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import {
  getNatures,
  type Nature,
} from "@/features/training/infrastructure/training-catalog-repository";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  getDamageHistory,
  type DamageHistoryRecord,
} from "../infrastructure/damage-history-repository";

/**
 * 逆引きダメージ計算ページで、user.db由来の保存データをまとめて読み込む。
 *
 * @returns 履歴、バトルチーム、育成案、性格、履歴setter、読み込みエラー。
 */
export function useReverseDamageUserData() {
  // 逆引きページも通常計算ページと同じ保存データを使う。
  // ただし候補探索の入力として使うため、このhook内では読み込みと同期追従に責務を絞る。
  const [attackerHistory, setAttackerHistory] = useState<DamageHistoryRecord[]>([]);
  const [defenderHistory, setDefenderHistory] = useState<DamageHistoryRecord[]>([]);
  const [battleTeams, setBattleTeams] = useState<BattleTeam[]>([]);
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const [natures, setNatures] = useState<Nature[]>([]);
  const [teamLoadError, setTeamLoadError] = useState("");

  /**
   * 逆引きダメージ計算ページで、履歴・チーム・育成案・性格を並列に再取得する。
   *
   * @param active - falseなら取得完了後もReact stateを更新しない。
   * @returns 読み込み完了を表すPromise。
   */
  const loadUserData = useCallback(async (active = true) => {
    // user.db由来のデータは互いに依存しないため並列で読む。
    // 読み込み順ではなく、揃った後にまとめて画面へ反映する。
    const [savedAttackers, savedDefenders, teams, builds, loadedNatures] =
      await Promise.all([
        getDamageHistory("attacker"),
        getDamageHistory("defender"),
        getAllBattleTeams(),
        getAllTrainingBuilds(),
        getNatures(),
      ]);
    if (!active) return;
    setAttackerHistory(savedAttackers);
    setDefenderHistory(savedDefenders);
    setBattleTeams(teams);
    setTrainingBuilds(builds);
    setNatures(loadedNatures);
  }, []);

  useEffect(() => {
    let active = true;
    // 初回描画直後に保存データを読む。
    // 逆引きフォームそのものは先に触れるよう、同期的な読み込みでブロックしない。
    const timer = window.setTimeout(() => {
      void loadUserData(active).catch((caught: unknown) => {
        console.error("Failed to load reverse calculator user data.", caught);
        if (active) setTeamLoadError("保存データを読み込めませんでした。");
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadUserData]);

  useEffect(() => {
    let active = true;
    // Firestore同期後はuser.dbの保存済み育成案やチームが増える可能性がある。
    // 逆引き候補に反映できるよう、同期イベントを受けて再取得する。
    const handleSynced = () => {
      void loadUserData(active).catch((caught: unknown) => {
        console.error("Failed to reload reverse calculator user data.", caught);
        if (active) setTeamLoadError("同期後の保存データを読み込めませんでした。");
      });
    };
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    return () => {
      active = false;
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    };
  }, [loadUserData]);

  // 戻り値は画面表示用の配列と、履歴保存hookへ渡すsetterをまとめたもの。
  // 逆引き計算そのものはuseReverseDamageCandidatesに分離している。
  return {
    attackerHistory,
    battleTeams,
    defenderHistory,
    natures,
    setAttackerHistory,
    setDefenderHistory,
    setTeamLoadError,
    teamLoadError,
    trainingBuilds,
  };
}
