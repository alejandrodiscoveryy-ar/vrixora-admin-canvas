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
    async request(destination, pathname, mode = "cors") {
      const request = {
        method: "GET",
        url: `https://admin.vrixora.com${pathname ?? `/assets/app.abc123.${destination === "script" ? "js" : "css"}`}`,
        mode,
        destination,
      };
      let pending;
      handlers.get("fetch")({
        request,
        respondWith(promise) { pending = promise; },
      });
      return pending ? await pending : undefined;
    },
    stored,
  };
}

test("updating the PWA worker invalidates the old cache generation", () => {
  assert.match(source, /const CACHE_VERSION = "v6"/);
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

test("Aliados is not an installable admin page and keeps its existing private URL", () => {
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");
  const allies = readFileSync(new URL("../src/routes/aliados.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/features/admin/MarketplaceAlliesPanel.tsx", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.doesNotMatch(root, /PwaExperience|manifest\.webmanifest/);
  assert.match(admin, /<PwaExperience \/>/);
  assert.match(admin, /href: "\/manifest\.webmanifest"/);
  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/admin/");
  assert.equal(manifest.start_url, "/admin/login");
  assert.match(allies, /createFileRoute\("\/aliados"\)/);
  assert.match(allies, /window\.location\.hash/);
  assert.doesNotMatch(allies, /useSupabaseAuth|navigate\(|redirect\(/);
  assert.match(panel, /https:\/\/admin\.vrixora\.com\/aliados/);
  assert.match(panel, /"#k="/);
});

test("a private Aliados navigation is never intercepted by the admin offline worker", async () => {
  const worker = createWorker(async () => { throw new Error("unexpected fetch"); }, new Response("admin shell"));
  for (const path of ["/aliados", "/aliados/"]) {
    assert.equal(await worker.request("document", path, "navigate"), undefined);
  }
});

test("manifest refresh prefers the newly deployed admin scope", async () => {
  const worker = createWorker(async () => new Response("new manifest"), new Response("old manifest"));
  const response = await worker.request("manifest", "/manifest.webmanifest");
  assert.equal(await response.text(), "new manifest");
  assert.equal(worker.stored.length, 1);
});
