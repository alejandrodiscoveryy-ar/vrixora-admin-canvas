
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/features/admin/MarketplaceSection.tsx', 'utf8');

test('tarjeta en el lateral de la carrera expandida', () => {
  assert.match(s, /<JobRadarShortcut[\s\S]*?jobId=\{job\.jobId\}/);
  assert.match(s, /lg:w-\[200px\]/);
  assert.match(s, /Ver recorrido por km/);
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
  assert.match(s, /Expediente 360 de carrera/);
});


test('radar visual activo, inactivo gris y estado histórico desconocido separado', () => {
  assert.match(s, /motion-safe:animate-\[spin_6s_linear_infinite\]/);
  assert.match(s, /conic-gradient\(from 0deg/);
  assert.match(s, /border-slate-600\/45/);
  assert.match(s, /Activo/);
  assert.match(s, /Inactivo/);
  assert.match(s, /Sin confirmar/);
  assert.match(s, /onClick=\{onOpen\}/);
  assert.match(s, /\{total\} registros · \{queued\} avisos encolados/);
});

test('ficha 360 de carrera sin cabecera visible repetida', () => {
  assert.match(s, /<DialogHeader className="sr-only">[\s\S]*?<DialogTitle>360 de carrera<\/DialogTitle>/);
  assert.match(s, /Expediente 360 de carrera/);
  assert.doesNotMatch(s, /TUKTUK \/ OPERACIONES/);
});

test('clic muestra recorrido por radios reales de cada carrera sin inventar etapas', () => {
  assert.match(s, /Recorrido de notificación por km/);
  assert.match(s, /notificationStageNumbers = \[\.\.\.new Set/);
  assert.match(s, /radar\.data\.status === "yes"/);
  assert.match(s, /El radar no se utilizó en esta carrera/);
  assert.match(s, /notificationRoute\.map/);
  assert.match(s, /Ver avisos de esta etapa/);
  assert.match(s, /kilometers\(radius\)/);
  assert.match(s, /stepRecipients|stageRecipients/);
  assert.match(s, /sin avisos conservados para este radio|Sin avisos conservados para este radio/);
  assert.match(s, /no confirma que se haya ejecutado la etapa/);
  assert.match(s, /no una ruta GPS/);
  assert.match(s, /primera selección por conductor/);
  assert.match(s, /setJobDetailInitialTab\("radar"\)/);
});
