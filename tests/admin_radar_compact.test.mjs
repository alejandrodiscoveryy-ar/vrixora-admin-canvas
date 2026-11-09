import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const radar = readFileSync(
  new URL("../src/features/admin/MarketplaceRadarReadinessCard.tsx", import.meta.url),
  "utf8",
);

test("Radar de Operaciones usa cinco indicadores compactos en lugar de tarjetas altas", () => {
  assert.match(radar, /Radar operativo/);
  assert.match(radar, /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5/);
  assert.match(radar, /flex min-w-0 items-center justify-between gap-2 rounded-xl/);
  assert.doesNotMatch(radar, /min-h-\[174px\]/);
  for (const label of ["Trabajando", "GPS reciente", "Aptos", "Candidatos GPS", "Alertas Android"]) {
    assert.ok(radar.includes('label="' + label + '"'), "Falta indicador " + label);
  }
});

test("El texto técnico pasa a un desplegable, manteniendo cifras y criterios", () => {
  assert.match(radar, /<details className="group mt-2/);
  assert.match(radar, /Ver diagnóstico y criterios/);
  assert.match(radar, /Sin GPS reciente:.*\{d\.gps_missing\}/);
  assert.match(radar, /Perfil o vehículo no apto:.*\{d\.profile_blocked\}/);
  assert.match(radar, /de \{d\.android_push_enabled\} con token/);
  assert.match(radar, /selección definitiva depende de radio/);
  assert.match(radar, /indicadores pueden solaparse/);
});

test("No altera disponibilidad, lecturas periódicas ni advertencias relevantes", () => {
  assert.match(radar, /admin_get_marketplace_radar_readiness/);
  assert.match(radar, /refetchInterval: 30_000/);
  assert.match(radar, /staleTime: 10_000/);
  assert.match(radar, /d\.working > 0 && d\.radar_reachable === 0/);
  assert.match(radar, /Sin candidatos aptos con GPS reciente/);
  assert.match(radar, /No hay conductores trabajando/);
  assert.match(radar, /role="alert"/);
});
