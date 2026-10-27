import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  buildFcmMessage,
  classifyFcmFailure,
  constantTimeSecretEquals,
  mapWithConcurrency,
  MAX_ATTEMPTS,
  parseWorkerOptions,
  retryDelaySeconds,
} from "./core.ts";

type QueueRow = { id: number; status: "pending" | "processing" | "sent" | "failed"; claimedAt?: number; attempts: number };

class LeasedQueue {
  constructor(readonly rows: QueueRow[]) {}

  claim(limit: number, now = Date.now(), leaseMs = 120_000): QueueRow[] {
    const claimed = this.rows.filter((row) =>
      row.attempts < MAX_ATTEMPTS &&
      (row.status === "pending" || (row.status === "processing" && (row.claimedAt ?? 0) < now - leaseMs))
    ).slice(0, limit);
    for (const row of claimed) {
      row.status = "processing";
      row.claimedAt = now;
      row.attempts++;
    }
    return claimed.map((row) => ({ ...row }));
  }
}

Deno.test("accepts a valid limit", () => {
  assertEquals(parseWorkerOptions({ limit: 250 }).limit, 250);
  assertEquals(parseWorkerOptions({}).limit, 100);
});

Deno.test("rejects invalid limits", () => {
  for (const limit of [-1, 0, 501, Number.NaN, 1.5, "25"]) {
    let rejected = false;
    try {
      parseWorkerOptions({ limit });
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
});

Deno.test("empty queue returns no claims", () => {
  assertEquals(new LeasedQueue([]).claim(100), []);
});

Deno.test("claims fewer than one batch", () => {
  const queue = new LeasedQueue([{ id: 1, status: "pending", attempts: 0 }]);
  assertEquals(queue.claim(100).length, 1);
});

Deno.test("drains more than one batch", () => {
  const queue = new LeasedQueue(Array.from({ length: 230 }, (_, index) => ({ id: index, status: "pending" as const, attempts: 0 })));
  let processed = 0;
  while (true) {
    const batch = queue.claim(100);
    if (!batch.length) break;
    processed += batch.length;
    for (const claimed of batch) queue.rows[claimed.id].status = "sent";
  }
  assertEquals(processed, 230);
});

Deno.test("two concurrent workers do not claim the same row", async () => {
  const queue = new LeasedQueue(Array.from({ length: 100 }, (_, index) => ({ id: index, status: "pending" as const, attempts: 0 })));
  const [first, second] = await Promise.all([Promise.resolve().then(() => queue.claim(60)), Promise.resolve().then(() => queue.claim(60))]);
  assertEquals(new Set([...first, ...second].map((row) => row.id)).size, 100);
  assertEquals(first.filter((row) => second.some((other) => other.id === row.id)).length, 0);
});

Deno.test("UNREGISTERED is permanent and invalid", () => {
  const result = classifyFcmFailure(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } });
  assert(result.invalid);
  assert(result.permanent);
});

Deno.test("temporary FCM failure remains retryable", () => {
  const result = classifyFcmFailure(503, { error: { status: "UNAVAILABLE", message: "try later" } });
  assertEquals(result.permanent, false);
  assertEquals(retryDelaySeconds(1), 30);
});

Deno.test("partial delivery can preserve success and count failure", () => {
  const results = [{ ok: true }, { ok: false }];
  assertEquals(results.filter((result) => result.ok).length, 1);
  assertEquals(results.filter((result) => !result.ok).length, 1);
});

Deno.test("missing endpoint authentication is rejected", async () => {
  assertEquals(await constantTimeSecretEquals("", "configured-secret"), false);
});

Deno.test("correct endpoint authentication is accepted", async () => {
  assert(await constantTimeSecretEquals("configured-secret", "configured-secret"));
  assertEquals(await constantTimeSecretEquals("wrong", "configured-secret"), false);
});

Deno.test("abandoned processing work is reclaimed after its lease", () => {
  const now = Date.now();
  const queue = new LeasedQueue([{ id: 1, status: "processing", claimedAt: now - 121_000, attempts: 1 }]);
  assertEquals(queue.claim(10, now).map((row) => row.id), [1]);
});

Deno.test("maximum retry count is terminal", () => {
  const queue = new LeasedQueue([{ id: 1, status: "pending", attempts: MAX_ATTEMPTS }]);
  assertEquals(queue.claim(10), []);
  assertEquals(retryDelaySeconds(MAX_ATTEMPTS), 480);
});

Deno.test("Android new job selects TukTuk 14 notification channel", () => {
  const message = buildFcmMessage("android", "token", "Title", "Body", { kind: "marketplace_job_available" }, "marketplace_job_available");
  const android = message.android as { priority: string; notification: { channel_id: string } };
  assertEquals(android.notification.channel_id, "tuktuk_nuevas_carreras_v1");
  assertEquals(android.priority, "high");
  assertEquals(message.notification, { title: "Title", body: "Body" });
});

Deno.test("Android other notifications retain general channel", () => {
  for (const kind of ["daily_exchange_rate", "app_announcement", "app_update", "new_subscription"]) {
    const message = buildFcmMessage("android", "token", "Title", "Body", { kind }, kind);
    const android = message.android as { notification: { channel_id: string } };
    assertEquals(android.notification.channel_id, "tuktuk_general");
  }
});

Deno.test("Android channel is driven by trusted outbox kind rather than payload data", () => {
  const message = buildFcmMessage("android", "token", "Title", "Body", { kind: "marketplace_job_available" }, "app_announcement");
  const android = message.android as { notification: { channel_id: string } };
  assertEquals(android.notification.channel_id, "tuktuk_general");
});

Deno.test("Web payload uses webpush without Android notification fields", () => {
  for (const kind of ["daily_exchange_rate", "marketplace_job_available"]) {
    const message = buildFcmMessage("web", "token", "Title", "Body", { kind }, kind);
    assert("webpush" in message);
    assertEquals("android" in message, false);
    assertEquals("notification" in message, false);
  }
});

Deno.test("concurrency pool never exceeds its configured size", async () => {
  let active = 0;
  let maximum = 0;
  await mapWithConcurrency(Array.from({ length: 30 }, (_, index) => index), 4, async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
  });
  assertEquals(maximum, 4);
});

Deno.test("malformed optional worker controls are rejected", async () => {
  await assertRejects(async () => parseWorkerOptions({ max_batches: 0 }));
  await assertRejects(async () => parseWorkerOptions({ concurrency: 21 }));
  await assertRejects(async () => parseWorkerOptions({ time_budget_ms: 999 }));
});

Deno.test("new driver tokens receive official job channel V2", () => {
  const message = buildFcmMessage("android", "token", "Title", "Body", {}, "marketplace_job_available", 2);
  const android = message.android as { notification: { channel_id: string } };
  assertEquals(android.notification.channel_id, "tuktuk_nuevas_carreras_v2");
});

Deno.test("legacy and unknown device capabilities always retain V1", () => {
  for (const version of [0, 1, 3]) {
    const message = buildFcmMessage("android", "token", "Title", "Body", {}, "marketplace_job_available", version);
    const android = message.android as { notification: { channel_id: string } };
    assertEquals(android.notification.channel_id, "tuktuk_nuevas_carreras_v1");
  }
});

Deno.test("unrelated push kinds never switch to the new channel", () => {
  const message = buildFcmMessage("android", "token", "Title", "Body", {}, "app_announcement", 2);
  const android = message.android as { notification: { channel_id: string } };
  assertEquals(android.notification.channel_id, "tuktuk_general");
});