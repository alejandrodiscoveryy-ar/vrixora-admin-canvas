// Enlace estable de la ficha oficial de TukTuk Conductor.
// La ficha de Google Play no cambia entre compilaciones Android.
export const TUKTUK_CONDUCTOR_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.alejandrocruz.tuktukcontrol";

const VERSION_PATTERN = /^\d+(?:\.\d+){1,3}$/;
const MAX_ANDROID_BUILD = 2147483647;

// Solo propone números: no modifica la versión publicada ni activa avisos.
export function suggestNextAndroidRelease(latestVersion: string, latestBuild: number): {
  version: string;
  build: number;
} | null {
  const currentVersion = latestVersion.trim();
  if (!VERSION_PATTERN.test(currentVersion) ||
      !Number.isSafeInteger(latestBuild) || latestBuild <= 0 ||
      latestBuild >= MAX_ANDROID_BUILD) return null;

  const segments = currentVersion.split(".");
  const lastIndex = segments.length - 1;
  const lastSegment = Number(segments[lastIndex]);
  if (!Number.isSafeInteger(lastSegment) || lastSegment >= Number.MAX_SAFE_INTEGER) return null;

  const nextVersion = [...segments];
  nextVersion[lastIndex] = String(lastSegment + 1);
  const version = nextVersion.join(".");
  if (version.length > 24) return null;

  return { version, build: latestBuild + 1 };
}
