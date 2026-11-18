import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const map = readFileSync(new URL("../src/features/admin/MarketplaceOperationalMap.tsx", import.meta.url), "utf8");
const official = readFileSync(new URL("../src/lib/havana-official-time.ts", import.meta.url), "utf8");

test("La hora de Cuba se mantiene UTC-4 en todo el invierno 2026-2027", () => {
  assert.match(official, /export function effectiveHavanaTimeZone\(at: Date\)/);
  assert.match(official, /CONTINUOUS_DST_FROM = Date.parse\('2026-11-01T04:00:00Z'\)/);
  assert.match(official, /CONTINUOUS_DST_UNTIL = Date.parse\('2027-11-07T05:00:00Z'\)/);
  assert.match(official, /\? 'Etc\/GMT\+4'/);
  // Server tzdb 2026 on 18 Nov returns UTC-5, while official time is UTC-4.
  const at = new Date("2026-11-18T21:16:00Z");
  const officialHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Etc/GMT+4", hour: "2-digit", hourCycle: "h23" }).format(at);
  assert.equal(officialHour, "17");
  const uses = (map.match(/effectiveHavanaTimeZone\(/g) ?? []).length;
  assert.ok(uses >= 4, "Map tooltip, last GPS, shift start label and hour all use official time");
  assert.doesNotMatch(map, /timeZone: "America\/Havana"/);
});

test("Mapa mantiene colores por GPS sin añadir menús: azul, verde, naranja transitorio, gris sin GPS", () => {
  assert.match(map, /type DriverPinState = "available" \| "busy" \| "stale" \| "offline" \| "historic" \| "unavailable"/);
  assert.match(map, /if \(driver.activeJobId\) return "busy"/);
  assert.match(map, /if \(!driver.locationFresh\) \{/);
  assert.match(map, /age == null \|\| age > 15 \* 60_000 \? "offline" : "stale"/);
  assert.match(map, /driverState === "available"/);
  assert.match(map, /driverState === "busy"/);
  assert.match(map, /stale \|\| driverState === "stale"/);
  assert.match(map, /driverState === "historic" \|\| driverState === "offline"/);
  assert.match(map, /GPS atrasado 5–15 min \(ámbar\); más de 15 min sin GPS \(gris\)/);
  assert.match(map, /function driverCoordinate\(driver: MarketplaceOperationalDriver\)/);
  assert.match(map, /const age = mapPositionAgeMs\(driver.capturedAt\)/);
});
