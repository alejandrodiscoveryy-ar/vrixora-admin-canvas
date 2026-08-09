export type ReviewTokenRecord = {
  hash: string;
  expiresAt: string;
  revokedAt?: string | null;
};

type ReviewEnvironment = {
  ADMIN_REVIEW_TOKENS?: string;
};

const REVIEW_PATH = /^\/review\/([^/]+)(?:\/[^/]+)?\/?$/;

export const REVIEW_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-content-type-options": "nosniff",
} as const;

export async function authorizeReviewRequest(
  request: Request,
  environment: ReviewEnvironment,
  now = new Date(),
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/review/")) return null;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return reviewResponse("Método no permitido", 405, { allow: "GET, HEAD" });
  }

  const match = url.pathname.match(REVIEW_PATH);
  if (!match) return reviewResponse("Enlace de revisión no válido", 404);

  const records = readTokenRecords(environment.ADMIN_REVIEW_TOKENS);
  const presentedHash = await sha256(match[1]);
  const record = records.find((candidate) => safeEqual(candidate.hash, presentedHash));

  if (!record) return reviewResponse("Enlace de revisión no válido", 404);
  if (record.revokedAt) return reviewResponse("Enlace de revisión revocado", 410);

  const expiresAt = new Date(record.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return reviewResponse("Enlace de revisión expirado", 410);
  }

  return null;
}

export function withReviewHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(REVIEW_HEADERS).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function readTokenRecords(raw: string | undefined): ReviewTokenRecord[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isTokenRecord);
  } catch {
    return [];
  }
}

function isTokenRecord(value: unknown): value is ReviewTokenRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.hash === "string" && typeof record.expiresAt === "string";
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function reviewResponse(message: string, status: number, extraHeaders?: HeadersInit): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...REVIEW_HEADERS, ...extraHeaders },
  });
}
