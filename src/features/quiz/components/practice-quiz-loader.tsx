"use client";

import { useEffect, useState } from "react";
import {
  getAllBattleTeams,
  getAllTrainingBuilds,
  type BattleTeam,
  type TrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import { getTypeMatchups } from "../infrastructure/quiz-catalog-repository";
import {
  getPracticeMemberCatalog,
  getPracticeTargets,
} from "../infrastructure/practice-quiz-repository";
import type { TypeMatchup } from "@/domain/type-matchup";
import type {
  PracticeBattleFormat,
  PracticeTarget,
  PracticeTeamMember,
} from "../practice-quiz-logic";
import PracticeQuizGame from "./practice-quiz-game";
import styles from "../styles/practice-quiz.module.css";

export default function PracticeQuizLoader() {
  const [teams, setTeams] = useState<BattleTeam[]>([]);
  const [builds, setBuilds] = useState<TrainingBuild[]>([]);
  const [typeMatchups, setTypeMatchups] = useState<TypeMatchup[]>([]);
  const [targetsByFormat, setTargetsByFormat] = useState<
    Record<PracticeBattleFormat, PracticeTarget[]>
  >({ single: [], double: [] });
  const [membersByBuildId, setMembersByBuildId] = useState<
    Map<number, PracticeTeamMember>
  >(new Map());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getAllBattleTeams(),
      getAllTrainingBuilds(),
      getTypeMatchups(),
      getPracticeTargets("single"),
      getPracticeTargets("double"),
    ])
      .then(async ([loadedTeams, loadedBuilds, matchups, single, double]) => {
        const catalog = await getPracticeMemberCatalog(
          loadedBuilds.map((build) => build.pokemonId),
        );
        if (!active) return;

        const nextMembers = new Map<number, PracticeTeamMember>();
        for (const build of loadedBuilds) {
          if (build.id === undefined) continue;
          const pokemon = catalog.pokemonByFormId.get(build.pokemonId);
          if (!pokemon) continue;
          const selectedMoveIds = new Set(build.moveIds);
          nextMembers.set(build.id, {
            buildId: build.id,
            buildName: build.name,
            pokemonId: build.pokemonId,
            pokemonName: pokemon.nameJa,
            imageUrl: pokemon.imageUrl,
            moves: (catalog.movesByFormId.get(build.pokemonId) ?? []).filter(
              (move) => selectedMoveIds.has(move.id),
            ),
          });
        }

        setTeams(loadedTeams);
        setBuilds(loadedBuilds);
        setTypeMatchups(matchups);
        setTargetsByFormat({ single, double });
        setMembersByBuildId(nextMembers);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("実践編クイズのデータを読み込めませんでした。", error);
        if (active) {
          setLoadError("実践編クイズのデータを読み込めませんでした。");
          setLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!loaded) {
    return <p className={styles.status}>クイズデータを読み込んでいます…</p>;
  }
  if (loadError) {
    return (
      <p className={styles.status} role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <PracticeQuizGame
      teams={teams}
      builds={builds}
      membersByBuildId={membersByBuildId}
      typeMatchups={typeMatchups}
      targetsByFormat={targetsByFormat}
    />
  );
}
