"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  getFirebaseAuth,
  signInWithGoogle,
  signOutFirebaseUser,
} from "@/infrastructure/firebase/firebase-client";
import {
  getUserDatabaseBackupMetadata,
  loadUserDatabaseBackup,
  saveUserDatabaseBackup,
} from "@/infrastructure/firebase/user-db-backup-repository";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import styles from "./user-database-sync.module.css";

const LAST_SYNC_PREFIX = "pokemon-lab:user-db:last-sync:";

function getLastSync(uid: string) {
  return Number(window.localStorage.getItem(`${LAST_SYNC_PREFIX}${uid}`) ?? 0);
}

function setLastSync(uid: string, updatedAt: number) {
  window.localStorage.setItem(`${LAST_SYNC_PREFIX}${uid}`, String(updatedAt));
}

function formatStatusDate(timestamp: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function UserDatabaseSync() {
  const [user, setUser] = useState<User | null>(null);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [message, setMessage] = useState("未ログイン");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const lastSync = getLastSync(nextUser.uid);
        setLastSyncAt(lastSync);
        setMessage(lastSync ? "同期済み" : "ログイン済み");
      } else {
        setLastSyncAt(0);
        setMessage("未ログイン");
      }
    });

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function syncUserDatabase(activeUser = user) {
    if (!activeUser || !navigator.onLine || syncing) return;
    setSyncing(true);
    setMessage("同期中");
    try {
      await sqliteWorkerClient.initialize();
      const lastSync = getLastSync(activeUser.uid);
      const remoteMetadata = await getUserDatabaseBackupMetadata(activeUser.uid);

      if (remoteMetadata && remoteMetadata.updatedAt > lastSync) {
        const backup = await loadUserDatabaseBackup(activeUser.uid);
        if (backup) {
          await sqliteWorkerClient.importUserDatabase(backup.bytes);
          setLastSync(activeUser.uid, backup.metadata.updatedAt);
          setLastSyncAt(backup.metadata.updatedAt);
          setMessage("クラウドから復元");
          return;
        }
      }

      const bytes = await sqliteWorkerClient.exportUserDatabase();
      const saved = await saveUserDatabaseBackup(activeUser.uid, bytes);
      setLastSync(activeUser.uid, saved.updatedAt);
      setLastSyncAt(saved.updatedAt);
      setMessage("クラウドへ同期");
    } catch (error) {
      console.warn("Failed to sync user.db.", error);
      setMessage("同期失敗");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!user || !online) return;
    const timer = window.setTimeout(() => void syncUserDatabase(user), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, online]);

  async function handleSignIn() {
    setMessage("ログイン中");
    try {
      const result = await signInWithGoogle();
      await syncUserDatabase(result.user);
    } catch (error) {
      console.warn("Failed to sign in with Google.", error);
      setMessage("ログイン失敗");
    }
  }

  async function handleSignOut() {
    await signOutFirebaseUser();
  }

  return (
    <div className={styles.syncBox}>
      <span className={online ? styles.online : styles.offline} />
      <span className={styles.status}>
        {message}
        {lastSyncAt ? ` ${formatStatusDate(lastSyncAt)}` : ""}
      </span>
      {user ? (
        <>
          <button type="button" disabled={syncing || !online} onClick={() => void syncUserDatabase()}>
            同期
          </button>
          <button type="button" onClick={() => void handleSignOut()}>
            ログアウト
          </button>
        </>
      ) : (
        <button type="button" disabled={!online} onClick={() => void handleSignIn()}>
          Googleログイン
        </button>
      )}
    </div>
  );
}
