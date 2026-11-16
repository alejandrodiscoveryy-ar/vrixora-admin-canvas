/**
 * TUKTUK: workload sintético 100% local.
 *
 * No consulta Supabase, Mapbox, Cloudflare, Firebase, usuarios ni teléfonos.
 * NO certifica los tiempos de respuesta de producción ni simula FCM real.
 * El workflow de GitHub ejecuta además los tests de contrato existentes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const tiers = [25, 50, 100, 200];
const drivers = Object.freeze(Array.from({ length: 200 }, (_, i) => Object.freeze({
  id: `synthetic-driver-${i}`,
  service: i % 3 === 0 ? "tricycle" : i % 3 === 1 ? "motorcycle" : "light_car",
  accepting: i % 4 !== 0,
  locationAgeSeconds: (i * 37) % 600,
})));
const jobs = Object.freeze(Array.from({ length: 80 }, (_, i) => Object.freeze({
  id: `synthetic-job-${i}`,
  status: i % 3 === 0 ? "published" : "accepted",
  service: i % 2 ? "passenger" : "cargo",
})));

function readOnlySnapshot(index) {
  const mode = index % 3 === 0 ? "tricycle" : index % 3 === 1 ? "motorcycle" : "light_car";
  const available = drivers
    .filter((driver) => driver.service === mode && driver.accepting)
    .sort((a, b) => a.locationAgeSeconds - b.locationAgeSeconds);
  return {
    driverCount: available.length,
    newestDriver: available[0]?.id ?? null,
    openJobs: jobs.filter((job) => job.status === "published").length,
  };
}

test("el contrato vigente distingue pruebas de solicitudes reales y deja la comision real apagada", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261013233000_marketplace_test_lab_runtime.sql", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/features/admin/MarketplaceTestCenterV2.tsx", import.meta.url), "utf8");
  assert.match(sql, /new\.is_test := false;/);
  assert.match(sql, /target_force_wallet_commission boolean default false/);
  assert.match(ui, /const \[forceRealCommission, setForceRealCommission\] = useState\(false\)/);
  assert.match(ui, /CONFIRMACIÓN FINANCIERA/);
});

test("carga de lectura sintética escalonada, sin escrituras ni mensajes push", async () => {
  const initialDrivers = JSON.stringify(drivers);
  const initialJobs = JSON.stringify(jobs);
  for (const users of tiers) {
    const durations = [];
    let completed = 0;
    const began = performance.now();
    await Promise.all(Array.from({ length: users }, async (_, i) => {
      // Cada usuario simula 25 consultas de vista local con microtareas intercaladas.
      for (let j = 0; j < 25; j++) {
        const t0 = performance.now();
        const snapshot = readOnlySnapshot(i + j);
        assert.ok(snapshot.driverCount >= 0);
        assert.ok(snapshot.openJobs >= 0);
        durations.push(performance.now() - t0);
        completed++;
        await Promise.resolve();
      }
    }));
    const sorted = durations.sort((a, b) => a - b);
    const p95Ms = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
    const wallMs = performance.now() - began;
    assert.equal(completed, users * 25);
    assert.ok(Number.isFinite(p95Ms));
    console.log(JSON.stringify({
      scope: "SYNTHETIC_IN_MEMORY_ONLY",
      virtualUsers: users,
      completedReadOperations: completed,
      failures: 0,
      localP95Ms: Number(p95Ms.toFixed(3)),
      localTotalMs: Number(wallMs.toFixed(1)),
      warning: "NO representa latencia de red ni capacidad Supabase",
    }));
  }
  assert.equal(JSON.stringify(drivers), initialDrivers);
  assert.equal(JSON.stringify(jobs), initialJobs);
});

test("el laboratorio no importa librerias ni invoca servicios externos", () => {
  const self = readFileSync(new URL(import.meta.url), "utf8");
  assert.doesNotMatch(self, /from ["'](?:https?:|@supabase|firebase|mapbox)/);
  assert.doesNotMatch(self, /\b(?:fetch|https?\.request|execSync|spawnSync)\s*\(/);
  const workflow = readFileSync(new URL("../.github/workflows/tuktuk-offline-load-free.yml", import.meta.url), "utf8");
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /\b(?:curl|wget|wrangler|supabase\s+db|deploy)\b/i);
});
