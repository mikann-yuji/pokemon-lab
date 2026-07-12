const CACHE_NAME = "pokemon-lab-v11";
const IMAGE_CACHE_NAME = "pokemon-lab-images-v1";
const IMAGE_CACHE_LIMIT = 300;

const APP_ROUTES = [
  "/",
  "/quiz",
  "/pokemon",
  "/damage-calculator",
  "/training",
  "/training-builds",
  "/battle-team",
  "/battle-team/new",
  "/battle-simulator",
  "/battle-simulator/battle",
  "/battle-records",
  "/sqlite-diagnostics",
];

const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/screenshots/desktop-wide.png",
  "/screenshots/mobile.png",
  "/sqlite-runtime-worker.mjs",
  "/sqlite-catalog.db.gz",
  "/champions-icons/manifest.json",
  "/sqlite-wasm/index.mjs",
  "/sqlite-wasm/sqlite3.wasm",
  "/sqlite-wasm/sqlite3-worker1.mjs",
  "/sqlite-wasm/sqlite3-opfs-async-proxy.js",
];

async function cacheRequests(cache, paths) {
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}`);
      }
      await cache.put(path, response);
    }),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.warn("Some offline assets could not be cached.", failures);
    throw new Error("Offline asset caching failed.");
  }
}

async function cacheNextStaticAssets(cache) {
  const pageResponses = await Promise.all(
    APP_ROUTES.map((path) => cache.match(path)),
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
    await cacheRequests(cache, [...assetPaths]);
  }
}

async function cacheChampionIcons(cache) {
  const manifestResponse = await cache.match("/champions-icons/manifest.json");
  if (!manifestResponse) return;

  const manifest = await manifestResponse.json();
  const iconPaths = manifest
    .map((entry) => entry.iconPath)
    .filter((path) => typeof path === "string");
  if (iconPaths.length > 0) {
    await cacheRequests(cache, iconPaths);
  }
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cacheRequests(cache, [...APP_ROUTES, ...CORE_ASSETS]);
  await cacheChampionIcons(cache);
  await cacheNextStaticAssets(cache);
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
            .filter((key) => key !== CACHE_NAME && key !== IMAGE_CACHE_NAME)
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
  if (!response.ok && response.type !== "opaque") return;
  await cache.delete(request);
  await cache.put(request, response.clone());
  await trimImageCache(cache);
}

async function respondWithCachedImage(event) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(event.request);

  if (cached) {
    const refresh = fetch(event.request)
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

async function respondWithCachedFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function respondWithNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match(request)) ?? (await caches.match("/"));
    return (
      cached ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (request.destination === "image") {
    event.respondWith(respondWithCachedImage(event));
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/_next/webpack-hmr")) {
    return;
  }

  if (url.pathname === "/_next/image") {
    event.respondWith(respondWithCachedImage(event));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(respondWithNavigation(request));
    return;
  }

  const isOfflineAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/screenshots/") ||
    url.pathname.startsWith("/champions-icons/") ||
    url.pathname.startsWith("/sqlite-wasm/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sqlite-runtime-worker.mjs" ||
    url.pathname === "/sqlite-catalog.db.gz";

  if (isOfflineAsset) {
    event.respondWith(respondWithCachedFirst(request));
    return;
  }

  const isReactServerComponent =
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.get("Accept")?.includes("text/x-component");

  if (isReactServerComponent) {
    event.respondWith(respondWithCachedFirst(request));
  }
});
