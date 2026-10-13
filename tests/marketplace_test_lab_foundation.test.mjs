import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sql = readFileSync(new URL('../supabase/migrations/20261013230000_marketplace_test_lab_foundation.sql', import.meta.url), 'utf8');

const contains = (text) => assert.ok(sql.includes(text), `Ausente: ${text}`);

test('configuración del grupo y destinatarios congelados por carrera', () => {
  contains('create table if not exists public.marketplace_test_audience');
  contains('create table if not exists public.marketplace_test_job_recipients');
  contains('create table if not exists public.marketplace_admin_test_jobs');
  contains('primary key (project_id, job_id, driver_user_id)');
  contains('TEST_JOB_RECIPIENTS_IMMUTABLE');
  contains('TEST_JOB_RECIPIENTS_INVALID_STATE');
});

test('sin escritura general para anon o usuarios autenticados', () => {
  for (const table of ['marketplace_test_audience', 'marketplace_test_job_recipients', 'marketplace_admin_test_jobs']) {
    contains(`alter table public.${table} enable row level security;`);
    contains(`revoke all on public.${table} from public, anon, authenticated;`);
  }
  contains("require_project_permission(target_project_id, 'marketplace.manage')");
  contains("require_project_permission(target_project_id, 'settings.manage')");
  contains("require_project_permission(target_project_id, 'marketplace.view')");
  contains("require_project_permission(target_project_id, 'settings.view')");
  contains('TEST_AUDIENCE_SIZE_INVALID');
  contains('TEST_AUDIENCE_INELIGIBLE_DRIVER');
});

test('compatibilidad explícita con carreras de prueba de destinatario único', () => {
  contains('app_private.marketplace_test_job_targets_driver');
  contains('and j.test_deleted_at is null');
  contains('and j.test_driver_user_id=target_driver_user_id');
  contains('not exists (');
});

test('migración preparatoria no altera lógica en producción', () => {
  assert.doesNotMatch(sql,/\b(drop table|truncate|alter\s+table\s+public\.jobs|create\s+or\s+replace\s+function\s+(public\.accept_job|public\.list_my_marketplace_available_jobs|app_private\.mark_marketplace_test_job_on_publish))\b/i);
});
