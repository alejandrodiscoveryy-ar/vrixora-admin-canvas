import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseAgencyVitality, agencyVitalitySignals, controlConversionFunnel, toneFromDecline,
  toneFromCancellation, toneFromPending, VITALITY_RULES,
} from "../src/lib/agency-vitality.ts";

const sample = {
  from: "2026-11-01", to: "2026-11-07", computed_at: "2026-11-07T21:45:00Z",
  control: { registered: 20, previous_registered: 10, only_control: 6, started: 12, activated: 8, first_ride: 3 },
  clients: {total: 30, new: 8, previous_new: 10, served: 4, recurrent: 2 },
  rides: {requested: 20, completed: 1, settled: 1, cancelled: 8, unassigned: 0, previous_completed: 10},
  finance: {cup: 3200, usd: 0, eur: 0, other: 0},
  operation: {profiles_total: 110, profiles_active: 100, incidents_open: 0, topups_pending: null},
};

test("semáforo clasifica con umbrales explícitos y datos suficientes", () => {
  assert.equal(toneFromDecline(10,10), "green");
  assert.equal(toneFromDecline(9,10), "yellow");
  assert.equal(toneFromDecline(7,10), "orange");
  assert.equal(toneFromDecline(4,10), "red");
  assert.equal(toneFromCancellation(20,1), "green");
  assert.equal(toneFromCancellation(20,2), "yellow");
  assert.equal(toneFromCancellation(20,4), "orange");
  assert.equal(toneFromCancellation(20,7), "red");
  assert.equal(toneFromPending(0,"incidents"), "green");
  assert.equal(toneFromPending(1,"incidents"), "yellow");
  assert.equal(toneFromPending(2,"incidents"), "orange");
  assert.equal(toneFromPending(4,"incidents"), "red");
  assert.equal(toneFromPending(3,"topups"), "yellow");
  assert.equal(toneFromPending(5,"topups"), "orange");
  assert.equal(toneFromPending(11,"topups"), "red");
});

test("datos ausentes, falta de muestra o permisos siempre producen gris", () => {
  assert.equal(toneFromDecline(0,0), "gray");
  assert.equal(toneFromDecline(0,4), "gray");
  assert.equal(toneFromDecline(null,100), "gray");
  assert.equal(toneFromCancellation(4,4), "gray");
  assert.equal(toneFromCancellation(null,0), "gray");
  assert.equal(toneFromPending(null,"topups"), "gray");
  const noPermissions = parseAgencyVitality({...sample, clients:null,rides:null,finance:null,operation:null});
  const flags = agencyVitalitySignals(noPermissions);
  for (const flag of flags) assert.equal(flag.tone,"gray",flag.label);
  assert.equal(flags.find(f=>f.id==="clients")?.value,null);
  assert.equal(flags.find(f=>f.id==="rides")?.value,null);
  assert.throws(()=>parseAgencyVitality({...sample,clients:{new:3}}),/INVALID_VITALITY_DATA/);
  assert.equal(VITALITY_RULES.minRequestsForCancellation,5);
});

test("indicadores y prioridades conservan su período y no llaman activo a trabajar", () => {
  const r = parseAgencyVitality(sample);
  const signals = agencyVitalitySignals(r);
  assert.equal(signals.length,6);
  assert.equal(signals.find(x=>x.id==="clients")?.tone,"yellow");
  assert.equal(signals.find(x=>x.id==="rides")?.tone,"red");
  assert.equal(signals.find(x=>x.id==="cancelled")?.tone,"red");
  assert.equal(signals.find(x=>x.id==="incidents")?.tone,"green");
  assert.equal(signals.find(x=>x.id==="topups")?.tone,"gray");
  assert.equal(signals.find(x=>x.id==="control")?.tone,"gray");
  assert.ok(signals.every(x=>x.basis.length>0&&x.explanation.length>0));
  assert.equal(r.control.only_control,6);
});

test("lectura: proyecto autorizado, pruebas excluidas, moneda separada y sin riesgo de PII", () => {
  const sql=readFileSync(new URL("../docs/security/agency-vitality-v1-candidate.sql",import.meta.url),"utf8");
  assert.match(sql,/require_project_permission\(target_project_id, 'analytics\.view'\)/);
  for(const p of ["marketplace.view","customers.view","payments.view"]) assert.ok(sql.includes(p));
  assert.match(sql,/coalesce\(j\.is_test, false\) = false and j\.test_deleted_at is null/);
  assert.match(sql,/status = 'settled'/);
  assert.match(sql,/marketplace_incident_resolutions resolution/);
  assert.match(sql,/resolution\.id is null/);
  assert.match(sql,/currency='CUP'/);
  assert.match(sql,/currency='USD'/);
  assert.match(sql,/currency='EUR'/);
  assert.match(sql,/on d\.project_id = target_project_id and d\.user_id = c\.user_id/);
  assert.match(sql,/revoke all on function public\.admin_get_agency_vitality_v1/);
  assert.match(sql,/grant execute on function public\.admin_get_agency_vitality_v1.*to authenticated/s);
  assert.doesNotMatch(sql,/display_name|whatsapp_phone|email/);
});

test("interfaz principal separa Vitalidad del análisis legado y comunica semáforos y limitaciones", () => {
  const dashboard=readFileSync(new URL("../src/features/admin/RendimientoSection.tsx",import.meta.url),"utf8");
  const board=readFileSync(new URL("../src/features/admin/AgencyVitalityOverview.tsx",import.meta.url),"utf8");
  assert.match(dashboard, /<AgencyVitalityOverview projectId=\{projectId\} from=\{fromDate\} to=\{toDate\}/);
  assert.match(dashboard, /Análisis detallado · Usuarios, captación y gráficos/);
  assert.match(dashboard, /La retención es acumulada, no del período/);
  assert.match(board, /Prioridades de intervención/);
  assert.match(board, /toneClasses/);
  assert.match(board, /Vitalidad no disponible todavía/);
  assert.match(board, /Los grises indican que falta base suficiente/);
  assert.match(board, /«Habilitado» no significa conectado o trabajando/);
  assert.match(board, /Valores de carreras, no ingresos netos ni comisiones/);
  assert.match(board, /<SectionCard/);
});

test("embudo de Control muestra tasas verificables sin convertir la ausencia de datos en cero", () => {
  const funnel = controlConversionFunnel(sample.control);
  assert.equal(funnel.consistent, true);
  assert.deepEqual(funnel.stages.map(s=>s.value),[20,12,8,3]);
  assert.deepEqual(funnel.stages.map(s=>s.share),[100,60,40,15]);
  assert.equal(controlConversionFunnel({...sample.control,registered:0,started:0,activated:0,first_ride:0}).stages[0].share,null);
  assert.equal(controlConversionFunnel({...sample.control,started:6,activated:8}).consistent,false);
  const board=readFileSync(new URL("../src/features/admin/AgencyVitalityOverview.tsx",import.meta.url),"utf8");
  assert.match(board,/Control → Conductor → Primera carrera/);
  assert.match(board,/Consultar conductores/);
  assert.match(board,/señales con atención/);
});

test("Analítica inicia en el período actual, filtra por fecha y muestra gráficos sin desplegar",()=>{
  const dashboard=readFileSync(new URL("../src/features/admin/RendimientoSection.tsx",import.meta.url),"utf8");
  const board=readFileSync(new URL("../src/features/admin/AgencyVitalityOverview.tsx",import.meta.url),"utf8");
  const shell=readFileSync(new URL("../src/routes/admin.tsx",import.meta.url),"utf8");
  assert.match(dashboard,/useState\(\(\) => periodRange\("7d"\)\)/);
  assert.doesNotMatch(dashboard,/usePersistentAnalyticsDateRange/);
  assert.match(dashboard,/row.date >= fromDate && row.date <= toDate/);
  assert.ok(dashboard.indexOf('title="Registros y accesos"')<dashboard.indexOf('Análisis detallado · Usuarios'));
  assert.match(shell,/wideAnalytics = currentSection === "rendimiento"/);
  assert.match(board,/title="Conversión de solicitudes"/);
  assert.match(board,/data.requested>0/);
  assert.match(board,/funnel.consistent && stage.share != null/);
  assert.match(board,/title="Economía"/);
  assert.match(board,/title="Flota"/);
  assert.doesNotMatch(board,/title="Economía y flota"/);
});
