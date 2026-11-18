import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../src/features/admin/MarketplaceOperationalMap.tsx", import.meta.url), "utf8");
const fn = source.match(/function driverPinState\(driver: MarketplaceOperationalDriver\): DriverPinState \{([\s\S]*?)\n\}/);
assert.ok(fn, "The map keeps a single driverPinState shared by markers and agenda");
// Evaluate the extracted pure classification function with representative
// backend records, rather than only checking regexes for colors.
const driverPinState = runInNewContext(
  "function classify(driver) {" + fn[1] + "\n} classify;",
  {
    hasHistoricalDriverCoordinate: (d) => d.historical === true,
    mapPositionAgeMs: (time) => time == null ? null : Date.now() - Date.parse(time),
  },
);
const minuteAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const driver = (overrides = {}) => ({
  acceptingJobs: true, isAvailable: true, activeJobId: null,
  locationFresh: false, capturedAt: minuteAgo(90), historical: false, ...overrides,
});

test("A working driver with GPS 90 minutes old is orange, NOT gray/resting", () => {
  assert.equal(driverPinState(driver()), "offline");
  assert.equal(driverPinState(driver({capturedAt: minuteAgo(10080), historical: true})), "offline");
  assert.equal(driverPinState(driver({capturedAt: null})), "offline");
});

test("A working driver with GPS lag 5–15 minutes stays orange", () => {
  assert.equal(driverPinState(driver({capturedAt: minuteAgo(10)})), "stale");
});

test("Only Descansando is gray; active service stays green; recent GPS blue", () => {
  assert.equal(driverPinState(driver({acceptingJobs:false, historical:true})), "historic");
  assert.equal(driverPinState(driver({acceptingJobs:false, historical:false})), "unavailable");
  assert.equal(driverPinState(driver({activeJobId:"real-job-id",historical:true})), "busy");
  assert.equal(driverPinState(driver({locationFresh:true,capturedAt:minuteAgo(1)})), "available");
});

test("The same semantics and colored pin are used on map and agenda; no extra menu", () => {
  assert.match(source, /driverState: driverPinState\(driver\)/);
  assert.match(source, /const pinState = driverPinState\(driver\)/);
  assert.match(source, /<OperationalPinLegend kind="driver" vehicleCategoryCode=\{driver\.vehicleCategoryCode\}/);
  assert.match(source, /driverState=\{pinState\} stale=\{pinState === "stale"\}/);
  assert.match(source, /stale \|\| driverState === "stale" \|\| driverState === "offline"/);
  assert.match(source, /driverState === "historic" \|\| driverState === "unavailable"/);
  assert.match(source, /Naranja: Trabajando sin GPS reciente · Gris: Descansando/);
});
