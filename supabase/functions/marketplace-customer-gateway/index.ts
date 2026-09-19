import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-forwarded-for" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const rateLimitCategory: Record<string, string> = {
  start_session: "session",
  services: "read",
  create_request: "request",
  publish: "publish",
  get_job: "read",
  cancel: "cancel",
  get_rating: "read",
  create_rating: "rating",
  media: "media",
};

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyCaptcha(token: unknown, provider: string | null) {
  if (typeof token !== "string" || token.trim() === "") throw new Error("CAPTCHA_VERIFICATION_REQUIRED");
  const secret = Deno.env.get("MARKETPLACE_CAPTCHA_SECRET");
  if (!secret || !provider) throw new Error("CAPTCHA_PROVIDER_NOT_CONFIGURED");
  const endpoint = provider === "turnstile" ? "https://challenges.cloudflare.com/turnstile/v0/siteverify" : provider === "hcaptcha" ? "https://hcaptcha.com/siteverify" : null;
  if (!endpoint) throw new Error("CAPTCHA_PROVIDER_UNSUPPORTED");
  const result = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret, response: token }) });
  if (!result.ok || !(await result.json()).success) throw new Error("CAPTCHA_VERIFICATION_FAILED");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const rateSecret = Deno.env.get("MARKETPLACE_RATE_LIMIT_SECRET");
    if (!url || !key || !rateSecret) throw new Error("GATEWAY_CONFIGURATION_MISSING");
    const body = await request.json(); const operation = body?.operation;
    if (typeof operation !== "string") throw new Error("CUSTOMER_GATEWAY_OPERATION_INVALID");
    const category = rateLimitCategory[operation];
    if (!category) throw new Error("CUSTOMER_GATEWAY_OPERATION_INVALID");
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("slug", "tuktuk-control").single();
    if (projectError || !project) throw new Error("MARKETPLACE_PROJECT_NOT_FOUND");
    const { data: settings, error: settingsError } = await supabase.from("marketplace_customer_abuse_settings").select("captcha_required,captcha_provider").eq("project_id", project.id).maybeSingle();
    if (settingsError) throw settingsError;
    if (settings?.captcha_required) await verifyCaptcha(body.captcha_token, settings.captcha_provider);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-network";
    const identity = await hmac(`${category}:${forwarded}`, rateSecret);
    const { error: limitError } = await supabase.rpc("marketplace_customer_gateway_rate_limit", { target_operation: category, target_derived_identity: identity });
    if (limitError) throw limitError;
    const params = body.params ?? {};
    if (operation === "media") {
      const { data: jobs, error } = await supabase.rpc("get_marketplace_customer_job", params); if (error || !jobs?.[0]) throw error || new Error("JOB_NOT_FOUND");
      const job = jobs[0]; if (!job.driver_photo_asset_id && !job.vehicle_main_photo_asset_id) throw new Error("ASSIGNED_MEDIA_NOT_AVAILABLE");
      const ids = [job.driver_photo_asset_id, job.vehicle_main_photo_asset_id].filter(Boolean);
      const { data: assets, error: assetsError } = await supabase.from("media_assets").select("id,storage_bucket,storage_path,status").eq("project_id", project.id).eq("status", "available").in("id", ids);
      if (assetsError) throw assetsError;
      const byId = new Map((assets ?? []).map((asset) => [asset.id, asset]));
      const sign = async (id: string | null) => { const asset = id ? byId.get(id) : null; if (!asset || asset.storage_bucket !== "marketplace-media") return null; const { data, error } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 900); if (error) throw error; return data.signedUrl; };
      return json({ data: { driver_photo_signed_url: await sign(job.driver_photo_asset_id), vehicle_photo_signed_url: await sign(job.vehicle_main_photo_asset_id), expires_at: new Date(Date.now() + 900000).toISOString() } });
    }
    const rpc = ({ start_session: "start_marketplace_customer_session", services: "list_marketplace_customer_services", create_request: "create_marketplace_customer_request", publish: "publish_marketplace_customer_job", get_job: "get_marketplace_customer_job", cancel: "cancel_marketplace_customer_job", get_rating: "get_marketplace_customer_rating", create_rating: "create_marketplace_customer_rating" } as Record<string, string>)[operation];
    if (!rpc) throw new Error("CUSTOMER_GATEWAY_OPERATION_INVALID");
    const { data, error } = await supabase.rpc(rpc, params); if (error) throw error;
    return json({ data });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "CUSTOMER_GATEWAY_FAILED" }, 400); }
});
