import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProbe } from '../../supabase/verification/gateway-ip-probe/index.ts';

const token = 'ab'.repeat(32);
const stagingRef = 'abcdefghijklmnopqrst';
const config = { projectRef: stagingRef, allowedProjectRef: stagingRef, token };
function request(extra = {}, authorization = `Bearer ${token}`, method = 'POST') {
  return new Request('https://isolated.invalid', {
    method, headers: { authorization, ...extra },
  });
}

test('probe refuses production, missing allowlist, and weak tokens', async () => {
  for (const candidate of [
    { ...config, projectRef: 'vvxvnywzgtqhlaqpxyqh', allowedProjectRef: 'vvxvnywzgtqhlaqpxyqh' },
    { ...config, allowedProjectRef: '' },
    { ...config, token: '' },
    { ...config, token: 'short' },
  ]) {
    const result = await createProbe(candidate)(request());
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: 'PROBE_DISABLED' });
  }
});

test('probe refuses unauthorized callers and other HTTP methods', async () => {
  const probe = createProbe(config);
  for (const authorization of ['', 'Bearer wrong', `Bearer ${token}extra`]) {
    const result = await probe(request({}, authorization));
    assert.equal(result.status, 404);
    assert.equal((await result.json()).cf_fingerprint, undefined);
  }
  assert.equal((await probe(request({}, `Bearer ${token}`, 'GET'))).status, 405);
});

test('probe reports independent fingerprints without returning sensitive input', async () => {
  const probe = createProbe(config);
  const results = [];
  for (const prefix of ['198.51.100.1', '198.51.100.2']) {
    const result = await probe(request({
      'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': `${prefix}, 203.0.113.9`,
    }));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const body = await result.json();
    assert.deepEqual(Object.keys(body).sort(), ['cf_fingerprint', 'cf_valid', 'xff_first_fingerprint']);
    assert.equal(body.cf_valid, true);
    assert.match(body.cf_fingerprint, /^[0-9a-f]{64}$/);
    assert.match(body.xff_first_fingerprint, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(body).includes('203.0.113.9'));
    assert.ok(!JSON.stringify(body).includes(token));
    results.push(body);
  }
  assert.equal(results[0].cf_fingerprint, results[1].cf_fingerprint);
  assert.notEqual(results[0].xff_first_fingerprint, results[1].xff_first_fingerprint);
});

test('probe reports invalid/missing CF address without substituting XFF', async () => {
  for (const value of ['', 'forged', '203.0.113.9, 203.0.113.10', 'fe80::1%eth0']) {
    const response = await createProbe(config)(request({
      'cf-connecting-ip': value, 'x-forwarded-for': '203.0.113.9',
    }));
    const body = await response.json();
    assert.equal(body.cf_valid, false);
    assert.equal(body.cf_fingerprint, null);
    assert.match(body.xff_first_fingerprint, /^[0-9a-f]{64}$/);
  }
});
