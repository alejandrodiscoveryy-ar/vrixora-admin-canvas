import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const src = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
test('La vista de operaciones se conserva como estado inicial', () => {
  assert.match(src, /useState<MapViewMode>\("operations"\)/);
  assert.match(src, /getMarketplaceOperationalRoutes\(projectId\)/);
  assert.match(src, /kind="customer"/);
  assert.match(src, /kind="destination"/);
  assert.match(src, /MAP_LAYERS\.incidents/);
});
test('La cobertura dispone de filtros y muestra todas las posiciones conocidas', () => {
  assert.match(src, /type CoverageFilter =/);
  assert.match(src, /setCoverageFilter\(filter\)/);
  assert.match(src, /coverageLocated/);
  assert.match(src, /mapViewMode === "coverage"/);
  assert.match(src, /driverCoordinate\(driver\)/);
});
test('Los grupos responden al zoom y se limpian al desmontarse', () => {
  assert.match(src, /const buckets = new Map/);
  assert.match(src, /map\.on\("moveend", regroup\)/);
  assert.match(src, /map\.off\("moveend", regroup\)/);
  assert.match(src, /map\.fitBounds\(bounds/);
  assert.match(src, /coverageClusterMarkersRef\.current = \[\]/);
});
test('Las capas operativas no invaden la cobertura y la leyenda comienza compacta', () => {
  assert.match(src, /mapViewMode === "operations" && layers\.incidents/);
  assert.match(src, /mapViewMode === "operations" && layers\.routes/);
  assert.match(src, /useState\(true\);\r?\n  const panelOpen = !agendaCollapsed/);
});
