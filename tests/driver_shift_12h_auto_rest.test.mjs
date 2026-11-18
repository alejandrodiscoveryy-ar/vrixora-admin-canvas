import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261118195800_driver_12h_no_active_job_auto_rest.sql", import.meta.url),
  "utf8",
);

test("continuous working for 12 hours is capped, independently of GPS or heartbeat", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION app_private\.expire_marketplace_driver_shifts_v2\(\)/);
  assert.match(migration, /shift_threshold timestamptz := now\(\) - interval '12 hours'/);
  assert.match(migration, /a\.working_since IS NOT NULL AND a\.working_since < shift_threshold/g);
  assert.match(migration, /FOR UPDATE OF a SKIP LOCKED/);
  assert.match(migration, /SET accepting_jobs = false,/);
  assert.match(migration, /is_available = false,/);
});

test("protect ongoing trips, incidents, and unfinished completed services", () => {
  assert.match(migration, /NOT EXISTS \([\s\S]*?FROM public\.jobs j/);
  for (const state of ["accepted", "en_route", "pickup", "in_progress", "completed", "incident"]) {
    assert.ok(migration.includes("'"+state+"'"), state);
  }
  assert.match(migration, /j\.status = 'incident' AND r\.id IS NULL/);
  assert.match(migration, /j\.test_deleted_at IS NULL/);
  assert.match(migration, /j\.assigned_driver_user_id = a\.driver_user_id/);
});

test("preserve 24-hour inactivity policy, no speculative backfill or duplicate cron", () => {
  assert.match(migration, /make_interval\(hours => inactivity_hours\)/);
  assert.match(migration, /singleton AND auto_expire_enabled/);
  assert.match(migration, /greatest\(/);
  assert.doesNotMatch(migration, /UPDATE public\.jobs|DELETE FROM|TRUNCATE|INSERT INTO cron/);
  assert.doesNotMatch(migration, /cron\.schedule\(/);
  assert.doesNotMatch(migration, /coalesce\(a\.working_since,\s*a\.updated_at\)/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION app_private\.expire_marketplace_driver_shifts_v2\(\)/);
});
