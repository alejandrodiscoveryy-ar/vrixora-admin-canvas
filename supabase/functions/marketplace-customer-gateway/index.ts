import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { gatewayClientIp } from "../_shared/gateway-client-ip.ts";
import { gatewayJson } from "../_shared/gateway-json.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const rateLimitCategory: Record<string, string> = {
  start_session: "session",
  services: "read",
  promo_profile: "read",
  working_fleet: "read",
  fleet_presence_v2: "read",
  create_request: "request",
  publish: "publish",
  get_job: "read",
  history: "read",
  cancel: "cancel",
  finish: "cancel",
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
    const clientIp = gatewayClientIp(request.headers);
    const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const rateSecret = Deno.env.get("MARKETPLACE_RATE_LIMIT_SECRET");
    if (!url || !key || !rateSecret) throw new Error("GATEWAY_CONFIGURATION_MISSING");
    const body = await gatewayJson(request); const operation = body?.operation;
    if (typeof operation !== "string") throw new Error("CUSTOMER_GATEWAY_OPERATION_INVALID");
    const category = rateLimitCategory[operation];
    if (!category) throw new Error("CUSTOMER_GATEWAY_OPERATION_INVALID");
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("slug", "tuktuk-control").single();
    if (projectError || !project) throw new Error("MARKETPLACE_PROJECT_NOT_FOUND");
    const { data: settings, error: settingsError } = await supabase.from("marketplace_customer_abuse_settings").select("captcha_required,captcha_provider").eq("project_id", project.id).maybeSingle();
    if (settingsError) throw settingsError;
    if (settings?.captcha_required) await verifyCaptcha(body.captcha_token, settings.captcha_provider);
    // Separate polling from booking/search budgets; still use trusted IP limits.
    const identity = await hmac(`${(operation === "working_fleet" || operation === "fleet_presence_v2") ? "fleet-read" : category}:${clientIp}`, rateSecret);
    const { error: limitError } = await supabase.rpc("marketplace_customer_gateway_rate_limit", { target_operation: category, target_derived_identity: identity });
    if (limitError) throw limitError;
    const params = { ...(body.params ?? {}) };
    if (operation === "promo_profile") {
      // Public promotional profile: opaque link only, rate limited above.
      const code = params.target_code;
      if (typeof code !== "string" || !/^[0-9a-f]{32}$/.test(code)) return json({ data: null });
      const { data: profile, error } = await supabase.rpc("resolve_marketplace_promo_profile_v1", { target_code: code });
      if (error) throw error;
      if (!profile) return json({ data: null });
      let photoUrl: string | null = null;
      if (profile.photo_asset_id) {
        const { data: asset, error: assetError } = await supabase.from("media_assets")
          .select("storage_bucket,storage_path")
          .eq("project_id", project.id).eq("id", profile.photo_asset_id)
          .eq("asset_kind", "driver_photo").eq("status", "available").maybeSingle();
        if (!assetError && asset?.storage_bucket === "marketplace-media") {
          const { data: signed } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 120);
          photoUrl = signed?.signedUrl ?? null;
        }
      }
      return new Response(JSON.stringify({ data: {
        public_name: profile.public_name,
        category_code: profile.category_code,
        service_codes: profile.service_codes,
        photo_url: photoUrl,
      } }), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (operation === "working_fleet" || operation === "fleet_presence_v2") {
      const v2 = operation === "fleet_presence_v2";
      // Require an existing customer session; never expose the private GPS table.
      if (typeof params.target_session_id !== "string" ||
          typeof params.target_session_token !== "string") {
        throw new Error("CUSTOMER_SESSION_REQUIRED");
      }
      // This role deliberately has no SELECT privilege on private driver tables.
      // The narrowly scoped RPC verifies the customer session inside Postgres
      // and returns only anonymized, approximate coordinates.
      const { data, error } = await supabase.rpc(v2 ? "get_marketplace_customer_fleet_presence_v2" : "get_marketplace_customer_working_fleet", {
        target_session_id: params.target_session_id,
        target_session_token: params.target_session_token,
      });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("FLEET_RESPONSE_INVALID");
      // A ~330 m grid in Cuba: approximate positions, no IDs, timestamps,
      // assignment status or other personal fields in the response.
      // Sort by coordinates, not driver identity; identical cells may overlap.
      const points = data.flatMap((row) => {
        if (row.latitude == null || row.longitude == null) return [];
        const lat = Number(row.latitude);
        const lon = Number(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
            lat < 18 || lat > 24.5 || lon < -85.5 || lon > -73) return [];
        const live = v2 && row.available_now === true;
        const grid = v2 && !live ? 0.01 : 0.003;
        const point = {
          latitude: Number((Math.round(lat / grid) * grid).toFixed(3)),
          longitude: Number((Math.round(lon / grid) * grid).toFixed(3)),
        };
        return [v2 ? { ...point, available_now: live } : point];
      }).sort((a, b) => a.latitude - b.latitude || a.longitude - b.longitude);
      return new Response(JSON.stringify({ data: points }), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    // Older clients can still request transport, but their browser-supplied
    // distance cannot influence the commercial quote.
    if (operation === "create_request") {
      const details = params.target_details;
      if (details != null && (typeof details !== "object" || Array.isArray(details))) throw new Error("REQUEST_DETAILS_INVALID");
      const serviceCode = String(params.target_service_code ?? "").trim();
      if (serviceCode === "passenger") {
        const vehicleCategory = String(params.target_vehicle_category_code ?? "").trim();
        if (!["motorcycle", "bicitaxi", "tricycle", "light_car"].includes(vehicleCategory)) {
          throw new Error("PASSENGER_VEHICLE_CATEGORY_REQUIRED");
        }
        throw new Error("PASSENGER_ROUTE_VERIFICATION_REQUIRED");
      }
      params.target_details = { ...(details ?? {}), distance_source: "unavailable" };
      delete params.target_details.estimated_distance_km;
      delete params.target_vehicle_category_code;
    }
    if (operation === "get_job") {
      // La RPC valida session_id/token y propiedad de ESTA carrera antes de acceder al GPS.
      const { data: jobs, error: jobError } = await supabase.rpc("get_marketplace_customer_job", params);
      if (jobError) throw jobError;
      if (!Array.isArray(jobs) || jobs.length === 0) return json({ data: jobs ?? [] });
      const job = jobs[0] as Record<string, unknown>;
      const safeJob: Record<string, unknown> = { ...job };
      const gpsAllowed = ["accepted", "en_route", "pickup", "in_progress"].includes(String(job.status));
      if (gpsAllowed && typeof params.target_job_id === "string") {
        // The table is intentionally inaccessible even to service_role.
        // This narrow RPC revalidates the customer session and job ownership.
        try {
          const { data: tracking, error: trackingError } = await supabase.rpc(
            "get_marketplace_customer_tracking_snapshot", {
              target_session_id: params.target_session_id,
              target_session_token: params.target_session_token,
              target_job_id: params.target_job_id,
            });
          if (!trackingError && tracking?.status === job.status && tracking.driver_location) {
            safeJob.driver_location = tracking.driver_location;
          }
        } catch (_) {
          // Optional GPS must never prevent reading or managing the ride.
        }
      }
      return new Response(JSON.stringify({ data: [safeJob, ...jobs.slice(1)] }), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
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
    const rpc = ({ start_session: "start_marketplace_customer_session", services: "list_marketplace_customer_services", create_request: "create_marketplace_customer_request", publish: "publish_marketplace_customer_job_v2", get_job: "get_marketplace_customer_job", history: "list_marketplace_customer_history", cancel: "cancel_marketplace_customer_job", finish: "finish_marketplace_customer_job", get_rating: "get_marketplace_customer_rating", create_rating: "create_marketplace_customer_rating" } as Record<string, string>)[operation];
    if (!rpc) throw new Error("CUSTOMER_GATEWAY_OPERATION_INVALID");
    const { data, error } = await supabase.rpc(rpc, params); if (error) throw error;
    return json({ data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "CUSTOMER_GATEWAY_FAILED";
    const status = message === "GATEWAY_CLIENT_IP_UNAVAILABLE" ? 503
      : message === "GATEWAY_REQUEST_TOO_LARGE" ? 413 : 400;
    return json({ error: message }, status);
  }
});
