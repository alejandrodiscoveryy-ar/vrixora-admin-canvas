import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const section = readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');
const card = readFileSync('src/features/admin/MarketplaceRadarReadinessCard.tsx','utf8');
const migration = readFileSync('supabase/migrations/20261031230453_radar_operational_eligibility_finance_off.sql','utf8');

test('Operaciones conserva el diagnostico y la sincronizacion de GPS', () => {
  assert.match(section, /<MarketplaceRadarReadinessCard projectId=\{projectId\}/);
  assert.match(card, /admin_get_marketplace_radar_readiness/);
  assert.match(card, /radar_reachable/);
  assert.match(card, /GPS reciente/);
  assert.match(card, /El diagnóstico no cambia el estado de los conductores/);
});

test('Radar informa candidatos tecnicos, sin etiquetas comerciales', () => {
  assert.match(card, /Perfil y vehículo aptos/);
  assert.match(card, /Candidatos con GPS/);
  assert.match(card, /d\.profile_ready/);
  assert.match(card, /d\.profile_blocked/);
  assert.match(card, /radio, expansión, prioridad, servicio y compatibilidad/);
  assert.doesNotMatch(card, /Aptos comercialmente|Sin requisito comercial|depósito|prueba gratuita/i);
});

test('Si comisiones estan desactivadas no bloquean seleccion de conductores', () => {
  assert.match(migration, /marketplace_driver_can_receive_job/);
  assert.match(migration, /financial\.commission_enabled is false/);
  assert.match(migration, /and a\.is_active and a\.accepting_jobs and a\.is_available/);
  assert.match(migration, /has_active_marketplace_work_trial/);
  assert.match(migration, /has_confirmed_marketplace_initial_deposit/);
});

test('El radar cuenta GPS y perfil sin exigir prueba ni deposito', () => {
  assert.match(migration, /'profile_ready',count\(distinct driver_user_id\) filter\(where onboarding_complete and profile_active\)/);
  assert.match(migration, /'profile_blocked',count\(distinct driver_user_id\) filter\(where not onboarding_complete or not profile_active\)/);
  assert.match(migration, /'radar_reachable',count\(distinct driver_user_id\) filter\(where onboarding_complete and profile_active and gps_recent\)/);
  assert.match(migration, /RADAR_ELIGIBILITY_SOURCE_CHANGED/);
});
