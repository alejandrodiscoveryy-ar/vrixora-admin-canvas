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

test("working drivers are included by area using their newest known GPS, irrespective of GPS age", () => {
  assert.match(sql, /union all[\s\S]*?marketplace_driver_last_confirmed_gps_v1/);
  assert.match(sql, /union all[\s\S]*?marketplace_driver_presence_v2/);
  assert.match(sql, /order by last_known\.captured_at desc,last_known\.source_priority/);
  assert.match(sql, /last_known\.latitude between -90 and 90/);
  assert.match(sql, /last_known\.longitude between -180 and 180/);
  assert.match(sql, /l\.captured_at >= now\(\) - interval '300 seconds'/);
  assert.match(sql, /v_distance_km := app_private\.marketplace_haversine_km/);
  assert.match(sql, /if v_distance_km <= v_radii\[1\] then/);
  assert.match(sql, /if v_distance_km <= v_radii\[idx\] then/);
  assert.doesNotMatch(sql, /and l\.captured_at >= now\(\) - interval '300 seconds'[\s\S]*?order by l\.captured_at/);
});

test("out-of-date GPS can select a wave but is never called live or used as confirmed distance", () => {
  assert.match(sql, /case when v_driver_gps_fresh then v_distance_km else null::numeric end/);
  assert.match(sql, /if not found then[\s\S]*?v_driver_lat := null;[\s\S]*?v_driver_lon := null;/);
  assert.match(sql, /if v_distance_km is null then[\s\S]*?coalesce\(v_settings\.expansion_enabled, true\)[\s\S]*?coalesce\(v_settings\.allow_outside_max_radius, false\)/);
  assert.match(sql, /v_stage := v_radius_count \+ 1;/);
  assert.match(sql, /secs => v_radius_count \* v_settings\.expansion_seconds/);
  assert.match(sql, /v_eligible_from := v_radius_from/);
  assert.doesNotMatch(sql, /update public\.driver_vehicle_assignments|delete from public\.marketplace_driver_locations/i);
});
