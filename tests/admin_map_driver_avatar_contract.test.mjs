import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const gateway = read("../supabase/functions/marketplace-map-admin-gateway/index.ts");
const page = read("../src/features/admin/MarketplaceOperationalMap.tsx");
const api = read("../src/lib/marketplace-map.ts");

test("map avatars only use project drivers from the permission-checked operational map", () => {
  const block = gateway.split('if (operation === "operational_driver_avatars") {')[1]?.split('if (operation === "operational_map_config") {')[0];
  assert.ok(block, "operational avatar endpoint exists");
  assert.ok(block.indexOf("admin_get_marketplace_operational_map") < block.indexOf('.from("driver_profiles")'));
  assert.match(block, /\.eq\("project_id", projectId\)/);
  assert.match(block, /\.in\("user_id", driverIds\)/);
  assert.match(block, /\.from\("profiles"\)/);
  assert.doesNotMatch(block, /admin_get_marketplace_driver_360/);
});

test("uploaded driver portrait has priority over Google and keeps a fallback URL", () => {
  const block = gateway.split('if (operation === "operational_driver_avatars") {')[1]?.split('if (operation === "operational_map_config") {')[0];
  assert.match(block, /avatar_url: uploadedPhotoUrl \?\? googleAvatar/);
  assert.match(block, /google_avatar_url: googleAvatar/);
  assert.match(api, /googleAvatarUrl: nullableString\(row\.google_avatar_url\)/);
  assert.match(page, /fallbackUrl=\{driverAvatars\.data\?\.\[driver\.driverUserId\]\?\.googleAvatarUrl \?\? null\}/);
});

test("failed driver image tries the next URL and then shows initials", () => {
  assert.match(page, /const \[failedUrls, setFailedUrls\] = useState/);
  assert.match(page, /url && !failedUrls\.has\(url\)/);
  assert.match(page, /fallbackUrl && !failedUrls\.has\(fallbackUrl\)/);
  assert.match(page, /onError=\{\(\) => setFailedUrls/);
  assert.doesNotMatch(page, /event\.currentTarget\.style\.display = "none"/);
});
