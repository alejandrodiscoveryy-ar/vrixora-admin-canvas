import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../src/features/admin/AdminOperationalAlerts.tsx", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("../src/routes/admin.proyectos.$id.tsx", import.meta.url), "utf8");

test("Alarmas aisladas por usuario/proyecto y protegidas con permiso Marketplace", () => {
  assert.match(source, /operational-alert-known:v1:\$\{projectId\}:\$\{userId\}/);
  assert.match(wrapper, /permissions\.includes\("marketplace\.view"\)/);
});

test("Solo carreras publicadas reales y registros de conductor", () => {
  assert.match(source, /listDrivers\(projectId/);
  assert.match(source, /listJobs\(projectId/);
  assert.match(source, /!job\.publishedAt \|\| job\.isTest/);
  assert.match(source, /driver:\$\{driver\.userId\}/);
  assert.match(source, /job:\$\{job\.jobId\}/);
});

test("Sin alarmas históricas ni repetidas, con controles de audio explícitos", () => {
  assert.match(source, /if \(initialized && !known\.has\(key\)\)/);
  assert.match(source, /initialized = true/);
  assert.match(source, /new AudioContext\(\)/);
  assert.match(source, /Activar sonido/);
  assert.match(source, /Marcar revisadas/);
  assert.match(source, /document\.visibilityState === "visible"/);
});

test("No modifica el backend ni promete notificaciones con navegador cerrado", () => {
  assert.match(source, /No equivalen a notificaciones push con el navegador cerrado/);
  assert.doesNotMatch(source, /service_role|\.from\("(jobs|driver_profiles|notification_outbox)"\)/);
});
