const CACHE = "to-buy-v3.3";

const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./backup.js",
  "./app.js",
  "./db.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Install the new version using fresh files.
self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);

      await cache.addAll(
        FILES.map((file) => new Request(file, { cache: "reload" })),
      );

      await self.skipWaiting();
    })(),
  );
});

// Remove outdated caches and activate the new version.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((k) => k.startsWith("to-buy-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );

      await self.clients.claim();
    })(),
  );
});

// Serve the current cached version and preserve offline access.
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== location.origin ||
    !e.request.url.startsWith(self.registration.scope)
  )
    return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(e.request);

      if (cached) return cached;

      try {
        return await fetch(e.request);
      } catch {
        if (e.request.mode === "navigate") {
          return (await cache.match("./index.html")) || Response.error();
        }

        return Response.error();
      }
    })(),
  );
});
