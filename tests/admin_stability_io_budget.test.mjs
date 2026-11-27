import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261127224000_admin_driver_media_batch.sql");
const edge = read("supabase/functions/marketplace-map-admin-gateway/index.ts");
const router = read("src/router.tsx");
test("media batch is bounded, read-only and project scoped", () => {
  assert.match(sql, /STABLE SECURITY DEFINER SET search_path TO ''/);
  assert.match(sql, /require_project_permission\(target_project_id, 'marketplace.view'\)/);
  assert.match(sql, /cardinality\(target_driver_user_ids\) > 25/);
  assert.match(sql, /d.project_id=target_project_id AND d.user_id=ANY\(target_driver_user_ids\)/);
  assert.match(sql, /a.project_id=d.project_id AND a.driver_user_id=d.user_id/);
  assert.match(sql, /REVOKE ALL.*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE.*TO authenticated/);
  assert.doesNotMatch(sql, /\b(INSERT INTO|UPDATE public|DELETE FROM|TRUNCATE)\b/i);
});
test("photo endpoints use small batches and never fetch full Driver 360", () => {
  assert.doesNotMatch(edge, /admin_get_marketplace_driver_360/);
  assert.match(edge, /admin_get_marketplace_driver_media_batch_v1/);
  assert.match(edge, /include_vehicles: false/);
  assert.match(edge, /include_vehicles: true/);
});
test("read retry pressure is bounded and writes retain default behavior", () => {
  assert.match(router, /queries: \{/);
  assert.match(router, /retry: 1/);
  assert.match(router, /retryDelay:/);
  assert.doesNotMatch(router, /mutations:/);
});
