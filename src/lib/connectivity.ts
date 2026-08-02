import { useSyncExternalStore } from "react";

export const CONNECTIVITY_PROBE_PATH = "/api/ping";

const CONNECTIVITY_TIMEOUT_MS = 2_000;
const RECENT_ONLINE_WINDOW_MS = 30_000;
const OFFLINE_CONFIRMATION_FAILURES = 2;

export type ConnectivityStatus = "checking" | "online" | "offline";

type ConnectivitySnapshot = {
  status: ConnectivityStatus;
  failureStreak: number;
  lastCheckedAt: number | null;
  lastSuccessfulAt: number | null;
};

const listeners = new Set<() => void>();
let inFlightProbe: Promise<boolean> | null = null;

const snapshot: ConnectivitySnapshot = {
  status: "checking",
  failureStreak: 0,
  lastCheckedAt: null,
  lastSuccessfulAt: null,
};

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function updateSnapshot(patch: Partial<ConnectivitySnapshot>) {
  Object.assign(snapshot, patch);
  emitChange();
}

function noteSuccessfulProbe() {
  updateSnapshot({
    status: "online",
    failureStreak: 0,
    lastCheckedAt: Date.now(),
    lastSuccessfulAt: Date.now(),
  });
}

function noteFailedProbe() {
  const failureStreak = snapshot.failureStreak + 1;
  updateSnapshot({
    status: failureStreak >= OFFLINE_CONFIRMATION_FAILURES ? "offline" : "checking",
    failureStreak,
    lastCheckedAt: Date.now(),
  });
}

function canTrustRecentOnlineState() {
  if (typeof navigator === "undefined") return true;

  return (
    snapshot.status === "online" &&
    snapshot.lastSuccessfulAt !== null &&
    Date.now() - snapshot.lastSuccessfulAt < RECENT_ONLINE_WINDOW_MS &&
    navigator.onLine !== false
  );
}

export function getConnectivitySnapshot() {
  return snapshot;
}

export function subscribeConnectivitySnapshot(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnectivitySnapshot() {
  return useSyncExternalStore(subscribeConnectivitySnapshot, getConnectivitySnapshot, getConnectivitySnapshot);
}

export function markNavigatorOnlineHint() {
  if (typeof navigator === "undefined") return;

  updateSnapshot({
    status: "online",
    failureStreak: 0,
    lastCheckedAt: Date.now(),
    lastSuccessfulAt: Date.now(),
  });
}

export function markNavigatorOfflineHint() {
  if (typeof navigator === "undefined") return;

  updateSnapshot({
    status: "checking",
    lastCheckedAt: Date.now(),
  });
}

export async function probeConnectivity(timeoutMs = CONNECTIVITY_TIMEOUT_MS) {
  if (typeof navigator === "undefined") return true;

  if (canTrustRecentOnlineState()) {
    return true;
  }

  if (inFlightProbe) {
    return inFlightProbe;
  }

  inFlightProbe = (async () => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${CONNECTIVITY_PROBE_PATH}?ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          "x-connectivity-probe": "1",
        },
      });

      if (!response.ok) {
        throw new Error(`Connectivity probe failed with status ${response.status}`);
      }

      noteSuccessfulProbe();
      return true;
    } catch {
      noteFailedProbe();
      return false;
    } finally {
      globalThis.clearTimeout(timeoutId);
      inFlightProbe = null;
    }
  })();

  return inFlightProbe;
}

export async function ensureConnectionAvailable(action: string) {
  if (typeof navigator === "undefined") return;

  if (canTrustRecentOnlineState()) {
    return;
  }

  const attempts = navigator.onLine === false ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await probeConnectivity()) {
      return;
    }
  }

  throw new Error(`${action} requiere conexión a Internet.`);
}