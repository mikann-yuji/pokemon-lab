"use client";

import { useCallback, useEffect, useState } from "react";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import {
  getDamageHistory,
  type DamageHistoryRecord,
} from "../infrastructure/damage-history-repository";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  getNatures,
  type Nature,
} from "@/features/training/infrastructure/training-catalog-repository";

// 通常ダメージ計算画面が使うユーザー保存データをまとめて読むhook。
// 履歴、バトルチーム、育成案、性格を同じタイミングで読み、同期後も再取得する。
export function useDamageCalculatorUserData() {
  const [attackerHistory, setAttackerHistory] = useState<
    DamageHistoryRecord[]
  >([]);
  const [defenderHistory, setDefenderHistory] = useState<
    DamageHistoryRecord[]
  >([]);
  const [battleTeams, setBattleTeams] = useState<BattleTeam[]>([]);
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const [natures, setNatures] = useState<Nature[]>([]);
  const [teamLoadError, setTeamLoadError] = useState("");

  const loadUserData = useCallback(async (active = true) => {
    // 画面に必要なuser.db由来データを並列で読む。
    // active=falseになった後は、遅れて解決したPromiseで画面を更新しない。
    const [
      savedAttackers,
      savedDefenders,
      teams,
      builds,
      loadedNatures,
    ] = await Promise.all([
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
    // 初回描画を軽くするため、保存データ読み込みは1tick遅らせる。
    const timer = window.setTimeout(() => {
      void loadUserData(active).catch((caught: unknown) => {
        console.error("ダメージ計算の保存データを読み込めませんでした。", caught);
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
    // Firestore同期が終わったらuser.dbが更新されるため、画面の保存データも読み直す。
    const handleSynced = () => {
      void loadUserData(active).catch((caught: unknown) => {
        console.error("同期後のダメージ計算データを読み込めませんでした。", caught);
        if (active) setTeamLoadError("同期後の保存データを読み込めませんでした。");
      });
    };
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    return () => {
      active = false;
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    };
  }, [loadUserData]);

  return {
    attackerHistory,
    setAttackerHistory,
    defenderHistory,
    setDefenderHistory,
    battleTeams,
    trainingBuilds,
    natures,
    teamLoadError,
  };
}
