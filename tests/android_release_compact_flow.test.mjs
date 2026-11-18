import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const ui = read("src/features/admin/AppReleaseSettingsCard.tsx");
const helper = read("src/lib/androidRelease.ts");
const sql = read("supabase/migrations/20261118170000_driver_android_release_delivery_summary.sql");

test("Android releases stay in a readable, compact and sequential workflow", () => {
  assert.ok(ui.indexOf("1. Seguimiento") < ui.indexOf("2. Preparar versión"));
  assert.ok(ui.indexOf("2. Preparar versión") < ui.indexOf("3. Avisar a los conductores"));
  assert.match(ui, /density="compact"/);
  assert.match(ui, /grid gap-3 lg:grid-cols-2/);
  assert.match(ui, /aria-expanded=\{editorOpen\}/);
  assert.match(ui, /Preparar \/ editar/);
  assert.match(ui, /aria-label="Actualizar el seguimiento de la versión"/);
});

test("Published release remains separate from unsaved draft and suggested release", () => {
  assert.match(ui, /query\.data\.latest_version/);
  assert.match(ui, /query\.data\.latest_build/);
  assert.match(ui, /suggestNextAndroidRelease/);
  assert.match(ui, /setVersion\(proposedRelease\.version\)/);
  assert.match(ui, /setBuild\(String\(proposedRelease\.build\)\)/);
  assert.match(ui, /setNotes\(""\)/);
  assert.match(ui, /hasDraftChanges/);
  assert.match(ui, /admin_save_app_release_policy/);
  assert.match(ui, /window\.confirm/);
  assert.match(helper, /return \{ version, build: latestBuild \+ 1 \}/);
});

test("Push and adoption counters do not imply Android installs", () => {
  assert.match(ui, /admin_get_driver_android_adoption/);
  assert.match(ui, /admin_get_driver_android_release_delivery/);
  assert.match(ui, /Enviado no significa instalado/);
  assert.match(ui, /admin_send_driver_app_update/);
  assert.match(ui, /Notificar versión/);
  assert.match(ui, /disabled=\{!canManage \|\| !hasSavedActiveRelease/);
  assert.match(sql, /require_project_permission\(target_project_id, 'settings.view'\)/);
  assert.match(sql, /driver_android_release:/);
  assert.match(sql, /delivery_status='sent'/);
});
