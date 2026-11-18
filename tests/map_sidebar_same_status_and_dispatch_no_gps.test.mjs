import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const map = read("src/features/admin/MarketplaceOperationalMap.tsx");
const sql = read("supabase/migrations/20261118213500_dispatch_final_wave_without_fresh_gps.sql");

test("the same colored driver pin is used in the map and compact driver agenda", () => {
  assert.match(map, /pin\.innerHTML = operationalPinSvg\(\{/);
  assert.match(map, /driverState: driverPinState\(driver\)/);
  assert.match(map, /const pinState = driverPinState\(driver\)/);
  assert.match(map, /<OperationalPinLegend kind="driver" vehicleCategoryCode=\{driver\.vehicleCategoryCode\}/);
  assert.match(map, /driverState=\{pinState\} stale=\{pinState === "stale"\}/);
  assert.match(map, /role="img" aria-label=\{\x60\$\{vehicleCategoryLabel\(driver\.vehicleCategoryCode\)\}/);
  // Never present a second, independent vehicle-color icon in the agenda.
  assert.doesNotMatch(map, /<VehicleModeIcon code=\{driver\.vehicleCategoryCode\} className="h-6 w-6"/);
});

test("fallback offers do not claim stale GPS as a current distance", () => {
  assert.match(sql, /l\.captured_at >= now\(\) - interval '300 seconds'/);
  assert.match(sql, /if not found then[\s\S]*?v_driver_lat := null;[\s\S]*?v_driver_lon := null;/);
  assert.match(sql, /if v_driver_lat is not null and v_driver_lon is not null then/);
  assert.match(sql, /v_distance_km := null;/);
  assert.match(sql, /if v_distance_km is null then[\s\S]*?coalesce\(v_settings\.expansion_enabled, true\)[\s\S]*?coalesce\(v_settings\.allow_outside_max_radius, false\)/);
  assert.match(sql, /v_stage := v_radius_count \+ 1;/);
  assert.match(sql, /secs => v_radius_count \* v_settings\.expansion_seconds/);
  assert.match(sql, /v_eligible_from := v_radius_from/);
  assert.doesNotMatch(sql, /update public\.driver_vehicle_assignments|delete from public\.marketplace_driver_locations/i);
});
