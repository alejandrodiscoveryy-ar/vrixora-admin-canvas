import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const pwa = readFileSync(new URL("../src/components/pwa/PwaExperience.tsx", import.meta.url), "utf8");

function createWorker(network, cached = null) {
  const handlers = new Map();
  const stored = [];
  const context = {
    self: {
      location: { origin: "https://admin.vrixora.com" },
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    caches: {
      match: async () => cached,
      open: async () => ({ put: async (request, response) => stored.push({ request, response }) }),
    },
    fetch: network,
    URL,
    Response,
    console: { warn() {} },
    importScripts: () => { throw new Error("Firebase CDN disabled in test"); },
  };
  vm.runInNewContext(source, context);
  return {
    async request(destination) {
      const request = {
        method: "GET",
        url: `https://admin.vrixora.com/assets/app.abc123.${destination === "script" ? "js" : "css"}`,
        mode: "cors",
        destination,
      };
      let pending;
      handlers.get("fetch")({
        request,
        respondWith(promise) { pending = promise; },
      });
      assert.ok(pending, "worker should handle app assets");
      return await pending;
    },
    stored,
  };
}

test("updating the PWA worker invalidates the old cache generation", () => {
  assert.match(source, /const CACHE_VERSION = "v5"/);
  assert.match(source, /self\.skipWaiting\(\)/);
});

test("scripts and styles prefer the deployed network version over an older cached copy", async () => {
  for (const destination of ["script", "style"]) {
    const old = new Response("old app");
    const fresh = new Response("compact footer");
    let fetchCount = 0;
    const worker = createWorker(async () => { fetchCount += 1; return fresh; }, old);
    const served = await worker.request(destination);
    assert.equal(await served.text(), "compact footer");
    assert.equal(fetchCount, 1);
    assert.equal(worker.stored.length, 1, "latest asset should replace cache");
  }
});

test("offline scripts still use a previously cached version", async () => {
  const old = new Response("cached offline app");
  const worker = createWorker(async () => { throw new Error("offline"); }, old);
  const served = await worker.request("script");
  assert.equal(await served.text(), "cached offline app");
});

test("Actualizar ahora reloads when skipWaiting already activated the worker", () => {
  assert.match(pwa, /navigator\.serviceWorker\.getRegistration\("\/"\)/);
  assert.match(pwa, /registration\.waiting\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(pwa, /window\.location\.reload\(\)/);
});
