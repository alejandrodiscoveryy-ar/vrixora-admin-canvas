import { requireOnline } from "@/lib/pwa";
import { getSupabaseClient } from "@/lib/supabase";

export type MapCapabilityCode = "map_visual" | "geocoding" | "routing";
export type MapHealth =
  | "operational"
  | "pending_check"
  | "warning"
  | "critical"
  | "error"
  | "disabled"
  | "not_configured";

export interface MapCapability {
  code: MapCapabilityCode;
  primaryProviderCode: string | null;
  providerName: string | null;
  fallbackProviderCode: string | null;
  enabled: boolean;
  status: MapHealth;
  credentialStatus: string | null;
  healthHttpStatus: number | null;
  healthErrorCode: string | null;
  config: Record<string, unknown>;
  usage: number | null;
  limit: number | null;
  capturedAt: string | null;
  lastCheckedAt: string | null;
}

export interface MapProvider {
  code: string;
  name: string;
  integrated: boolean;
  enabled: boolean;
  capabilities: MapCapabilityCode[];
  publicCredentialConfigured: boolean;
  serverCredentialConfigured: boolean;
  publicCredentialStorage: string | null;
  serverCredentialStorage: string | null;
  publicCredentialMasked: string | null;
  serverCredentialMasked: string | null;
  lastCheckedAt: string | null;
  publicConfig: Record<string, unknown>;
  quotaConfig: Record<string, unknown>;
}

export interface MarketplaceMapDashboard {
  canView: boolean;
  canManage: boolean;
  capabilities: MapCapability[];
  providers: MapProvider[];
}

const capabilityCodes: MapCapabilityCode[] = ["map_visual", "geocoding", "routing"];
const defaultCapabilityConfig: Record<MapCapabilityCode, Record<string, unknown>> = {
  map_visual: { style: "mapbox/dark-v11", tile_size: 256 },
  geocoding: { country: "CU", language: "es", limit: 6 },
  routing: { profile: "driving", timeout_ms: 10000, quote_ttl_seconds: 900 },
};
const providerNames: Record<string, string> = {
  mapbox: "Mapbox",
  google_maps: "Google Maps",
  tomtom: "TomTom",
  here: "HERE",
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const nullableString = (input: unknown) => (input == null || input === "" ? null : String(input));

export function usagePercentage(used: number | null, limit: number | null) {
  return used != null && limit != null && limit > 0 ? Math.min(100, (used / limit) * 100) : null;
}

export function mapHealthLabel(status: MapHealth) {
  return {
    operational: "Operativo",
    pending_check: "Pendiente de comprobación",
    warning: "Advertencia",
    critical: "Crítico",
    error: "Error",
    disabled: "Desactivado",
    not_configured: "Sin configurar",
  }[status];
}

export function translateMapError(code: unknown) {
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: "Las credenciales no son válidas.",
    MISSING_CREDENTIALS: "Faltan credenciales para esta capacidad.",
    PROVIDER_NOT_INTEGRATED: "Este proveedor estará disponible próximamente.",
    PROVIDER_DISABLED: "El proveedor está desactivado.",
    MAP_PUBLIC_CREDENTIAL_CLIENT_BUILD_UNTESTABLE:
      "No comprobable desde Administración: el mapa visual actual usa la credencial incluida en el build del cliente.",
    TIMEOUT: "La comprobación superó el tiempo de espera.",
    RATE_LIMITED: "El proveedor limitó temporalmente las solicitudes.",
  };
  return messages[String(code ?? "")] ?? "No se pudo comprobar la conexión.";
}

function health(input: unknown): MapHealth {
  return [
    "operational",
    "pending_check",
    "warning",
    "critical",
    "error",
    "disabled",
    "not_configured",
  ].includes(String(input))
    ? (String(input) as MapHealth)
    : "not_configured";
}

export function mapDashboard(data: unknown): MarketplaceMapDashboard {
  const root = record(data);
  const summary = record(root.summary);
  const settings = record(root.settings);
  const operational = record(root.operational);
  const rawCapabilities = Array.isArray(summary.items) ? summary.items : [];
  const rawProviders = Array.isArray(settings.providers) ? settings.providers : [];
  const connections = Array.isArray(settings.connections) ? settings.connections : [];
  const configuredCapabilities = Array.isArray(settings.settings) ? settings.settings : [];
  const capabilities = capabilityCodes.map((code) => {
    const row = record(rawCapabilities.find((item) => String(record(item).capability) === code));
    const configured = record(
      configuredCapabilities.find((item) => String(record(item).capability) === code),
    );
    return {
      code,
      primaryProviderCode: nullableString(row.provider_code),
      providerName: nullableString(row.provider_name),
      fallbackProviderCode: nullableString(row.fallback_provider_code),
      enabled: Boolean(row.enabled),
      status: health(row.status ?? row.health_status),
      credentialStatus: nullableString(row.credential_status),
      healthHttpStatus: row.health_http_status == null ? null : Number(row.health_http_status),
      healthErrorCode: nullableString(row.health_error_code),
      config: {
        ...defaultCapabilityConfig[code],
        ...record(configured.config),
      },
      usage: row.usage_used_units == null ? null : Number(row.usage_used_units),
      limit: row.usage_limit_units == null ? null : Number(row.usage_limit_units),
      capturedAt: nullableString(row.usage_captured_at),
      lastCheckedAt: nullableString(row.health_checked_at),
    };
  });
  const providers = rawProviders.map((item) => {
    const row = record(item);
    const code = String(row.code ?? row.provider_code ?? "");
    const connection = record(
      connections.find((entry) => String(record(entry).provider_code) === code),
    );
    return {
      code,
      name: String(row.name ?? row.provider_name ?? providerNames[code] ?? code),
      integrated: Boolean(row.integrated),
      enabled: Boolean(connection.enabled),
      capabilities: (Array.isArray(row.capabilities) ? (row.capabilities as unknown[]) : []).filter(
        (x): x is MapCapabilityCode => capabilityCodes.includes(String(x) as MapCapabilityCode),
      ),
      publicCredentialConfigured: Boolean(connection.public_credential_configured),
      serverCredentialConfigured: Boolean(connection.server_credential_configured),
      publicCredentialStorage: nullableString(connection.public_credential_storage),
      serverCredentialStorage: nullableString(connection.server_credential_storage),
      publicCredentialMasked: nullableString(connection.public_credential_masked),
      serverCredentialMasked: nullableString(connection.server_credential_masked),
      lastCheckedAt: null,
      publicConfig: record(connection.public_config),
      quotaConfig: record(connection.quota_config),
    };
  });
  return {
    canView: true,
    canManage: Boolean(settings.can_manage ?? operational.can_manage),
    capabilities,
    providers,
  };
}

export async function getMarketplaceMapDashboard(projectId: string) {
  const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_map_dashboard", {
    target_project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return mapDashboard(data);
}

export async function saveMarketplaceMapCapability(projectId: string, capability: MapCapability) {
  await requireOnline("guardar la configuración de mapas");
  const { error } = await getSupabaseClient().rpc("admin_save_marketplace_map_capability", {
    target_project_id: projectId,
    target_capability: capability.code,
    target_primary_provider_code: capability.primaryProviderCode,
    target_fallback_provider_code: capability.fallbackProviderCode,
    target_enabled: capability.enabled,
    target_config: capability.config,
  });
  if (error) throw new Error(error.message);
}

export async function saveMarketplaceMapCredentials(
  projectId: string,
  providerCode: string,
  publicToken: string,
  serverToken: string,
) {
  await requireOnline("guardar las credenciales de mapas");
  const { error } = await getSupabaseClient().rpc(
    "admin_save_marketplace_map_provider_credentials",
    {
      target_project_id: projectId,
      target_provider_code: providerCode,
      target_public_token: publicToken || null,
      target_server_token: serverToken || null,
    },
  );
  if (error) throw new Error(error.message);
}

export async function saveMarketplaceMapProviderConnection(
  projectId: string,
  provider: MapProvider,
) {
  if (!provider.integrated) {
    throw new Error("Este proveedor estará disponible próximamente.");
  }
  await requireOnline("guardar la activación del proveedor de mapas");
  const { error } = await getSupabaseClient().rpc(
    "admin_save_marketplace_map_provider_connection",
    {
      target_project_id: projectId,
      target_provider_code: provider.code,
      target_enabled: provider.enabled,
      target_public_config: provider.publicConfig,
    },
  );
  if (error) throw new Error(error.message);
}

export async function saveMarketplaceMapQuotaConfig(
  projectId: string,
  providerCode: string,
  quotaConfig: Record<string, unknown>,
) {
  await requireOnline("guardar los límites administrativos de mapas");
  const { error } = await getSupabaseClient().rpc("admin_save_marketplace_map_quota_config", {
    target_project_id: projectId,
    target_provider_code: providerCode,
    target_quota_config: quotaConfig,
  });
  if (error) throw new Error(error.message);
}

export async function testMarketplaceMapProvider(
  projectId: string,
  providerCode: string,
  capability: MapCapabilityCode,
) {
  await requireOnline("probar la conexión de mapas");
  const { data, error } = await getSupabaseClient().functions.invoke(
    "marketplace-map-admin-gateway",
    {
      body: {
        operation: "test_provider",
        project_id: projectId,
        provider_code: providerCode,
        capability,
      },
    },
  );
  if (error) throw new Error(error.message);
  return record(data);
}
export interface MarketplaceOperationalDriver {
  driverUserId: string;
  driverDisplayName: string | null;
  vehicleId: string;
  vehicleName: string | null;
  vehicleCategoryCode: string | null;
  acceptingJobs: boolean;
  isAvailable: boolean;
  activeJobId: string | null;
  activeJobStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastAccuracyM: number | null;
  accuracyM: number | null;
  headingDegrees: number | null;
  speedMps: number | null;
  capturedAt: string | null;
  freshnessSeconds: number;
  locationFresh: boolean;
}

export interface MarketplaceOperationalJob {
  jobId: string;
  status: string;
  serviceCode: string;
  originText: string;
  destinationText: string;
  originLat: number | null;
  originLon: number | null;
  destinationLat: number | null;
  destinationLon: number | null;
  estimatedDistanceKm: number | null;
  routeDurationSeconds: number | null;
  customerDisplayName: string | null;
  driverUserId: string | null;
  vehicleId: string | null;
  driverDisplayName: string | null;
  vehicleName: string | null;
  vehicleCategoryCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceOperationalMapData {
  serverTime: string;
  freshnessSeconds: number;
  summary: {
    workingDrivers: number;
    inactiveDrivers: number;
    driversWithFreshLocation: number;
    activeJobs: number;
  };
  drivers: MarketplaceOperationalDriver[];
  jobs: MarketplaceOperationalJob[];
}

export interface MarketplaceOperationalStaticMapData {
  dataUrl: string;
  pointCount: number;
  routeCount: number;
  generatedAt: string | null;
}

export interface MarketplaceOperationalMapConfig {
  accessToken: string;
  mapStyle: string;
  generatedAt: string | null;
}

export interface MarketplaceOperationalRoute {
  jobId: string;
  polyline: string;
  distanceKm: number | null;
  durationSeconds: number | null;
}

const nullableNumber = (value: unknown) =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

export async function getMarketplaceOperationalMap(
  projectId: string,
): Promise<MarketplaceOperationalMapData> {
  const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_operational_map", {
    target_project_id: projectId,
  });

  if (error) throw new Error(error.message);

  const root = record(data);
  const summary = record(root.summary);
  const rawDrivers = Array.isArray(root.drivers) ? (root.drivers as unknown[]) : [];
  const rawJobs = Array.isArray(root.jobs) ? (root.jobs as unknown[]) : [];

  return {
    serverTime: String(root.server_time ?? new Date().toISOString()),
    freshnessSeconds: Number(root.freshness_seconds ?? 180),
    summary: {
      workingDrivers: Number(summary.working_drivers ?? 0),
      inactiveDrivers: Number(summary.inactive_drivers ?? 0),
      driversWithFreshLocation: Number(summary.drivers_with_fresh_location ?? 0),
      activeJobs: Number(summary.active_jobs ?? 0),
    },
    drivers: rawDrivers.map((item) => {
      const row = record(item);
      return {
        driverUserId: String(row.driver_user_id ?? ""),
        driverDisplayName: nullableString(row.driver_display_name),
        vehicleId: String(row.vehicle_id ?? ""),
        vehicleName: nullableString(row.vehicle_name),
        vehicleCategoryCode: nullableString(row.vehicle_category_code),
        acceptingJobs: Boolean(row.accepting_jobs),
        isAvailable: Boolean(row.is_available),
        activeJobId: nullableString(row.active_job_id),
        activeJobStatus: nullableString(row.active_job_status),
        latitude: nullableNumber(row.latitude),
        longitude: nullableNumber(row.longitude),
        lastLatitude: nullableNumber(row.last_latitude),
        lastLongitude: nullableNumber(row.last_longitude),
        lastAccuracyM: nullableNumber(row.last_accuracy_m),
        accuracyM: nullableNumber(row.accuracy_m),
        headingDegrees: nullableNumber(row.heading_degrees),
        speedMps: nullableNumber(row.speed_mps),
        capturedAt: nullableString(row.captured_at),
        freshnessSeconds: Number(row.freshness_seconds ?? (row.active_job_id ? 120 : 300)),
        locationFresh: Boolean(row.location_fresh),
      };
    }),
    jobs: rawJobs.map((item) => {
      const row = record(item);
      return {
        jobId: String(row.job_id ?? ""),
        status: String(row.status ?? ""),
        serviceCode: String(row.service_code ?? ""),
        originText: String(row.origin_text ?? ""),
        destinationText: String(row.destination_text ?? ""),
        originLat: nullableNumber(row.origin_lat),
        originLon: nullableNumber(row.origin_lon),
        destinationLat: nullableNumber(row.destination_lat),
        destinationLon: nullableNumber(row.destination_lon),
        estimatedDistanceKm: nullableNumber(row.estimated_distance_km),
        routeDurationSeconds: nullableNumber(row.route_duration_seconds),
        customerDisplayName: nullableString(row.customer_display_name),
        driverUserId: nullableString(row.driver_user_id),
        vehicleId: nullableString(row.vehicle_id),
        driverDisplayName: nullableString(row.driver_display_name),
        vehicleName: nullableString(row.vehicle_name),
        vehicleCategoryCode: nullableString(row.vehicle_category_code),
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
      };
    }),
  };
}

export interface MarketplaceOperationalDriverAvatar {
  driverUserId: string;
  avatarUrl: string | null;
  avatarSource: "driver_photo" | "google" | null;
}

export async function getMarketplaceOperationalDriverAvatars(
  projectId: string,
): Promise<Record<string, MarketplaceOperationalDriverAvatar>> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "marketplace-map-admin-gateway",
    {
      body: {
        operation: "operational_driver_avatars",
        project_id: projectId,
      },
    },
  );

  if (error) throw new Error(error.message);

  const root = record(data);
  const payload = record(root.data);
  const rawDrivers = Array.isArray(payload.drivers)
    ? (payload.drivers as unknown[])
    : Array.isArray(root.drivers)
      ? (root.drivers as unknown[])
      : [];

  return Object.fromEntries(
    rawDrivers.map((item) => {
      const row = record(item);
      const driverUserId = String(row.driver_user_id ?? "");
      const rawSource = nullableString(row.avatar_source);
      const avatarSource =
        rawSource === "driver_photo" || rawSource === "google" ? rawSource : null;

      return [
        driverUserId,
        {
          driverUserId,
          avatarUrl: nullableString(row.avatar_url),
          avatarSource,
        },
      ];
    }),
  );
}

export async function getMarketplaceOperationalStaticMap(
  projectId: string,
  options: { showRoutes?: boolean } = {},
): Promise<MarketplaceOperationalStaticMapData> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "marketplace-map-admin-gateway",
    {
      body: {
        operation: "operational_static_map",
        project_id: projectId,
        show_routes: options.showRoutes !== false,
      },
    },
  );

  if (error) throw new Error(error.message);

  const root = record(data);
  const payload = record(root.data);
  const dataUrl = nullableString(payload.data_url ?? root.data_url);

  if (!dataUrl) throw new Error("MAP_IMAGE_UNAVAILABLE");

  return {
    dataUrl,
    pointCount: Number(payload.point_count ?? root.point_count ?? 0),
    routeCount: Number(payload.route_count ?? root.route_count ?? 0),
    generatedAt: nullableString(payload.generated_at ?? root.generated_at),
  };
}

export async function getMarketplaceOperationalMapConfig(
  projectId: string,
): Promise<MarketplaceOperationalMapConfig> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "marketplace-map-admin-gateway",
    {
      body: {
        operation: "operational_map_config",
        project_id: projectId,
      },
    },
  );

  if (error) throw new Error(error.message);

  const root = record(data);
  const payload = record(root.data);
  const accessToken = nullableString(payload.access_token ?? root.access_token);
  const mapStyle = nullableString(payload.map_style ?? root.map_style);

  if (!accessToken || !mapStyle) {
    throw new Error("MAP_INTERACTIVE_CONFIG_UNAVAILABLE");
  }

  return {
    accessToken,
    mapStyle,
    generatedAt: nullableString(payload.generated_at ?? root.generated_at),
  };
}

export async function getMarketplaceOperationalRoutes(
  projectId: string,
): Promise<MarketplaceOperationalRoute[]> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "marketplace-map-admin-gateway",
    {
      body: {
        operation: "operational_route_geometry",
        project_id: projectId,
      },
    },
  );

  if (error) throw new Error(error.message);

  const root = record(data);
  const payload = record(root.data);
  const rawRoutes = Array.isArray(payload.routes)
    ? payload.routes
    : Array.isArray(root.routes)
      ? root.routes
      : [];

  return rawRoutes
    .map((item) => {
      const row = record(item);
      const jobId = String(row.job_id ?? "").trim();
      const polyline = String(row.polyline ?? "").trim();
      if (!jobId || !polyline) return null;

      return {
        jobId,
        polyline,
        distanceKm: nullableNumber(row.distance_km),
        durationSeconds: nullableNumber(row.duration_seconds),
      } satisfies MarketplaceOperationalRoute;
    })
    .filter((item): item is MarketplaceOperationalRoute => item != null);
}
