import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const release = read("src/features/admin/AppReleaseSettingsCard.tsx");
const settings = read("src/features/admin/ConfiguracionSection.tsx");

test("Android section no longer duplicates the giant settings snapshot", () => {
  assert.match(settings, /visibleSection === "application" \? \(/);
  assert.doesNotMatch(settings, /aria-label="Cambiar sección de ajustes"/);
  assert.match(settings, /visibleSection !== "application" \? \(/);
  assert.match(settings, /showExtraAppSettings/);
  assert.match(settings, /aria-controls="app-extra-settings"/);
  assert.match(settings, /Atención: mantenimiento activo/);
  assert.doesNotMatch(settings, /Panel independiente/);
});

test("Premium update status explains release, delivery, adoption, and next action", () => {
  for (const word of [
    "Versión Android publicada", "Actualización obligatoria",
    "Notificaciones enviadas", "Instalaciones verificadas",
    "Enviado no significa instalado", "Sin datos no significa sin actualizar",
    "2. Preparar versión", "3. Avisar a los conductores",
    "Usar sugerencia", "Ya notificados"
  ]) assert.ok(release.includes(word), word);
  assert.match(release, /lg:grid-cols-2/);
  assert.match(release, /role="progressbar"/);
  assert.match(release, /aria-expanded=\{editorOpen\}/);
});

test("The UI preserves release business actions and deduplicated push workflow", () => {
  assert.match(release, /admin_save_app_release_policy/);
  assert.match(release, /admin_send_driver_app_update/);
  assert.match(release, /admin_get_driver_android_adoption/);
  assert.match(release, /admin_get_driver_android_release_delivery/);
  assert.match(release, /query\.data\.latest_version/);
  assert.match(release, /TUKTUK_CONDUCTOR_PLAY_URL/);
  assert.match(release, /window\.confirm/);
});
