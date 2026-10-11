import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
type Point = { lat: number; lon: number };
const bytes = new TextEncoder();
export function point(value: any): Point {
  const lat = Number(value?.lat), lon = Number(value?.lon);
  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) throw Error("POINT_INVALID");
  return { lat, lon };
}
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, bytes.encode(value)),
    ),
  ].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameSignature(a: string, b: string) {
  if (!/^[0-9a-f]{64}$/.test(a) || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
async function provider(path: string, params: URLSearchParams, token: string) {
  params.set("access_token", token);
  const response = await fetch(`https://api.mapbox.com/${path}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`MAPBOX_UPSTREAM_${response.status}`);
  return response.json();
}
async function directions(origin: Point, destination: Point, token: string) {
  const path =
    `directions/v5/mapbox/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const result = await provider(
    path,
    new URLSearchParams({ geometries: "geojson", overview: "full" }),
    token,
  );
  return parseDirections(result);
}
export function parseDirections(result: any) {
  const route = result.routes?.[0];
  if (!route || !Array.isArray(route.geometry?.coordinates)) {
    throw Error("ROUTE_NOT_FOUND");
  }
  return {
    distance_km: route.distance / 1000,
    duration_seconds: Math.round(route.duration),
    route_points: route.geometry.coordinates.map((coordinate: number[]) => ({
      lat: coordinate[1],
      lon: coordinate[0],
    })),
  };
}
export async function routeToken(
  origin: Point,
  destination: Point,
  route: any,
  secret: string,
) {
  const now = Date.now();
  const payload = {
    version: 1,
    origin,
    destination,
    distance_km: route.distance_km,
    duration_seconds: route.duration_seconds,
    verified_at: now,
    expires_at: now + 900000,
  };
  const value = btoa(JSON.stringify(payload));
  return `${value}.${await sign(value, secret)}`;
}
export async function verifiedRoute(
  token: unknown,
  origin: Point,
  destination: Point,
  secret: string,
) {
  if (typeof token !== "string" || token.length > 4096) {
    throw Error("ROUTE_TOKEN_INVALID");
  }
  const parts = token.split(".");
  if (
    parts.length !== 2 || !sameSignature(parts[1], await sign(parts[0], secret))
  ) throw Error("ROUTE_TOKEN_INVALID");
  let payload: any;
  try {
    payload = JSON.parse(atob(parts[0]));
  } catch {
    throw Error("ROUTE_TOKEN_INVALID");
  }
  const from = point(payload.origin), to = point(payload.destination);
  if (
    payload.version !== 1 || !Number.isSafeInteger(payload.verified_at) ||
    payload.verified_at > Date.now() ||
    !Number.isSafeInteger(payload.expires_at) ||
    payload.expires_at <= Date.now() ||
    payload.expires_at !== payload.verified_at + 900000
  ) throw Error("ROUTE_TOKEN_EXPIRED");
  if (
    from.lat !== origin.lat || from.lon !== origin.lon ||
    to.lat !== destination.lat || to.lon !== destination.lon
  ) throw Error("ROUTE_TOKEN_POINTS_MISMATCH");
  if (
    !Number.isFinite(payload.distance_km) || payload.distance_km <= 0 ||
    payload.distance_km > 5000 || !Number.isFinite(payload.duration_seconds) ||
    payload.duration_seconds <= 0
  ) throw Error("ROUTE_TOKEN_INVALID");
  return payload;
}

async function managedCredential(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
  kind: "public" | "server",
) {
  try {
    const { data, error } = await serviceClient.rpc(
      "get_marketplace_map_provider_secret_service",
      {
        target_project_id: projectId,
        target_provider_code: "mapbox",
        target_secret_kind: kind,
      },
    );
    if (error) return null;
    return typeof data === "string" && data.trim() ? data.trim() : null;
  } catch {
    return null;
  }
}

async function resolveMapboxCredential(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
) {
  const managedServer = await managedCredential(
    serviceClient,
    projectId,
    "server",
  );
  if (managedServer) return managedServer;

  const managedPublic = await managedCredential(
    serviceClient,
    projectId,
    "public",
  );
  if (managedPublic) return managedPublic;

  return Deno.env.get("MAPBOX_SERVER_TOKEN")?.trim() ||
    Deno.env.get("MAPBOX_PUBLIC_TOKEN")?.trim() ||
    null;
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (request.method !== "POST") {
    return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  }
  let requestOperation: string | null = null;
  try {
    const url = Deno.env.get("SUPABASE_URL"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const secret = Deno.env.get("MARKETPLACE_ROUTE_SIGNING_SECRET");
    const rateSecret = Deno.env.get("MARKETPLACE_RATE_LIMIT_SECRET");
    if (!url || !key || !secret || !rateSecret) {
      throw Error("MAP_GATEWAY_CONFIGURATION_MISSING");
    }
    const body = await request.json(), operation = body?.operation;
    requestOperation = typeof operation === "string" ? operation : null;
    if (
      ![
        "geocode",
        "reverse_geocode",
        "route_quote",
        "price_quote",
        "create_request",
        "driver_route",
      ].includes(operation)
    ) throw Error("MAP_OPERATION_INVALID");
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const projectSlug = Deno.env.get("MARKETPLACE_PROJECT_SLUG")?.trim() ||
      "tuktuk-control";
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("id")
      .eq("slug", projectSlug)
      .maybeSingle();
    if (projectError || !project?.id) {
      throw Error("MAP_PROJECT_CONFIGURATION_MISSING");
    }
    const mapbox = await resolveMapboxCredential(db, project.id);
    if (!mapbox) throw Error("MAPBOX_CREDENTIAL_MISSING");
    const category =
      operation === "create_request" || operation === "route_quote" ||
        operation === "driver_route"
        ? "request"
        : "read";
    const identity = await sign(
      `${category}:${
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown-network"
      }`,
      rateSecret,
    );
    const { error: limitError } = await db.rpc(
      "marketplace_customer_gateway_rate_limit",
      { target_operation: category, target_derived_identity: identity },
    );
    if (limitError) throw limitError;
    if (operation === "geocode") {
      const query = String(body.query ?? "").trim();
      if (query.length < 3 || query.length > 160) {
        throw Error("SEARCH_QUERY_INVALID");
      }
      const result = await provider(
        "search/geocode/v6/forward",
        new URLSearchParams({
          q: query,
          language: "es",
          country: "CU",
          limit: "6",
          proximity: "-82.3666,23.1136",
        }),
        mapbox,
      );
      return reply({
        data: (result.features ?? []).map((feature: any) => ({
          label: feature.properties?.full_address || feature.properties?.name ||
            "Ubicación",
          lat: feature.geometry?.coordinates?.[1],
          lon: feature.geometry?.coordinates?.[0],
        })).filter((item: Point) =>
          Number.isFinite(item.lat) && Number.isFinite(item.lon)
        ),
      });
    }
    if (operation === "reverse_geocode") {
      const selected = point(body.point);
      const result = await provider(
        "search/geocode/v6/reverse",
        new URLSearchParams({
          longitude: String(selected.lon),
          latitude: String(selected.lat),
          language: "es",
          limit: "1",
        }),
        mapbox,
      );
      const feature = result.features?.[0];
      const properties = feature?.properties ?? {};
      const label = properties.full_address ||
        [properties.name, properties.place_formatted].filter(Boolean).join(
          ", ",
        ) ||
        properties.name ||
        "Ubicación seleccionada";
      return reply({ data: { ...selected, label } });
    }
    if (operation === "driver_route") {
      const authorization = request.headers.get("authorization")?.trim() ?? "";

      const match = authorization.match(/^Bearer\s+(.+)$/i);

      if (!match) {
        throw Error("AUTHENTICATION_REQUIRED");
      }

      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser(match[1]);

      if (authError || !user) {
        throw Error("AUTHENTICATION_REQUIRED");
      }

      const jobId = String(body.job_id ?? "").trim();
      const stage = String(body.stage ?? "").trim();

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(jobId)
      ) {
        throw Error("JOB_ID_INVALID");
      }

      if (!["pickup", "destination"].includes(stage)) {
        throw Error("DRIVER_ROUTE_STAGE_INVALID");
      }

      const callerApiKey = request.headers.get("apikey")?.trim() ?? "";

      if (!callerApiKey) {
        throw Error("AUTHENTICATION_REQUIRED");
      }

      const userDb = createClient(url, callerApiKey, {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { data: driverJobs, error: driverJobsError } = await userDb.rpc(
        "list_my_marketplace_jobs",
        {
          target_scope: "active",
          target_limit: 100,
        },
      );

      if (driverJobsError || !Array.isArray(driverJobs)) {
        throw Error("DRIVER_JOB_FORBIDDEN");
      }

      const job = driverJobs.find((item: any) =>
        String(item?.job_id ?? "") === jobId
      );

      if (!job) {
        throw Error("DRIVER_JOB_FORBIDDEN");
      }

      if (
        !["accepted", "en_route", "pickup", "in_progress"].includes(
          String(job.status),
        )
      ) {
        throw Error("JOB_NOT_ACTIVE");
      }

      let pickup: Point;
      let routeDestination: Point;

      try {
        pickup = point({
          lat: job.origin_lat,
          lon: job.origin_lon,
        });

        routeDestination = point({
          lat: job.destination_lat,
          lon: job.destination_lon,
        });
      } catch {
        throw Error("JOB_COORDINATES_MISSING");
      }

      let routeOrigin: Point;

      if (stage === "pickup") {
        try {
          routeOrigin = point(body.origin);
        } catch {
          throw Error("DRIVER_LOCATION_INVALID");
        }
      } else {
        routeOrigin = pickup;
      }

      const target = stage === "pickup" ? pickup : routeDestination;

      const route = await directions(
        routeOrigin,
        target,
        mapbox,
      );

      return reply({
        data: route,
      });
    }

    const origin = point(body.origin), destination = point(body.destination);
    if (operation === "route_quote" || operation === "price_quote") {
      const route = operation === "route_quote"
        ? await directions(origin, destination, mapbox)
        : await verifiedRoute(body.route_token, origin, destination, secret);
      const prices: Record<string, unknown> = {};
      const extras = body.pricing ?? {};
      const vehicleCategory = String(extras.vehicle_category_code ?? "").trim();
      const passengerCategories = [
        "motorcycle",
        "bicitaxi",
        "tricycle",
        "light_car",
      ] as const;
      const passengerByCategory: Record<string, unknown> = {};

      for (const categoryCode of passengerCategories) {
        const { data, error } = await db.rpc(
          "preview_marketplace_customer_quote_v3",
          {
            target_service_code: "passenger",
            target_vehicle_category_code: categoryCode,
            target_passenger_count: extras.passenger_count ?? 1,
            target_distance_km: route.distance_km,
            target_stop_count: extras.stop_count ?? 0,
            target_destination_lat: destination.lat,
            target_destination_lon: destination.lon,
            target_scheduled_for: extras.scheduled_for ?? null,
          },
        );
        if (error) throw error;
        passengerByCategory[categoryCode] = data;
      }

      prices.passenger_by_category = passengerByCategory;
      if (passengerCategories.includes(vehicleCategory as any)) {
        prices.passenger = passengerByCategory[vehicleCategory];
      } else {
        prices.passenger = null;
      }

      for (const code of ["courier", "cargo"]) {
        const { data, error } = await db.rpc(
          "preview_marketplace_customer_quote",
          {
            target_service_code: code,
            target_passenger_count: null,
            target_cargo_weight_kg: extras.cargo_weight_kg ?? null,
            target_cargo_volume_m3: extras.cargo_volume_m3 ?? null,
            target_distance_km: route.distance_km,
            target_stop_count: extras.stop_count ?? 0,
            target_load_help: extras.load_help === true,
            target_unload_help: extras.unload_help === true,
            target_urgent: extras.urgent === true,
          },
        );
        if (error) throw error;
        prices[code] = data;
      }
      return reply({
        data: {
          ...route,
          route_points: "route_points" in route ? route.route_points : [],
          route_token: operation === "route_quote"
            ? await routeToken(origin, destination, route, secret)
            : body.route_token,
          prices,
        },
      });
    }
    const verified = await verifiedRoute(
      body.route_token,
      origin,
      destination,
      secret,
    );
    if (!body.params || typeof body.params !== "object") {
      throw Error("REQUEST_PARAMS_INVALID");
    }
    const params: Record<string, any> = {
      ...body.params,
      target_details: {
        ...(body.params.target_details ?? {}),
        estimated_distance_km: verified.distance_km,
        distance_source: "provider",
        route_provider: "mapbox",
        route_mode: "driving",
        route_duration_seconds: verified.duration_seconds,
        route_origin: origin,
        route_destination: destination,
        route_verified_at: new Date(verified.verified_at).toISOString(),
      },
    };
    const serviceCode = String(params.target_service_code ?? "").trim();
    let requestRpc = "create_marketplace_customer_request";
    if (serviceCode === "passenger") {
      const vehicleCategory = String(params.target_vehicle_category_code ?? "")
        .trim();
      if (
        !["motorcycle", "bicitaxi", "tricycle", "light_car"].includes(
          vehicleCategory,
        )
      ) {
        throw Error("PASSENGER_VEHICLE_CATEGORY_REQUIRED");
      }
      requestRpc = "create_marketplace_customer_request_v2";
    } else {
      delete params.target_vehicle_category_code;
    }
    const { data, error } = await db.rpc(requestRpc, params);
    // PostgREST returns error objects, not always Error instances.
    // Preserve the existing V8 recovery envelope for this exact error only.
    // Do not create a job or bypass session authentication.
    if (error?.message === "CUSTOMER_SESSION_NOT_FOUND") {
      return reply({ error: "CUSTOMER_SESSION_NOT_FOUND" }, 200);
    }
    if (error) throw error;
    return reply({ data });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "MAP_GATEWAY_FAILED";

    // TUKTUK Cliente V8: structured domain error for an unknown session.
    // The client rejects the JSON error, starts a NEW verified session,
    // and requires another explicit tap before any job can be created.
    // Keep all other operations and HTTP error statuses unchanged.
    if (requestOperation === "create_request" &&
        message === "CUSTOMER_SESSION_NOT_FOUND") {
      return reply({ error: message }, 200);
    }

    const status = message === "AUTHENTICATION_REQUIRED"
      ? 401
      : message === "DRIVER_JOB_FORBIDDEN"
      ? 403
      : message === "JOB_NOT_ACTIVE"
      ? 409
      : message === "JOB_COORDINATES_MISSING" ||
          message === "DRIVER_LOCATION_INVALID"
      ? 422
      : 400;

    return reply({ error: message }, status);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
