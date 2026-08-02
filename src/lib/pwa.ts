export const PWA_APP_NAME = "VRIXORA Centro de Control";
export const PWA_SHORT_NAME = "VRIXORA Admin";
export const PWA_DESCRIPTION =
  "Plataforma de administración de aplicaciones, clientes, licencias, pagos y operaciones de VRIXORA Solutions.";
export const PWA_THEME_COLOR = "#00e5ff";
export const PWA_BACKGROUND_COLOR = "#111111";
export const PWA_CACHE_NAME = "vrixora-admin-pwa-v1";

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosDevice() {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export async function requireOnline(action: string) {
  const { ensureConnectionAvailable } = await import("@/lib/connectivity");

  await ensureConnectionAvailable(action);
}