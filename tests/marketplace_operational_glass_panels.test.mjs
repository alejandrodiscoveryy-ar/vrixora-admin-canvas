import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
test('agenda única de cristal con pestañas exclusivas y leyenda por defecto', () => {
 assert.match(source, /type OperationalAgendaTab = "drivers" \| "services" \| "clients"/);
 assert.match(source, /useState<OperationalAgendaTab \| null>\(null\)/);
 assert.match(source, /aria-label="Agenda operativa de cristal"/);
 assert.match(source, /agendaTab === null/);
 assert.match(source, /aria-label="Pestañas laterales de la agenda"/);
 assert.match(source, /bg-slate-950\/\[0\.82\]/);
 assert.match(source, /setAgendaCollapsed\(false\)/);
 assert.doesNotMatch(source, /driversPanelOpen|servicesPanelOpen/);
});
test('pestañas conductores servicios y clientes operativas', () => {
 for(const value of ['agendaTab === "drivers"','agendaTab === "services"','agendaTab === "clients"','tab.title','aria-pressed={panelOpen && agendaTab === tab.id}','setAgendaTab(current ? null : tab.id)']) assert.ok(source.includes(value),value);
});
test('incidencias priorizadas y aviso persistente en Servicios', () => {
 for(const value of ['const incidentCount =','const prioritizedJobs =','prioritizedJobs.slice(0, 12)','job.status === "incident"','tab.id === "services" && incidentCount > 0','setAgendaTab("services")']) assert.ok(source.includes(value),value);
});
test('clientes derivados solo de carreras activas y con permisos', () => {
 for(const value of ['const customerJobs =','operationalJobs.map((job)','canViewCustomers','onOpenCustomer?.(job.customerId)','Cliente 360','focusJob(job)']) assert.ok(source.includes(value),value);
});
test('colores del mapa y funciones de negocio preservados', () => {
 for(const value of ['"line-color": "#22d3ee"','"line-color": "#67e8f9"','"line-color": "#facc15"','"line-color": "#fde047"','getMarketplaceOperationalMap(projectId)','getMarketplaceOperationalRoutes(projectId)','onOpenJob?.(selectedJob.jobId)']) assert.ok(source.includes(value),value);
});
