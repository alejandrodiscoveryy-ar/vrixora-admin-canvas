import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const sql = readFileSync(new URL("../supabase/migrations/20261128013000_cron_retention_guarded.sql", import.meta.url), "utf8");
test("retention only deletes bounded terminal cron records older than seven days", () => {
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /ORDER BY runid LIMIT 1000/);
  assert.match(sql, /DELETE FROM cron\.job_run_details d/);
  assert.match(sql, /d\.status IN \('succeeded','failed'\)/);
  assert.match(sql, /d\.start_time < cutoff AND d\.end_time < cutoff/);
  assert.equal((sql.match(/DELETE FROM/g)||[]).length, 1);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
});
test("maintenance starts disabled and backs off during failures, concurrency or load", () => {
  assert.match(sql, /pg_try_advisory_xact_lock/);
  assert.match(sql, /skipped_recent_cron_failure/);
  assert.match(sql, /skipped_load/);
  assert.match(sql, /statement_timeout = ''3s''/);
  assert.match(sql, /active := false/);
  assert.match(sql, /REVOKE ALL ON FUNCTION.*FROM PUBLIC, anon, authenticated/);
});
