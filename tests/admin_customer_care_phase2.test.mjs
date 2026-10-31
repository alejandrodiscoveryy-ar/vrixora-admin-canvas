import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const care = readFileSync('src/features/admin/MarketplaceCustomerCareWorkspace.tsx','utf8');
const section = readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');
const sqlFile = readFileSync('tests/marketplace_care_phase2_migration_path.txt','utf8').trim();
const sql = readFileSync(sqlFile,'utf8');

test('pantalla conectada al listado y ficha 360 reales de Clientes', () => {
  assert.match(care,/admin_lookup_marketplace_care_customer/);
  assert.match(care,/admin_register_marketplace_care_customer/);
  assert.match(care,/customer\.display_name/);
  assert.match(care,/onOpenCustomer\(customer\.id\)/);
  assert.match(section,/canViewCustomers=\{canCustomers\}/);
  assert.match(section,/onOpenCustomer=\{setCustomerId\}/);
});
test('publicacion no usa un laboratorio y comprueba la tarifa del servidor', () => {
  assert.match(care,/admin_publish_marketplace_care_job/);
  assert.match(care,/confirmPublish/);
  assert.match(care,/target_expected_price: verifiedPrice/);
  assert.match(care,/onOpenJob\(published\.job_id\)/);
  assert.doesNotMatch(care,/test_lab_create_v3|admin_create_marketplace_test_job/);
  assert.match(sql,/create_marketplace_customer_request_v2/);
  assert.match(sql,/publish_marketplace_customer_job_v2/);
  assert.match(sql,/CARE_PRICE_CHANGED/);
});
test('cliente unico por telefono, ficha real y permisos por proyecto', () => {
  assert.match(sql,/require_project_permission\(target_project_id,'customers\.view'\)/);
  assert.match(sql,/require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(sql,/require_project_permission\(target_project_id,'customers\.manage'\)/);
  assert.match(sql,/marketplace_admin_test_customers/);
  assert.match(sql,/where c\.project_id=target_project_id and c\.whatsapp_phone=v_phone/);
  assert.match(sql,/create table if not exists public\.marketplace_admin_care_jobs/);
});
test('operador auditable, idempotencia y sesion transitoria revocada', () => {
  assert.match(sql,/actor_user_id uuid not null/);
  assert.match(sql,/constraint marketplace_admin_care_jobs_idempotency unique/);
  assert.match(sql,/v_previous\.payload_hash<>v_digest/);
  assert.match(sql,/status='revoked'/);
  assert.match(sql,/route_origin/);
  assert.match(sql,/route_destination/);
  assert.match(sql,/grant execute on function public\.admin_publish_marketplace_care_job/);
  assert.match(sql,/enable row level security/);
});
test('servicios reales y carga con peso; sin turismo no soportado', () => {
  assert.match(care,/"passenger" \| "courier" \| "cargo"/);
  assert.match(care,/target_cargo_weight_kg/);
  assert.match(care,/pricing: \{ service_code: service/);
  assert.doesNotMatch(care,/value: "tourism"/);
});

const gateway = readFileSync(
  'supabase/functions/marketplace-map-admin-gateway/index.ts','utf8'
);

test('carrera real exige ruta y precio certificados', () => {
  assert.match(care,/operation: "care_route_verify_v1"/);
  assert.match(care,/target_verified_route_id: proofId/);
  assert.match(care,/target_expected_price: verifiedPrice/);
  assert.match(sql,/marketplace_admin_care_verified_routes/);
  assert.match(sql,/CARE_VERIFIED_ROUTE_MISMATCH/);
  assert.match(sql,/consumed_at=now\(\)/);
  assert.match(gateway,/operation === "care_route_verify_v1"/);
  assert.match(gateway,/admin_assert_marketplace_care_publish_access/);
  assert.match(gateway,/auth\.getUser\(\)/);
  assert.match(gateway,/marketplace_admin_care_verified_routes/);
});

test('Atencion conecta permisos reales y navegacion 360', () => {
  const tag = section.match(
    /<MarketplaceCustomerCareWorkspace[\s\S]*?\/>/
  )?.[0] ?? '';

  assert.match(tag,/canViewCustomers=\{canCustomers\}/);
  assert.match(tag,/canManageMarketplace=\{canManageMarketplace\}/);
  assert.match(tag,/canRegisterCustomers=\{permissions\.includes\("customers\.manage"\)\}/);
  assert.match(tag,/onOpenCustomer=\{setCustomerId\}/);
  assert.match(tag,/onOpenJob=\{setJobId\}/);
});