import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isIP } from 'node:net';
import { webcrypto } from 'node:crypto';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { test } from 'node:test';

// Run the actual handlers, including HMAC and limiter calls, without network,
// credentials, database access, or an HTTP listener.
async function harness() {
  const calls = { clients: 0, providers: 0, operations: 0, identities: [] };
  const buckets = new Map();
  const db = {
    from(table) {
      const data = table === 'projects' ? { id: 'test-project' } : null;
      const query = {
        select() { return query; }, eq() { return query; },
        single: async () => ({ data, error: null }),
        maybeSingle: async () => ({ data, error: null }),
      };
      return query;
    },
    async rpc(name, params) {
      if (name === 'get_marketplace_map_provider_secret_service') {
        return { data: 'test-provider-token', error: null };
      }
      if (name === 'marketplace_customer_gateway_rate_limit') {
        const identity = params.target_derived_identity;
        calls.identities.push(identity);
        const count = (buckets.get(identity) ?? 0) + 1;
        buckets.set(identity, count);
        // Deliberately small test budget; no production SQL is executed.
        return { error: count > 2 ? new Error('CUSTOMER_RATE_LIMITED') : null };
      }
      calls.operations++;
      return { data: [], error: null };
    },
  };
  const env = {
    SUPABASE_URL: 'https://isolated.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only',
    MARKETPLACE_RATE_LIMIT_SECRET: 'test-rate-secret',
    MARKETPLACE_ROUTE_SIGNING_SECRET: 'test-route-secret',
  };
  let customerHandler;
  const modules = new Map();
  const globals = {
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, Error, AbortSignal,
    crypto: webcrypto,
    Deno: { env: { get: (key) => env[key] }, serve: (handler) => { customerHandler = handler; } },
    fetch: async (url) => {
      assert.equal(new URL(url).hostname, 'api.mapbox.com');
      calls.providers++;
      return Response.json({ features: [] });
    },
  };
  const { createContext } = await import('node:vm');
  const context = createContext(globals);
  const sdk = new SyntheticModule(['createClient'], function () {
    this.setExport('createClient', () => { calls.clients++; return db; });
  }, { context });
  const net = new SyntheticModule(['isIP'], function () { this.setExport('isIP', isIP); }, { context });
  async function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const source = await readFile(url, 'utf8');
    const module = new SourceTextModule(stripTypeScriptTypes(source), {
      context, identifier: url.href, initializeImportMeta(meta) { meta.main = false; },
    });
    modules.set(url.href, module);
    await module.link((specifier, parent) => {
      if (specifier === 'https://esm.sh/@supabase/supabase-js@2.110.8') return sdk;
      if (specifier === 'node:net') return net;
      assert.ok(specifier.startsWith('.'), `Unexpected dependency: ${specifier}`);
      return load(new URL(specifier, parent.identifier));
    });
    return module;
  }
  const customer = await load(new URL('../../supabase/functions/marketplace-customer-gateway/index.ts', import.meta.url));
  const map = await load(new URL('../../supabase/functions/marketplace-map-gateway/index.ts', import.meta.url));
  await customer.evaluate();
  await map.evaluate();
  return { calls, handlers: { customer: customerHandler, map: map.namespace.handleRequest } };
}

function request(kind, headers = {}, method = 'POST') {
  return new Request('https://isolated.invalid/gateway', {
    method, headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(kind === 'customer'
      ? { operation: 'services' } : { operation: 'geocode', query: 'Habana' }) } : {}),
  });
}

for (const kind of ['customer', 'map']) {
  test(`${kind}: rotating forged XFF cannot create fresh limiter buckets`, async () => {
    const { handlers, calls } = await harness();
    for (let i = 1; i <= 3; i++) {
      const response = await handlers[kind](request(kind, {
        'cf-connecting-ip': '203.0.113.9',
        'x-forwarded-for': `198.51.100.${i}, 203.0.113.9`,
        'x-real-ip': `192.0.2.${i}`,
      }));
      if (i <= 2) assert.equal(response.status, 200);
      else assert.equal((await response.json()).error, 'CUSTOMER_RATE_LIMITED');
    }
    assert.equal(new Set(calls.identities).size, 1);
    for (const identity of calls.identities) assert.match(identity, /^[0-9a-f]{64}$/);
    if (kind === 'map') assert.equal(calls.providers, 2, 'blocked request must not reach provider');
  });

  test(`${kind}: missing, duplicate or malformed trusted IP fails before database/provider access`, async () => {
    for (const ip of [null, '', 'unknown', '203.0.113.9, 198.51.100.2', '999.1.2.3', '[2001:db8::1]', '2001:db8::1%eth0']) {
      const { handlers, calls } = await harness();
      const response = await handlers[kind](request(kind, {
        ...(ip === null ? {} : { 'cf-connecting-ip': ip }),
        'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9',
      }));
      assert.equal(response.status, 503, `IP case: ${ip}`);
      assert.equal((await response.json()).error, 'GATEWAY_CLIENT_IP_UNAVAILABLE');
      assert.equal(calls.clients, 0);
      assert.equal(calls.providers, 0);
      assert.equal(calls.identities.length, 0);
    }
  });

  test(`${kind}: equivalent IPv6 addresses share a bucket`, async () => {
    const { handlers, calls } = await harness();
    for (const ip of ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1', '2001:db8::0001']) {
      await handlers[kind](request(kind, { 'cf-connecting-ip': ip, 'x-forwarded-for': ip }));
    }
    assert.equal(new Set(calls.identities).size, 1);
  });

  test(`${kind}: different trusted addresses have independent budgets`, async () => {
    const { handlers, calls } = await harness();
    for (const ip of ['203.0.113.9', '203.0.113.10']) {
      const response = await handlers[kind](request(kind, {
        'cf-connecting-ip': ip, 'x-forwarded-for': 'forged-same-value',
      }));
      assert.equal(response.status, 200);
    }
    assert.equal(new Set(calls.identities).size, 2);
  });

  test(`${kind}: preflight and method checks do not require an IP`, async () => {
    const { handlers, calls } = await harness();
    assert.equal((await handlers[kind](request(kind, {}, 'OPTIONS'))).status, 200);
    assert.equal((await handlers[kind](request(kind, {}, 'GET'))).status, 405);
    assert.equal(calls.clients, 0);
  });
}

test('both gateways share the existing read budget for the same trusted IP', async () => {
  const { handlers, calls } = await harness();
  for (const kind of ['customer', 'map', 'customer']) {
    const response = await handlers[kind](request(kind, {
      'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': `${kind}-forged`,
    }));
    if (calls.identities.length === 3) {
      assert.equal((await response.json()).error, 'CUSTOMER_RATE_LIMITED');
    } else assert.equal(response.status, 200);
  }
  assert.equal(new Set(calls.identities).size, 1);
});
