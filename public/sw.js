/**
 * このファイルの役割: 静的アセットをキャッシュし、ネットワーク失敗時にキャッシュへフォールバックするPWA用Service Worker。
 */

const CACHE_NAME = "pokemon-lab-v6";
const IMAGE_CACHE_NAME = "pokemon-lab-images-v1";
const IMAGE_CACHE_LIMIT = 300;
const APP_SHELL = [
  "/",
  "/quiz",
  "/pokemon",
  "/damage-calculator",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/screenshots/desktop-wide.png",
  "/screenshots/mobile.png",
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);

  // 各ページのHTMLが参照するビルド済みJS/CSSも保存し、初回キャッシュ後から
  // ダメージ計算エンジンを含めて完全にオフラインで起動できるようにする。
  const pageResponses = await Promise.all(
    APP_SHELL.filter((path) => !path.includes(".")).map((path) =>
      cache.match(path),
    ),
  );
  const assetPaths = new Set();

  for (const response of pageResponses) {
    if (!response) continue;
    const html = await response.text();
    for (const match of html.matchAll(
      /(?:src|href)="(\/_next\/static\/[^"]+)"/g,
    )) {
      assetPaths.add(match[1]);
    }
  }

  if (assetPaths.size > 0) {
    await cache.addAll([...assetPaths]);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE_NAME && key !== IMAGE_CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

async function trimImageCache(cache) {
  const requests = await cache.keys();
  const overflow = requests.length - IMAGE_CACHE_LIMIT;

  if (overflow > 0) {
    await Promise.all(
      requests.slice(0, overflow).map((request) => cache.delete(request)),
    );
  }
}

async function cacheImage(cache, request, response) {
  if (!response.ok) return;

  // 再登録して、最近使った画像がキャッシュ順の末尾になるようにする。
  await cache.delete(request);
  await cache.put(request, response.clone());
  await trimImageCache(cache);
}

async function respondWithCachedImage(event) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(event.request);

  if (cached) {
    const refresh = cacheImage(cache, event.request, cached)
      .then(() => fetch(event.request))
      .then(async (response) => {
        await cacheImage(cache, event.request, response);
        return response;
      })
      .catch(() => null);
    event.waitUntil(refresh);
    return cached;
  }

  const response = await fetch(event.request);
  event.waitUntil(cacheImage(cache, event.request, response));
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  const isReactServerComponent =
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.get("Accept")?.includes("text/x-component");

  if (isReactServerComponent || url.pathname.startsWith("/_next/webpack-hmr")) {
    return;
  }

  if (url.pathname === "/_next/image") {
    event.respondWith(respondWithCachedImage(event));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) ?? (await caches.match("/"));
          return (
            cached ??
            new Response("オフラインです", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/screenshots/") ||
    url.pathname === "/manifest.webmanifest";

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) {
          return cached;
        }

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});
