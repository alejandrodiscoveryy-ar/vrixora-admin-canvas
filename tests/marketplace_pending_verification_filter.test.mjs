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

test("verified identity never appears again as an active pending verification", async () => {
  const helper = await import("../src/features/admin/driver-verification-filter.ts");
  const { matchesPendingDriverVerification } = helper;
  assert.equal(matchesPendingDriverVerification(true, true), false);
  assert.equal(matchesPendingDriverVerification(true, false), true);
  assert.equal(matchesPendingDriverVerification(true, undefined), false);
  assert.equal(matchesPendingDriverVerification(false, false), false);

  const migration = read("supabase/migrations/20261118190000_exclude_verified_from_pending_impulsa_filter.sql");
  const ui = read("src/features/admin/MarketplaceSection.tsx");
  assert.match(migration, /app_private\.marketplace_driver_identity_verified_v1\(a\.project_id,a\.driver_user_id\) = false/);
  assert.match(migration, /require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(migration, /a\.status='pending'/);
  assert.match(migration, /revoke all on function public\.admin_list_marketplace_pending_impulsa_verifications_v1/);
  assert.match(ui, /matchesPendingDriverVerification\(/);
  assert.match(ui, /driverVerifications\.isError \|\| !verificationComplete/);
});
