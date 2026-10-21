import { deepStrictEqual as equal, ok } from "node:assert/strict";
import dispatcher from "./index.ts";
import { FakeAdmin } from "./test_support/fake_admin.ts";

// Synthetic RSA account and fetch responses only; tests run WITHOUT network permission.
const key = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key.privateKey));
const encoded = btoa(String.fromCharCode(...bytes));
Deno.env.set("FIREBASE_SERVICE_ACCOUNT_JSON", JSON.stringify({ project_id: "synthetic-project",
  client_email: "synthetic@example.invalid", private_key: "-----BEGIN PRIVATE KEY-----\n" + encoded + "\n-----END PRIVATE KEY-----" }));
Deno.env.set("TUKTUK_PUSH_DISPATCH_SECRET", "synthetic-dispatch-secret");
const kinds = ["daily_exchange_rate", "exchange_rate_update", "app_announcement", "app_update", "new_subscription", "marketplace_job_available"];
const originalFetch = globalThis.fetch;
function setup(events = kinds) {
  const db = new FakeAdmin(), messages: Record<string, any>[] = [], order: string[] = [];
  db.tables.notification_outbox = events.map((kind, index) => ({
    id: index + 1, project_id: "dfb41cea-a812-46f2-b511-7a60bd3d78af", user_id: "synthetic-user",
    kind, notification_date: "2026-10-11", title: kind, body: "synthetic-body", data: {},
    claim_id: "claim-" + index, attempt_count: 1, delivery_status: "processing",
  }));
  db.tables.push_device_tokens = ["admin", "client"].map(scope => ({
    id: scope, token: "synthetic-" + scope, platform: "android", user_id: "synthetic-user",
    project_id: "dfb41cea-a812-46f2-b511-7a60bd3d78af", enabled: true, app_scope: scope,
  }));
  let claimed = false;
  db.onRpc = (name, args) => {
    order.push(name);
    if (name === "claim_push_notification_batch") {
      equal(args.allowed_kinds, kinds);
      equal(args.lease_seconds, 300); equal(args.max_attempts, 5);
      return { data: claimed ? [] : (claimed = true, db.tables.notification_outbox.map(row => ({ ...row }))), error: null };
    }
    return { data: [], error: null };
  };
  let response = () => Response.json({ name: "synthetic-message" });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "synthetic-oauth" });
    if (!url.startsWith("https://fcm.googleapis.com/v1/projects/synthetic-project/messages:send")) throw new Error("Unexpected network destination");
    const message = JSON.parse(String(init?.body)).message;
    messages.push(message); order.push(message.data.kind);
    return response();
  };
  return { db, messages, order, setResponse: (value: typeof response) => { response = value; } };
}
function req(values = {}, secret = "synthetic-dispatch-secret") {
  return new Request("http://localhost/dispatcher", { method: "POST",
    headers: { "x-tuktuk-dispatch-secret": secret }, body: JSON.stringify(values) });
}
async function run(db: FakeAdmin, request = req()) {
  return await dispatcher.fetch(request, { supabaseAdmin: db });
}
Deno.test("dispatcher: six operative events preserve payload and default admin/client audience", async () => {
  const { db, messages } = setup();
  try {
    const result = await run(db); equal(result.status, 200);
    const summary = await result.json(); equal(summary.sent, 6); equal(summary.customer.claimed, 0);
    equal(messages.map(message => message.data.kind), kinds);
    for (const message of messages) {
      equal(message.token, message.data.kind === "new_subscription" ? "synthetic-admin" : "synthetic-client");
      equal(message.notification, { title: message.data.kind, body: "synthetic-body" });
      equal(message.android.notification.channel_id,
        message.data.kind === "marketplace_job_available"
          ? "tuktuk_nuevas_carreras_v1"
          : "tuktuk_general");
    }
  } finally { globalThis.fetch = originalFetch; }
});
Deno.test("dispatcher: audience and platform override preserve current v16 filters", async () => {
  const { db, messages } = setup(["app_announcement"]);
  db.tables.notification_outbox[0].data = { target_audience: "admin", target_platform: "web" };
  db.tables.push_device_tokens[0].platform = "web";
  try { await run(db); equal(messages.length, 1); equal(messages[0].token, "synthetic-admin");
    ok(messages[0].webpush); equal(messages[0].notification, undefined);
  } finally { globalThis.fetch = originalFetch; }
});
Deno.test("dispatcher: invalid audience falls back to v16 default", async () => {
  const { db, messages } = setup(["new_subscription"]);
  db.tables.notification_outbox[0].data = { target_audience: "unauthorized-scope" };
  try { await run(db); equal(messages[0].token, "synthetic-admin"); }
  finally { globalThis.fetch = originalFetch; }
});
Deno.test("dispatcher: missing/wrong secret, invalid limits and method never claim or send", async () => {
  const { db, messages } = setup();
  try {
    equal((await run(db, req({}, ""))).status, 401);
    equal((await run(db, req({}, "wrong"))).status, 401);
    equal((await run(db, req({ limit: 501 }))).status, 400);
    equal((await run(db, new Request("http://localhost/"))).status, 405);
    equal(messages.length, 0); equal(db.calls.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
Deno.test("dispatcher: transient, invalid token and exhausted retries retain Conductor semantics", async () => {
  for (const mode of ["transient", "invalid", "exhausted"]) {
    const { db, setResponse } = setup(["marketplace_job_available"]);
    if (mode === "exhausted") db.tables.notification_outbox[0].attempt_count = 5;
    setResponse(() => Response.json({ error: { details: [{ errorCode: mode === "invalid" ? "UNREGISTERED" : "UNAVAILABLE" }] } }, { status: mode === "invalid" ? 404 : 503 }));
    try {
      const summary = await (await run(db)).json();
      equal(summary.failed, 1);
      equal(db.tables.notification_outbox[0].delivery_status, mode === "transient" ? "pending" : "failed");
      equal(db.tables.push_device_tokens[1].enabled, mode !== "invalid");
      equal(db.tables.notification_outbox[0].claim_id, null);
    } finally { globalThis.fetch = originalFetch; }
  }
});
Deno.test("dispatcher: no target token skips, partial delivery retains success", async () => {
  const empty = setup(["exchange_rate_update"]); empty.db.tables.push_device_tokens = [];
  try { equal((await (await run(empty.db)).json()).skipped, 1); equal(empty.messages.length, 0); }
  finally { globalThis.fetch = originalFetch; }
  const partial = setup(["exchange_rate_update"]);
  partial.db.tables.push_device_tokens.push({ ...partial.db.tables.push_device_tokens[1], id: "second", token: "synthetic-second" });
  let count = 0; partial.setResponse(() => ++count === 1 ? Response.json({}) : Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }));
  try { equal((await (await run(partial.db)).json()).sent, 1); equal(partial.db.tables.notification_outbox[0].delivery_status, "sent"); }
  finally { globalThis.fetch = originalFetch; }
});
Deno.test("dispatcher: saturated Cliente runs after Conductor using the same OAuth/FCM sender", async () => {
  const { db, order, messages } = setup(["marketplace_job_available"]);
  const originalRpc = db.onRpc;
  const leases = Array.from({ length: 1000 }, (_, i) => ({
    delivery_id: i + 1, claim_uuid: "customer-claim-" + i, subscription_id: "customer-" + i,
    fcm_token: "synthetic-customer-" + i, rate_history_id: 7, current_rate: 410, previous_rate: 400, attempt_number: 1,
  }));
  db.tables.marketplace_customer_eltoque_push_subscriptions = leases.map(row => ({ id: row.subscription_id, fcm_token: row.fcm_token, enabled: true, expires_at: new Date(Date.now() + 86400000).toISOString() }));
  db.tables.marketplace_customer_eltoque_push_deliveries = leases.map(row => ({ id: row.delivery_id, status: "sending", claim_id: row.claim_uuid, claimed_until: new Date(Date.now() + 240000).toISOString() }));
  db.onRpc = (name, args) => {
    if (name !== "marketplace_customer_eltoque_push_claim") return originalRpc(name, args);
    order.push(name); return { data: leases.slice(0, args.batch_limit), error: null };
  };
  try {
    const summary = await (await run(db)).json();
    equal(summary.sent, 1); ok(summary.customer.sent > 0 && summary.customer.sent <= 100);
    equal(messages[0].data.kind, "marketplace_job_available");
    ok(order.indexOf("marketplace_job_available") < order.indexOf("marketplace_customer_eltoque_push_claim"));
    const customer = messages[1]; equal(customer.data.kind, "customer_exchange_rate_update");
    equal(customer.notification, undefined); ok(customer.webpush); equal(customer.data.rate_history_id, "7");
  } finally { globalThis.fetch = originalFetch; }
});
Deno.test("dispatcher: Cliente failure cannot fail completed Conductor delivery", async () => {
  const { db } = setup(["marketplace_job_available"]);
  const original = db.onRpc;
  db.onRpc = (name, args) => {
    if (name === "marketplace_customer_eltoque_push_claim") throw new Error("Cliente unavailable");
    return original(name, args);
  };
  try { const result = await run(db); equal(result.status, 200);
    const summary = await result.json(); equal(summary.sent, 1); equal(summary.customer.unavailable, true);
  } finally { globalThis.fetch = originalFetch; }
});
