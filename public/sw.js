/**
 * DokanAI service worker.
 *
 * Minimum-viable PWA: registers so Chrome/Edge/Safari treat the site as
 * installable. Network-first for everything — we never want to serve
 * stale dashboard analyses from cache. Only the offline fallback page
 * is precached so a fully offline navigation has something to show.
 *
 * NOT a full offline app. Most DokanAI surfaces (Forecast, Pilot chat,
 * Analyze) need network — they query Postgres and the ML backend on
 * every request. The PWA exists for the home-screen-icon + standalone
 * window-chrome experience, not offline functionality.
 */

const CACHE_VERSION = "dokanai-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Only the document navigation path uses the offline fallback. Asset
  // and API requests bypass the worker so we never serve stale auth,
  // dataset, or analysis data.
  if (req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(CACHE_VERSION);
      const offline = await cache.match(OFFLINE_URL);
      return offline || new Response("Offline", { status: 503 });
    }),
  );
});
