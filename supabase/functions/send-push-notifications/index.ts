import { withSupabase } from "npm:@supabase/server@1.5.2";
import { customerPayload, processCustomerQueue } from "./customer.ts";
import {
  buildFcmMessage,
  classifyFcmFailure,
  constantTimeSecretEquals,
  mapWithConcurrency,
  MAX_ATTEMPTS,
  parseWorkerOptions,
  retryDelaySeconds,
  type FcmResult,
} from "./core.ts";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type OutboxRow = {
  id: number;
  project_id: string;
  user_id: string;
  kind: string;
  notification_date: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  claim_id: string;
  attempt_count: number;
};
type DeviceToken = { id: string; token: string; platform: "android" | "ios" | "web"; job_alert_channel_version?: number };
type PushContent = Pick<OutboxRow, "id" | "kind" | "notification_date" | "title" | "body" | "data">;

const PROJECT_ID = "dfb41cea-a812-46f2-b511-7a60bd3d78af";
const ALLOWED_KINDS = [
  "daily_exchange_rate",
  "exchange_rate_update",
  "app_announcement",
  "app_update",
  "new_subscription",
  "marketplace_job_available",
  "admin_marketplace_new_job",
  "admin_marketplace_new_driver",
  "admin_marketplace_pending_job",
];
const AUTH_HEADER = "x-tuktuk-dispatch-secret";

function findFirebaseServiceAccountRaw(): string {
  const exact = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (exact) return exact;
  for (const [name, value] of Object.entries(Deno.env.toObject())) {
    const tail = name.split(/\r?\n/).pop()?.trim();
    if (tail === "FIREBASE_SERVICE_ACCOUNT_JSON" && value) return value;
  }
  return "";
}

function b64url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64text(value: string) {
  return b64url(new TextEncoder().encode(value));
}
function pemBuffer(pem: string) {
  const body = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function googleAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64text(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64text(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string") throw new Error(`Google OAuth failed (${response.status})`);
  return result.access_token as string;
}

function payloadData(row: PushContent) {
  const output: Record<string, string> = {
    notification_id: String(row.id),
    kind: row.kind,
    notification_date: row.notification_date,
    title: row.title,
    body: row.body,
  };
  for (const [key, value] of Object.entries(row.data ?? {})) {
    if (value !== null && value !== undefined) output[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return output;
}

async function sendFcm(account: ServiceAccount, accessToken: string, row: PushContent, device: DeviceToken): Promise<FcmResult> {
  // La categoría de la fila validada controla el canal, no row.data.kind.
  const message = buildFcmMessage(device.platform, device.token, row.title, row.body, payloadData(row), row.kind, device.job_alert_channel_version);
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, invalid: false, permanent: false, error: null } : classifyFcmFailure(response.status, result);
  } catch {
    return { ok: false, invalid: false, permanent: false, error: "FCM network request failed" };
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const startedAt = Date.now();
    const admin: any = ctx.supabaseAdmin;
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

    const expectedSecret = Deno.env.get("TUKTUK_PUSH_DISPATCH_SECRET") ?? "";
    if (!expectedSecret) return Response.json({ error: "Worker authentication is not configured" }, { status: 500 });
    if (!await constantTimeSecretEquals(req.headers.get(AUTH_HEADER) ?? "", expectedSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let options;
    try {
      options = parseWorkerOptions(await req.json().catch(() => ({})));
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
    }

    const firebaseRaw = findFirebaseServiceAccountRaw();
    if (!firebaseRaw) return Response.json({ error: "Firebase configuration unavailable" }, { status: 500 });
    let account: ServiceAccount;
    try {
      account = JSON.parse(firebaseRaw);
      if (!account.project_id || !account.client_email || !account.private_key) throw new Error();
    } catch {
      return Response.json({ error: "Firebase service account is invalid" }, { status: 500 });
    }
    let accessToken: string;
    try {
      accessToken = await googleAccessToken(account);
    } catch {
      return Response.json({ error: "Could not authenticate with Firebase" }, { status: 502 });
    }

    // Enqueue escalations using the existing push dispatcher; no parallel cron.
    const { error: pendingAlarmError } = await admin.rpc("enqueue_admin_marketplace_pending_alerts", {
      target_project_id: PROJECT_ID,
    });
    if (pendingAlarmError) console.warn("Admin pending-job alarm enqueue failed:", pendingAlarmError.code);

    const summary = {
      claimed: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      invalid_tokens: 0,
      remaining_pending: 0,
      batches: 0,
      duration_ms: 0,
    };

    const processRow = async (row: OutboxRow) => {
      if (Date.now() - startedAt >= options.timeBudgetMs - 2_000) {
        await releaseForRetry(admin, row, "Worker execution time budget reached");
        return { sent: 0, failed: 0, skipped: 1, invalid: 0 };
      }
      // Antes de enviar un aviso original o recordatorio, verificar estado REAL.
      if (row.kind === "marketplace_job_available") {
        const jobId = typeof row.data?.job_id === "string" ? row.data.job_id : null;
        if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
          await finishRow(admin, row, "skipped", "Missing/invalid marketplace job id");
          return { sent: 0, failed: 0, skipped: 1, invalid: 0 };
        }
        const { data: liveJob, error: liveJobError } = await admin.from("jobs")
          .select("status,assigned_driver_user_id,expires_at,test_deleted_at")
          .eq("project_id", row.project_id).eq("id", jobId).maybeSingle();
        if (liveJobError) {
          await releaseForRetry(admin, row, "Could not verify current marketplace job status");
          return { sent: 0, failed: 1, skipped: 0, invalid: 0 };
        }
        const expires = liveJob?.expires_at ? Date.parse(liveJob.expires_at) : Number.POSITIVE_INFINITY;
        if (!liveJob || liveJob.status !== "published" || liveJob.assigned_driver_user_id ||
            liveJob.test_deleted_at || Number.isNaN(expires) || expires <= Date.now()) {
          await finishRow(admin, row, "skipped", "Marketplace job no longer available");
          return { sent: 0, failed: 0, skipped: 1, invalid: 0 };
        }
        const { data: assignment, error: assignmentError } = await admin.from("job_assignments")
          .select("id").eq("project_id", row.project_id).eq("job_id", jobId).maybeSingle();
        if (assignmentError) {
          await releaseForRetry(admin, row, "Could not verify marketplace job assignments");
          return { sent: 0, failed: 1, skipped: 0, invalid: 0 };
        }
        if (assignment) {
          await finishRow(admin, row, "skipped", "Marketplace job already assigned");
          return { sent: 0, failed: 0, skipped: 1, invalid: 0 };
        }
        if (row.data?.reminder_index !== undefined) {
          const index = Number(row.data.reminder_index);
          const validUntil = typeof row.data.reminder_expires_at === "string"
            ? Date.parse(row.data.reminder_expires_at) : Number.NaN;
          if (!Number.isInteger(index) || index < 1 || index > 5 ||
              !Number.isFinite(validUntil) || Date.now() >= validUntil) {
            await finishRow(admin, row, "skipped", "Marketplace job reminder expired");
            return { sent: 0, failed: 0, skipped: 1, invalid: 0 };
          }
          const { data: eligible, error: eligibleError } = await admin.rpc(
            "marketplace_reminder_recipient_eligible", {
              target_project_id: row.project_id,
              target_job_id: jobId,
              target_driver_user_id: row.user_id,
            },
          );
          if (eligibleError) {
            await releaseForRetry(admin, row, "Could not verify current driver eligibility");
            return { sent: 0, failed: 1, skipped: 0, invalid: 0 };
          }
          if (eligible !== true) {
            await finishRow(admin, row, "skipped", "Marketplace reminder recipient no longer eligible");
            return { sent: 0, failed: 0, skipped: 1, invalid: 0 };
          }
        }
      }
      const targetPlatform = typeof row.data?.target_platform === "string" ? row.data.target_platform : null;
      const requestedAudience = typeof row.data?.target_audience === "string" ? row.data.target_audience : null;
      const targetAudience = requestedAudience === "admin" || requestedAudience === "client"
        ? requestedAudience
        : row.kind === "new_subscription"
          ? "admin"
          : "client";
      let deviceQuery = admin.from("push_device_tokens").select("id,token,platform,job_alert_channel_version")
        .eq("project_id", row.project_id).eq("user_id", row.user_id).eq("enabled", true)
        .eq("app_scope", targetAudience);
      if (targetPlatform) deviceQuery = deviceQuery.eq("platform", targetPlatform);
      const { data: devices, error: devicesError } = await deviceQuery;
      if (devicesError) {
        await releaseForRetry(admin, row, "Could not load device tokens");
        return { sent: 0, failed: 1, skipped: 0, invalid: 0 };
      }
      const typedDevices = (devices ?? []) as DeviceToken[];
      if (!typedDevices.length) {
        const platformText = targetPlatform ? ` ${targetPlatform}` : "";
        await finishRow(admin, row, "skipped", `No enabled ${targetAudience}${platformText} push device tokens`);
        return { sent: 0, failed: 0, skipped: 1, invalid: 0 };
      }

      const results: FcmResult[] = [];
      for (const device of typedDevices) {
        const result = await sendFcm(account, accessToken, row, device);
        results.push(result);
        if (result.invalid) {
          await admin.from("push_device_tokens").update({ enabled: false }).eq("id", device.id);
        }
      }
      const successes = results.filter((result) => result.ok).length;
      const invalid = results.filter((result) => result.invalid).length;
      const errors = results.flatMap((result) => result.error ? [result.error] : []);
      if (successes > 0) {
        await finishRow(admin, row, "sent", errors.length ? `Partial delivery: ${errors.length} token(s) failed` : null);
        return { sent: 1, failed: 0, skipped: 0, invalid };
      }
      const hasTransientFailure = results.some((result) => !result.ok && !result.permanent);
      if (hasTransientFailure && row.attempt_count < MAX_ATTEMPTS) {
        await releaseForRetry(admin, row, errors.slice(0, 3).join(" | ") || "Temporary FCM failure");
      } else {
        await finishRow(admin, row, "failed", errors.slice(0, 3).join(" | ") || "All push deliveries failed");
      }
      return { sent: 0, failed: 1, skipped: 0, invalid };
    };

    while (summary.batches < options.maxBatches && Date.now() - startedAt < options.timeBudgetMs) {
      const { data, error } = await admin.rpc("claim_push_notification_batch", {
        target_project_id: PROJECT_ID,
        batch_limit: options.limit,
        lease_seconds: 300,
        max_attempts: MAX_ATTEMPTS,
        allowed_kinds: ALLOWED_KINDS,
      });
      if (error) return Response.json({ error: "Could not claim outbox", code: error.code, ...summary }, { status: 500 });
      const rows = (data ?? []) as OutboxRow[];
      if (!rows.length) break;
      summary.batches++;
      summary.claimed += rows.length;
      const results = await mapWithConcurrency(rows, options.concurrency, processRow);
      for (const result of results) {
        summary.processed++;
        summary.sent += result.sent;
        summary.failed += result.failed;
        summary.skipped += result.skipped;
        summary.invalid_tokens += result.invalid;
      }
      if (rows.length < options.limit) break;
    }

    const { count } = await admin.from("notification_outbox").select("id", { count: "exact", head: true })
      .eq("project_id", PROJECT_ID).eq("delivery_status", "pending").in("kind", ALLOWED_KINDS);
    summary.remaining_pending = count ?? 0;
    const customer = await processCustomerQueue(admin, async row => {
      const payload = customerPayload(row);
      return sendFcm(account, accessToken, {
        id: row.delivery_id,
        kind: payload.data.kind, notification_date: "", title: payload.title, body: payload.body,
        data: payload.data,
      }, { id: row.subscription_id, token: row.fcm_token, platform: "web" });
    }, startedAt + options.timeBudgetMs, options.concurrency);
    summary.duration_ms = Date.now() - startedAt;
    return Response.json({ ...summary, customer });
  }),
};

async function finishRow(client: any, row: OutboxRow, status: "sent" | "failed" | "skipped", lastError: string | null) {
  const update: Record<string, unknown> = {
    delivery_status: status,
    last_error: lastError?.slice(0, 1000) ?? null,
    claim_id: null,
    claimed_at: null,
    next_attempt_at: null,
  };
  if (status === "sent") update.sent_at = new Date().toISOString();
  await client.from("notification_outbox").update(update).eq("id", row.id).eq("claim_id", row.claim_id).eq("delivery_status", "processing");
}

async function releaseForRetry(client: any, row: OutboxRow, lastError: string) {
  const retryAt = new Date(Date.now() + retryDelaySeconds(row.attempt_count) * 1000).toISOString();
  await client.from("notification_outbox").update({
    delivery_status: "pending",
    last_error: lastError.slice(0, 1000),
    claim_id: null,
    claimed_at: null,
    next_attempt_at: retryAt,
  }).eq("id", row.id).eq("claim_id", row.claim_id).eq("delivery_status", "processing");
}
