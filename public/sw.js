// VRIXORA PWA cache + dedicated, authenticated-admin FCM push notifications.
const CACHE_VERSION = "v3";
const APP_CACHE = `vrixora-admin-pwa-${CACHE_VERSION}`;
const ESSENTIAL_ASSETS = [
  "/offline.html", "/manifest.webmanifest", "/favicon.png", "/apple-touch-icon.png",
  "/icon-192.png", "/icon-512.png", "/icon-maskable-192.png", "/icon-maskable-512.png",
  "/brand/vrixora-mark.jpg", "/brand/vrixora-lockup.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(ESSENTIAL_ASSETS)));
  if (!self.registration.active) self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key !== APP_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function safeTarget(raw) {
  try {
    const url = new URL(typeof raw === "string" ? raw : "/admin/proyectos", self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/admin/proyectos")) return url.toString();
  } catch { /* invalid URL */ }
  return new URL("/admin/proyectos", self.location.origin).toString();
}

// Registered BEFORE Firebase to avoid its default click handler stealing navigation.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = safeTarget(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((item) => new URL(item.url).origin === self.location.origin);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(destination);
      if ("focus" in existing) return existing.focus();
    }
    return self.clients.openWindow(destination);
  })());
});

// Existing non-FCM push fallback; skip Firebase payloads to avoid duplicate alerts.
self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json?.() || {}; } catch { return; }
  if (payload.from || payload.fcmMessageId || payload.data?.kind) return;
  const title = typeof payload.title === "string" ? payload.title : "VRIXORA Admin";
  const iconUrl = typeof payload.iconUrl === "string" ? payload.iconUrl : "";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: iconVariantUrl(iconUrl, "pwa-192.png") || "/icon-192.png",
    badge: iconVariantUrl(iconUrl, "notification-96.png") || "/favicon.png",
    data: { url: safeTarget(payload.url) }, tag: payload.tag,
  }));
});

// Pinned compat version matches the known working TukTuk Conductor FCM worker.
try {
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyAVDRuwMJZStQGCqHRGMuoNydCbG3JeUIo",
  authDomain: "tuktuk-control-9e74c.firebaseapp.com",
  projectId: "tuktuk-control-9e74c",
  storageBucket: "tuktuk-control-9e74c.firebasestorage.app",
  messagingSenderId: "835856456604",
  appId: "1:835856456604:web:f9ce95c62e04f050fec659",
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  if (!['admin_marketplace_new_job', 'admin_marketplace_new_driver', 'admin_marketplace_pending_job'].includes(data.kind)) return;
  const projectId = data.project_id || "";
  const fallback = `/admin/proyectos/${encodeURIComponent(projectId)}/trabajos`;
  return self.registration.showNotification(data.title || "Vrixora: alerta operativa", {
    body: data.body || "Hay una operación que requiere atención.",
    icon: "/icon-192.png", badge: "/favicon.png",
    tag: `vrixora:${data.kind}:${data.job_id || data.driver_id || 'admin'}`,
    requireInteraction: data.kind !== 'admin_marketplace_new_driver',
    renotify: true,
    data: { url: safeTarget(data.url || fallback) },
  });
});
} catch (error) {
  // Offline PWA should still install even if Firebase CDN is temporarily unavailable.
  console.warn("Background push unavailable; offline shell stays active", error);
}

function iconVariantUrl(masterUrl, name) {
  const match = masterUrl.match(/^(.*\/favicon-([0-9a-f-]{36}))\.png(?:\?.*)?$/i);
  return match ? `${match[1]}/${name}` : "";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match("/offline.html")) || Response.error()));
    return;
  }
  const cacheableDestinations = new Set(["style", "script", "font", "worker"]);
  if (!cacheableDestinations.has(request.destination) && !ESSENTIAL_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)
    .then((response) => {
      if (response?.ok) caches.open(APP_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => request.destination === "image"
      ? (await caches.match("/favicon.png")) || Response.error()
      : Response.error())));
});
