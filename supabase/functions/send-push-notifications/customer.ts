import { mapWithConcurrency, MAX_ATTEMPTS, retryDelaySeconds, type FcmResult } from "./core.ts";

export type CustomerClaim = {
  delivery_id: number; claim_uuid: string; subscription_id: string; fcm_token: string;
  rate_history_id: number; current_rate: number; previous_rate: number | null; attempt_number: number;
};
const SUBSCRIPTIONS = "marketplace_customer_eltoque_push_subscriptions";
const DELIVERIES = "marketplace_customer_eltoque_push_deliveries";

export function customerPayload(row: CustomerClaim) {
  const current = Number(row.current_rate), previous = row.previous_rate === null ? null : Number(row.previous_rate);
  const direction = previous !== null && current > previous ? "subió" : "bajó";
  return {
    title: "elTOQUE · TUKTUK Cliente",
    body: previous === null ? `1 USD = ${current} CUP. Valor referencial.` :
      `El USD ${direction}: ${current} CUP (antes ${previous}). Valor referencial.`,
    data: { kind: "customer_exchange_rate_update", rate_history_id: String(row.rate_history_id) },
  };
}

// Conductor completes first with its original budget/limits. Cliente only uses
// the remaining time, a single bounded claim, and the SAME sendFcm/OAuth session.
// deno-lint-ignore no-explicit-any
export async function processCustomerQueue(admin: any, send: (row: CustomerClaim) => Promise<FcmResult>,
  deadline: number, concurrency: number, now: () => number = Date.now) {
  const summary = { claimed: 0, sent: 0, failed: 0, skipped: 0, invalid_tokens: 0, unavailable: false };
  const pool = Math.min(concurrency, 6);
  const waves = Math.floor((deadline - now() - 2000) / 10000);
  if (waves < 1) return summary;
  let claimed;
  try {
    // Claim at most 100 so ordinary fast FCM responses can drain 500–1000
    // devices without treating every send as a full ten-second timeout.
    claimed = await admin.rpc("marketplace_customer_eltoque_push_claim", { batch_limit: 100 });
  } catch { return { ...summary, unavailable: true }; }
  const { data, error } = claimed;
  if (error) return { ...summary, unavailable: true }; // Isolate Cliente DB outages from Conductor.
  const rows = (data ?? []) as CustomerClaim[];
  summary.claimed = rows.length;
  const updateDelivery = async (row: CustomerClaim, values: Record<string, unknown>) => {
    const { data, error } = await admin.from(DELIVERIES).update({ ...values, claim_id: null, claimed_until: null })
      .eq("id", row.delivery_id).eq("claim_id", row.claim_uuid).eq("status", "sending")
      .gt("claimed_until", new Date(now()).toISOString()).select("id");
    return !error && data?.length === 1;
  };
  await mapWithConcurrency(rows, pool, async row => {
    try {
      // A claim can expire or be replaced while waiting in the pool. Recheck
      // ownership and current subscription immediately before any FCM send.
      const { data: lease, error: leaseError } = await admin.from(DELIVERIES).select("id")
        .eq("id", row.delivery_id).eq("claim_id", row.claim_uuid).eq("status", "sending")
        .gt("claimed_until", new Date(now() + 10000).toISOString()).maybeSingle();
      if (leaseError) { summary.unavailable = true; return; }
      if (!lease) { summary.skipped++; return; }
      const { data: subscription, error: subscriptionError } = await admin.from(SUBSCRIPTIONS).select("id")
        .eq("id", row.subscription_id).eq("enabled", true).eq("fcm_token", row.fcm_token)
        .gt("expires_at", new Date(now()).toISOString()).maybeSingle();
      if (subscriptionError) { summary.unavailable = true; return; }
      if (!subscription) {
        if (await updateDelivery(row, { status: "failed", last_error: "Subscription revoked, expired or rotated" })) summary.skipped++;
        return;
      }
      const current = Number(row.current_rate), previous = Number(row.previous_rate);
      if (!Number.isFinite(current) || current <= 0 || row.previous_rate === null || !Number.isFinite(previous) || current === previous) {
        if (await updateDelivery(row, { status: "failed", last_error: "Not a valid USD/CUP rate change" })) summary.skipped++;
        return;
      }
      if (now() >= deadline - 12000) {
        if (await updateDelivery(row, { status: "retry", attempt_count: Math.max(0, row.attempt_number - 1),
          next_attempt_at: new Date(now() + 30000).toISOString(), last_error: "Worker time budget reached" })) summary.skipped++;
        return;
      }
      const result = await send(row);
      if (result.invalid) {
        // Never disable a replacement token after an in-flight token rotation.
        const { data, error } = await admin.from(SUBSCRIPTIONS).update({ enabled: false, updated_at: new Date(now()).toISOString() })
          .eq("id", row.subscription_id).eq("fcm_token", row.fcm_token).select("id");
        if (error) summary.unavailable = true;
        else summary.invalid_tokens += data?.length ?? 0;
      }
      const terminal = result.permanent || row.attempt_number >= MAX_ATTEMPTS;
      // Keep error categories only, never FCM response text containing a token.
      const saved = await updateDelivery(row, result.ok
        ? { status: "sent", sent_at: new Date(now()).toISOString(), last_error: null }
        : { status: terminal ? "failed" : "retry", last_error: result.invalid ? "FCM token unregistered" : terminal ? "Permanent FCM failure" : "Temporary FCM failure",
          next_attempt_at: new Date(now() + retryDelaySeconds(row.attempt_number) * 1000).toISOString() });
      if (!saved) { summary.unavailable = true; return; }
      if (result.ok) summary.sent++;
      else summary.failed++;
    } catch { summary.unavailable = true; } // Lease expires for safe recovery; do not erase another claim.
  });
  return summary;
}
