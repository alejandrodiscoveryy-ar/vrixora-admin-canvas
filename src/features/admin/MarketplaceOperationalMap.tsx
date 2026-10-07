import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl, { type CircleLayerSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

if (typeof window !== "undefined") {
  mapboxgl.prewarm();
}
import {
  AlertTriangle,
  Bike,
  Boxes,
  CarFront,
  Copy,
  Clock3,
  MapPin,
  MessageCircle,
  Package,
  Maximize2,
  Minimize2,
  Navigation,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Route,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseServices } from "@/lib/services";
import {
  getMarketplaceOperationalDriverAvatars,
  getMarketplaceOperationalMap,
  getMarketplaceOperationalMapConfig,
  getMarketplaceOperationalRoutes,
  getMarketplaceOperationalStaticMap,
  type MarketplaceOperationalDriver,
  type MarketplaceOperationalJob,
} from "@/lib/marketplace-map";

const MAP_SOURCE_POINTS = "tuktuk-live-points";
const MAP_SOURCE_ROUTES = "tuktuk-live-routes";
const MAP_LAYERS = {
  routes: "tuktuk-live-routes-trip-layer",
  routesSelected: "tuktuk-live-routes-trip-selected-layer",
  routesPickup: "tuktuk-live-routes-pickup-layer",
  routesPickupSelected: "tuktuk-live-routes-pickup-selected-layer",
  driversFresh: "tuktuk-live-drivers-fresh-layer",
  driversStale: "tuktuk-live-drivers-stale-layer",
  incidents: "tuktuk-live-incidents-layer",
} as const;

type LayerKey = "drivers" | "pickups" | "destinations" | "routes" | "incidents";
type LayerState = Record<LayerKey, boolean>;

type Coordinate = [number, number];

const defaultLayers: LayerState = {
  drivers: true,
  pickups: true,
  destinations: true,
  routes: true,
  incidents: true,
};

const statusLabel = (status: string | null) =>
  ({
    published: "Buscando conductor",
    accepted: "Aceptado",
    en_route: "En camino",
    pickup: "Recogida",
    in_progress: "En curso",
    completed: "Completado",
    incident: "Incidencia",
  })[status ?? ""] ??
  status ??
  "—";

const vehicleCategoryLabel = (code: string | null) =>
  ({
    motorcycle: "Moto",
    bicitaxi: "Bicitaxi",
    tricycle: "Triciclo",
    light_car: "Auto",
    van: "Furgoneta",
    truck: "Camion",
    other: "Otro",
  })[code ?? ""] ??
  code ??
  "Modalidad s/d";

type OperationalPinKind = "driver" | "customer" | "destination";

function operationalPinIconSvg(
  kind: OperationalPinKind,
  vehicleCategoryCode: string | null = null,
) {
  if (kind === "customer") {
    return `
      <circle cx="24" cy="18.2" r="4" fill="#1e293b"/>
      <path
        d="M16.7 30c.8-5 3.4-7.4 7.3-7.4s6.5 2.4 7.3 7.4H16.7Z"
        fill="#1e293b"
      />
    `;
  }

  if (kind === "destination") {
    return `
      <path
        d="M18.8 31V14.2"
        fill="none"
        stroke="#1e293b"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M20 14.8h11v8H20z"
        fill="#ffffff"
        stroke="#1e293b"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <path d="M20 14.8h5.5v4H20z" fill="#1e293b"/>
      <path d="M25.5 18.8H31v4h-5.5z" fill="#1e293b"/>
    `;
  }

  if (vehicleCategoryCode === "tricycle") {
    return `
      <text
        x="24"
        y="26.5"
        text-anchor="middle"
        font-size="16"
        font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif"
      >🛺</text>
    `;
  }

  if (vehicleCategoryCode === "motorcycle") {
    return `
      <circle
        cx="17.5"
        cy="27"
        r="2.8"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.7"
      />
      <circle
        cx="30.5"
        cy="27"
        r="2.8"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.7"
      />
      <path
        d="M17.5 27l4.3-6.2h4.3l4.4 6.2M21.8 20.8l3 6.2M24.8 27l3.5-8.8h3"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    `;
  }

  if (vehicleCategoryCode === "bicitaxi") {
    return `
      <circle
        cx="16.5"
        cy="27.2"
        r="2.4"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.5"
      />
      <circle
        cx="31.5"
        cy="27.2"
        r="2.4"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.5"
      />
      <path
        d="M18.8 27.2h10.3l-1.3-8H20l-1.2 8Z"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M19.9 19.2h8.3M23.9 19.2v-3.5M21.7 15.7h4.5"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    `;
  }

  if (
    vehicleCategoryCode === "light_car" ||
    vehicleCategoryCode === "van"
  ) {
    return `
      <path
        d="M16 23.8l2.3-6.1h11.4l2.3 6.1v4H16v-4Z"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
      <path
        d="M19.2 18.2h9.6l1.4 4.2H17.8l1.4-4.2Z"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.2"
      />
      <circle cx="19" cy="28.2" r="1.7" fill="#1e293b"/>
      <circle cx="29" cy="28.2" r="1.7" fill="#1e293b"/>
    `;
  }

  if (vehicleCategoryCode === "truck") {
    return `
      <path
        d="M15.5 17.5h10v9.8h-10z"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.6"
      />
      <path
        d="M25.5 20h4.2l2.8 3.2v4.1h-7V20Z"
        fill="none"
        stroke="#1e293b"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <circle cx="19" cy="28.1" r="1.8" fill="#1e293b"/>
      <circle cx="29" cy="28.1" r="1.8" fill="#1e293b"/>
    `;
  }

  return `
    <circle
      cx="24"
      cy="21.5"
      r="6.2"
      fill="none"
      stroke="#1e293b"
      stroke-width="2"
    />
    <circle cx="24" cy="21.5" r="1.6" fill="#1e293b"/>
    <path
      d="M24 19.8v-4M22.3 22.8l-3.7 2.8M25.7 22.8l3.7 2.8"
      fill="none"
      stroke="#1e293b"
      stroke-width="1.9"
      stroke-linecap="round"
    />
  `;
}

function operationalPinSvg({
  kind,
  key,
  selected = false,
  stale = false,
  vehicleCategoryCode = null,
}: {
  kind: OperationalPinKind;
  key: string;
  selected?: boolean;
  stale?: boolean;
  vehicleCategoryCode?: string | null;
}) {
  const colors =
    kind === "driver"
      ? stale
        ? ["#b58a6a", "#85533b", "#60392b", "#35231e"]
        : ["#ffd19a", "#ff6b00", "#e24a00", "#922c05"]
      : kind === "customer"
        ? ["#9bf2b7", "#22c55e", "#15803d", "#14532d"]
        : ["#fecaca", "#ef4444", "#b91c1c", "#7f1d1d"];

  const safeKey =
    key.replace(/[^a-zA-Z0-9_-]/g, "").slice(-30) || "marker";

  const bodyId = `pin-body-${kind}-${safeKey}`;
  const innerId = `pin-inner-${kind}-${safeKey}`;
  const innerShadowId = `pin-inner-shadow-${kind}-${safeKey}`;

  const [top, middle, bottom, edge] = colors;

  const selectedShadow = selected
    ? "drop-shadow(0 0 5px rgba(255,255,255,0.68)) drop-shadow(0 9px 8px rgba(0,0,0,0.45))"
    : "drop-shadow(0 9px 7px rgba(0,0,0,0.42))";

  const markerOpacity =
    kind === "driver" && stale ? "0.62" : "1";

  return `
    <svg
      width="48"
      height="60"
      viewBox="0 0 48 60"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style="overflow:visible;filter:${selectedShadow};opacity:${markerOpacity}"
    >
      <defs>
        <linearGradient
          id="${bodyId}"
          x1="9"
          y1="3"
          x2="38"
          y2="54"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stop-color="${top}"/>
          <stop offset="0.18" stop-color="${middle}"/>
          <stop offset="0.63" stop-color="${middle}"/>
          <stop offset="1" stop-color="${bottom}"/>
        </linearGradient>

        <radialGradient id="${innerId}" cx="32%" cy="24%" r="82%">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="0.48" stop-color="#f8fafc"/>
          <stop offset="0.78" stop-color="#e2e8f0"/>
          <stop offset="1" stop-color="#b8c3cf"/>
        </radialGradient>

        <filter
          id="${innerShadowId}"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
        >
          <feDropShadow
            dx="0"
            dy="1.2"
            stdDeviation="1.2"
            flood-color="#020617"
            flood-opacity="0.48"
          />
        </filter>
      </defs>

      <ellipse
        cx="24"
        cy="57.1"
        rx="10.2"
        ry="2.5"
        fill="#020617"
        opacity="0.32"
      />

      <path
        d="M24 2.2C12.35 2.2 3 11.45 3 23c0 15.9 21 34.8 21 34.8S45 38.9 45 23C45 11.45 35.65 2.2 24 2.2Z"
        fill="url(#${bodyId})"
        stroke="${selected ? "#ffffff" : edge}"
        stroke-width="${selected ? "2.5" : "1.7"}"
        stroke-linejoin="round"
      />

      <path
        d="M7 29.1C11.5 42 24 54.5 24 54.5S36.5 42 41 29.1c-4.6 5.8-10.3 8.7-17 8.7S11.6 34.9 7 29.1Z"
        fill="#020617"
        opacity="0.15"
      />

      <path
        d="M8.7 20.1C10.7 10.8 18.5 5.9 28.4 6.9c-7.1 1.2-12.5 5.3-15.4 11.7-1.2 2.5-4.8 3.5-4.3 1.5Z"
        fill="#ffffff"
        opacity="0.38"
      />

      <circle
        cx="24"
        cy="22"
        r="13.1"
        fill="#020617"
        opacity="0.31"
      />

      <circle
        cx="24"
        cy="21"
        r="11.5"
        fill="url(#${innerId})"
        stroke="#ffffff"
        stroke-width="1.4"
        stroke-opacity="0.96"
        filter="url(#${innerShadowId})"
      />

      <path
        d="M17.2 17.5c1.7-3.2 4.5-4.8 8.3-4.8"
        fill="none"
        stroke="#ffffff"
        stroke-width="1.25"
        stroke-linecap="round"
        opacity="0.72"
      />

      ${operationalPinIconSvg(kind, vehicleCategoryCode)}
    </svg>
  `;
}

function OperationalPinLegend({
  kind,
  stale = false,
  vehicleCategoryCode = null,
}: {
  kind: OperationalPinKind;
  stale?: boolean;
  vehicleCategoryCode?: string | null;
}) {
  const markup = operationalPinSvg({
    kind,
    key: `legend-${kind}-${stale ? "stale" : "fresh"}`,
    stale,
    vehicleCategoryCode,
  });

  return (
    <span
      className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-visible"
      aria-hidden="true"
    >
      <span
        className="pointer-events-none absolute block h-[60px] w-[48px]"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%) scale(0.38)",
        }}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </span>
  );
}

function VehicleModeIcon({
  code,
  className = "h-4 w-4",
}: {
  code: string | null;
  className?: string;
}) {
  switch (code) {
    case "light_car":
      return <CarFront className={className} />;
    case "motorcycle":
    case "bicitaxi":
      return <Bike className={className} />;
    case "tricycle":
      return (
        <span
          className={`${className} inline-flex items-center justify-center text-[14px] leading-none`}
          aria-hidden="true"
        >
          🛺
        </span>
      );
    case "van":
    case "truck":
      return <Truck className={className} />;
    case "other":
      return <Boxes className={className} />;
    default:
      return <Package className={className} />;
  }
}

function VehicleModeBadge({ code }: { code: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/[0.06] px-2 py-1 text-[10px] font-semibold text-orange-200"
      title={`Modalidad: ${vehicleCategoryLabel(code)}`}
    >
      <VehicleModeIcon code={code} className="h-3.5 w-3.5" />
      {vehicleCategoryLabel(code)}
    </span>
  );
}
const driverInitials = (name: string | null) => {
  const parts = String(name ?? "Conductor")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "C";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

function DriverAvatar({ name, url }: { name: string | null; url: string | null }) {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border/70 bg-background shadow-sm">
      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-foreground">
        {driverInitials(name)}
      </div>
      {url ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

const formatTime = (value: string | null) => {
  if (!value) return "Sin señal";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin señal";
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const formatDistance = (value: number | null) =>
  value == null
    ? "Distancia s/d"
    : `${value.toLocaleString("es", { maximumFractionDigits: 1 })} km`;

const formatDuration = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return "Tiempo s/d";
  const totalMinutes = Math.max(1, Math.round(value / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${totalMinutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

const signalAgeLabel = (capturedAt: string | null, serverTime: string) => {
  if (!capturedAt) return "Sin ubicación";
  const captured = new Date(capturedAt).getTime();
  const server = new Date(serverTime).getTime();
  if (!Number.isFinite(captured) || !Number.isFinite(server)) return "Señal registrada";

  const seconds = Math.max(0, Math.round((server - captured) / 1000));
  if (seconds < 60) return `Señal hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Señal hace ${minutes} min`;
  return `Última señal ${formatTime(capturedAt)}`;
};

const validCoordinate = (value: number | null, min: number, max: number) =>
  value != null && Number.isFinite(value) && value >= min && value <= max ? value : null;

function driverCoordinate(driver: MarketplaceOperationalDriver): Coordinate | null {
  const lon = validCoordinate(
    driver.locationFresh ? driver.longitude : driver.lastLongitude,
    -180,
    180,
  );
  const lat = validCoordinate(
    driver.locationFresh ? driver.latitude : driver.lastLatitude,
    -90,
    90,
  );
  return lon == null || lat == null ? null : [lon, lat];
}

function decodePolyline(encoded: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lon / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function jobCoordinate(job: MarketplaceOperationalJob, kind: "origin" | "destination") {
  const lat = validCoordinate(kind === "origin" ? job.originLat : job.destinationLat, -90, 90);
  const lon = validCoordinate(kind === "origin" ? job.originLon : job.destinationLon, -180, 180);
  return lon == null || lat == null ? null : ([lon, lat] satisfies Coordinate);
}

function coordinatesAlmostEqual(
  first: Coordinate,
  second: Coordinate,
  tolerance = 0.000005,
) {
  return (
    Math.abs(first[0] - second[0]) <= tolerance &&
    Math.abs(first[1] - second[1]) <= tolerance
  );
}

function addOperationalLayers(map: mapboxgl.Map) {
  if (!map.getSource(MAP_SOURCE_ROUTES)) {
    map.addSource(MAP_SOURCE_ROUTES, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getSource(MAP_SOURCE_POINTS)) {
    map.addSource(MAP_SOURCE_POINTS, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(MAP_LAYERS.routesPickup)) {
    map.addLayer({
      id: MAP_LAYERS.routesPickup,
      type: "line",
      source: MAP_SOURCE_ROUTES,
      filter: [
        "all",
        ["!=", ["get", "selected"], true],
        ["==", ["get", "segment"], "pickup"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#f97316",
        "line-width": 4,
        "line-opacity": 0.88,
        "line-dasharray": [2.2, 1.7],
      },
    });
  }

  if (!map.getLayer(MAP_LAYERS.routesPickupSelected)) {
    map.addLayer({
      id: MAP_LAYERS.routesPickupSelected,
      type: "line",
      source: MAP_SOURCE_ROUTES,
      filter: [
        "all",
        ["==", ["get", "selected"], true],
        ["==", ["get", "segment"], "pickup"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#fb923c",
        "line-width": 6,
        "line-opacity": 1,
        "line-dasharray": [2.2, 1.6],
      },
    });
  }

  if (!map.getLayer(MAP_LAYERS.routes)) {
    map.addLayer({
      id: MAP_LAYERS.routes,
      type: "line",
      source: MAP_SOURCE_ROUTES,
      filter: [
        "all",
        ["!=", ["get", "selected"], true],
        ["==", ["get", "segment"], "trip"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#22c55e",
        "line-width": 5,
        "line-opacity": 0.88,
      },
    });
  }

  if (!map.getLayer(MAP_LAYERS.routesSelected)) {
    map.addLayer({
      id: MAP_LAYERS.routesSelected,
      type: "line",
      source: MAP_SOURCE_ROUTES,
      filter: [
        "all",
        ["==", ["get", "selected"], true],
        ["==", ["get", "segment"], "trip"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#4ade80",
        "line-width": 7,
        "line-opacity": 1,
      },
    });
  }

  const pointLayer = (
    id: string,
    kind: string,
    color: string,
    radius: number,
    extraPaint: NonNullable<CircleLayerSpecification["paint"]> = {},
  ) => {
    if (map.getLayer(id)) return;
    map.addLayer({
      id,
      type: "circle",
      source: MAP_SOURCE_POINTS,
      filter: ["==", ["get", "kind"], kind],
      paint: {
        "circle-color": color,
        "circle-radius": radius,
        "circle-stroke-color": "#0f172a",
        "circle-stroke-width": 2,
        ...extraPaint,
      },
    });
  };

  pointLayer(MAP_LAYERS.driversFresh, "driver_fresh", "#f97316", 8, {
    "circle-stroke-color": "#ffedd5",
    "circle-stroke-width": 3,
  });

  pointLayer(MAP_LAYERS.driversStale, "driver_stale", "#f59e0b", 7, {
    "circle-opacity": 0.65,
    "circle-stroke-color": "#fde68a",
  });

  pointLayer(MAP_LAYERS.incidents, "incident", "#ef4444", 12, {
    "circle-opacity": 0.35,
    "circle-stroke-color": "#fecaca",
    "circle-stroke-width": 3,
  });
}

function setLayerVisibility(map: mapboxgl.Map, id: string, visible: boolean) {
  if (map.getLayer(id)) {
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

export default function MarketplaceOperationalMap({
  projectId,
  canViewCustomers = false,
  onOpenCustomer,
  onOpenJob,
}: {
  projectId: string;
  canViewCustomers?: boolean;
  onOpenCustomer?: (customerId: string) => void;
  onOpenJob?: (jobId: string) => void;
}) {
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [expanded, setExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [customerDetailsJobId, setCustomerDetailsJobId] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitNonce, setMapInitNonce] = useState(0);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [mapViewportHeight, setMapViewportHeight] = useState<number | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const jobMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const jobHoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const mapInitRetryRef = useRef(0);

  const operational = useQuery({
    queryKey: ["marketplace-operational-map-live", projectId],
    queryFn: () => getMarketplaceOperationalMap(projectId),
    refetchInterval: (query) => ((query.state.data?.summary.activeJobs ?? 0) > 0 ? 5_000 : 15_000),
    refetchIntervalInBackground: false,
  });

  const mapConfig = useQuery({
    queryKey: ["marketplace-operational-map-config", projectId],
    queryFn: () => getMarketplaceOperationalMapConfig(projectId),
    staleTime: 15 * 60_000,
    retry: 1,
  });

  const driverAvatars = useQuery({
    queryKey: ["marketplace-operational-driver-avatars", projectId],
    queryFn: () => getMarketplaceOperationalDriverAvatars(projectId),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const routeKey = useMemo(() => {
    const jobs = operational.data?.jobs ?? [];
    const drivers = operational.data?.drivers ?? [];

    return jobs
      .map((job) => {
        const driver = drivers.find(
          (item) =>
            item.driverUserId === job.driverUserId &&
            (!job.vehicleId || item.vehicleId === job.vehicleId),
        );

        const driverPoint = driver ? driverCoordinate(driver) : null;

        return [
          job.jobId,
          job.status,
          job.driverUserId ?? "x",
          job.vehicleId ?? "x",
          job.originLat ?? "x",
          job.originLon ?? "x",
          job.destinationLat ?? "x",
          job.destinationLon ?? "x",
          driverPoint?.[0] ?? "x",
          driverPoint?.[1] ?? "x",
          driver?.capturedAt ?? "x",
        ].join(":");
      })
      .sort()
      .join("|");
  }, [operational.data?.drivers, operational.data?.jobs]);

  const routes = useQuery({
    queryKey: ["marketplace-operational-routes-live", projectId, routeKey],
    queryFn: () => getMarketplaceOperationalRoutes(projectId),
    enabled: Boolean(routeKey),
    staleTime: 4_000,
    retry: 1,
  });

  const staticFallback = useQuery({
    queryKey: ["marketplace-operational-map-static-fallback", projectId, routeKey],
    queryFn: () => getMarketplaceOperationalStaticMap(projectId, { showRoutes: layers.routes }),
    enabled: Boolean(operational.data && mapConfig.isError),
    staleTime: 20_000,
  });

  const selectedJob = useMemo(
    () => operational.data?.jobs.find((job) => job.jobId === selectedJobId) ?? null,
    [operational.data?.jobs, selectedJobId],
  );

  const customerDetailsJob = useMemo(
    () =>
      operational.data?.jobs.find(
        (job) => job.jobId === customerDetailsJobId,
      ) ?? null,
    [operational.data?.jobs, customerDetailsJobId],
  );

  const selectedCustomer = useQuery({
    queryKey: [
      "marketplace-map-customer-360",
      projectId,
      customerDetailsJob?.customerId,
    ],
    queryFn: () =>
      supabaseServices.marketplace.getCustomer360(
        projectId,
        customerDetailsJob!.customerId!,
      ),
    enabled:
      canViewCustomers &&
      Boolean(customerDetailsJob?.customerId),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!selectedJobId && operational.data?.jobs.length) {
      setSelectedJobId(operational.data.jobs[0].jobId);
    } else if (
      selectedJobId &&
      operational.data &&
      !operational.data.jobs.some((job) => job.jobId === selectedJobId)
    ) {
      setSelectedJobId(operational.data.jobs[0]?.jobId ?? null);
    }
  }, [operational.data, selectedJobId]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("marketplace-map-fullscreen");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.body.classList.remove("marketplace-map-fullscreen");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (expanded) {
      setMapViewportHeight(null);
      return;
    }

    const viewport = mapViewportRef.current;
    if (!viewport) return;

    let frame = 0;
    const visualViewport = window.visualViewport;

    const measure = () => {
      window.cancelAnimationFrame(frame);

      frame = window.requestAnimationFrame(() => {
        const current = mapViewportRef.current;
        if (!current) return;

        const visibleHeight = visualViewport?.height ?? window.innerHeight;
        const visibleTop = visualViewport?.offsetTop ?? 0;
        const mapTop = current.getBoundingClientRect().top - visibleTop;
        const available = Math.floor(visibleHeight - Math.max(mapTop, 0) - 12);
        const nextHeight = Math.max(320, available);

        setMapViewportHeight((previous) =>
          previous === nextHeight ? previous : nextHeight,
        );
      });
    };

    const toolbar = viewport.previousElementSibling;
    const observer = new ResizeObserver(measure);

    if (toolbar instanceof HTMLElement) {
      observer.observe(toolbar);
    }

    window.addEventListener("resize", measure);
    visualViewport?.addEventListener("resize", measure);

    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      visualViewport?.removeEventListener("resize", measure);
      window.cancelAnimationFrame(frame);
    };
  }, [expanded, panelOpen]);

  useEffect(() => {
    const node = mapNodeRef.current;
    const config = mapConfig.data;

    if (!node || !config || mapRef.current) return;

    let disposed = false;
    let map: mapboxgl.Map | null = null;
    let initFrame = 0;
    let settleFrame = 0;
    let resizeFrame = 0;
    let initTimer = 0;
    let watchdog = 0;
    let ready = false;

    const settleMap = () => {
      if (
        disposed ||
        !map ||
        mapRef.current !== map
      ) {
        return;
      }

      window.cancelAnimationFrame(resizeFrame);

      resizeFrame = window.requestAnimationFrame(() => {
        if (
          disposed ||
          !map ||
          mapRef.current !== map
        ) {
          return;
        }

        map.resize();
        map.triggerRepaint();

        window.requestAnimationFrame(() => {
          if (
            !disposed &&
            map &&
            mapRef.current === map
          ) {
            map.resize();
            map.triggerRepaint();
          }
        });
      });
    };

    let stylePrepared = false;
    let lastMapError: string | null = null;

    const prepareStyle = () => {
      if (
        disposed ||
        !map ||
        mapRef.current !== map
      ) {
        return;
      }

      if (!stylePrepared) {
        addOperationalLayers(map);
        stylePrepared = true;
      }

      settleMap();
    };

    const markReady = () => {
      if (
        disposed ||
        !map ||
        mapRef.current !== map ||
        !map.isStyleLoaded()
      ) {
        return;
      }

      prepareStyle();
      ready = true;

      mapInitRetryRef.current = 0;
      setMapLoadError(null);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (
            !disposed &&
            map &&
            mapRef.current === map
          ) {
            map.resize();
            map.triggerRepaint();
            setMapLoaded(true);
          }
        });
      });
    };

    const captureMapError = (event: unknown) => {
      const candidate = (event as { error?: unknown }).error;

      lastMapError =
        candidate instanceof Error
          ? candidate.message
          : candidate
            ? String(candidate)
            : "Error de carga de Mapbox";
    };

    const initialize = () => {
      if (
        disposed ||
        mapRef.current
      ) {
        return;
      }

      const current = mapNodeRef.current;

      if (!current || current !== node) {
        return;
      }

      const bounds = current.getBoundingClientRect();

      if (bounds.width < 64 || bounds.height < 64) {
        window.clearTimeout(initTimer);
        initTimer = window.setTimeout(initialize, 60);
        return;
      }

      mapboxgl.accessToken = config.accessToken;

      const mapStyleUrl = config.mapStyle.startsWith("mapbox://styles/")
        ? config.mapStyle
        : `mapbox://styles/${config.mapStyle}`;

      map = new mapboxgl.Map({
        container: current,
        style: mapStyleUrl,
        center: [-82.3666, 23.1136],
        zoom: 11,
        attributionControl: false,
      });

      mapRef.current = map;

      setMapLoaded(false);
      setMapLoadError(null);

      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: true }),
        "bottom-right",
      );

      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-left",
      );

      map.on("style.load", prepareStyle);
      map.on("load", prepareStyle);
      map.on("idle", markReady);
      map.on("error", captureMapError);

      if (map.isStyleLoaded()) {
        prepareStyle();
      } else {
        settleMap();
      }

      watchdog = window.setTimeout(() => {
        if (
          disposed ||
          !map ||
          mapRef.current !== map ||
          ready
        ) {
          return;
        }

        map.resize();
        map.triggerRepaint();

        if (mapInitRetryRef.current < 1) {
          mapInitRetryRef.current += 1;

          map.off("style.load", prepareStyle);
          map.off("load", prepareStyle);
          map.off("idle", markReady);
          map.off("error", captureMapError);
          map.remove();

          if (mapRef.current === map) {
            mapRef.current = null;
          }

          setMapLoaded(false);
          setMapLoadError(null);
          setMapInitNonce((value) => value + 1);
          return;
        }

        setMapLoadError(
          lastMapError
            ? `Mapbox no pudo completar la carga: ${lastMapError}`
            : "El mapa no completó su carga inicial.",
        );
      }, 4500);
    };

    const observer = new ResizeObserver(() => {
      if (!mapRef.current) {
        initialize();
        return;
      }

      if (mapRef.current === map) {
        settleMap();
      }
    });

    observer.observe(node);

    initFrame = window.requestAnimationFrame(() => {
      settleFrame = window.requestAnimationFrame(initialize);
    });

    return () => {
      disposed = true;

      observer.disconnect();

      window.cancelAnimationFrame(initFrame);
      window.cancelAnimationFrame(settleFrame);
      window.cancelAnimationFrame(resizeFrame);

      window.clearTimeout(initTimer);
      window.clearTimeout(watchdog);

      setMapLoaded(false);

      for (const marker of driverMarkersRef.current.values()) {
        marker.remove();
      }
      driverMarkersRef.current.clear();

      for (const marker of jobMarkersRef.current.values()) {
        marker.remove();
      }
      jobMarkersRef.current.clear();

      jobHoverPopupRef.current?.remove();
      jobHoverPopupRef.current = null;

      if (map) {
        map.off("style.load", prepareStyle);
        map.off("load", prepareStyle);
        map.off("idle", markReady);
        map.off("error", captureMapError);

        if (mapRef.current === map) {
          map.remove();
          mapRef.current = null;
        }
      }
    };
  }, [
    mapConfig.data,
    mapInitNonce,
  ]);
  useEffect(() => {
    const map = mapRef.current;
    const node = mapNodeRef.current;
    if (!map || !node) return;

    let frame = 0;

    const resize = () => {
      window.cancelAnimationFrame(frame);

      frame = window.requestAnimationFrame(() => {
        map.resize();

        window.requestAnimationFrame(() => {
          if (mapRef.current === map) {
            map.resize();
          }
        });
      });
    };

    const observer = new ResizeObserver(resize);
    observer.observe(node);

    if (node.parentElement) {
      observer.observe(node.parentElement);
    }

    const settleFast = window.setTimeout(resize, 80);
    const settleLayout = window.setTimeout(resize, 240);
    const settleMap = window.setTimeout(resize, 520);

    window.addEventListener("resize", resize);

    if (mapLoaded) {
      map.once("idle", resize);
    }

    resize();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.clearTimeout(settleFast);
      window.clearTimeout(settleLayout);
      window.clearTimeout(settleMap);
      window.cancelAnimationFrame(frame);

      if (mapRef.current === map) {
        map.off("idle", resize);
      }
    };
  }, [expanded, panelOpen, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const markers = driverMarkersRef.current;
    const visible = new Set<string>();

    if (layers.drivers) {
      for (const driver of operational.data?.drivers ?? []) {
        const coordinate = driverCoordinate(driver);
        if (!coordinate) continue;

        visible.add(driver.driverUserId);
        let marker = markers.get(driver.driverUserId);

        if (!marker) {
          const element = document.createElement("div");
          element.style.display = "flex";
          element.style.flexDirection = "column";
          element.style.alignItems = "center";
          element.style.gap = "3px";
          element.style.pointerEvents = "auto";
          element.style.userSelect = "none";

          const pin = document.createElement("div");
          pin.dataset.role = "driver-pin";
          pin.style.width = "48px";
          pin.style.height = "60px";
          pin.style.display = "flex";
          pin.style.alignItems = "center";
          pin.style.justifyContent = "center";

          element.append(pin);

          marker = new mapboxgl.Marker({
            element,
            anchor: "bottom",
          })
            .setLngLat(coordinate)
            .addTo(map);

          markers.set(driver.driverUserId, marker);
        }

        marker.setLngLat(coordinate);

        const element = marker.getElement();
        const pin = element.querySelector<HTMLElement>(
          '[data-role="driver-pin"]',
        );

        if (!pin) continue;

        pin.innerHTML = operationalPinSvg({
          kind: "driver",
          key: driver.driverUserId,
          selected: Boolean(driver.activeJobId),
          stale: !driver.locationFresh,
          vehicleCategoryCode: driver.vehicleCategoryCode,
        });

        element.setAttribute("role", "img");
        element.setAttribute(
          "aria-label",
          `${vehicleCategoryLabel(driver.vehicleCategoryCode)} - ${
            driver.driverDisplayName ?? "Conductor"
          }`,
        );

        element.title = `${driver.driverDisplayName ?? "Conductor"} - ${vehicleCategoryLabel(
          driver.vehicleCategoryCode,
        )}`;

        element.style.cursor = driver.activeJobId ? "pointer" : "default";

        element.onclick = driver.activeJobId
          ? (event) => {
              event.stopPropagation();
              setSelectedJobId(driver.activeJobId);
              setCustomerDetailsJobId(driver.activeJobId);
            }
          : null;
      }
    }

    for (const [driverUserId, marker] of markers.entries()) {
      if (!visible.has(driverUserId)) {
        marker.remove();
        markers.delete(driverUserId);
      }
    }
  }, [operational.data?.drivers, layers.drivers, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const markers = jobMarkersRef.current;
    const visible = new Set<string>();

    const renderMarker = (
      job: MarketplaceOperationalJob,
      kind: "pickup" | "destination",
      coordinate: Coordinate | null,
    ) => {
      const layerVisible =
        kind === "pickup" ? layers.pickups : layers.destinations;

      if (!layerVisible || !coordinate) return;

      const key = `${job.jobId}:${kind}`;
      visible.add(key);

      let marker = markers.get(key);

      if (!marker) {
        const element = document.createElement("div");

        element.style.display = "flex";
        element.style.flexDirection = "column";
        element.style.alignItems = "center";
        element.style.gap = "4px";
        element.style.pointerEvents = "auto";
        element.style.cursor = "pointer";
        element.style.userSelect = "none";

        const caption = document.createElement("div");
        caption.dataset.role = "caption";
        caption.style.padding = "3px 8px";
        caption.style.borderRadius = "9999px";
        caption.style.fontSize = "10px";
        caption.style.fontWeight = "800";
        caption.style.lineHeight = "1";
        caption.style.color = "#f8fafc";
        caption.style.background = "rgba(15,23,42,0.92)";
        caption.style.border = "1px solid rgba(255,255,255,0.18)";
        caption.style.boxShadow = "0 6px 18px rgba(0,0,0,0.28)";
        caption.style.whiteSpace = "nowrap";

        const bubble = document.createElement("div");
        bubble.dataset.role = "bubble";
        bubble.style.width = "48px";
        bubble.style.height = "60px";
        bubble.style.display = "flex";
        bubble.style.alignItems = "center";
        bubble.style.justifyContent = "center";

        element.append(caption, bubble);

        marker = new mapboxgl.Marker({
          element,
          anchor: "bottom",
        })
          .setLngLat(coordinate)
          .addTo(map);

        markers.set(key, marker);
      }

      marker.setLngLat(coordinate);

      const element = marker.getElement();
      const caption = element.querySelector<HTMLElement>(
        '[data-role="caption"]',
      );
      const bubble = element.querySelector<HTMLElement>(
        '[data-role="bubble"]',
      );

      if (!caption || !bubble) return;

      const isPickup = kind === "pickup";
      const selected = job.jobId === selectedJobId;

      caption.textContent = isPickup ? "Cliente" : "Destino";

      bubble.innerHTML = operationalPinSvg({
        kind: isPickup ? "customer" : "destination",
        key,
        selected,
      });

      caption.style.borderColor = isPickup
        ? "rgba(34,197,94,0.60)"
        : "rgba(239,68,68,0.60)";
      element.onclick = (event) => {
        event.stopPropagation();
        setSelectedJobId(job.jobId);
        setCustomerDetailsJobId(job.jobId);
      };

      element.onmouseenter = () => {
        const popup =
          jobHoverPopupRef.current ??
          new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 28,
          });

        jobHoverPopupRef.current = popup;

        const content = document.createElement("div");
        content.style.minWidth = "150px";
        content.style.maxWidth = "270px";

        const title = document.createElement("div");
        title.textContent = isPickup
          ? job.customerDisplayName || "Cliente"
          : "Destino";
        title.style.fontSize = "12px";
        title.style.fontWeight = "800";
        title.style.color = "#f8fafc";

        const detail = document.createElement("div");
        detail.textContent = isPickup
          ? job.originText
          : job.destinationText;
        detail.style.marginTop = "4px";
        detail.style.fontSize = "10px";
        detail.style.lineHeight = "1.35";
        detail.style.color = "#cbd5e1";

        content.append(title, detail);

        popup
          .setLngLat(coordinate)
          .setDOMContent(content)
          .addTo(map);

        const popupContent = popup
          .getElement()
          .querySelector(".mapboxgl-popup-content");

        if (popupContent instanceof HTMLElement) {
          popupContent.style.background = "rgba(15,23,42,0.97)";
          popupContent.style.border =
            "1px solid rgba(148,163,184,0.30)";
          popupContent.style.borderRadius = "12px";
          popupContent.style.padding = "10px 12px";
          popupContent.style.boxShadow =
            "0 14px 32px rgba(0,0,0,0.40)";
        }
      };

      element.onmouseleave = () => {
        jobHoverPopupRef.current?.remove();
      };
    };

    for (const job of operational.data?.jobs ?? []) {
      renderMarker(
        job,
        "pickup",
        jobCoordinate(job, "origin"),
      );

      renderMarker(
        job,
        "destination",
        jobCoordinate(job, "destination"),
      );
    }

    for (const [key, marker] of markers.entries()) {
      if (!visible.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    }
  }, [
    operational.data?.jobs,
    layers.pickups,
    layers.destinations,
    mapLoaded,
    selectedJobId,
  ]);
  const pointFeatures = useMemo(() => {
    const data = operational.data;
    if (!data) return [];
    const features: Array<Record<string, unknown>> = [];

    for (const job of data.jobs) {
      const origin = jobCoordinate(job, "origin");
      const destination = jobCoordinate(job, "destination");
      if (origin) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: origin },
          properties: {
            kind: "pickup",
            jobId: job.jobId,
            label: job.customerDisplayName || "Cliente",
            selected: job.jobId === selectedJobId,
          },
        });
        if (job.status === "incident") {
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: origin },
            properties: { kind: "incident", jobId: job.jobId },
          });
        }
      }
      if (destination) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: destination },
          properties: {
            kind: "destination",
            jobId: job.jobId,
            label: "Destino",
            selected: job.jobId === selectedJobId,
          },
        });
      }
    }

    return features;
  }, [operational.data, selectedJobId]);

  const routeFeatures = useMemo(() => {
    const jobs = operational.data?.jobs ?? [];
    const drivers = operational.data?.drivers ?? [];

    const activeJobIds = new Set(jobs.map((job) => job.jobId));

    return (routes.data ?? []).flatMap((route) => {
      if (!activeJobIds.has(route.jobId)) return [];

      const job = jobs.find((item) => item.jobId === route.jobId);
      if (!job) return [];

      const coordinates = decodePolyline(route.polyline);
      if (coordinates.length < 2) return [];

      let startAnchor: Coordinate | null = null;
      let endAnchor: Coordinate | null = null;

      if (route.segment === "pickup") {
        const driver = drivers.find(
          (item) =>
            item.driverUserId === job.driverUserId &&
            (!job.vehicleId || item.vehicleId === job.vehicleId),
        );

        startAnchor = driver ? driverCoordinate(driver) : null;
        endAnchor = jobCoordinate(job, "origin");
      } else {
        startAnchor = jobCoordinate(job, "origin");
        endAnchor = jobCoordinate(job, "destination");
      }

      const anchoredCoordinates = [...coordinates];

      if (
        startAnchor &&
        !coordinatesAlmostEqual(startAnchor, anchoredCoordinates[0])
      ) {
        anchoredCoordinates.unshift(startAnchor);
      }

      if (
        endAnchor &&
        !coordinatesAlmostEqual(
          endAnchor,
          anchoredCoordinates[anchoredCoordinates.length - 1],
        )
      ) {
        anchoredCoordinates.push(endAnchor);
      }

      return [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: anchoredCoordinates,
          },
          properties: {
            jobId: route.jobId,
            segment: route.segment,
            selected: route.jobId === selectedJobId,
          },
        },
      ];
    });
  }, [
    operational.data?.drivers,
    operational.data?.jobs,
    routes.data,
    selectedJobId,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;
    addOperationalLayers(map);

    const pointsSource = map.getSource(MAP_SOURCE_POINTS) as mapboxgl.GeoJSONSource | undefined;
    pointsSource?.setData({ type: "FeatureCollection", features: pointFeatures } as never);

    const routeSource = map.getSource(MAP_SOURCE_ROUTES) as mapboxgl.GeoJSONSource | undefined;
    routeSource?.setData({ type: "FeatureCollection", features: routeFeatures } as never);
  }, [pointFeatures, routeFeatures, mapConfig.data, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;
    setLayerVisibility(map, MAP_LAYERS.driversFresh, layers.drivers);
    setLayerVisibility(map, MAP_LAYERS.driversStale, layers.drivers);
    setLayerVisibility(map, MAP_LAYERS.routesPickup, layers.routes);
    setLayerVisibility(map, MAP_LAYERS.routesPickupSelected, layers.routes);
    setLayerVisibility(map, MAP_LAYERS.routes, layers.routes);
    setLayerVisibility(map, MAP_LAYERS.routesSelected, layers.routes);
    setLayerVisibility(map, MAP_LAYERS.incidents, layers.incidents);
  }, [layers, pointFeatures, routeFeatures, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    const interactiveLayers = [
      MAP_LAYERS.incidents,
    ];

    const selectPoint = (event: mapboxgl.MapLayerMouseEvent) => {
      const rawJobId = event.features?.[0]?.properties?.jobId;
      const jobId = rawJobId == null ? "" : String(rawJobId);

      if (jobId) {
        setSelectedJobId(jobId);
        setCustomerDetailsJobId(jobId);
      }
    };

    const showPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    for (const layer of interactiveLayers) {
      map.on("click", layer, selectPoint);
      map.on("mouseenter", layer, showPointer);
      map.on("mouseleave", layer, clearPointer);
    }

    return () => {
      for (const layer of interactiveLayers) {
        map.off("click", layer, selectPoint);
        map.off("mouseenter", layer, showPointer);
        map.off("mouseleave", layer, clearPointer);
      }
    };
  }, [mapLoaded]);

  const focusJob = useCallback(
    (job: MarketplaceOperationalJob | null) => {
      const map = mapRef.current;
      if (!map || !job) return;

      const bounds = new mapboxgl.LngLatBounds();
      const origin = jobCoordinate(job, "origin");
      const destination = jobCoordinate(job, "destination");
      if (origin) bounds.extend(origin);
      if (destination) bounds.extend(destination);

      const driver = operational.data?.drivers.find(
        (item) => item.driverUserId === job.driverUserId,
      );
      const driverPoint = driver ? driverCoordinate(driver) : null;
      if (driverPoint) bounds.extend(driverPoint);

      const jobRoutes =
        routes.data?.filter((item) => item.jobId === job.jobId) ?? [];

      for (const route of jobRoutes) {
        for (const coordinate of decodePolyline(route.polyline)) {
          bounds.extend(coordinate);
        }
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: expanded ? 90 : 60,
          maxZoom: 15,
          duration: 550,
        });
      }
    },
    [expanded, operational.data?.drivers, routes.data],
  );

  useEffect(() => {
    focusJob(selectedJob);
  }, [selectedJob, focusJob]);

  if (operational.isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[26px] border border-border/60 bg-background/35">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (operational.isError || !operational.data) {
    return (
      <div className="rounded-[26px] border border-rose-500/20 bg-rose-500/[0.04] p-6">
        <p className="font-semibold text-foreground">Mapa operativo aún no disponible</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No pudimos recuperar la operación geográfica. Los demás módulos de Administración no se
          ven afectados.
        </p>
      </div>
    );
  }

  const data = operational.data;
  const operationalJobs = data.jobs;
  const liveAt = formatTime(data.serverTime);
  const rootClass = expanded
    ? "fixed inset-0 z-[100] overflow-hidden bg-background p-3 sm:p-4"
    : "";

  const customer = selectedCustomer.data?.customer ?? null;
  const customerPhone = customer?.whatsappPhone ?? null;
  const whatsappUrl = customerPhone
    ? `https://wa.me/${customerPhone.replace(/\D/g, "")}`
    : null;

  const selectedDriver =
    selectedJob?.driverUserId
      ? data.drivers.find(
          (driver) =>
            driver.driverUserId === selectedJob.driverUserId &&
            (!selectedJob.vehicleId ||
              driver.vehicleId === selectedJob.vehicleId),
        ) ?? null
      : null;

  const selectedDriverPoint = selectedDriver
    ? driverCoordinate(selectedDriver)
    : null;

  const selectedPickupRoute =
    selectedJob
      ? routes.data?.find(
          (route) =>
            route.jobId === selectedJob.jobId &&
            route.segment === "pickup",
        ) ?? null
      : null;

  const selectedTripRoute =
    selectedJob
      ? routes.data?.find(
          (route) =>
            route.jobId === selectedJob.jobId &&
            route.segment === "trip",
        ) ?? null
      : null;

  const selectedPhase = !selectedJob
    ? null
    : selectedJob.status === "published"
      ? "Esperando que un conductor tome el servicio"
      : ["accepted", "en_route", "pickup"].includes(selectedJob.status)
        ? selectedDriverPoint
          ? "Conductor en ruta hacia el cliente"
          : "Conductor asignado · esperando ubicación GPS"
        : selectedJob.status === "in_progress"
          ? "Cliente recogido · viaje hacia el destino"
          : selectedJob.status === "incident"
            ? "Servicio con incidencia activa"
            : statusLabel(selectedJob.status);

  const layerButton = (
    key: LayerKey,
    label: string,
    dotClass: string,
    activeClass: string,
  ) => (
    <button
      type="button"
      aria-pressed={layers[key]}
      onClick={() => setLayers((current) => ({ ...current, [key]: !current[key] }))}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold backdrop-blur-xl transition-all duration-200 ${
        layers[key]
          ? `${activeClass} shadow-[0_12px_30px_-18px_rgba(0,0,0,0.9)]`
          : "border-white/10 bg-background/25 text-muted-foreground opacity-65 hover:bg-background/40 hover:opacity-90"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full shadow-sm ${dotClass}`} />
      {label}
    </button>
  );

  return (
    <div className={rootClass}>

      <div
        className={`grid gap-4 ${
          expanded
            ? panelOpen
              ? "h-full grid-cols-[minmax(0,1fr)_300px]"
              : "h-full grid-cols-1"
            : panelOpen
              ? "items-start xl:grid-cols-[minmax(0,1fr)_284px]"
              : "items-start grid-cols-1"
        }`}
      >
        <section
          className={`flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-border/60 bg-background/35 ${
            expanded ? "h-full" : "self-start"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/55 px-3 py-2.5 xl:flex-nowrap">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 xl:flex-nowrap">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                EN VIVO · {liveAt}
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/[0.06] px-2.5 py-1.5 text-[10px] text-orange-200">
                Trabajando
                <strong className="text-foreground">{data.summary.workingDrivers}</strong>
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[10px] text-emerald-200">
                Con señal
                <strong className="text-foreground">
                  {data.summary.driversWithFreshLocation}
                </strong>
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.06] px-2.5 py-1.5 text-[10px] text-cyan-200">
                Servicios
                <strong className="text-foreground">{data.summary.activeJobs}</strong>
              </span>

              <span className="hidden text-[10px] text-muted-foreground 2xl:inline">
                {data.summary.activeJobs ? "Actualización cada 5 s" : "Actualización cada 15 s"}
              </span>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5 xl:flex-nowrap">
              <Button size="sm" variant="outline" onClick={() => setPanelOpen((value) => !value)}>
                {panelOpen ? (
                  <PanelRightClose className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <PanelRightOpen className="mr-2 h-3.5 w-3.5" />
                )}
                {panelOpen ? "Ocultar panel" : "Mostrar panel"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={operational.isFetching}
                onClick={() => void operational.refetch()}
              >
                <RefreshCw
                  className={`mr-2 h-3.5 w-3.5 ${operational.isFetching ? "animate-spin" : ""}`}
                />
                Actualizar
              </Button>

              <Button size="sm" variant="outline" onClick={() => setExpanded((value) => !value)}>
                {expanded ? (
                  <Minimize2 className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="mr-2 h-3.5 w-3.5" />
                )}
                {expanded ? "Salir de pantalla completa" : "Pantalla completa"}
              </Button>
            </div>
          </div>

          <div
            ref={mapViewportRef}
            style={
              !expanded && mapViewportHeight != null
                ? { height: `${mapViewportHeight}px` }
                : undefined
            }
            className={`relative overflow-hidden bg-muted/15 ${
              expanded ? "min-h-0 flex-1" : "min-h-[320px] flex-none"
            }`}
          >
            <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 rounded-[20px] border border-white/10 bg-background/35 p-2 shadow-[0_18px_48px_-22px_rgba(0,0,0,0.95)] backdrop-blur-xl">
              {layerButton(
                "drivers",
                "Conductores",
                "bg-orange-500",
                "border-orange-400/30 bg-orange-500/20 text-orange-100",
              )}
              {layerButton(
                "pickups",
                "Clientes",
                "bg-emerald-500",
                "border-emerald-400/30 bg-emerald-500/20 text-emerald-100",
              )}
              {layerButton(
                "destinations",
                "Destinos",
                "bg-red-500",
                "border-red-400/30 bg-red-500/20 text-red-100",
              )}
              {layerButton(
                "routes",
                "Rutas",
                "bg-cyan-600",
                "border-sky-400/30 bg-sky-500/20 text-sky-100",
              )}
              {layerButton(
                "incidents",
                "Incidencias",
                "bg-red-500",
                "border-red-400/30 bg-red-500/20 text-red-100",
              )}
            </div>

            {mapConfig.data ? (
              <>
                <div
                  ref={mapNodeRef}
                  className="absolute inset-0 h-full w-full"
                />

                {!mapLoaded ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/78 px-6 text-center backdrop-blur-sm">
                    <div className="rounded-[22px] border border-cyan-400/15 bg-background/70 px-6 py-5 shadow-[0_20px_60px_-38px_rgba(34,211,238,0.8)]">
                      {mapLoadError ? (
                        <>
                          <MapPin className="mx-auto h-7 w-7 text-amber-300" />

                          <p className="mt-3 text-sm font-semibold text-foreground">
                            El mapa necesita reintentarse
                          </p>

                          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                            {mapLoadError}
                          </p>

                          <Button
                            size="sm"
                            variant="outline"
                            className="pointer-events-auto mt-4"
                            onClick={() => {
                              mapInitRetryRef.current = 0;
                              setMapLoadError(null);
                              setMapInitNonce((value) => value + 1);
                            }}
                          >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            Reintentar mapa
                          </Button>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-cyan-300" />

                          <p className="mt-3 text-sm font-semibold text-foreground">
                            Cargando mapa operativo
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Preparando el mapa y ajustando el área visible…
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : mapConfig.isLoading ? (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : staticFallback.data ? (
              <img
                src={staticFallback.data.dataUrl}
                alt="Mapa operativo de TukTuk Marketplace"
                className="h-full min-h-[420px] w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
                <MapPin className="h-10 w-10 text-orange-300" />
                <p className="mt-3 font-semibold text-foreground">Mapa interactivo no disponible</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Los datos operativos siguen visibles en el panel lateral.
                </p>
              </div>
            )}
          </div>
        </section>

        {panelOpen ? (
          <aside
            className={`space-y-2.5 bg-transparent ${
              expanded ? "min-h-0 overflow-y-auto pr-1" : ""
            }`}
          >
            {selectedJob && customerDetailsJobId === selectedJob.jobId ? (
              <section className="rounded-[20px] border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-background/45 to-cyan-500/[0.03] p-3 shadow-[0_14px_34px_-26px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-200">
                      <UserRound className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                        Cliente del servicio
                      </p>

                      <h4 className="mt-0.5 truncate text-sm font-semibold text-foreground">
                        {customer?.displayName ||
                          selectedJob.customerDisplayName ||
                          "Cliente"}
                      </h4>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedCustomer.isLoading
                          ? "Consultando contacto…"
                          : customerPhone || "Contacto no disponible"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${
                      selectedJob.status === "incident"
                        ? "border-red-500/25 bg-red-500/[0.08] text-red-300"
                        : "border-cyan-500/20 bg-cyan-500/[0.07] text-cyan-300"
                    }`}
                  >
                    {statusLabel(selectedJob.status)}
                  </span>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-background/40 p-2.5">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selectedJob.originText}
                    </p>
                  </div>

                  <div className="mt-1.5 flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selectedJob.destinationText}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.055] px-2 py-1 text-[10px] font-medium text-cyan-200">
                      {formatDistance(selectedJob.estimatedDistanceKm)}
                    </span>

                    <span className="rounded-lg border border-violet-500/20 bg-violet-500/[0.055] px-2 py-1 text-[10px] font-medium text-violet-200">
                      {formatDuration(selectedJob.routeDurationSeconds)}
                    </span>

                    <VehicleModeBadge code={selectedJob.vehicleCategoryCode} />
                  </div>
                </div>

                <div className="mt-2.5 rounded-xl border border-orange-500/15 bg-orange-500/[0.04] px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-orange-300">
                    Conductor
                  </p>

                  <p className="mt-1 truncate text-xs font-medium text-foreground">
                    {selectedJob.driverDisplayName || "Pendiente de asignación"}
                    {selectedJob.vehicleName
                      ? ` · ${selectedJob.vehicleName}`
                      : ""}
                  </p>

                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {selectedJob.driverUserId
                      ? selectedDriverPoint
                        ? selectedDriver?.locationFresh
                          ? "Ubicación en vivo"
                          : "Mostrando última ubicación conocida"
                        : "Sin ubicación disponible del conductor"
                      : "Todavía sin conductor asignado"}
                  </p>
                </div>

                {selectedPhase ? (
                  <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-white/10 bg-background/35 px-3 py-2">
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                    <span className="text-[11px] font-medium text-foreground">
                      {selectedPhase}
                    </span>
                  </div>
                ) : null}

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.05] p-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-orange-300">
                      Chofer → cliente
                    </p>

                    <p className="mt-1 text-[11px] font-medium text-foreground">
                      {selectedPickupRoute
                        ? `${formatDistance(selectedPickupRoute.distanceKm)} · ${formatDuration(
                            selectedPickupRoute.durationSeconds,
                          )}`
                        : selectedJob.driverUserId
                          ? "Pendiente de GPS"
                          : "Pendiente de conductor"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-300">
                      Cliente → destino
                    </p>

                    <p className="mt-1 text-[11px] font-medium text-foreground">
                      {selectedTripRoute
                        ? `${formatDistance(selectedTripRoute.distanceKm)} · ${formatDuration(
                            selectedTripRoute.durationSeconds,
                          )}`
                        : `${formatDistance(selectedJob.estimatedDistanceKm)} · ${formatDuration(
                            selectedJob.routeDurationSeconds,
                          )}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!whatsappUrl}
                    onClick={() => {
                      if (whatsappUrl) {
                        window.open(
                          whatsappUrl,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }
                    }}
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                    WhatsApp
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!customerPhone}
                    onClick={() => {
                      if (customerPhone && navigator.clipboard) {
                        void navigator.clipboard.writeText(customerPhone);
                      }
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copiar
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !canViewCustomers ||
                      !selectedJob.customerId ||
                      !onOpenCustomer
                    }
                    onClick={() => {
                      if (selectedJob.customerId) {
                        setExpanded(false);
                        onOpenCustomer?.(selectedJob.customerId);
                      }
                    }}
                  >
                    Cliente 360
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!onOpenJob}
                    onClick={() => {
                      setExpanded(false);
                      onOpenJob?.(selectedJob.jobId);
                    }}
                  >
                    Ver servicio
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="rounded-[20px] border border-white/10 bg-background/38 p-3 shadow-[0_14px_34px_-26px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-cyan-300" />
                  <h4 className="text-sm font-semibold text-foreground">Servicios activos</h4>
                </div>
                <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/[0.08] px-2.5 py-1 text-sm font-semibold text-cyan-200">
                  {operationalJobs.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {operationalJobs.length ? (
                  operationalJobs.slice(0, 12).map((job) => {
                    const selected = job.jobId === selectedJobId;
                    return (
                      <button
                        type="button"
                        key={job.jobId}
                        onClick={() => {
                          setSelectedJobId(job.jobId);
                          setCustomerDetailsJobId(job.jobId);
                          focusJob(job);
                        }}
                        className={`w-full rounded-2xl border p-3 text-left transition ${
                          selected
                            ? "border-cyan-400/45 bg-cyan-500/[0.08] shadow-sm"
                            : "border-white/10 bg-background/40 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md hover:border-cyan-400/30 hover:bg-background/55"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              job.status === "incident"
                                ? "border-red-500/25 bg-red-500/[0.08] text-red-300"
                                : "border-cyan-500/20 bg-cyan-500/[0.07] text-cyan-300"
                            }`}
                          >
                            {statusLabel(job.status)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              {job.serviceCode}
                            </span>
                            <VehicleModeBadge code={job.vehicleCategoryCode} />
                          </div>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {job.customerDisplayName || "Cliente"}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {job.originText} → {job.destinationText}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.055] px-2.5 py-1 text-[11px] font-medium text-cyan-200">
                            {formatDistance(job.estimatedDistanceKm)}
                          </span>
                          <span className="rounded-lg border border-violet-500/20 bg-violet-500/[0.055] px-2.5 py-1 text-[11px] font-medium text-violet-200">
                            {formatDuration(job.routeDurationSeconds)}
                          </span>
                        </div>
                        {job.driverDisplayName ? (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Navigation className="h-3.5 w-3.5 text-orange-300" />
                            {job.driverDisplayName}
                          </p>
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="rounded-2xl border border-dashed border-border/55 p-4 text-sm text-muted-foreground">
                    No hay servicios activos ahora.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[20px] border border-white/10 bg-background/38 p-3 shadow-[0_14px_34px_-26px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-300" />
                <h4 className="text-sm font-semibold text-foreground">Conductores</h4>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.055] px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-300">
                    Trabajando
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {data.summary.workingDrivers}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-background/35 px-3 py-2.5 backdrop-blur-md">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Descansando
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {data.summary.inactiveDrivers}
                  </p>
                </div>
              </div>

              <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]">
                {data.drivers.length ? (
                  data.drivers.map((driver) => {
                    const hasLastPosition = driverCoordinate(driver) != null;
                    return (
                      <div
                        key={driver.driverUserId}
                        className="rounded-xl border border-white/10 bg-background/38 px-3 py-2.5 shadow-[0_10px_28px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <DriverAvatar
                            name={driver.driverDisplayName}
                            url={driverAvatars.data?.[driver.driverUserId]?.avatarUrl ?? null}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 text-sm font-semibold leading-tight text-foreground">
                                {driver.driverDisplayName || "Conductor"}
                              </p>

                              <span
                                className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                                  driver.locationFresh
                                    ? "bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.75)]"
                                    : hasLastPosition
                                      ? "bg-amber-400"
                                      : "bg-muted-foreground/40"
                                }`}
                                title={
                                  driver.locationFresh
                                    ? "Ubicación en línea"
                                    : signalAgeLabel(driver.capturedAt, data.serverTime)
                                }
                              />
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                              <VehicleModeIcon
                                code={driver.vehicleCategoryCode}
                                className="h-3.5 w-3.5 shrink-0 text-orange-300"
                              />
                              <span className="font-medium text-orange-200">
                                {vehicleCategoryLabel(driver.vehicleCategoryCode)}
                              </span>
                              <span className="text-muted-foreground/60">·</span>
                              <span className="min-w-0 break-words">
                                {driver.vehicleName || driver.vehicleId}
                              </span>
                            </div>

                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {driver.activeJobId ? (
                                <span className="inline-flex rounded-full border border-cyan-500/25 bg-cyan-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                                  En servicio · {statusLabel(driver.activeJobStatus)}
                                </span>
                              ) : driver.acceptingJobs ? (
                                <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                  {driver.isAvailable ? "Trabajando · disponible" : "Trabajando"}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-white/10 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Descansando
                                </span>
                              )}

                              {!driver.locationFresh ? (
                                <span
                                  className={`text-[10px] ${
                                    hasLastPosition ? "text-amber-300" : "text-muted-foreground"
                                  }`}
                                >
                                  {signalAgeLabel(driver.capturedAt, data.serverTime)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay conductores activos.
                  </p>
                )}
              </div>
            </section>

            {selectedJob?.status === "incident" ? (
              <section className="rounded-[24px] border border-red-500/25 bg-red-500/[0.05] p-4">
                <div className="flex items-center gap-2 text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  <h4 className="font-semibold">Incidencia activa</h4>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  El servicio seleccionado tiene una incidencia sin resolver y permanece visible en
                  el centro de operaciones.
                </p>
              </section>
            ) : null}

            <section className="rounded-[20px] border border-white/10 bg-background/38 p-3 shadow-[0_14px_34px_-26px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-cyan-300" />
                <h4 className="text-sm font-semibold text-foreground">Leyenda</h4>
              </div>
              <div className="mt-3 space-y-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <OperationalPinLegend
                    kind="driver"
                    vehicleCategoryCode="tricycle"
                  />
                  <span>Conductor con señal reciente</span>
                </div>
                <div className="flex items-center gap-2">
                  <OperationalPinLegend
                    kind="driver"
                    stale
                    vehicleCategoryCode="tricycle"
                  />
                  <span>Última ubicación conocida</span>
                </div>
                <div className="flex items-center gap-2">
                  <OperationalPinLegend kind="customer" />
                  <span>Cliente</span>
                </div>
                <div className="flex items-center gap-2">
                  <OperationalPinLegend kind="destination" />
                  <span>Destino</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-7 border-t-2 border-dashed border-orange-500" />
                  <span>Chofer → cliente</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-7 border-t-2 border-emerald-400" />
                  <span>Cliente → destino</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span>Incidencia</span>
                </div>
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
