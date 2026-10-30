import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");

test("SQL sin referencias ambiguas", () => {
  const sql = read("supabase/migrations/20261030105718_fix_marketplace_driver_vehicle_service_alias_42702.sql");
  assert.match(sql, /s\.code=requested\.service_code/);
  assert.match(sql, /count\(distinct requested\.service_code\)/);
  assert.doesNotMatch(sql, /s\.code=code\b/);
  assert.match(sql, /require_project_permission/);
  assert.match(sql, /admin_edit_driver_vehicle_full/);
});

test("Mostrar error real del servidor", () => {
  const ui = read("src/features/admin/MarketplaceDriverVehicleEditor.tsx");
  assert.match(ui, /save\.error instanceof Error/);
  assert.match(ui, /save\.error\.message/);
});