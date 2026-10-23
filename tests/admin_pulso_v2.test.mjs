import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('src/features/admin/MarketplaceSection.tsx', 'utf8');
const begin = src.indexOf('<TabsContent value="resumen">');
const end = src.indexOf('</TabsContent>', begin);
const pulso = src.slice(begin, end);
test('V2 se aplica dentro de la pestaña real Resumen/Pulso', () => {
  assert.ok(begin >= 0 && end > begin);
  assert.match(pulso, /data-pulso-v2="20261023"/);
  assert.match(pulso, /Pulso operativo/);
});
test('La marca de agua proviene de los SVG temáticos ya existentes', () => {
  assert.match(pulso, /src="\/admin-premium\/overview\.svg"/);
  assert.match(pulso, /src="\/admin-premium\/operations\.svg"/);
  assert.match(pulso, /src="\/admin-premium\/shortcuts\.svg"/);
  assert.match(pulso, /aria-hidden="true"/);
  assert.match(pulso, /opacity-\[0\.12\]/);
});
test('La atención usa datos reales y maneja carga y error', () => {
  for (const token of ['overview.data?.jobsIncidentOpen', 'overview.data?.pendingTopups', 'overview.data?.jobsPublished', 'overview.isLoading', 'overview.isError']) assert.ok(pulso.includes(token), token);
  assert.match(pulso, /Requiere atención/);
});
test('Los accesos cambian de pestaña y respetan permisos financieros', () => {
  for (const tab of ['conductores','trabajos','mapa','incidencias','recargas']) assert.ok(pulso.includes(`handleTabChange("${tab}")`), tab);
  assert.match(pulso, /canPayments\s*\?/);
  assert.match(src, /const handleTabChange = \(value: string\)/);
});
test('No elimina métricas ni funcionalidades previas', () => {
  for (const field of ['driversTotal','driversActive','driversTrialActive','driversPostTrialActive','jobsPublished','jobsActive','jobsIncidentOpen','pendingTopups']) assert.ok(pulso.includes(`overview.data?.${field}`), field);
  assert.match(src, /<TabsContent value="trabajos"/);
  assert.match(src, /<TabsContent\s+value="mapa"/);
});
