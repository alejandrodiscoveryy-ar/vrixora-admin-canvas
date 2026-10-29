import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const component = read("src/features/admin/MarketplaceDriverVehicleEditor.tsx");
const record = read("src/features/admin/MarketplaceDriver360Record.tsx");
const sql = read("supabase/migrations/20261029230547_admin_driver_vehicle_full_editor.sql");

test("vehículo: edición completa visible desde su propia ficha", () => {
  assert.match(record, /<MarketplaceDriverVehicleEditor/);
  assert.match(component, /Editar vehículo completo/);
  assert.match(component, /target_category_code: f\.category/);
  assert.match(component, /target_propulsion_code: f\.propulsion/);
  assert.match(component, /target_service_codes: f\.services/);
  assert.match(component, /target_passenger_capacity/);
  assert.match(component, /target_cargo_capacity_kg/);
  assert.match(component, /target_main_photo_asset_id/);
});

test("RPC sensible requiere permisos, propiedad y bloqueo de carreras vivas", () => {
  assert.equal((sql.match(/require_project_permission\(target_project_id, 'marketplace\.manage'\)/g) ?? []).length, 2);
  assert.match(sql, /vv\.owner_user_id=target_driver_user_id and vv\.deleted_at is null/);
  assert.match(sql, /ACTIVE_JOB_BLOCKS_VEHICLE_EDIT/);
  assert.match(sql, /assigned_vehicle_id=target_vehicle_id/);
  // Mantener bloqueadas carreras operativas y completadas pendientes de liquidacion.
  // Las incidencias ya resueltas no deben bloquear la correccion de datos.
  assert.equal((sql.match(/'accepted','en_route','pickup','in_progress','completed'/g) ?? []).length, 2);
  assert.equal((sql.match(/j\.status='incident' and r\.id is null/g) ?? []).length, 2);
  assert.equal((sql.match(/left join public\.marketplace_incident_resolutions r/g) ?? []).length, 2);
  assert.match(sql, /revoke all on function public\.admin_update_marketplace_driver_vehicle_full_v1/);
  assert.match(sql, /grant execute on function public\.admin_update_marketplace_driver_vehicle_full_v1/);
});

test("corrección conserva historia y audita antes/después", () => {
  assert.match(sql, /admin_edit_driver_vehicle_full/);
  assert.match(sql, /'category_changed',category_change/);
  assert.match(sql, /'old',jsonb_build_object/);
  assert.match(sql, /'new',jsonb_build_object/);
  assert.match(sql, /MOTORCYCLE_PASSENGERS_MUST_BE_ONE/);
  assert.match(sql, /CARGO_CAPACITY_REQUIRED/);
  assert.match(sql, /INVALID_VEHICLE_SERVICES/);
  assert.doesNotMatch(sql, /update public\.jobs|delete from public\.jobs/i);
});


test("evitar regresiones de foto, modo Trabajar, historial y caché", () => {
  assert.match(sql, /VEHICLE_PHOTO_REQUIRED/);
  assert.match(sql, /VEHICLE_WORKING_BLOCKS_EDIT/);
  assert.match(sql, /for update/);
  assert.match(sql, /j\.test_deleted_at is null/);
  assert.match(sql, /'in_progress','completed'/);
  assert.match(component, /!form\.photoId/);
  assert.match(component, /details\.data\?\.working/);
  assert.match(component, /marketplace-driver-directory-media/);
  assert.match(component, /marketplace-driver-360-media/);
  assert.match(sql, /unpublished_modalities/);
  assert.match(component, /modalidades no publicadas/);
});
