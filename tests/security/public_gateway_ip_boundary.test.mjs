import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isIP } from 'node:net';
import { webcrypto } from 'node:crypto';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { test } from 'node:test';

// Run the actual handlers, including HMAC and limiter calls, without network,
// credentials, database access, or an HTTP listener.
async function harness({ fleetRows = [], sessionError = null, trackingSnapshot = null, trackingError = null, customerJobs = [] } = {}) {
  const calls = { clients: 0, providers: 0, operations: 0, identities: [], fleetQueries: [], sessionChecks: 0, trackingChecks: 0, providerPaths: [] };
  const buckets = new Map();
  const db = {
    from(table) {
      if (table === 'marketplace_driver_locations' || table === 'jobs') {
        calls.fleetQueries.push(table);
        throw new Error('PRIVATE_TABLE_ACCESS_FORBIDDEN');
      }
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
      if (name === 'get_marketplace_customer_working_fleet') {
        calls.sessionChecks++;
        assert.deepEqual(Object.keys(params).sort(), ['target_session_id', 'target_session_token']);
        return { data: fleetRows, error: sessionError };
      }
      if (name === 'get_marketplace_customer_job') return { data: customerJobs, error: null };
      if (name === 'get_marketplace_customer_tracking_snapshot') {
        calls.trackingChecks++;
        assert.deepEqual(Object.keys(params).sort(), ['target_job_id', 'target_session_id', 'target_session_token']);
        return { data: trackingSnapshot, error: trackingError };
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
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder, Error, AbortSignal,
    crypto: webcrypto,
    Deno: { env: { get: (key) => env[key] }, serve: (handler) => { customerHandler = handler; } },
    fetch: async (url) => {
      assert.equal(new URL(url).hostname, 'api.mapbox.com');
      calls.providers++;
      calls.providerPaths.push(new URL(url).pathname);
      if (new URL(url).pathname.startsWith('/directions/')) {
        return Response.json({ routes: [{ distance: 1000, duration: 120,
          geometry: { coordinates: [[-82.36,23.11],[-82.35,23.12]] } }] });
      }
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
  test(`${kind}: rejects oversized streamed JSON despite a misleading Content-Length`, async () => {
    const { handlers, calls } = await harness();
    const payload = new TextEncoder().encode(JSON.stringify({
      operation: kind === 'customer' ? 'services' : 'geocode', query: 'Habana',
      padding: 'a'.repeat(96 * 1024),
    }));
    let offset = 0;
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        if (offset >= payload.length) { controller.close(); return; }
        controller.enqueue(payload.slice(offset, offset + 8192));
        offset += 8192;
      },
      cancel() { cancelled = true; },
    });
    const req = new Request('https://isolated.invalid', {
      method: 'POST', body: stream, duplex: 'half',
      headers: { 'cf-connecting-ip': '203.0.113.9', 'content-type': 'application/json',
        'content-length': '1' },
    });
    const response = await handlers[kind](req);
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'GATEWAY_REQUEST_TOO_LARGE');
    assert.equal(cancelled, true);
    assert.equal(calls.clients, 0);
    assert.equal(calls.providers, 0);
  });

  test(`${kind}: accepts JSON at the byte limit and counts UTF-8 bytes`, async () => {
    const make = (padding) => JSON.stringify({
      operation: kind === 'customer' ? 'services' : 'geocode', query: 'Habana', padding,
    });
    const baseBytes = new TextEncoder().encode(make('')).length;
    for (const [padding, status] of [
      ['a'.repeat(65536 - baseBytes), 200], ['é'.repeat(32768), 413],
    ]) {
      const { handlers, calls } = await harness();
      const response = await handlers[kind](new Request('https://isolated.invalid', {
        method: 'POST', body: make(padding),
        headers: { 'cf-connecting-ip': '203.0.113.9', 'content-type': 'application/json' },
      }));
      assert.equal(response.status, status);
      if (status === 413) {
        assert.equal(calls.clients, 0);
        assert.equal(calls.providers, 0);
      }
    }
  });

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

function fleetRequest(params = { target_session_id: 'test-session', target_session_token: 'test-token' }) {
  return new Request('https://isolated.invalid/gateway', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify({ operation: 'working_fleet', params }),
  });
}
test('working fleet: validates session before reading GPS; never returns private fields', async () => {
  const { handlers, calls } = await harness({ fleetRows: [
    { latitude: 23.123456, longitude: -82.345678, driver_user_id: 'private-id', captured_at: '2020-01-01' },
    { latitude: null, longitude: -82 },
    { latitude: 90, longitude: 0 },
  ] });
  const response = await handlers.customer(fleetRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: [{ latitude: 23.124, longitude: -82.347 }] });
  assert.equal(calls.sessionChecks, 1);
  assert.equal(calls.fleetQueries.length, 0, 'never access private GPS directly');
});
test('working fleet: missing or invalid session cannot read GPS', async () => {
  for (const [params, sessionError] of [[{}, null], [{ target_session_id: 'bad', target_session_token: 'bad' }, new Error('SESSION_INVALID')]]) {
    const { handlers, calls } = await harness({ sessionError });
    assert.equal((await handlers.customer(fleetRequest(params))).status, 400);
    assert.equal(calls.fleetQueries.length, 0);
  }
});
test('working fleet: separate trusted-IP budget from booking reads', async () => {
  const { handlers, calls } = await harness();
  assert.equal((await handlers.customer(fleetRequest())).status, 200);
  assert.equal((await handlers.customer(request('customer', { 'cf-connecting-ip': '203.0.113.9' }))).status, 200);
  assert.notEqual(calls.identities[0], calls.identities[1]);
});

test('working fleet SQL boundary: service-only wrapper and private session-authorized query', async () => {
  const sql = await readFile(new URL('../../docs/security/customer-working-fleet-rpc.sql', import.meta.url), 'utf8');
  assert.match(sql, /app_private\.resolve_marketplace_customer_session\(target_session_id, target_session_token\)/);
  assert.match(sql, /SECURITY DEFINER SET search_path TO ''/i);
  assert.match(sql, /SECURITY INVOKER SET search_path TO ''/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_marketplace_customer_working_fleet\(uuid, text\) FROM PUBLIC, anon, authenticated;/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_marketplace_customer_working_fleet\(uuid, text\) TO service_role;/i);
  assert.match(sql, /a\.is_active[\s\S]*a\.accepting_jobs/);
  assert.match(sql, /d\.status = 'active'/);
  assert.match(sql, /v\.marketplace_status = 'active'/);
  assert.match(sql, /round\(l\.latitude \/ 0\.003\) \* 0\.003/);
  assert.match(sql, /round\(l\.longitude \/ 0\.003\) \* 0\.003/);
  assert.doesNotMatch(sql, /\bis_available\b|\bcaptured_at\b|GRANT\s+SELECT/i);
});

const trackingParams = { target_session_id: 'test-session', target_session_token: 'test-token', target_job_id: 'test-job' };
function trackingRequest(operation, params = trackingParams) {
  return new Request('https://isolated.invalid/gateway', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify(operation === 'get_job' ? { operation, params } : { operation, ...params }),
  });
}
function trackingFixture(status = 'en_route', captured = new Date().toISOString()) {
  return { status, driver_location: { latitude: 23.11, longitude: -82.36,
    accuracy_m: 12, speed_mps: 4, heading_degrees: 90, captured_at: captured },
    route_origin: { lat: 23.12, lon: -82.35 }, route_destination: { lat: 23.15, lon: -82.31 } };
}
test('assigned driver GPS uses private RPC, preserves heading, and fails softly', async () => {
  const job = { status: 'en_route', job_id: 'test-job' };
  for (const trackingError of [null, new Error('permission denied')]) {
    const { handlers, calls } = await harness({ customerJobs: [job], trackingSnapshot: trackingFixture(), trackingError });
    const response = await handlers.customer(trackingRequest('get_job'));
    assert.equal(response.status, 200);
    const data = (await response.json()).data[0];
    assert.equal(data.job_id, job.job_id);
    assert.equal(data.driver_location?.heading_degrees, trackingError ? undefined : 90);
    assert.equal(calls.trackingChecks, 1);
    assert.equal(calls.fleetQueries.length, 0);
  }
});
test('customer tracking directions use server GPS and actual stage, ignore browser coordinates', async () => {
  for (const status of ['en_route','in_progress']) {
    const { handlers, calls } = await harness({ trackingSnapshot: trackingFixture(status) });
    const response = await handlers.map(trackingRequest('customer_tracking_route', { ...trackingParams, origin: {lat:0,lon:0}, destination: {lat:1,lon:1} }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.stage, status === 'in_progress' ? 'destination' : 'pickup');
    assert.equal(calls.trackingChecks, 1);
    assert.equal(calls.providers, 1);
    assert.ok(calls.providerPaths[0].endsWith(status === 'in_progress' ? '-82.36,23.11;-82.31,23.15' : '-82.36,23.11;-82.35,23.12'));
  }
});
test('customer tracking rejects invalid session and never requests directions for stale GPS or arrived driver', async () => {
  for (const [snapshot, error, expected] of [[null,new Error('ACCESS_DENIED'),403],[trackingFixture('en_route','2020-01-01T00:00:00Z'),null,200],[trackingFixture('pickup'),null,200]]) {
    const { handlers, calls } = await harness({ trackingSnapshot: snapshot, trackingError: error });
    const response = await handlers.map(trackingRequest('customer_tracking_route'));
    assert.equal(response.status,expected);
    assert.equal(calls.providers,0);
    if (expected === 200) assert.deepEqual((await response.json()).data.route_points,[]);
  }
});
test('tracking SQL guards ownership, phase, freshness and service-only privileges', async () => {
  const sql = await readFile(new URL('../../docs/security/customer-assigned-tracking-rpc.sql',import.meta.url),'utf8');
  assert.match(sql,/resolve_marketplace_customer_session\(target_session_id, target_session_token\)/);
  assert.match(sql,/j\.id=target_job_id AND r\.customer_id=cid/);
  assert.match(sql,/j\.status IN \('accepted','en_route','pickup','in_progress'\)/);
  assert.match(sql,/l\.driver_user_id=j\.assigned_driver_user_id AND l\.vehicle_id=j\.assigned_vehicle_id/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.get_marketplace_customer_tracking_snapshot\(uuid,text,uuid\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.get_marketplace_customer_tracking_snapshot\(uuid,text,uuid\) TO service_role;/);
  assert.doesNotMatch(sql,/GRANT\s+SELECT/i);
});
