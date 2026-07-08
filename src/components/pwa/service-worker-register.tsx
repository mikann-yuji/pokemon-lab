"use client";

/**
 * このファイルの役割: ブラウザ上でService Workerを登録し、PWAのオフライン対応を有効化する小さなクライアントコンポーネント。
 */

import { useEffect } from "react";

/**
 * 本番環境ではService Workerを登録し、開発環境では古い登録を解除する。
 */
export function ServiceWorkerRegister() {
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
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch((error) => {
        console.error("Service worker registration failed", error);
      });
  }, []);

  return null;
}
