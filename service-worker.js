/* Offline-first cache for kiosk reliability.
   Bump CACHE_VERSION whenever you update content/code to force a refresh. */
const CACHE_VERSION = "exhibit-v3";

const CORE_ASSETS = [
  "./",
  "index.html",
  "css/styles.css",
  "js/app.js",
  "data/exhibit.json",
  "assets/painting.jpg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Strategy:
   - Media (assets/: images, videos) -> CACHE-FIRST so the kiosk plays offline.
   - Code & data (html, css, js, json) -> NETWORK-FIRST, falling back to cache
     when offline. This keeps content/code edits visible on the next reload
     instead of being pinned to a stale cached copy. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isMedia = /\/assets\//.test(url.pathname) &&
    /\.(jpe?g|png|webp|gif|mp4|webm|m4v|ogg|mov)$/i.test(url.pathname);

  if (isMedia) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // Network-first for code & data.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
