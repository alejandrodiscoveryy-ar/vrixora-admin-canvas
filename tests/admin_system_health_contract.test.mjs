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
