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
type OperationalPoint = {
  kind: OperationalPointKind;
  lat: number;
  lon: number;
};

type OperationalRouteSegment = "pickup" | "trip";

type OperationalRouteCandidate = {
  jobId: string;
  segment: OperationalRouteSegment;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
};

type OperationalRouteRender = {
  jobId: string;
  segment: OperationalRouteSegment;
  polyline: string;
  distanceKm: number | null;
  durationSeconds: number | null;
};

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

  const { data, error } = await serviceClient.rpc("record_marketplace_map_health_check_service", {
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
  });

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
    url = `https://api.mapbox.com/directions/v5/mapbox/driving/-82.3666,23.1136;-82.3537,23.1367?${params}`;
  } else {
    url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/0/0/0?access_token=${encodeURIComponent(token)}`;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function validCoordinate(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function operationalPointsFromData(value: unknown): OperationalPoint[] {
  const root = asRecord(value);
  const points: OperationalPoint[] = [];

  const drivers = Array.isArray(root.drivers) ? root.drivers : [];
  for (const item of drivers) {
    const row = asRecord(item);
    if (row.location_fresh !== true) continue;

    const lat = validCoordinate(row.latitude, -90, 90);
    const lon = validCoordinate(row.longitude, -180, 180);
    if (lat == null || lon == null) continue;

    points.push({ kind: "driver", lat, lon });
  }

  const jobs = Array.isArray(root.jobs) ? root.jobs : [];
  for (const item of jobs) {
    const row = asRecord(item);

    const originLat = validCoordinate(row.origin_lat, -90, 90);
    const originLon = validCoordinate(row.origin_lon, -180, 180);
    if (originLat != null && originLon != null) {
      points.push({ kind: "customer", lat: originLat, lon: originLon });
    }

    const destinationLat = validCoordinate(row.destination_lat, -90, 90);
    const destinationLon = validCoordinate(row.destination_lon, -180, 180);
    if (destinationLat != null && destinationLon != null) {
      points.push({
        kind: "destination",
        lat: destinationLat,
        lon: destinationLon,
      });
    }
  }

  return points.slice(0, 50);
}

function operationalRoutesFromData(
  value: unknown,
  routeJobId: string | null = null,
): OperationalRouteCandidate[] {
  const root = asRecord(value);
  const jobs = Array.isArray(root.jobs) ? root.jobs : [];
  const drivers = Array.isArray(root.drivers) ? root.drivers : [];
  const routes: OperationalRouteCandidate[] = [];
  const pickupStatuses = new Set(["accepted", "en_route", "pickup"]);

  for (const item of jobs) {
    const row = asRecord(item);
    const jobId = String(row.job_id ?? "");
    const status = String(row.status ?? "");
    const assignedDriverUserId = String(row.driver_user_id ?? "");
    const assignedVehicleId = String(row.vehicle_id ?? "");

    if (routeJobId && jobId !== routeJobId) continue;

    const originLat = validCoordinate(row.origin_lat, -90, 90);
    const originLon = validCoordinate(row.origin_lon, -180, 180);
    const destinationLat = validCoordinate(row.destination_lat, -90, 90);
    const destinationLon = validCoordinate(row.destination_lon, -180, 180);

    if (originLat == null || originLon == null) continue;

    if (
      pickupStatuses.has(status) &&
      assignedDriverUserId
    ) {
      const assignedDriver = drivers
        .map(asRecord)
        .find((driver) => {
          if (String(driver.driver_user_id ?? "") !== assignedDriverUserId) {
            return false;
          }

          if (
            assignedVehicleId &&
            String(driver.vehicle_id ?? "") !== assignedVehicleId
          ) {
            return false;
          }

          return true;
        });

      if (assignedDriver) {
        const locationFresh = assignedDriver.location_fresh === true;

        const driverLat = validCoordinate(
          locationFresh
            ? assignedDriver.latitude
            : assignedDriver.last_latitude,
          -90,
          90,
        );

        const driverLon = validCoordinate(
          locationFresh
            ? assignedDriver.longitude
            : assignedDriver.last_longitude,
          -180,
          180,
        );

        if (driverLat != null && driverLon != null) {
          routes.push({
            jobId,
            segment: "pickup",
            origin: { lat: driverLat, lon: driverLon },
            destination: { lat: originLat, lon: originLon },
          });
        }
      }
    }

    if (destinationLat != null && destinationLon != null) {
      routes.push({
        jobId,
        segment: "trip",
        origin: { lat: originLat, lon: originLon },
        destination: {
          lat: destinationLat,
          lon: destinationLon,
        },
      });
    }
  }

  return routes.slice(0, routeJobId ? 2 : 16);
}

async function operationalRoutePolyline(
  route: OperationalRouteCandidate,
  token: string,
): Promise<OperationalRouteRender | null> {
  const params = new URLSearchParams({
    geometries: "polyline",
    overview: "full",
    alternatives: "false",
    steps: "false",
    access_token: token,
  });

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${route.origin.lon},${route.origin.lat};${route.destination.lon},${route.destination.lat}?${params}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);

  const data = await response.json();
  const firstRoute = data?.routes?.[0];
  const geometry = firstRoute?.geometry;

  if (typeof geometry !== "string" || !geometry.trim()) return null;

  const distanceMeters = Number(firstRoute?.distance);
  const durationSeconds = Number(firstRoute?.duration);

  return {
    jobId: route.jobId,
    segment: route.segment,
    polyline: geometry.trim(),
    distanceKm: Number.isFinite(distanceMeters) ? distanceMeters / 1000 : null,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : null,
  };
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

async function resolveOperationalPublicCredential(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
) {
  const managedPublic = await getCredential(serviceClient, projectId, "mapbox", "public");
  if (managedPublic) return managedPublic;

  const envPublic = Deno.env.get("MAPBOX_PUBLIC_TOKEN")?.trim() || null;
  if (envPublic) return envPublic;

  return null;
}

async function resolveOperationalRoutingCredential(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
) {
  const managedServer = await getCredential(serviceClient, projectId, "mapbox", "server");
  if (managedServer) return managedServer;

  const envServer = Deno.env.get("MAPBOX_SERVER_TOKEN")?.trim() || null;
  if (envServer) return envServer;

  const managedPublic = await getCredential(serviceClient, projectId, "mapbox", "public");
  if (managedPublic) return managedPublic;

  return Deno.env.get("MAPBOX_PUBLIC_TOKEN")?.trim() || null;
}

async function operationalStaticMap(
  serviceClient: ReturnType<typeof createClient>,
  projectId: string,
  points: OperationalPoint[],
  routes: OperationalRouteCandidate[],
  showRoutes: boolean,
  mapStyle: string,
) {
  const token = await resolveOperationalMapCredential(serviceClient, projectId);
  if (!token) throw new Error("MAPBOX_CREDENTIAL_MISSING");

  const color = {
    driver: "f97316",
    customer: "22c55e",
    destination: "22d3ee",
  } satisfies Record<OperationalPointKind, string>;

  const pointOverlays = points.map(
    (point) => `pin-s+${color[point.kind]}(${point.lon.toFixed(6)},${point.lat.toFixed(6)})`,
  );

  const routeOverlays: string[] = [];
  const renderedRoutes: OperationalRouteRender[] = [];

  if (showRoutes && routes.length) {
    const routingToken = await resolveOperationalRoutingCredential(serviceClient, projectId);

    if (routingToken) {
      const results = await Promise.all(
        routes.map(async (route) => {
          try {
            return await operationalRoutePolyline(route, routingToken);
          } catch {
            return null;
          }
        }),
      );

      for (const result of results) {
        if (!result) continue;

        const routeColor =
          result.segment === "pickup" ? "f97316" : "22d3ee";
        const routeOverlay =
          `path-4+${routeColor}-0.85(${encodeURIComponent(result.polyline)})`;
        const candidate = [...routeOverlays, routeOverlay, ...pointOverlays].join(",");

        if (candidate.length > 6500) break;

        routeOverlays.push(routeOverlay);
        renderedRoutes.push(result);
      }
    }
  }

  const overlay = [...routeOverlays, ...pointOverlays].join(",");
  const camera = overlay ? `${overlay}/auto` : "-82.3666,23.1136,11";
  const params = new URLSearchParams({ access_token: token });
  if (overlay) {
    params.set("padding", "60");
  }

  const url = `https://api.mapbox.com/styles/v1/${mapStyle}/static/${camera}/1100x660?${params}`;

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
        routes: routeOverlays.length,
        show_routes: showRoutes,
        map_style: mapStyle,
      },
    });

    if (routeOverlays.length) {
      await serviceClient.rpc("record_marketplace_map_usage_event", {
        target_project_id: projectId,
        target_provider_code: "mapbox",
        target_capability: "routing",
        target_operation: "operational_route_overlay",
        target_units: routeOverlays.length,
        target_success: true,
        target_fallback_used: false,
        target_latency_ms: null,
        target_error_code: null,
        target_correlation_id: null,
        target_metadata: {
          source: "marketplace-map-admin-gateway",
          routes: routeOverlays.length,
        },
      });
    }
  } catch {
    // El mapa no falla por un problema secundario de telemetria.
  }

  return {
    dataUrl: `data:${contentType};base64,${toBase64(bytes)}`,
    routeCount: routeOverlays.length,
    renderedRoutes,
  };
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

    if (
      ![
        "test_provider",
        "operational_static_map",
        "operational_map_config",
        "operational_route_geometry",
        "operational_driver_avatars",
      ].includes(operation)
    ) {
      throw new Error("MAP_ADMIN_OPERATION_INVALID");
    }

    const projectId = String(body?.project_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("PROJECT_ID_INVALID");

    if (operation === "operational_driver_avatars") {
      const { data: operationalData, error: operationalError } = await userClient.rpc(
        "admin_get_marketplace_operational_map",
        { target_project_id: projectId },
      );
      if (operationalError) throw operationalError;

      const operationalRoot = asRecord(operationalData);
      const operationalDrivers = Array.isArray(operationalRoot.drivers)
        ? operationalRoot.drivers
        : [];
      const driverIds = Array.from(
        new Set(
          operationalDrivers
            .map((item) => String(asRecord(item).driver_user_id ?? ""))
            .filter((value) => /^[0-9a-f-]{36}$/i.test(value)),
        ),
      );

      if (!driverIds.length) {
        const payload = {
          drivers: [],
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        };
        return reply({ ...payload, data: payload });
      }

      const driverDetails = await Promise.all(
        driverIds.map(async (driverUserId) => {
          const { data, error } = await userClient.rpc("admin_get_marketplace_driver_360", {
            target_project_id: projectId,
            target_driver_user_id: driverUserId,
          });
          if (error) throw error;

          const root = asRecord(data);
          return {
            driverUserId,
            account: asRecord(root.account),
            driver: asRecord(root.driver),
          };
        }),
      );

      const photoAssetIds = Array.from(
        new Set(
          driverDetails
            .map((item) => String(item.driver.photo_asset_id ?? ""))
            .filter((value) => /^[0-9a-f-]{36}$/i.test(value)),
        ),
      );

      let mediaAssets: any[] = [];
      if (photoAssetIds.length) {
        const { data, error } = await serviceClient
          .from("media_assets")
          .select("id,storage_bucket,storage_path,status")
          .eq("project_id", projectId)
          .eq("status", "available")
          .in("id", photoAssetIds);
        if (error) throw error;
        mediaAssets = data ?? [];
      }

      const detailByUserId = new Map(
        driverDetails.map((item) => [item.driverUserId, item]),
      );
      const assetById = new Map(mediaAssets.map((row: any) => [String(row.id), row]));

      const drivers = await Promise.all(
        driverIds.map(async (driverUserId) => {
          const detail = detailByUserId.get(driverUserId);
          const photoAssetId = String(detail?.driver.photo_asset_id ?? "");
          const asset = assetById.get(photoAssetId) as any;

          let uploadedPhotoUrl: string | null = null;
          if (
            asset?.storage_bucket === "marketplace-media" &&
            typeof asset?.storage_path === "string" &&
            asset.storage_path
          ) {
            const { data: signed, error: signedError } = await serviceClient.storage
              .from(asset.storage_bucket)
              .createSignedUrl(asset.storage_path, 900);
            if (!signedError && signed?.signedUrl) {
              uploadedPhotoUrl = signed.signedUrl;
            }
          }

          const googleAvatar =
            typeof detail?.account.avatar_url === "string" && detail.account.avatar_url.trim()
              ? detail.account.avatar_url.trim()
              : null;

          return {
            driver_user_id: driverUserId,
            avatar_url: uploadedPhotoUrl ?? googleAvatar,
            avatar_source: uploadedPhotoUrl ? "driver_photo" : googleAvatar ? "google" : null,
          };
        }),
      );
      const payload = {
        drivers,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
      return reply({ ...payload, data: payload });
    }

    if (operation === "operational_map_config") {
      const { error: operationalError } = await userClient.rpc(
        "admin_get_marketplace_operational_map",
        { target_project_id: projectId },
      );
      if (operationalError) throw operationalError;

      const { data: mapSettings, error: mapSettingsError } = await userClient.rpc(
        "admin_get_marketplace_map_settings",
        { target_project_id: projectId },
      );
      if (mapSettingsError) throw mapSettingsError;

      const mapVisualSetting = Array.isArray(mapSettings?.settings)
        ? mapSettings.settings.find((item: any) => item?.capability === "map_visual")
        : null;

      const configuredStyle = String(mapVisualSetting?.config?.style ?? "")
        .trim()
        .replace(/^mapbox:\/\/styles\//, "");

      const mapStyle = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(configuredStyle)
        ? configuredStyle
        : "mapbox/dark-v11";

      const publicToken = await resolveOperationalPublicCredential(serviceClient, projectId);
      if (!publicToken) throw new Error("MAP_PUBLIC_CREDENTIAL_MISSING");
      if (!publicToken.startsWith("pk.")) {
        throw new Error("MAP_PUBLIC_CREDENTIAL_UNSAFE");
      }

      const payload = {
        access_token: publicToken,
        map_style: mapStyle,
        generated_at: new Date().toISOString(),
      };

      return reply({ ...payload, data: payload });
    }

    if (operation === "operational_route_geometry") {
      const { data: operationalData, error: operationalError } = await userClient.rpc(
        "admin_get_marketplace_operational_map",
        { target_project_id: projectId },
      );
      if (operationalError) throw operationalError;

      const routeJobId = String(body?.route_job_id ?? "").trim();
      if (routeJobId && !/^[0-9a-f-]{36}$/i.test(routeJobId)) {
        throw new Error("ROUTE_JOB_ID_INVALID");
      }

      const routeCandidates = operationalRoutesFromData(operationalData, routeJobId || null);
      if (routeJobId && routeCandidates.length === 0) {
        throw new Error("ROUTE_JOB_NOT_FOUND");
      }

      const routingToken = await resolveOperationalRoutingCredential(serviceClient, projectId);
      if (!routingToken) throw new Error("MAPBOX_ROUTING_CREDENTIAL_MISSING");

      const results = await Promise.all(
        routeCandidates.map(async (route) => {
          try {
            return await operationalRoutePolyline(route, routingToken);
          } catch {
            return null;
          }
        }),
      );

      const renderedRoutes = results.filter(
        (route): route is OperationalRouteRender => route != null,
      );

      try {
        if (renderedRoutes.length) {
          await serviceClient.rpc("record_marketplace_map_usage_event", {
            target_project_id: projectId,
            target_provider_code: "mapbox",
            target_capability: "routing",
            target_operation: "operational_route_geometry",
            target_units: renderedRoutes.length,
            target_success: true,
            target_fallback_used: false,
            target_latency_ms: null,
            target_error_code: null,
            target_correlation_id: null,
            target_metadata: {
              source: "marketplace-map-admin-gateway",
              routes: renderedRoutes.length,
            },
          });
        }
      } catch {
        // La respuesta operativa no falla por un problema secundario de telemetria.
      }

      const payload = {
        routes: renderedRoutes.map((route) => ({
          job_id: route.jobId,
          segment: route.segment,
          polyline: route.polyline,
          distance_km: route.distanceKm,
          duration_seconds: route.durationSeconds,
        })),
        generated_at: new Date().toISOString(),
      };

      return reply({ ...payload, data: payload });
    }

    if (operation === "operational_static_map") {
      const { data: operationalData, error: operationalError } = await userClient.rpc(
        "admin_get_marketplace_operational_map",
        { target_project_id: projectId },
      );

      if (operationalError) throw operationalError;

      const { data: mapSettings, error: mapSettingsError } = await userClient.rpc(
        "admin_get_marketplace_map_settings",
        { target_project_id: projectId },
      );
      if (mapSettingsError) throw mapSettingsError;

      const mapVisualSetting = Array.isArray(mapSettings?.settings)
        ? mapSettings.settings.find((item: any) => item?.capability === "map_visual")
        : null;

      const configuredStyle = String(mapVisualSetting?.config?.style ?? "")
        .trim()
        .replace(/^mapbox:\/\/styles\//, "");

      const mapStyle = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(configuredStyle)
        ? configuredStyle
        : "mapbox/dark-v11";

      const routeJobId = String(body?.route_job_id ?? "").trim();

      if (routeJobId && !/^[0-9a-f-]{36}$/i.test(routeJobId)) {
        throw new Error("ROUTE_JOB_ID_INVALID");
      }

      const showRoutes = body?.show_routes !== false;
      const routeCandidates = operationalRoutesFromData(operationalData, routeJobId || null);

      if (routeJobId && routeCandidates.length === 0) {
        throw new Error("ROUTE_JOB_NOT_FOUND");
      }

      const points = operationalPointsFromData(operationalData);
      const rendered = await operationalStaticMap(
        serviceClient,
        projectId,
        points,
        showRoutes ? routeCandidates : [],
        showRoutes,
        mapStyle,
      );

      const selectedRoute = routeJobId
        ? (
            rendered.renderedRoutes.find(
              (route) =>
                route.jobId === routeJobId &&
                route.segment === "trip",
            ) ??
            rendered.renderedRoutes.find(
              (route) => route.jobId === routeJobId,
            ) ??
            null
          )
        : null;

      const payload = {
        data_url: rendered.dataUrl,
        point_count: points.length,
        route_count: rendered.routeCount,
        map_style: mapStyle,
        route_job_id: selectedRoute?.jobId ?? null,
        route_distance_km: selectedRoute?.distanceKm ?? null,
        route_duration_seconds: selectedRoute?.durationSeconds ?? null,
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
              ? (connection?.public_credential_mode ?? "none")
              : (connection?.server_credential_mode ?? "none"),
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
