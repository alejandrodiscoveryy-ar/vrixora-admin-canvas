import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const health=read("src/features/admin/SystemHealthSection.tsx");
const sql=read("supabase/migrations/20261128174000_admin_system_health_v1.sql");
test("health is privileged, first for TukTuk and preserves business summary",()=>{
  const home=read("src/routes/admin.proyectos.$id.index.tsx");
  const nav=read("src/lib/admin-navigation.ts");
  const route=read("src/routes/admin.proyectos.$id.$section.tsx");
  assert.match(home,/permissions.includes\("settings.manage"\)/);
  assert.match(home,/section: "salud"/);
  assert.match(nav,/ADMIN_PROJECT_TABS = \[\s*\{ slug: "salud"/);
  assert.match(route,/salud: "settings.manage"/);
  assert.match(route,/case "panel-general":/);
  assert.match(sql,/require_project_permission\(target_project_id, 'settings.manage'\)/);
  assert.match(sql,/slug='tuktuk-control'/);
  assert.match(sql,/revoke all on function .* from public, anon, authenticated/);
});
test("health polling is bounded, avoids background logging and communicates missing data",()=>{
  assert.match(health,/REFRESH_MS = 60_000/);
  assert.match(health,/refetchIntervalInBackground: false/);
  assert.match(health,/retry: false/);
  assert.match(sql,/order by runid desc limit 100/);
  assert.match(health,/No disponible/);
  assert.match(health,/No se presentan mediciones antiguas como actuales/);
});

const continuous = read("supabase/migrations/20261128180000_system_health_continuous_v2.sql");
test("continuous collector is private, scheduled and bounded",()=>{
  assert.match(continuous,/cron.schedule\('tuktuk-system-health-v2','\*\/5 \* \* \* \*'/);
  assert.match(continuous,/order by runid desc limit 300/);
  assert.match(continuous,/pg_try_advisory_xact_lock/);
  assert.match(continuous,/sampled_at<bucket-interval '7 days'/);
  assert.match(continuous,/resolved_at<t-interval '30 days'/);
  assert.match(continuous,/revoke all on function app_private.collect_system_health_v2\(\) from public,anon,authenticated/);
  assert.match(continuous,/on conflict\(code\) where resolved_at is null/);
  assert.match(continuous,/last_seen_at<=t-interval '9 minutes'/);
  assert.match(health,/admin_get_system_health_v3/);
  assert.match(health,/12\*60_000/);
  assert.match(health,/admin_ack_system_health_incident_v2/);
  assert.match(health,/Proyección disponible después de reunir 24 horas/);
});

const providerSql=read("supabase/migrations/20261128193000_system_health_provider_v3.sql");
const providerCompat=read("supabase/migrations/20261128193200_system_health_counter_compat_v3.sql");
const collector=read("supabase/functions/system-health-provider-v3/index.ts");
test("official metrics remain server-side and use one-time challenges",()=>{
  assert.match(collector,/SUPABASE_SECRET_KEYS/);
  assert.match(collector,/customer\/v1\/privileged\/metrics/);
  assert.match(collector,/system_health_claim_provider_v3/);
  assert.match(providerSql,/claimed_at is null and completed_at is null/);
  assert.match(providerSql,/grant execute on function public.system_health_claim_provider_v3\(text\) to service_role/);
  assert.match(providerSql,/cron.schedule\('tuktuk-system-health-provider-v3','\*\/5 \* \* \* \*'/);
  assert.match(providerSql,/requested_at<t-interval '7 days'/);
  assert.match(providerSql,/i.code not like 'provider_%'/);
  assert.match(providerCompat,/total between secs\*cpu_count\*0.65 and secs\*cpu_count\*1.35/);
  assert.doesNotMatch(health,/SUPABASE_SECRET_KEYS|customer\/v1\/privileged\/metrics/);
});
test("provider charts preserve missing data and distinguish quotas",()=>{
  assert.match(health,/providerUnavailable/);
  assert.match(health,/no es Disk IO Balance/);
  assert.match(health,/no es consumo facturable/);
  assert.match(health,/connectNulls=\{false\}/);
  assert.match(health,/RAM/);
  assert.match(health,/Swap/);
});

test("Grafana-inspired dashboard uses real threshold gauges and accessible compact panels",()=>{
  assert.match(health,/function MetricGauge/);
  assert.match(health,/g\.value!==null/);
  assert.match(health,/measured&&/);
  assert.match(health,/start:g\.warning,end:g\.critical/);
  assert.match(health,/grid-cols-2/);
  assert.match(health,/Disco · MB\/s/);
  assert.match(health,/Red · MB\/s/);
  assert.ok(health.indexOf('aria-label="Alertas y acciones"')<health.indexOf('title="Recursos del servidor"'));
  assert.match(health,/p\.http_status!==200\?\{cpu_pct:null/);
});

test("compact health overview keeps incident priority, freshness and readable gauges",()=>{
  assert.match(health,/role="status"/);
  assert.match(health,/Última lectura:/);
  assert.match(health,/alerts.length>0 \|\| stale \|\| \(!q.isPending && providerStale\) \|\| ack.isError/);
  assert.match(health,/max-w-\[220px\]/);
  assert.match(health,/Cómo interpretar las métricas/);
  assert.match(health,/Sin umbral/);
  assert.match(health,/dot=\{\{r:2\}\}/);
  assert.match(health,/Cobertura parcial/);
});

test("health alert is unified on its own route and stays visible elsewhere",()=>{
  assert.match(health,/const onHealthPage = !!matchRoute/);
  assert.match(health,/enabled && !onHealthPage &&/);
  assert.match(health,/aria-label="Alertas y acciones"/);
  assert.ok(health.indexOf('aria-label="Alertas y acciones"')<health.indexOf('</header>'));
  assert.match(health,/alerts\[0\]\.detail/);
  assert.match(health,/alerts\.map\(m=>/);
  assert.match(health,/ack\.mutate\(m.id\)/);
  assert.match(health,/variant="subtle" className=\{premiumControlSurface\}/);
  assert.doesNotMatch(health,/title="Alertas y acciones"/);
});

test("v4 operations reuse central sampling and protect partial evidence",()=>{
  const ops=read("supabase/migrations/20261128213000_system_health_operations_v4.sql");
  assert.match(ops,/after insert on app_private.system_health_samples_v2/);
  assert.doesNotMatch(ops,/cron\.schedule\(|net\.http/);
  assert.match(ops,/enable row level security/);
  assert.match(ops,/base:=public.admin_get_system_health_v3\(target_project_id\)/);
  assert.match(ops,/not j\.is_test and j\.test_deleted_at is null/);
  assert.match(ops,/w\.id=t\.ledger_transaction_id and w\.project_id=t\.project_id and w\.user_id=t\.user_id/);
  assert.match(health,/error\?\.code==="PGRST202"/);
  assert.match(health,/opsFresh/);
  assert.match(health,/Sin muestra vigente de servicios/);
  assert.match(health,/no confirma recepción/);
  assert.match(health,/no generan avisos push automáticos aún/);
});
