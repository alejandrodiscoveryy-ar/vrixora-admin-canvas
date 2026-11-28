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
  assert.match(health,/admin_get_system_health_v2/);
  assert.match(health,/12\*60_000/);
  assert.match(health,/admin_ack_system_health_incident_v2/);
  assert.match(health,/Proyección disponible después de reunir 24 horas/);
});
