import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const sql = readFileSync(new URL("../supabase/migrations/20261013190000_marketplace_driver_record_v2.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/features/admin/MarketplaceDriver360Record.tsx", import.meta.url), "utf8");

test("historial aislado por proyecto y autorizado", () => {
  assert.match(sql, /require_project_permission\(target_project_id, 'marketplace\.view'\)/);
  assert.match(sql, /j\.project_id = target_project_id/);
  assert.match(sql, /j\.assigned_driver_user_id = target_driver_user_id/);
  assert.match(sql, /j\.test_deleted_at is null/);
  assert.match(sql, /case when v_customers then sr\.origin_text else null end/);
  assert.match(sql, /where not j\.is_test/);
  assert.match(sql, /limit v_limit \+ 1/);
  assert.match(sql, /revoke all on function/);
});

test("expediente responsive y sin estadísticas falsas", () => {
  assert.match(ui, /lg:grid-cols-\[minmax\(0,1\.65fr\)_minmax\(280px,1fr\)\]/);
  assert.match(ui, /summary\?\.services \?\? "—"/);
  assert.match(ui, /Todavía no registra servicios/);
  assert.match(ui, /Información restringida por permisos/);
  assert.match(ui, /Ver servicios anteriores/);
});