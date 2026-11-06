// Diagnostic artifact only. Not in functions/: never deploy with production.
// Emits keyed fingerprints, never raw addresses, credentials or headers.
import { isIP } from "node:net";

const productionRef = "vvxvnywzgtqhlaqpxyqh";
type ProbeConfig = { projectRef: string; allowedProjectRef: string; token: string };

export function createProbe(config: ProbeConfig) {
  const configured = /^[a-z]{20}$/.test(config.projectRef) &&
    config.projectRef !== productionRef &&
    config.projectRef === config.allowedProjectRef &&
    /^[0-9a-f]{64}$/.test(config.token);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  async function fingerprint(value: string | null): Promise<string | null> {
    if (!value) return null;
    const bytes = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", bytes.encode(config.token),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, bytes.encode(value));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return async (request: Request) => {
    if (!configured) return reply({ error: "PROBE_DISABLED" }, 503);
    const supplied = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${config.token}`;
    let difference = supplied.length ^ expected.length;
    for (let i = 0; i < expected.length; i++) {
      difference |= (supplied.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
    }
    if (difference) return reply({ error: "NOT_FOUND" }, 404);
    if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
    const raw = request.headers.get("cf-connecting-ip")?.trim() ?? "";
    const family = isIP(raw);
    const valid = family !== 0 && !raw.includes("%");
    const canonical = valid ? (family === 6
      ? new URL(`http://[${raw}]/`).hostname.slice(1, -1) : raw) : null;
    const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    return reply({
      cf_valid: valid,
      cf_fingerprint: await fingerprint(canonical),
      xff_first_fingerprint: await fingerprint(xff),
    });
  };
}

if (import.meta.main) {
  const host = new URL(Deno.env.get("SUPABASE_URL") || "https://invalid.invalid").hostname;
  Deno.serve(createProbe({
    projectRef: host.endsWith(".supabase.co") ? host.split(".")[0] : "",
    allowedProjectRef: Deno.env.get("GATEWAY_PROBE_ALLOWED_PROJECT_REF") || "",
    token: Deno.env.get("GATEWAY_PROBE_TOKEN") || "",
  }));
}
