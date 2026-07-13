"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import {
  getFirebaseAuth,
  getGoogleRedirectResult,
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOutFirebaseUser,
} from "@/infrastructure/firebase/firebase-client";
import {
  syncUserRecords,
} from "@/infrastructure/firebase/user-record-sync-repository";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import styles from "./user-database-sync.module.css";

const LAST_SYNC_PREFIX = "pokemon-lab:user-db:last-sync:";
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SYNC_MIN_INTERVAL_MS = 30 * 1000;
export const USER_RECORDS_SYNCED_EVENT = "pokemon-lab:user-records-synced";
export const USER_RECORDS_LOCAL_CHANGED_EVENT =
  "pokemon-lab:user-records-local-changed";

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

function getFirebaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function shouldUseRedirectSignIn(error: unknown) {
  return [
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
    "auth/popup-blocked",
  ].includes(getFirebaseErrorCode(error));
}

function getSignInErrorMessage(error: unknown) {
  const code = getFirebaseErrorCode(error);
  if (code === "auth/unauthorized-domain") {
    return "ログイン失敗: Firebaseの承認済みドメインを確認";
  }
  if (code === "auth/popup-closed-by-user") {
    return "ログインがキャンセルされました";
  }
  return code ? `ログイン失敗: ${code}` : "ログイン失敗";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getSyncErrorMessage(error: unknown) {
  const code = getFirebaseErrorCode(error);
  const message = getErrorMessage(error);
  if (code === "permission-denied") {
    return "同期失敗: Firestore権限";
  }
  if (code === "resource-exhausted") {
    return "同期失敗: Firestore容量/回数上限";
  }
  if (code === "unavailable") {
    return "同期失敗: ネットワーク";
  }
  if (code) return `同期失敗: ${code}`;
  return message ? `同期失敗: ${message}` : "同期失敗";
}

export function UserDatabaseSync() {
  const [user, setUser] = useState<User | null>(null);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [message, setMessage] = useState("未ログイン");
  const [detailMessage, setDetailMessage] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const syncingRef = useRef(false);
  const lastAutoSyncAttemptRef = useRef(0);

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
    if (!activeUser || !navigator.onLine || syncingRef.current) return;
    lastAutoSyncAttemptRef.current = Date.now();
    syncingRef.current = true;
    setSyncing(true);
    setMessage("同期中");
    setDetailMessage("");
    setDetailOpen(false);
    try {
      setMessage("DB準備中");
      await sqliteWorkerClient.initialize();
      setMessage("レコード同期中");
      const result = await syncUserRecords(activeUser.uid);
      const syncedAt = Date.now();
      setLastSync(activeUser.uid, syncedAt);
      setLastSyncAt(syncedAt);
      setMessage(`同期済み ${result.uploaded}件`);
      window.dispatchEvent(
        new CustomEvent(USER_RECORDS_SYNCED_EVENT, { detail: result }),
      );
    } catch (error) {
      console.warn("Failed to sync user.db.", error);
      const syncErrorMessage = getSyncErrorMessage(error);
      setMessage(syncErrorMessage);
      setDetailMessage(getErrorMessage(error));
      setDetailOpen(true);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  function requestAutoSync(
    activeUser = user,
    minimumIntervalMs = AUTO_SYNC_MIN_INTERVAL_MS,
  ) {
    if (!activeUser || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastAutoSyncAttemptRef.current < minimumIntervalMs) return;
    lastAutoSyncAttemptRef.current = now;
    void syncUserDatabase(activeUser);
  }

  useEffect(() => {
    if (!user || !online) return;
    const timer = window.setTimeout(() => void syncUserDatabase(user), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, online]);

  useEffect(() => {
    if (!user || !online) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      requestAutoSync(user, AUTO_SYNC_INTERVAL_MS);
    }, AUTO_SYNC_INTERVAL_MS);
    const handleFocus = () => requestAutoSync(user);
    const handlePageShow = () => requestAutoSync(user);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestAutoSync(user);
    };
    const handleLocalChanged = () => requestAutoSync(user, 0);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(USER_RECORDS_LOCAL_CHANGED_EVENT, handleLocalChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        USER_RECORDS_LOCAL_CHANGED_EVENT,
        handleLocalChanged,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, online]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void getGoogleRedirectResult()
        .then((result) => {
          if (result?.user) void syncUserDatabase(result.user);
        })
        .catch((error: unknown) => {
          console.warn("Failed to finish Google redirect sign in.", error);
          setMessage(getSignInErrorMessage(error));
        });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignIn() {
    if (!navigator.onLine) {
      setMessage("オフラインです");
      return;
    }

    setMessage("ログイン中");
    setDetailMessage("");
    setDetailOpen(false);
    try {
      const result = await signInWithGoogle();
      await syncUserDatabase(result.user);
    } catch (error) {
      console.warn("Failed to sign in with Google.", error);
      if (shouldUseRedirectSignIn(error)) {
        setMessage("Googleへ移動します");
        await signInWithGoogleRedirect();
        return;
      }
      setMessage(getSignInErrorMessage(error));
      setDetailMessage(getErrorMessage(error));
      setDetailOpen(true);
    }
  }

  async function handleSignOut() {
    await signOutFirebaseUser();
  }

  return (
    <div className={styles.syncBox}>
      <div className={styles.summaryRow}>
        <span className={online ? styles.online : styles.offline} />
        <button
          type="button"
          className={styles.statusButton}
          title={detailMessage || message}
          onClick={() => detailMessage && setDetailOpen((current) => !current)}
        >
          {message}
          {lastSyncAt ? ` ${formatStatusDate(lastSyncAt)}` : ""}
        </button>
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
          <button type="button" disabled={syncing} onClick={() => void handleSignIn()}>
            Googleログイン
          </button>
        )}
      </div>
      {detailMessage && detailOpen ? (
        <p className={styles.detailMessage}>{detailMessage}</p>
      ) : null}
    </div>
  );
}
