"use client";

import { useCallback, useEffect, useState } from "react";
import {
  runSqlitePhaseTwoDiagnostics,
  sqliteWorkerClient,
  type SqlitePhaseTwoDiagnostics,
} from "@/infrastructure/sqlite-wasm/sqlite-client";
import {
  deleteBattleTeam,
  findTrainingBuildByContentKey,
  getAllBattleTeams,
  saveBattleTeam,
  saveTrainingBuild,
} from "@/features/training/infrastructure/training-build-repository";
import {
  getHint,
  getMistakeKeys,
  removeMistake,
  saveHint,
  saveMistake,
} from "@/features/quiz/storage/mistake-repository";
import {
  getDamageHistory,
  saveDamageHistory,
} from "@/features/damage-calculator/infrastructure/damage-history-repository";

type RepositoryDiagnostics = {
  trainingBuild: boolean;
  battleTeam: boolean;
  quiz: boolean;
  damageHistory: boolean;
};

/**
 * user.dbを使う各リポジトリを、実際の保存・取得・削除で検査する。
 * catalog.dbではなくユーザー保存領域の疎通確認が目的。
 */
async function runRepositoryDiagnostics(): Promise<RepositoryDiagnostics> {
  const token = crypto.randomUUID();
  const contentKey = `diagnostic:${token}`;
  const questionKey = `diagnostic:${token}`;
  const pokemonId = -Math.floor(Date.now() / 1000);
  let buildId: number | undefined;
  let teamId: number | undefined;

  try {
    // 通常データと衝突しない診断専用キーで、各保存経路を一通り通す。
    const savedBuild = await saveTrainingBuild({
      name: "SQLite診断用育成案",
      contentKey,
      pokemonId,
      nature: "serious",
      itemId: "",
      abilityId: "",
      abilityPoints: { hp: 1 },
      moveIds: ["diagnostic-move"],
      updatedAt: Date.now(),
    });
    buildId = savedBuild.id;
    const foundBuild = await findTrainingBuildByContentKey(contentKey);

    if (buildId === undefined) throw new Error("育成案IDを取得できません。");
    teamId = await saveBattleTeam("SQLite診断用チーム", [buildId]);
    const teams = await getAllBattleTeams();

    await saveMistake(questionKey);
    await saveHint(questionKey, "SQLite診断用ヒント");
    const [mistakeKeys, hint] = await Promise.all([
      getMistakeKeys(),
      getHint(questionKey),
    ]);

    await saveDamageHistory("attacker", pokemonId, "diagnostic-move");
    const damageHistory = await getDamageHistory("attacker");

    return {
      trainingBuild:
        foundBuild?.id === buildId &&
        foundBuild.name === "SQLite診断用育成案",
      battleTeam: teams.some(
        (team) => team.id === teamId && team.buildIds[0] === buildId,
      ),
      quiz:
        mistakeKeys.includes(questionKey) && hint === "SQLite診断用ヒント",
      damageHistory: damageHistory.some(
        (record) =>
          record.pokemonId === pokemonId &&
          record.moveId === "diagnostic-move",
      ),
    };
  } finally {
    // 診断ページを繰り返し実行してもuser.dbへ検査データを残さない。
    if (teamId !== undefined) await deleteBattleTeam(teamId);
    await removeMistake(questionKey);
    await saveHint(questionKey, "");
    await sqliteWorkerClient.execute(
      "DELETE FROM damage_history WHERE side = ? AND pokemon_id = ?",
      ["attacker", pokemonId],
    );
    if (buildId !== undefined) {
      await sqliteWorkerClient.execute(
        "DELETE FROM training_builds WHERE id = ?",
        [buildId],
      );
    }
  }
}

/** SQLite WASM、OPFS、Storage API、リポジトリ疎通をまとめて表示する診断UI。 */
export function SqliteDiagnostics() {
  const [diagnostics, setDiagnostics] =
    useState<SqlitePhaseTwoDiagnostics | null>(null);
  const [repositories, setRepositories] =
    useState<RepositoryDiagnostics | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  // ボタン押下でブラウザ能力診断とリポジトリ診断を並列実行する。
  const runDiagnostics = useCallback(() => {
    setRunning(true);
    setError("");
    void Promise.all([
      runSqlitePhaseTwoDiagnostics(),
      runRepositoryDiagnostics(),
    ])
      .then(([sqliteDiagnostics, repositoryDiagnostics]) => {
        setDiagnostics(sqliteDiagnostics);
        setRepositories(repositoryDiagnostics);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setRunning(false));
  }, []);

  // 自動テストや手動確認用に /sqlite-diagnostics?auto=1 で即実行できるようにする。
  useEffect(() => {
    if (!window.location.search.includes("auto=1")) return;
    queueMicrotask(runDiagnostics);
  }, [runDiagnostics]);

  if (error) return <p role="alert">SQLite WASM 初期化失敗: {error}</p>;
  if (!diagnostics) {
    return (
      <button type="button" disabled={running} onClick={runDiagnostics}>
        {running ? "SQLite WASM を初期化しています…" : "診断を実行"}
      </button>
    );
  }

  return (
    <dl>
      <dt>SQLite</dt>
      <dd>{diagnostics.worker.sqliteVersion}</dd>
      <dt>VFS</dt>
      <dd>{diagnostics.worker.vfs}</dd>
      <dt>user.db</dt>
      <dd>{diagnostics.worker.databaseFilename}</dd>
      <dt>スキーマバージョン</dt>
      <dd>{diagnostics.worker.schemaVersion}</dd>
      <dt>user.db テーブル数</dt>
      <dd>{diagnostics.worker.tableCount}</dd>
      <dt>user.db 保存件数</dt>
      <dd>{diagnostics.worker.userRecordCount}</dd>
      <dt>catalog.db</dt>
      <dd>{diagnostics.worker.catalogDatabaseFilename}</dd>
      <dt>catalog.db seed</dt>
      <dd>{diagnostics.worker.catalogSeedVersion ?? "未投入"}</dd>
      <dt>チャンピオンズ対象フォーム</dt>
      <dd>{diagnostics.worker.championsFormCount}</dd>
      <dt>タイプ相性</dt>
      <dd>{diagnostics.worker.typeMatchupCount}</dd>
      <dt>外部キー制約</dt>
      <dd>{diagnostics.worker.foreignKeysEnabled ? "有効" : "無効"}</dd>
      <dt>CRUD</dt>
      <dd>{diagnostics.worker.crudVerified ? "成功" : "失敗"}</dd>
      <dt>トランザクションのロールバック</dt>
      <dd>
        {diagnostics.worker.transactionRollbackVerified ? "成功" : "失敗"}
      </dd>
      <dt>DB 作成時刻</dt>
      <dd>{diagnostics.worker.databaseCreatedAt}</dd>
      <dt>育成案リポジトリ</dt>
      <dd>{repositories?.trainingBuild ? "成功" : "失敗"}</dd>
      <dt>バトルチームリポジトリ</dt>
      <dd>{repositories?.battleTeam ? "成功" : "失敗"}</dd>
      <dt>クイズリポジトリ</dt>
      <dd>{repositories?.quiz ? "成功" : "失敗"}</dd>
      <dt>ダメージ履歴リポジトリ</dt>
      <dd>{repositories?.damageHistory ? "成功" : "失敗"}</dd>
      <dt>永続ストレージ</dt>
      <dd>{diagnostics.persisted ? "許可済み" : "未許可"}</dd>
      <dt>使用量 / 上限</dt>
      <dd>
        {diagnostics.usage ?? "不明"} / {diagnostics.quota ?? "不明"} bytes
      </dd>
    </dl>
  );
}
