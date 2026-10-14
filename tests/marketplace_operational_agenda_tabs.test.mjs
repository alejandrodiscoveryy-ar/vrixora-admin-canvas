import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
test('alternar pestaña actual devuelve la leyenda',()=>{
  assert.match(src,/setAgendaTab\(current \? null : tab.id\)/);
  assert.match(src,/agendaTab === null \? \(/);
});
test('agenda puede plegarse sin perder pestañas visibles',()=>{
  assert.match(src,/style=\{\{ width: panelOpen \? "min\(420px, calc\(100% - 24px\)\)" : "44px" \}\}/);
  assert.match(src,/aria-label="Pestañas laterales de la agenda"/);
});
test('la selección de una incidencia puede abrir Servicios',()=>{
  assert.match(src,/setCustomerDetailsJobId\(jobId\);\s*setAgendaTab\("services"\);/);
});
