import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file=readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');
test('expediente premium y ventana ancha',()=>{
 assert.match(file,/Expediente de carrera/);
 assert.match(file,/max-w-\[1180px\]/);
 assert.match(file,/Identidad de la carrera/);
 assert.match(file,/Resumen ejecutivo/);
 assert.match(file,/Radar y cobertura/);
 assert.match(file,/Finanzas/);
 assert.match(file,/Trazabilidad/);
 assert.match(file,/role="tablist"/);
});
test('preserva eventos, cancelacion y origen de radar',()=>{
 assert.match(file,/<JobNotificationReach projectId=\{projectId\} jobId=\{jobId\}/);
 assert.match(file,/admin_get_marketplace_job_radar_analysis/);
 assert.match(file,/admin_cancel_assisted_marketplace_job/);
 assert.match(file,/timeline\.map/);
 assert.match(file,/incidentResolution/);
 assert.match(file,/formatOperationPrice/);
});