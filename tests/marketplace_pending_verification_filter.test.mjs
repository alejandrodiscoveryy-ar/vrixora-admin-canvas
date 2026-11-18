import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("pending verification filter queries only pending applications with admin permissions", () => {
  const sql = read("supabase/migrations/20261118000800_admin_pending_impulsa_verification_filter.sql");
  const ui = read("src/features/admin/MarketplaceSection.tsx");
  const hook = read("src/hooks/usePendingDriverVerifications.ts");
  assert.match(sql, /require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(sql, /a\.status='pending'/);
  assert.match(sql, /revoke all on function public\.admin_list_marketplace_pending_impulsa_verifications_v1/);
  assert.match(hook, /admin_list_marketplace_pending_impulsa_verifications_v1/);
  assert.match(ui, /<option value="pending">Solicitan verificación<\/option>/);
  assert.match(ui, /pendingVerifications\.data\?\.has\(item\.userId\)/);
});
