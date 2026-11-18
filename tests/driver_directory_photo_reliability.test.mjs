import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const client = read("src/lib/marketplace-map.ts");
const page = read("src/features/admin/MarketplaceSection.tsx");
const edge = read("supabase/functions/marketplace-map-admin-gateway/index.ts");

test("Directory media batches IDs to the 25-ID secure gateway contract", () => {
  assert.match(edge, /requested\.length > 25/);
  assert.match(client, /DRIVER_DIRECTORY_MEDIA_BATCH_SIZE = 25/);
  assert.match(client, /Array\.from\(new Set\(driverUserIds\)\)/);
  assert.match(client, /batches\.push\(uniqueIds\.slice\(/);
  assert.match(client, /Promise\.allSettled/);
  assert.match(client, /Object\.assign\(allMedia, outcome\.value\)/);
  assert.match(client, /if \(successCount === 0 && firstFailure\) throw firstFailure/);
});

test("Portrait prefers the conductor upload and falls back to their Google photo on URL failure", () => {
  const part = edge.split('if (operation === "driver_directory_media") {')[1]?.split('if (operation === "operational_driver_avatars") {')[0];
  assert.ok(part);
  assert.match(part, /avatar_url: uploaded \?\? google/);
  assert.match(part, /google_avatar_url: google/);
  assert.match(client, /googleAvatarUrl: nullableString\(driver\.google_avatar_url\)/);
  assert.match(page, /function DriverDirectoryPortrait\(/);
  assert.match(page, /\[url, googleUrl\]\.find/);
  assert.match(page, /onError=\{\(\) => setFailedUrls/);
  assert.match(page, /googleUrl=\{driverMedia\.data\?\.\[item\.userId\]\?\.googleAvatarUrl \?\? null\}/);
  const portrait = page.split("function DriverDirectoryPortrait(")[1]?.split("const label = ")[0] ?? "";
  assert.doesNotMatch(portrait, /currentTarget\.style\.display/);
});

test("Driver listing shows retryable error without deleting photo records", () => {
  assert.match(page, /driverMedia\.isError/);
  assert.match(page, /role="alert"/);
  assert.match(page, /Reintentar fotos/);
  assert.match(page, /driverMedia\.refetch\(\)/);
  assert.match(edge, /admin_get_marketplace_driver_360/);
  assert.doesNotMatch(edge.split('if (operation === "driver_directory_media") {')[1]?.split('if (operation === "operational_driver_avatars") {')[0] ?? "", /\.from\("driver_profiles"\)/);
});
