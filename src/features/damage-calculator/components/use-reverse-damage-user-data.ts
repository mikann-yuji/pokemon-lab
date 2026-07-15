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

export function useReverseDamageUserData() {
  const [attackerHistory, setAttackerHistory] = useState<DamageHistoryRecord[]>([]);
  const [defenderHistory, setDefenderHistory] = useState<DamageHistoryRecord[]>([]);
  const [battleTeams, setBattleTeams] = useState<BattleTeam[]>([]);
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const [natures, setNatures] = useState<Nature[]>([]);
  const [teamLoadError, setTeamLoadError] = useState("");

  const loadUserData = useCallback(async (active = true) => {
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
