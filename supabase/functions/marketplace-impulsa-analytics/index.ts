import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { gatewayClientIp } from "../_shared/gateway-client-ip.ts";

// Anonymous, privacy-preserving event ingestion. No public database table
// access and no ability to create or modify a ride or wallet operation.
const allowedOrigins = new Set([
  "https://www.vrixora.com",
  "https://vrixora.com",
]);
const eventNames = new Set(["link_open","app_open","origin_selected","destination_selected","quote_ready","request_started","request_created","survey_answer"]);
const channels = new Set(["unknown","direct","whatsapp_private","whatsapp_groups","whatsapp_status","facebook","instagram","qr","other"]);
const reasons = new Set(["price","comparing","no_driver","difficult","later","other"]);
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[0-9a-f]{32}$/;
const headersFor = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
});
const reply = (status: number, origin: string, body: unknown = null) =>
  new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { ...headersFor(origin), ...(body == null ? {} : {"Content-Type":"application/json"}) }
  });

async function derivedIdentity(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("impulsa-analytics-v1:"+ip)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (!allowedOrigins.has(origin)) return new Response(null,{status:403});
  if (req.method === "OPTIONS") return reply(204, origin);
  if (req.method !== "POST") return reply(405, origin);
  try {
    const raw = await req.text();
    if (raw.length > 1400 || raw.length < 2) return reply(413,origin);
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object" || Array.isArray(b)) return reply(400,origin);
    const event = String(b.event ?? "");
    const sessionId = String(b.session_id ?? "");
    const code = b.promo_code === null || b.promo_code === undefined || b.promo_code === ""
      ? null : String(b.promo_code);
    const channel = String(b.channel ?? "unknown");
    const reason = b.reason === null || b.reason === undefined ? null : String(b.reason);
    const price = b.price_cup === null || b.price_cup === undefined ? null : Number(b.price_cup);
    if (!eventNames.has(event) || !sessionPattern.test(sessionId) ||
      (code !== null && !codePattern.test(code)) || !channels.has(channel) ||
      (reason !== null && !reasons.has(reason)) ||
      (event === "survey_answer" && reason === null) ||
      (reason !== null && event !== "survey_answer") ||
      (price !== null && (event !== "quote_ready" || !Number.isFinite(price) || price < 0 || price > 1000000))
    ) return reply(400,origin);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const limitSecret = Deno.env.get("MARKETPLACE_RATE_LIMIT_SECRET");
    if (!url || !serviceKey || !limitSecret) return reply(503,origin);
    const client = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    // Separate HMAC namespace from actual passenger gateway limits. Never
    // write the source IP, user agent, contact details, or addresses.
    const ip = gatewayClientIp(req.headers);
    const derived = await derivedIdentity(ip, limitSecret);
    const limit = await client.rpc("marketplace_customer_gateway_rate_limit",{
      target_operation:"read",target_derived_identity:derived
    });
    if (limit.error) return reply(429,origin);
    const outcome = await client.rpc("record_public_marketplace_impulsa_event_v1",{
      target_event:event,target_session_id:sessionId,target_promo_code:code,
      target_channel:channel,target_reason:reason,target_price_cup:price,
    });
    if (outcome.error) {
      console.error("impulsa-analytics ingest unavailable",outcome.error.code ?? "UNKNOWN");
      return reply(503,origin);
    }
    return reply(204,origin);
  } catch (_) {
    // Tracking failures are intentionally invisible to the booking UI.
    return reply(400,origin);
  }
});
