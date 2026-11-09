import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const radar = readFileSync(
  new URL("../src/features/admin/MarketplaceRadarReadinessCard.tsx", import.meta.url),
  "utf8",
);

test("GPS operativo premium muestra cinco indicadores compactos y se adapta al ancho", () => {
  assert.match(radar, /GPS operativo/);
  assert.match(radar, /aria-label="Diagnóstico de disponibilidad del GPS"/);
  assert.match(radar, /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5/);
  assert.match(radar, /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5/);
  assert.match(radar, /rounded-\[14px\] border px-3 py-2\.5/);
  assert.match(radar, /fullOnMobile/);
  assert.match(radar, /text-\[25px\] font-bold/);
  assert.doesNotMatch(radar, /min-h-\[174px\]/);
  for (const label of ["Trabajando", "GPS reciente", "Aptos", "Candidatos con GPS", "Alertas Android"]) {
    assert.ok(radar.includes('label="' + label + '"'), "Falta indicador " + label);
  }
});

test("El texto técnico pasa a un desplegable, manteniendo cifras y criterios", () => {
  assert.match(radar, /<details className="group relative mt-2 border-t/);
  assert.match(radar, /Ver diagnóstico/);
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

test("Diseño premium prioriza GPS, candidatos aptos y conserva cabecera ligera", () => {
  assert.match(radar, /Disponibilidad técnica en tiempo real/);
  assert.match(radar, /tone="signal" icon=\{MapPin\}/);
  assert.match(radar, /tone="eligible" icon=\{Navigation\}/);
  assert.match(radar, /shadow-\[0_20px_48px_-38px_rgba\(8,145,178,0\.55\)\]/);
  assert.match(radar, /className="hidden text-\[11px\] text-slate-400 sm:block"/);
  assert.match(radar, /min-h-9 cursor-pointer/);
  assert.match(radar, /role="status"/);
});
