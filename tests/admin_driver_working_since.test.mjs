import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const map = readFileSync("src/features/admin/MarketplaceOperationalMap.tsx", "utf8");
const client = readFileSync("src/lib/marketplace-map.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261116140000_marketplace_driver_working_since.sql", "utf8");
const match = map.match(/const workingDurationLabel = \(workingSince: string \| null \| undefined, serverTime: string\) => \{([\s\S]*?)\n\};/);
assert.ok(match);
const duration = new Function("workingSince", "serverTime", match[1]);

test("duración de jornada usa hora de servidor, sin inventar inicio", () => {
  const now = "2026-11-16T17:00:00Z";
  assert.equal(duration("2026-11-16T12:45:00Z", now), "4 h 15 min");
  assert.equal(duration("2026-11-16T12:00:00Z", now), "5 h");
  assert.equal(duration("2026-11-16T16:59:30Z", now), "<1 min");
  assert.equal(duration("2026-11-16T16:35:00Z", now), "25 min");
  for (const start of [null, undefined, "invalid", "2026-11-17T00:00:00Z"]) assert.equal(duration(start, now), null);
  assert.equal(duration("2026-11-15T16:00:00Z", now), "25 h");
});

test("inicio y GPS se muestran por separado, sin cambiar estado operativo", () => {
  assert.match(client, /workingSince: nullableString\(row.working_since\)/);
  assert.match(map, /workingDurationLabel\(driver.workingSince, data.serverTime\)/);
  assert.match(map, /timeZone: "America\/Havana"/);
  assert.match(map, /Inicio de jornada no registrado/);
  assert.match(map, /signalAgeLabel\(driver.capturedAt, data.serverTime\)/);
  assert.match(migration, /NEW.working_since := OLD.working_since/);
  assert.match(migration, /NEW.working_since := NULL/);
  assert.match(migration, /NEW.working_since := statement_timestamp\(\)/);
  assert.match(migration, /'marketplace.view'/);
});

test("la hora de inicio cubana es visible en la fila sin desplegar", () => {
  const startMatch = map.match(/const workingStartTimeLabel = \(workingSince: string \| null \| undefined\) => \{([\s\S]*?)\n\};/);
  assert.ok(startMatch);
  const startTime = new Function("workingSince", startMatch[1]);
  assert.equal(startTime("2026-11-16T12:00:00Z"), "07:00");
  assert.equal(startTime("2026-07-16T11:00:00Z"), "07:00");
  assert.equal(startTime(null), null);
  assert.equal(startTime("invalid"), null);
  const compactRow = map.slice(map.indexOf("const startTime = working && duration"), map.indexOf("{rowExpanded ? (", map.indexOf("const startTime = working && duration")));
  assert.ok(compactRow.includes("Desde ${startTime}"));
  assert.ok(compactRow.includes('duration ?? "—"'));
});

test("la fila usa la misma verificación real que el directorio, sin confundirla con GPS o jornada", () => {
  const badge = readFileSync("src/features/admin/DriverVerifiedBadge.tsx", "utf8");
  const hook = readFileSync("src/hooks/useDriverVerifications.ts", "utf8");
  assert.match(map, /useDriverVerifications\(projectId, operationalDriverIds, isVisible\)/);
  assert.match(map, /!driverVerifications\.isError && driverVerifications\.data\?\.\[driver\.driverUserId\]\?\.verified === true/);
  assert.match(map, /verified && <DriverVerifiedBadge iconOnly \/>/);
  assert.match(badge, /if \(iconOnly\)/);
  assert.match(badge, /aria-label="Conductor verificado"/);
  assert.match(badge, /fill-\[#1D9BF0\] text-white/);
  assert.match(hook, /admin_get_marketplace_driver_verifications_v1/);
  assert.match(hook, /slice\(i, i \+ 200\)/);
});
