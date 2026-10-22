import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const source = readFileSync(new URL("../src/features/admin/AdminOperationalAlerts.tsx", import.meta.url),"utf8");
const wrapper = readFileSync(new URL("../src/routes/admin.proyectos.$id.tsx", import.meta.url),"utf8");
test("Vigilancia aislada por usuario y proyecto, protegida por Marketplace", () => {
  assert.match(source,/operational-alert-known:v2:\$\{projectId\}:\$\{userId\}/);
  assert.match(wrapper,/permissions\.includes\("marketplace\.view"\)/);
});
test("Solo carreras reales y publicadas generan alertas", () => {
  assert.match(source,/listDrivers\(projectId/);
  assert.match(source,/listJobs\(projectId/);
  assert.match(source,/!job\.isTest/);
  assert.match(source,/job\.status === "published"/);
  assert.match(source,/!job\.driverUserId/);
});
test("No depende de visibilidad de pestaña, controla tono y avisos Windows", () => {
  assert.match(source,/new AudioContext\(\)/);
  assert.match(source,/registerAdminPush\(\)/);
  assert.match(source,/unregisterAdminPush\(\)/);
  assert.doesNotMatch(source,/document\.visibilityState === "visible"/);
});
test("Señala carrera pendiente aunque el gestor abra Admin después", () => {
  assert.match(source,/validCurrentJob\(job\)/);
  assert.match(source,/PENDING_THRESHOLD_MS/);
  assert.match(source,/Carrera sin conductor/);
  assert.match(source,/setPending\(currentPending\)/);
});
