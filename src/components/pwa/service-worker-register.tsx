"use client";

/**
 * このファイルの役割: ブラウザ上でService Workerを登録し、PWAのオフライン対応を有効化する小さなクライアントコンポーネント。
 */

import { useEffect, useRef, useState } from "react";
import styles from "./service-worker-register.module.css";

/**
 * 本番環境ではService Workerを登録し、開発環境では古い登録を解除する。
 */
export function ServiceWorkerRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);

  // Service Workerはブラウザ専用APIなので、クライアントでマウントされた後だけ登録する。
  useEffect(() => {
    // 未対応ブラウザでは何もせず、通常のWebアプリとして動かす。
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        );

      if ("caches" in window) {
        void caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("pokemon-lab-"))
              .map((key) => caches.delete(key)),
          ),
        );
      }
      return;
    }

    // public/sw.js はビルド後もルート直下 /sw.js として配信される。
    let disposed = false;
    const showWaitingWorker = (worker: ServiceWorker | null) => {
      if (!disposed && worker) setWaitingWorker(worker);
    };

    const handleControllerChange = () => {
      if (applyingRef.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((nextRegistration) => {
        if (disposed) return;
        showWaitingWorker(nextRegistration.waiting);
        nextRegistration.addEventListener("updatefound", () => {
          const installingWorker = nextRegistration.installing;
          installingWorker?.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              showWaitingWorker(nextRegistration.waiting ?? installingWorker);
            }
          });
        });
        void nextRegistration.update();
      })
      .catch((error) => {
        console.error("Service worker registration failed", error);
      });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <aside className={styles.updateNotice} aria-live="polite">
      <span>新しいバージョンを利用できます。</span>
      <button
        type="button"
        className={styles.updateButton}
        disabled={applying}
        onClick={() => {
          applyingRef.current = true;
          setApplying(true);
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        {applying ? "反映中…" : "更新を反映"}
      </button>
    </aside>
  );
}
