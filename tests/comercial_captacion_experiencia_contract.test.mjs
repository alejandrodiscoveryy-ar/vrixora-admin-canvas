import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const section = readFileSync("src/features/admin/ComercialSection.tsx", "utf8");
const root = section.split('      ) : showReferrals ? (')[0];
const crm = section.split('      ) : showReferrals ? (')[1]?.split('      {/* Existing modals')[0] ?? "";

test("Comercial conserva navegación principal y no pone acciones de CRM en la barra global", () => {
  assert.match(root, /aria-label="Áreas de Comercial"/);
  assert.doesNotMatch(root, /Nueva campaña/);
  assert.doesNotMatch(root, /Nuevo lead/);
  assert.match(crm, /<CommercialPageHeader/);
  assert.match(crm, /Nueva campaña de contactos/);
  assert.match(crm, /Nuevo contacto/);
  assert.match(crm, /actions=\{canManage \?/);
});

test("Captación diferencia carga, fallo, ausencia real de registros y datos existentes", () => {
  assert.match(crm, /leads\.isPending \?/);
  assert.match(crm, /leads\.isError \?/);
  assert.match(crm, /leads\.refetch\(\)/);
  assert.match(crm, /\(leads\.data\?\.length \?\? 0\) === 0 \?/);
  assert.match(crm, /Todavía no hay contactos registrados/);
  assert.match(crm, /Registrar primer contacto/);
  assert.match(crm, /Visitas y solicitudes de enlaces se consultan en Resultados/i);
  const emptyAt = crm.indexOf("Todavía no hay contactos registrados");
  const metricAt = crm.indexOf('<MetricCard density="compact"');
  assert.ok(metricAt > emptyAt, "KPIs only in populated-data branch");
});

test("No duplica contadores ni abre gráficas vacías; CRM conserva tabla, filtros y modales", () => {
  assert.match(crm, /Embudo comercial/);
  assert.match(crm, /Proporción de contactos por etapa/);
  assert.doesNotMatch(crm, /ArrowRight/);
  assert.match(crm, /aria-expanded=\{showLeadAnalytics\}/);
  assert.match(crm, /\{showLeadAnalytics && \(/);
  assert.match(crm, /<AdminDataTableShell/);
  assert.match(crm, /Sin contactos coincidentes/);
  assert.match(crm, /Limpiar filtros/);
  assert.ok(crm.indexOf("<AdminDataTableShell") < crm.indexOf("Análisis de captación"), "tabla antes de análisis");
  assert.match(section, /<LeadDialog/);
  assert.match(section, /<CampaignDialog/);
  assert.match(section, /<HistoryDialog/);
});
