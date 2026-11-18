import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const release = read("src/features/admin/AppReleaseSettingsCard.tsx");
const comms = read("src/features/admin/ComunicadosSection.tsx");
const migration = read("supabase/migrations/20261118122500_unify_driver_android_release_center.sql");

test("Android releases have a single editable configuration and separate explicit push confirmation", () => {
  assert.match(release, /readOnly aria-readonly="true"/);
  assert.match(release, /target_download_url: TUKTUK_CONDUCTOR_PLAY_URL/);
  assert.match(release, /Guardar versión Android/);
  assert.match(release, /Notificar actualización/);
  assert.match(release, /admin_get_driver_app_update_audience/);
  assert.match(release, /admin_send_driver_app_update/);
  assert.match(release, /hasSavedActiveRelease/);
  assert.match(release, /pushConfirmationOpen/);
  assert.match(release, /No se enviará nada por guardar/);
});

test("General communications no longer expose duplicated Android update inputs", () => {
  assert.doesNotMatch(comms, /value="app_update"/);
  assert.doesNotMatch(comms, /setReleaseVersion|setCategory|releaseVersionValue/);
  assert.match(comms, /Configuración → Aplicación y versiones/);
});

test("Driver-specific update push validates saved version, permissions and idempotency", () => {
  assert.match(migration, /require_project_permission\(target_project_id, 'settings.manage'\)/);
  assert.match(migration, /target_release_version/);
  assert.match(migration, /target_release_build/);
  assert.match(migration, /v_release.enabled is distinct from true/);
  assert.match(migration, /d.status = 'active'/);
  assert.match(migration, /t.platform = 'android'/);
  assert.match(migration, /t.enabled = true/);
  assert.match(migration, /driver_android_release:/);
  assert.match(migration, /on conflict \(project_id, user_id, kind, dedupe_key\) do nothing/);
  assert.match(migration, /revoke all on function public.admin_send_driver_app_update/);
});
