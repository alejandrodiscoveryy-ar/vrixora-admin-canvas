const CACHE_VERSION = "v1";
const APP_CACHE = `vrixora-admin-pwa-${CACHE_VERSION}`;
const ESSENTIAL_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/brand/vrixora-mark.jpg",
  "/brand/vrixora-lockup.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(ESSENTIAL_ASSETS)));
  if (!self.registration.active) {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== APP_CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedFallback = await caches.match("/offline.html");
        return cachedFallback || Response.error();
      }),
    );
    return;
  }

  const cacheableDestinations = new Set(["style", "script", "font", "worker"]);
  if (!cacheableDestinations.has(request.destination) && !isStaticShellAsset(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          if (request.destination === "image") {
            return caches.match("/favicon.png");
          }

          return Response.error();
        });
    }),
  );
});

function isStaticShellAsset(pathname) {
  return [
    "/offline.html",
    "/manifest.webmanifest",
    "/favicon.png",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-192.png",
    "/icon-maskable-512.png",
    "/brand/vrixora-mark.jpg",
    "/brand/vrixora-lockup.jpg",
  ].includes(pathname);
}