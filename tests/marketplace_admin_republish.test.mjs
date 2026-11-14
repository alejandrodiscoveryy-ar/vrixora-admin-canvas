import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20261114134246_marketplace_admin_republish_unassigned.sql", "utf8");
const map = readFileSync("src/features/admin/MarketplaceOperationalMap.tsx", "utf8");
test("republish preserves same job and guards permissions, concurrency and assignments", () => {
  assert.match(sql, /require_project_permission\(target_project_id,'marketplace.manage'\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /JOB_NOT_REPUBLISHABLE/);
  assert.match(sql, /IDEMPOTENCY_MISMATCH/);
  assert.match(sql, /JOB_REPUBLISH_COOLDOWN/);
  assert.match(sql, /state_version=state_version\+1/);
  assert.doesNotMatch(sql, /insert into public.jobs/i);
  assert.match(sql, /enqueue_marketplace_job_offer_wave\(j.id\)/);
});
test("map action confirms customer need and refreshes the same service", () => {
  assert.match(map, /canManageMarketplace && !job.driverUserId/);
  assert.match(map, /admin_republish_marketplace_job/);
  assert.match(map, /Republicar carrera/);
  assert.match(map, /window.confirm/);
  assert.match(map, /operational.refetch/);
});
