import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
type Point = { lat: number; lon: number };
const bytes = new TextEncoder();
export function point(value: any): Point {
  const lat = Number(value?.lat), lon = Number(value?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Error("POINT_INVALID");
  return { lat, lon };
}
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes.encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
function sameSignature(a: string, b: string) {
  if (!/^[0-9a-f]{64}$/.test(a) || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function provider(path: string, params: URLSearchParams, token: string) {
  params.set("access_token", token);
  const response = await fetch(`https://api.mapbox.com/${path}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error("MAPBOX_UNAVAILABLE");
  return response.json();
}
async function directions(origin: Point, destination: Point, token: string) {
  const path = `directions/v5/mapbox/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const result = await provider(path, new URLSearchParams({ geometries: "geojson", overview: "full" }), token);
  return parseDirections(result);
}
export function parseDirections(result: any) {
  const route = result.routes?.[0];
  if (!route || !Array.isArray(route.geometry?.coordinates)) throw Error("ROUTE_NOT_FOUND");
  return {
    distance_km: route.distance / 1000,
    duration_seconds: Math.round(route.duration),
    route_points: route.geometry.coordinates.map((coordinate: number[]) => ({ lat: coordinate[1], lon: coordinate[0] })),
  };
}
export async function routeToken(origin: Point, destination: Point, route: any, secret: string) {
  const now = Date.now();
  const payload = { version: 1, origin, destination, distance_km: route.distance_km,
    duration_seconds: route.duration_seconds, verified_at: now, expires_at: now + 900000 };
  const value = btoa(JSON.stringify(payload));
  return `${value}.${await sign(value, secret)}`;
}
export async function verifiedRoute(token: unknown, origin: Point, destination: Point, secret: string) {
  if (typeof token !== "string" || token.length > 4096) throw Error("ROUTE_TOKEN_INVALID");
  const parts = token.split(".");
  if (parts.length !== 2 || !sameSignature(parts[1], await sign(parts[0], secret))) throw Error("ROUTE_TOKEN_INVALID");
  let payload: any;
  try { payload = JSON.parse(atob(parts[0])); } catch { throw Error("ROUTE_TOKEN_INVALID"); }
  const from = point(payload.origin), to = point(payload.destination);
  if (payload.version !== 1 || !Number.isSafeInteger(payload.verified_at) || payload.verified_at > Date.now() ||
      !Number.isSafeInteger(payload.expires_at) || payload.expires_at <= Date.now() ||
      payload.expires_at !== payload.verified_at + 900000) throw Error("ROUTE_TOKEN_EXPIRED");
  if (from.lat !== origin.lat || from.lon !== origin.lon || to.lat !== destination.lat || to.lon !== destination.lon) throw Error("ROUTE_TOKEN_POINTS_MISMATCH");
  if (!Number.isFinite(payload.distance_km) || payload.distance_km <= 0 || payload.distance_km > 5000 || !Number.isFinite(payload.duration_seconds) || payload.duration_seconds <= 0) throw Error("ROUTE_TOKEN_INVALID");
  return payload;
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const mapbox = Deno.env.get("MAPBOX_SERVER_TOKEN"), secret = Deno.env.get("MARKETPLACE_ROUTE_SIGNING_SECRET");
    const rateSecret = Deno.env.get("MARKETPLACE_RATE_LIMIT_SECRET");
    if (!url || !key || !mapbox || !secret || !rateSecret) throw Error("MAP_GATEWAY_CONFIGURATION_MISSING");
    const body = await request.json(), operation = body?.operation;
    if (!["geocode", "reverse_geocode", "route_quote", "price_quote", "create_request"].includes(operation)) throw Error("MAP_OPERATION_INVALID");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const category = operation === "create_request" || operation === "route_quote" ? "request" : "read";
    const identity = await sign(`${category}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-network"}`, rateSecret);
    const { error: limitError } = await db.rpc("marketplace_customer_gateway_rate_limit", { target_operation: category, target_derived_identity: identity });
    if (limitError) throw limitError;
    if (operation === "geocode") {
      const query = String(body.query ?? "").trim();
      if (query.length < 3 || query.length > 160) throw Error("SEARCH_QUERY_INVALID");
      const result = await provider("search/geocode/v6/forward", new URLSearchParams({ q: query, language: "es", country: "CU", limit: "6", proximity: "-82.3666,23.1136" }), mapbox);
      return reply({ data: (result.features ?? []).map((feature: any) => ({ label: feature.properties?.full_address || feature.properties?.name || "Ubicación", lat: feature.geometry?.coordinates?.[1], lon: feature.geometry?.coordinates?.[0] })).filter((item: Point) => Number.isFinite(item.lat) && Number.isFinite(item.lon)) });
    }
    if (operation === "reverse_geocode") {
      const selected = point(body.point);
      const result = await provider("search/geocode/v6/reverse", new URLSearchParams({ longitude: String(selected.lon), latitude: String(selected.lat), language: "es", limit: "1" }), mapbox);
      return reply({ data: { ...selected, label: result.features?.[0]?.properties?.full_address || "Ubicación seleccionada" } });
    }
    const origin = point(body.origin), destination = point(body.destination);
    if (operation === "route_quote" || operation === "price_quote") {
      const route = operation === "route_quote"
        ? await directions(origin, destination, mapbox)
        : await verifiedRoute(body.route_token, origin, destination, secret);
      const prices: Record<string, unknown> = {};
      const extras = body.pricing ?? {};
      for (const code of ["passenger", "courier", "cargo"]) {
        const { data, error } = await db.rpc("preview_marketplace_customer_quote", {
          target_service_code: code, target_passenger_count: code === "passenger" ? (extras.passenger_count ?? 1) : null,
          target_cargo_weight_kg: extras.cargo_weight_kg ?? null, target_cargo_volume_m3: extras.cargo_volume_m3 ?? null,
          target_distance_km: route.distance_km, target_stop_count: extras.stop_count ?? 0,
          target_load_help: extras.load_help === true, target_unload_help: extras.unload_help === true,
          target_urgent: extras.urgent === true,
        });
        if (error) throw error;
        prices[code] = data;
      }
      return reply({ data: {
        ...route,
        route_points: "route_points" in route ? route.route_points : [],
        route_token: operation === "route_quote" ? await routeToken(origin, destination, route, secret) : body.route_token,
        prices,
      } });
    }
    const verified = await verifiedRoute(body.route_token, origin, destination, secret);
    if (!body.params || typeof body.params !== "object") throw Error("REQUEST_PARAMS_INVALID");
    const params = { ...body.params, target_details: { ...(body.params.target_details ?? {}),
      estimated_distance_km: verified.distance_km, distance_source: "provider", route_provider: "mapbox",
      route_mode: "driving", route_duration_seconds: verified.duration_seconds,
      route_origin: origin, route_destination: destination, route_verified_at: new Date(verified.verified_at).toISOString(),
    } };
    const { data, error } = await db.rpc("create_marketplace_customer_request", params);
    if (error) throw error;
    return reply({ data });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "MAP_GATEWAY_FAILED" }, 400); }
}

if (import.meta.main) Deno.serve(handleRequest);
