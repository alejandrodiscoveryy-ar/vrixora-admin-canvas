import { deepStrictEqual as equal, ok } from "node:assert/strict";
import { processCustomerQueue, type CustomerClaim } from "./customer.ts";
import { FakeAdmin } from "./test_support/fake_admin.ts";

const S = "marketplace_customer_eltoque_push_subscriptions", D = "marketplace_customer_eltoque_push_deliveries";
const time = Date.parse("2026-10-11T12:00:00Z");
function setup(count = 1) {
  const db = new FakeAdmin();
  const claims: CustomerClaim[] = Array.from({ length: count }, (_, i) => ({
    delivery_id: i + 1, claim_uuid: "claim-" + i, subscription_id: "device-" + i,
    fcm_token: "synthetic-token-" + i, rate_history_id: 2, current_rate: 410, previous_rate: 400, attempt_number: 1,
  }));
  db.tables[S] = claims.map(row => ({ id: row.subscription_id, fcm_token: row.fcm_token, enabled: true, expires_at: new Date(time + 86400000).toISOString() }));
  db.tables[D] = claims.map(row => ({ id: row.delivery_id, claim_id: row.claim_uuid, status: "sending", claimed_until: new Date(time + 240000).toISOString() }));
  let used = false;
  db.onRpc = (_name, args) => ({ data: used ? [] : (used = true, claims.slice(0, args.batch_limit)), error: null });
  return { db, claims };
}
const success = () => Promise.resolve({ ok: true, invalid: false, permanent: false, error: null });
Deno.test("Cliente: empty queue and exhausted budget do not send", async () => {
  const { db } = setup(0);
  equal((await processCustomerQueue(db, success, time + 45000, 6, () => time)).claimed, 0);
  const full = setup(1000);
  equal((await processCustomerQueue(full.db, success, time + 1000, 6, () => time)).claimed, 0);
  equal(full.db.calls.length, 0);
});
Deno.test("Cliente: bounded batch, multiple devices, repeat invocation has no duplicate", async () => {
  const { db } = setup(1000); let sent = 0;
  const send = async () => { sent++; return await success(); };
  const first = await processCustomerQueue(db, send, time + 45000, 6, () => time);
  equal(first.claimed, 100); equal(first.sent, 100);
  equal((await processCustomerQueue(db, send, time + 45000, 6, () => time)).claimed, 0);
  equal(sent, 100);
});
for (const invalidity of ["revoked", "expired", "rotated", "old-claim", "expired-lease", "equal-rate"]) {
  Deno.test("Cliente: no send for " + invalidity, async () => {
    const { db, claims } = setup(); let sent = 0;
    if (invalidity === "revoked") db.tables[S][0].enabled = false;
    if (invalidity === "expired") db.tables[S][0].expires_at = new Date(time - 1).toISOString();
    if (invalidity === "rotated") db.tables[S][0].fcm_token = "replacement";
    if (invalidity === "old-claim") db.tables[D][0].claim_id = "new-owner";
    if (invalidity === "expired-lease") db.tables[D][0].claimed_until = new Date(time - 1).toISOString();
    if (invalidity === "equal-rate") claims[0].previous_rate = claims[0].current_rate;
    await processCustomerQueue(db, async () => { sent++; return await success(); }, time + 45000, 6, () => time);
    equal(sent, 0);
    if (invalidity === "old-claim") equal(db.tables[D][0].claim_id, "new-owner");
  });
}
Deno.test("Cliente: invalid token disables only the current token and records terminal failure", async () => {
  const { db } = setup();
  const result = await processCustomerQueue(db, async () => ({ ok: false, invalid: true, permanent: true, error: "synthetic" }), time + 45000, 6, () => time);
  equal(result.invalid_tokens, 1); equal(db.tables[S][0].enabled, false); equal(db.tables[D][0].status, "failed");
});
Deno.test("Cliente: invalid response for rotated token cannot disable replacement", async () => {
  const { db } = setup();
  await processCustomerQueue(db, async () => {
    db.tables[S][0].fcm_token = "replacement";
    return { ok: false, invalid: true, permanent: true, error: "synthetic" };
  }, time + 45000, 6, () => time);
  equal(db.tables[S][0].enabled, true);
});
Deno.test("Cliente: transient error backoff and maximum attempts", async () => {
  for (const attempts of [1, 5]) {
    const { db, claims } = setup(); claims[0].attempt_number = attempts;
    await processCustomerQueue(db, async () => ({ ok: false, invalid: false, permanent: false, error: "token must not be persisted" }), time + 45000, 6, () => time);
    equal(db.tables[D][0].status, attempts === 5 ? "failed" : "retry");
    equal(db.tables[D][0].last_error, attempts === 5 ? "Permanent FCM failure" : "Temporary FCM failure");
    ok(Date.parse(db.tables[D][0].next_attempt_at) > time);
  }
});
Deno.test("Cliente: changed claim during FCM cannot be finalized by old worker", async () => {
  const { db } = setup();
  const result = await processCustomerQueue(db, async () => { db.tables[D][0].claim_id = "new-owner"; return await success(); }, time + 45000, 6, () => time);
  equal(result.sent, 0); equal(db.tables[D][0].claim_id, "new-owner"); equal(result.unavailable, true);
});
Deno.test("Cliente: service unavailable does not throw into Conductor", async () => {
  const { db } = setup();
  db.onRpc = () => { throw new Error("unavailable"); };
  equal((await processCustomerQueue(db, success, time + 45000, 6, () => time)).unavailable, true);
});
Deno.test("Cliente: time budget releases unsent work without exhausting FCM attempts", async () => {
  const { db } = setup(10);
  let elapsed = 0;
  await processCustomerQueue(db, async () => { elapsed = 40000; return await success(); }, time + 45000, 1, () => time + elapsed);
  equal(db.tables[D][0].status, "sent");
  for (const row of db.tables[D].slice(1)) {
    equal(row.status, "retry"); equal(row.attempt_count, 0);
  }
});
