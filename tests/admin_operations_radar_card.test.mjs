
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/features/admin/MarketplaceSection.tsx', 'utf8');

test('tarjeta en el lateral de la carrera expandida', () => {
  assert.match(s, /<JobRadarShortcut[\s\S]*?jobId=\{job\.jobId\}/);
  assert.match(s, /lg:w-\[200px\]/);
  assert.match(s, /Radar de la carrera/);
});
test('estados historicos separados de configuracion actual', () => {
  assert.match(s, /analysis\.data\?\.status === "yes"/);
  assert.match(s, /analysis\.data\?\.status === "no"/);
  assert.match(s, /Sin registro histórico/);
  assert.match(s, /Radar utilizado/);
  assert.match(s, /Radar no utilizado/);
});
test('clic en la tarjeta abre directamente la pestaña Radar', () => {
  assert.match(s, /setJobDetailInitialTab\("radar"\)/);
  assert.match(s, /initialTab=\{jobDetailInitialTab\}/);
  assert.match(s, /setActiveTab.*initialTab/);
  assert.match(s, /onClick=\{onOpen\}/);
});
test('conserva el expediente premium y las acciones existentes', () => {
  assert.match(s, /admin_cancel_assisted_marketplace_job/);
  assert.match(s, /admin_get_marketplace_job_radar_analysis/);
  assert.match(s, /Finalizar carrera/);
  assert.match(s, /Expediente de carrera/);
});
