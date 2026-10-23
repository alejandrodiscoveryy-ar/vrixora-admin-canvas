import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    const renderMarker = (');
const end = source.indexOf('    for (const job of operational.data?.jobs ?? []) {', start);
const marker = source.slice(start, end);

test('ninguna etiqueta flotante se crea sobre Cliente ni Destino', () => {
  assert.ok(start >= 0 && end > start, 'marker renderer exists');
  assert.doesNotMatch(marker, /caption|data-role=["']caption["']/);
  assert.match(marker, /element\.append\(bubble\)/);
});

test('conserva los pines, el color, la seleccion y los eventos', () => {
  for (const token of [
    'kind: isPickup ? "customer" : "destination"',
    'selected,',
    'operationalPinSvg({',
    'element.onclick = (event) => {',
    'setSelectedJobId(job.jobId)',
    'element.onmouseenter = () => {',
    'element.onmouseleave = () => {',
  ]) assert.ok(marker.includes(token), token);
});

test('conserva tooltip y detalle lateral sin eliminar nombres ni direcciones', () => {
  for (const token of [
    'job.customerDisplayName || "Cliente"',
    'job.destinationText',
    'job.originText',
    'setAgendaTab("services")',
    'setCustomerDetailsJobId(job.jobId)',
  ]) assert.ok(marker.includes(token), token);
});

test('conserva rutas, capas y marcadores de conductores', () => {
  for (const token of [
    'getMarketplaceOperationalRoutes(projectId)',
    'MAP_LAYERS.incidents',
    'kind="customer"',
    'kind="destination"',
  ]) assert.ok(source.includes(token), token);
});
