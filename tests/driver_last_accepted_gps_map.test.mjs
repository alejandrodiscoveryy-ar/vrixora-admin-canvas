import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const load = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const sql = load("supabase/migrations/20261118211000_last_accepted_driver_gps_strict_latest.sql");
const map = load("src/features/admin/MarketplaceOperationalMap.tsx");

test("Newest timestamp wins between the precise driver GPS and retained coverage location", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admin_get_marketplace_operational_map/);
  assert.match(sql, /s\.coverage_captured_at > coalesce\(l\.captured_at,'-infinity'::timestamptz\)/);
  assert.match(sql, /then s\.coverage_latitude else coalesce\(l\.latitude,s\.coverage_latitude\)/);
  assert.match(sql, /then s\.coverage_longitude else coalesce\(l\.longitude,s\.coverage_longitude\)/);
  assert.match(sql, /greatest\(l\.captured_at,s\.coverage_captured_at\) as captured_at/);
  assert.match(sql, /location_fresh/);
});

test("Out-of-order GPS upload cannot be mistaken by the APK for a successful update", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_my_marketplace_driver_location/);
  assert.match(sql, /where excluded\.captured_at >= public\.marketplace_driver_locations\.captured_at/);
  assert.match(sql, /if result\.captured_at > captured then/);
  assert.match(sql, /DRIVER_LOCATION_STALE_FIX_REJECTED/);
  assert.match(sql, /using errcode = '22023'/);
  assert.match(sql, /DRIVER_LOCATION_NOT_ALLOWED/);
});

test("The map retains the last accepted location even if old, but never calls historic GPS live", () => {
  assert.match(map, /function driverCoordinate\(driver: MarketplaceOperationalDriver\)/);
  assert.match(map, /driver\.locationFresh \? driver\.longitude : driver\.lastLongitude/);
  assert.match(map, /function hasHistoricalDriverCoordinate/);
  assert.match(map, /MAP_LAST_POSITION_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(map, /if \(hasHistoricalDriverCoordinate\(driver\)\) return "historic"/);
  assert.match(map, /GPS histórico/);
  assert.match(map, /No representa la ubicación actual/);
  assert.match(map, /GPS históricos/);
  assert.match(map, /Con última posición/);
  assert.match(map, /driver\.capturedAt \? new Intl\.DateTimeFormat/);
  assert.doesNotMatch(map, /if \(age == null \|\| age > MAP_LAST_POSITION_MAX_AGE_MS/);
});

test("Historical GPS pins are entirely gray, not orange modality pins, and identify the selected driver", () => {
  assert.match(map, /driverState === "historic" \? "#64748b" : vehicleModeColor\(vehicleCategoryCode\)/);
  assert.match(map, /driverState === "historic"[\s\S]*?"0\.76"/);
  assert.match(map, /driverPinState\(driver\) === "historic" \? "2"/);
  assert.match(map, /setExpandedDriverId\(driver\.driverUserId\)/);
  assert.match(map, /GPS históricos \(&gt;24 h\), en gris/);
  assert.match(map, /Posición aproximada de cobertura/);
});
