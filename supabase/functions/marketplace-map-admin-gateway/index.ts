import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

type Capability = "map_visual" | "geocoding" | "routing";
type OperationalPointKind = "driver" | "customer" | "destination";

function normalizeCapability(value: unknown): Capability {
  if (value === "map_visual" || value === "geocoding" || value === "routing") return value;
  throw new Error("MAP_CAPABILITY_INVALID");
}

async function getCredential(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
  providerCode: string,
  kind: "public" | "server",
) {
  const { data, error } = await serviceClient.rpc("get_marketplace_map_provider_secret_service", {
    target_project_id: projectId,
    target_provider_code: providerCode,
    target_secret_kind: kind,
  });
  if (error) throw error;
  if (typeof data === "string" && data.trim()) return data.trim();
  return null;
}

async function recordHealth(
  serviceClient: ReturnType<typeof createClient>,
  args: {
    projectId: string;
    providerCode: string;
    capability: Capability;
    status: "ok" | "warning" | "error";
    httpStatus?: number | null;
    latencyMs?: number | null;
    errorCode?: string | null;
    checkedBy?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const requestedCheckedAt = new Date().toISOString();

  const { data, error } = await serviceClient.rpc(
    "record_marketplace_map_health_check_service",
    {
      target_project_id: args.projectId,
      target_provider_code: args.providerCode,
      target_capability: args.capability,
      target_status: args.status,
      target_http_status: args.httpStatus ?? null,
      target_latency_ms: args.latencyMs ?? null,
      target_error_code: args.errorCode ?? null,
      target_checked_by: args.checkedBy ?? null,
      target_metadata: args.metadata ?? {},
      target_checked_at: requestedCheckedAt,
    },
  );

  if (error) throw error;
  return typeof data === "string" && data ? data : requestedCheckedAt;
}

async function testMapbox(capability: Capability, token: string) {
  let url: string;

  if (capability === "geocoding") {
    const params = new URLSearchParams({
      q: "Habana",
      country: "CU",
      language: "es",
      limit: "1",
      access_token: token,
    });
    url = `https://api.mapbox.com/search/geocode/v6/forward?${params}`;
  } else if (capability === "routing") {
    const params = new URLSearchParams({
      overview: "false",
      access_token: token,
    });
    url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/-82.3666,23.1136;-82.3537,23.1367?${params}`;
  } else {
    url =
      `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/0/0/0?access_token=${encodeURIComponent(token)}`;
  }

  const started = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const latencyMs = Math.round(performance.now() - started);

  return {
    ok: response.ok,
    httpStatus: response.status,
    latencyMs,
  };
}

function parseOperationalPoints(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 100).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const kind = String(row.kind ?? "") as OperationalPointKind;
    const lat = Number(row.lat);
    const lon = Number(row.lon);

    if (!["driver", "customer", "destination"].includes(kind)) {
      throw new Error("MAP_POINT_KIND_INVALID");
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error("MAP_POINT_LATITUDE_INVALID");
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new Error("MAP_POINT_LONGITUDE_INVALID");
    }

    return { kind, lat, lon };
  });
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function resolveOperationalMapCredential(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
) {
  const managedPublic = await getCredential(serviceClient, projectId, "mapbox", "public");
  if (managedPublic) return managedPublic;

  const envPublic = Deno.env.get("MAPBOX_PUBLIC_TOKEN")?.trim() || null;
  if (envPublic) return envPublic;

  const managedServer = await getCredential(serviceClient, projectId, "mapbox", "server");
  if (managedServer) return managedServer;

  return Deno.env.get("MAPBOX_SERVER_TOKEN")?.trim() || null;
}

async function operationalStaticMap(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
  points: ReturnType<typeof parseOperationalPoints>,
) {
  const token = await resolveOperationalMapCredential(serviceClient, projectId);
  if (!token) throw new Error("MAPBOX_CREDENTIAL_MISSING");

  const color = {
    driver: "f97316",
    customer: "22c55e",
    destination: "22d3ee",
  } satisfies Record<OperationalPointKind, string>;

  const overlay = points
    .map(
      (point) =>
        `pin-s+${color[point.kind]}(${point.lon.toFixed(6)},${point.lat.toFixed(6)})`,
    )
    .join(",");

  const camera = overlay ? `${overlay}/auto` : "-82.3666,23.1136,11";
  const params = new URLSearchParams({
    access_token: token,
    padding: overlay ? "60" : "0",
  });

  const url =
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${camera}/1100x660?${params}`;

  const started = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const latencyMs = Math.round(performance.now() - started);

  if (!response.ok) {
    throw new Error(`UPSTREAM_HTTP_${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";

  try {
    await serviceClient.rpc("record_marketplace_map_usage_event", {
      target_project_id: projectId,
      target_provider_code: "mapbox",
      target_capability: "map_visual",
      target_operation: "operational_static_map",
      target_units: 1,
      target_success: true,
      target_fallback_used: false,
      target_latency_ms: latencyMs,
      target_error_code: null,
      target_correlation_id: null,
      target_metadata: {
        source: "marketplace-map-admin-gateway",
        points: points.length,
      },
    });
  } catch {
    // El mapa no falla por un problema secundario de telemetría.
  }

  return `data:${contentType};base64,${toBase64(bytes)}`;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("MAP_ADMIN_CONFIGURATION_MISSING");
    }

    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await request.json();
    const operation = String(body?.operation ?? "");

    if (!["test_provider", "operational_static_map"].includes(operation)) {
      throw new Error("MAP_ADMIN_OPERATION_INVALID");
    }

    const projectId = String(body?.project_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("PROJECT_ID_INVALID");

    if (operation === "operational_static_map") {
      const { error: operationalError } = await userClient.rpc(
        "admin_get_marketplace_operational_map",
        { target_project_id: projectId },
      );

      if (operationalError) throw operationalError;

      const points = parseOperationalPoints(body?.points);
      const dataUrl = await operationalStaticMap(serviceClient, projectId, points);

      const payload = {
        data_url: dataUrl,
        point_count: points.length,
        generated_at: new Date().toISOString(),
      };

      return reply({ ...payload, data: payload });
    }

    const providerCode = String(body?.provider_code ?? "").trim();
    const capability = normalizeCapability(body?.capability);

    if (!/^[a-z][a-z0-9_]*$/.test(providerCode)) {
      throw new Error("MAP_PROVIDER_CODE_INVALID");
    }

    const { data: settings, error: settingsError } = await userClient.rpc(
      "admin_get_marketplace_map_settings",
      { target_project_id: projectId },
    );
    if (settingsError) throw settingsError;
    if (settings?.can_manage !== true) throw new Error("ACCESS_DENIED");

    const provider = Array.isArray(settings?.providers)
      ? settings.providers.find((item: any) => item?.code === providerCode)
      : null;

    if (!provider) throw new Error("MAP_PROVIDER_NOT_FOUND");
    if (provider.integrated !== true) throw new Error("MAP_PROVIDER_NOT_INTEGRATED");
    if (providerCode !== "mapbox") throw new Error("MAP_PROVIDER_ADAPTER_NOT_IMPLEMENTED");

    const { data: authData } = await userClient.auth.getUser();
    const checkedBy = authData?.user?.id ?? null;

    let credential: string | null = null;
    let credentialSource = "none";

    if (capability === "map_visual") {
      credential = await getCredential(serviceClient, projectId, providerCode, "public");
      if (credential) {
        credentialSource = "vault_public";
      } else {
        credential = Deno.env.get("MAPBOX_PUBLIC_TOKEN")?.trim() || null;
        if (credential) credentialSource = "edge_env_public";
      }
    } else {
      credential = await getCredential(serviceClient, projectId, providerCode, "server");
      if (credential) {
        credentialSource = "vault_server";
      } else {
        credential = Deno.env.get("MAPBOX_SERVER_TOKEN")?.trim() || null;
        if (credential) credentialSource = "edge_env_server";
      }
    }

    if (!credential) {
      const connection = Array.isArray(settings?.connections)
        ? settings.connections.find((item: any) => item?.provider_code === providerCode)
        : null;
      const errorCode =
        capability === "map_visual" && connection?.public_credential_mode === "client_build"
          ? "MAP_PUBLIC_CREDENTIAL_CLIENT_BUILD_UNTESTABLE"
          : capability === "map_visual"
          ? "MAP_PUBLIC_CREDENTIAL_NOT_MANAGED"
          : "MAP_SERVER_CREDENTIAL_MISSING";

      const checkedAt = await recordHealth(serviceClient, {
        projectId,
        providerCode,
        capability,
        status: "warning",
        errorCode,
        checkedBy,
        metadata: {
          credential_source: "none",
          configured_mode:
            capability === "map_visual"
              ? connection?.public_credential_mode ?? "none"
              : connection?.server_credential_mode ?? "none",
        },
      });

      const payload = {
        ok: false,
        provider_code: providerCode,
        capability,
        status: "warning",
        error_code: errorCode,
        checked_at: checkedAt,
      };

      return reply({ ...payload, data: payload });
    }

    const result = await testMapbox(capability, credential);
    const status = result.ok ? "ok" : "error";
    const errorCode = result.ok ? null : `UPSTREAM_HTTP_${result.httpStatus}`;

    const checkedAt = await recordHealth(serviceClient, {
      projectId,
      providerCode,
      capability,
      status,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      errorCode,
      checkedBy,
      metadata: { credential_source: credentialSource },
    });

    await serviceClient.rpc("record_marketplace_map_usage_event", {
      target_project_id: projectId,
      target_provider_code: providerCode,
      target_capability: capability,
      target_operation: "health_check_" + capability,
      target_units: 1,
      target_success: result.ok,
      target_fallback_used: false,
      target_latency_ms: result.latencyMs,
      target_error_code: errorCode,
      target_correlation_id: null,
      target_metadata: { source: "marketplace-map-admin-gateway" },
    });

    const payload = {
      ok: result.ok,
      provider_code: providerCode,
      capability,
      status,
      http_status: result.httpStatus,
      latency_ms: result.latencyMs,
      error_code: errorCode,
      checked_at: checkedAt,
    };

    return reply({ ...payload, data: payload }, result.ok ? 200 : 502);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MAP_ADMIN_FAILED";
    const status =
      message === "AUTH_REQUIRED" || message === "ACCESS_DENIED"
        ? 403
        : message.includes("INVALID") ||
            message.includes("NOT_FOUND") ||
            message.includes("NOT_INTEGRATED")
          ? 400
          : 500;
    return reply({ ok: false, error: message }, status);
  }
});