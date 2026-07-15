"use client";

import { useCallback, useEffect, useState } from "react";
import { USER_RECORDS_SYNCED_EVENT } from "@/components/sync/user-database-sync";
import {
  getAllTrainingBuilds,
  type TrainingBuild,
} from "../infrastructure/training-build-repository";
import {
  getHeldItems,
  getNatures,
  type HeldItem,
  type Nature,
} from "../infrastructure/training-catalog-repository";

export function useTrainingCatalogOptions({
  initialNatures,
  initialHeldItems,
}: {
  initialNatures?: Nature[];
  initialHeldItems?: HeldItem[];
}) {
  const [natures, setNatures] = useState<Nature[]>(initialNatures ?? []);
  const [heldItems, setHeldItems] = useState<HeldItem[]>(initialHeldItems ?? []);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    if (initialNatures && initialHeldItems) return;
    let active = true;
    void Promise.all([getNatures(), getHeldItems()])
      .then(([loadedNatures, loadedItems]) => {
        if (!active) return;
        setNatures(loadedNatures);
        setHeldItems(loadedItems);
      })
      .catch((error: unknown) => {
        console.error("Failed to load training simulator catalog data.", error);
        if (active) {
          setCatalogError("育成シミュレータ用データを読み込めませんでした。");
        }
      });
    return () => {
      active = false;
    };
  }, [initialHeldItems, initialNatures]);

  return { catalogError, heldItems, natures, setNatures };
}

export function useTrainingBuildList() {
  const [trainingBuilds, setTrainingBuilds] = useState<TrainingBuild[]>([]);
  const [matchupError, setMatchupError] = useState("");

  const loadTrainingBuilds = useCallback(async (active = true) => {
    const builds = await getAllTrainingBuilds();
    if (active) setTrainingBuilds(builds);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadTrainingBuilds(active).catch((error: unknown) => {
        console.error("Failed to load saved training builds.", error);
        if (active) setMatchupError("保存済み育成案を読み込めませんでした。");
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadTrainingBuilds]);

  useEffect(() => {
    let active = true;
    const handleSynced = () => {
      void loadTrainingBuilds(active).catch((error: unknown) => {
        console.error("Failed to reload saved training builds after sync.", error);
        if (active) setMatchupError("同期後の保存済み育成案を読み込めませんでした。");
      });
    };
    window.addEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    return () => {
      active = false;
      window.removeEventListener(USER_RECORDS_SYNCED_EVENT, handleSynced);
    };
  }, [loadTrainingBuilds]);

  return { matchupError, setMatchupError, setTrainingBuilds, trainingBuilds };
}
