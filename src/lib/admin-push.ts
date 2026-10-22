/** Web FCM uses the same Firebase project, VAPID public key and protected RPC as Conductor.
 * Public Firebase identifiers are not credentials. No service-role key is shipped to browsers.
 */
import { getApp, getApps, initializeApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { getSupabaseClient } from "@/lib/supabase";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAVDRuwMJZStQGCqHRGMuoNydCbG3JeUIo",
  authDomain: "tuktuk-control-9e74c.firebaseapp.com",
  projectId: "tuktuk-control-9e74c",
  storageBucket: "tuktuk-control-9e74c.firebasestorage.app",
  messagingSenderId: "835856456604",
  appId: "1:835856456604:web:f9ce95c62e04f050fec659",
};
const VAPID_PUBLIC_KEY = "BF-az4NW8nREYEw-RvnBOfQ2wrJGttOjBhR_PD0SKWEKDHWqWvFBLdmka5e_0d-_Mptdrpxxfy1aF-FFPQpvfEE";
const FIREBASE_APP_NAME = "vrixora-admin-push";
const TOKEN_STORAGE = "vrixora:admin:fcm-token:v1";
export const ADMIN_PUSH_KINDS = ["admin_marketplace_new_job", "admin_marketplace_new_driver", "admin_marketplace_pending_job"] as const;
export type AdminPushEvent = { kind: string; job_id?: string; driver_id?: string; stage?: string; title: string; body: string; url: string };

function app() {
  return getApps().some((item) => item.name === FIREBASE_APP_NAME)
    ? getApp(FIREBASE_APP_NAME)
    : initializeApp(FIREBASE_CONFIG, FIREBASE_APP_NAME);
}

function safeAdminUrl(raw: string | undefined, projectId: string) {
  const fallback = `/admin/proyectos/${encodeURIComponent(projectId)}/trabajos`;
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw, location.origin);
    return parsed.origin === location.origin && parsed.pathname.startsWith("/admin/proyectos/")
      ? parsed.pathname + parsed.search : fallback;
  } catch { return fallback; }
}

export async function adminPushSupported() {
  return typeof window !== "undefined" && window.isSecureContext &&
    "Notification" in window && "serviceWorker" in navigator && "PushManager" in window &&
    await isSupported();
}

/** Must run in a user gesture; persists a token only after server validation. */
export async function registerAdminPush() {
  if (typeof window === "undefined" || !window.isSecureContext || !("Notification" in window)) {
    throw new Error("Los avisos Windows requieren HTTPS y un navegador compatible.");
  }
  // Request permission BEFORE any asynchronous browser-support check: user gesture must be preserved.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Debes permitir notificaciones para recibir avisos de Windows.");
  if (!await adminPushSupported()) throw new Error("Este navegador no admite notificaciones web de Firebase.");
  // Reuse the existing Vrixora PWA worker; do not add a second SW with the same scope.
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await registration.update();
  // An old worker cannot handle Firebase admin push; activate the new worker
  // using the existing SKIP_WAITING protocol before obtaining a token.
  if (registration.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 4000);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app()), {
    vapidKey: VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Firebase no devolvió un dispositivo de notificaciones válido.");
  const { error } = await getSupabaseClient().rpc("register_my_admin_push_token", { target_token: token });
  if (error) throw new Error("No se pudo asociar este equipo con tu cuenta administrativa.");
  try { localStorage.setItem(TOKEN_STORAGE, token); } catch { /* optional */ }
  return token;
}

export async function unregisterAdminPush() {
  const token = localStorage.getItem(TOKEN_STORAGE);
  if (!token) return;
  const { error } = await getSupabaseClient().rpc("disable_my_admin_push_token", { target_token: token });
  if (error) throw new Error("No se pudo desactivar el dispositivo en el servidor.");
  if (await adminPushSupported()) await deleteToken(getMessaging(app())).catch(() => false);
  localStorage.removeItem(TOKEN_STORAGE);
}

export function savedAdminPushToken() {
  try { return localStorage.getItem(TOKEN_STORAGE); } catch { return null; }
}

/** Called only after an authenticated project screen has mounted. */
export async function listenAdminPush(projectId: string, handle: (event: AdminPushEvent) => void) {
  if (!await adminPushSupported() || Notification.permission !== "granted") return () => {};
  return onMessage(getMessaging(app()), (message) => {
    const data = message.data ?? {};
    const kind = data.kind ?? "";
    if (!ADMIN_PUSH_KINDS.some((allowed) => allowed === kind)) return;
    if (data.project_id !== projectId) return;
    const event: AdminPushEvent = {
      kind,
      job_id: data.job_id,
      driver_id: data.driver_id,
      stage: data.stage,
      title: data.title || "Vrixora: operación requiere atención",
      body: data.body || "Abre el centro de control.",
      url: safeAdminUrl(data.url, projectId),
    };
    handle(event);
    // In the foreground FCM does not show OS notifications automatically.
    void navigator.serviceWorker.ready.then((worker) => worker.showNotification(event.title, {
      body: event.body,
      icon: "/icon-192.png",
      badge: "/favicon.png",
      tag: `vrixora:${kind}:${event.job_id ?? event.driver_id ?? "admin"}`,
      requireInteraction: kind !== "admin_marketplace_new_driver",
      data: { url: event.url },
    })).catch(() => undefined);
  });
}
