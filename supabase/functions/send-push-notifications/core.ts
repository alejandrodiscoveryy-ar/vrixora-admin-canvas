export const DEFAULT_BATCH_LIMIT = 100;
export const MIN_BATCH_LIMIT = 1;
export const MAX_BATCH_LIMIT = 500;
export const DEFAULT_MAX_BATCHES = 10;
export const MAX_BATCHES = 20;
export const DEFAULT_CONCURRENCY = 8;
export const MAX_CONCURRENCY = 20;
export const DEFAULT_TIME_BUDGET_MS = 45_000;
export const MAX_TIME_BUDGET_MS = 50_000;
export const MAX_ATTEMPTS = 5;

export type WorkerOptions = {
  limit: number;
  maxBatches: number;
  concurrency: number;
  timeBudgetMs: number;
};

export type FcmResult = {
  ok: boolean;
  invalid: boolean;
  permanent: boolean;
  error: string | null;
};

export function parseWorkerOptions(value: unknown): WorkerOptions {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    limit: boundedInteger(body.limit, DEFAULT_BATCH_LIMIT, MIN_BATCH_LIMIT, MAX_BATCH_LIMIT, "limit"),
    maxBatches: boundedInteger(body.max_batches, DEFAULT_MAX_BATCHES, 1, MAX_BATCHES, "max_batches"),
    concurrency: boundedInteger(body.concurrency, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY, "concurrency"),
    timeBudgetMs: boundedInteger(body.time_budget_ms, DEFAULT_TIME_BUDGET_MS, 1_000, MAX_TIME_BUDGET_MS, "time_budget_ms"),
  };
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, field: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export async function constantTimeSecretEquals(actual: string, expected: string): Promise<boolean> {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(actualHash);
  const b = new Uint8Array(expectedHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function classifyFcmFailure(status: number, payload: unknown): FcmResult {
  const data = payload as { error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } };
  const code = data?.error?.details?.find((item) => typeof item?.errorCode === "string")?.errorCode ??
    data?.error?.status ?? String(status);
  const invalid = code === "UNREGISTERED";
  const permanentCodes = new Set(["UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH", "THIRD_PARTY_AUTH_ERROR"]);
  const permanent = permanentCodes.has(code) || (status >= 400 && status < 500 && status !== 408 && status !== 429);
  return { ok: false, invalid, permanent, error: `${code}: ${data?.error?.message ?? "FCM send failed"}`.slice(0, 500) };
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await operation(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export function retryDelaySeconds(attemptCount: number): number {
  return Math.min(900, 30 * (2 ** Math.max(0, attemptCount - 1)));
}

export function buildFcmMessage(
  platform: "android" | "ios" | "web",
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Record<string, unknown> {
  const message: Record<string, unknown> = { token, data };
  if (platform === "web") {
    message.webpush = { headers: { Urgency: "high" } };
  } else {
    message.notification = { title, body };
    message.android = { priority: "high", notification: { channel_id: "tuktuk_general" } };
  }
  return message;
}
