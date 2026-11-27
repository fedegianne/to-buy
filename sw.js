const CACHE = "ultragym-v5";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./backup.js",
  "./js/app.js",
  "./js/model.js",
  "./js/db.js",
  "./js/charts.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(
        FILES.map((file) => new Request(file, { cache: "reload" })),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("ultragym-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin ||
    !request.url.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        return await fetch(request);
      } catch (e) {
        return request.mode === "navigate"
          ? (await cache.match("./index.html")) || Response.error()
          : Response.error();
      }
    })(),
  );
});
