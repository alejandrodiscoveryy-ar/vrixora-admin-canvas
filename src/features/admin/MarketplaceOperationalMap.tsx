import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl, { type CircleLayerSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  AlertTriangle,
  Bike,
  Boxes,
  CarFront,
  Clock3,
  MapPin,
  Package,
  Maximize2,
  Minimize2,
  Navigation,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Route,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
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
  routes: "tuktuk-live-routes-layer",
  routesSelected: "tuktuk-live-routes-selected-layer",
  driversFresh: "tuktuk-live-drivers-fresh-layer",
  driversStale: "tuktuk-live-drivers-stale-layer",
  pickups: "tuktuk-live-pickups-layer",
  destinations: "tuktuk-live-destinations-layer",
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
    published: "Publicado",
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

const vehicleMapGlyph = (code: string | null) =>
  ({
    motorcycle: "\u{1F3CD}\uFE0F",
    bicitaxi: "\u{1F6B2}",
    tricycle: "\u{1F6FA}",
    light_car: "\u{1F697}",
    van: "\u{1F690}",
    truck: "\u{1F69A}",
    other: "\u{1F4E6}",
  })[code ?? ""] ?? "\u{1F698}";

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
    case "tricycle":
      return <Bike className={className} />;
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

  if (!map.getLayer(MAP_LAYERS.routes)) {
    map.addLayer({
      id: MAP_LAYERS.routes,
      type: "line",
      source: MAP_SOURCE_ROUTES,
      filter: ["!=", ["get", "selected"], true],
      paint: {
        "line-color": "#22d3ee",
        "line-width": 4,
        "line-opacity": 0.78,
      },
    });
  }

  if (!map.getLayer(MAP_LAYERS.routesSelected)) {
    map.addLayer({
      id: MAP_LAYERS.routesSelected,
      type: "line",
      source: MAP_SOURCE_ROUTES,
      filter: ["==", ["get", "selected"], true],
      paint: {
        "line-color": "#67e8f9",
        "line-width": 7,
        "line-opacity": 0.98,
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
  pointLayer(MAP_LAYERS.pickups, "pickup", "#22c55e", 7);
  pointLayer(MAP_LAYERS.destinations, "destination", "#22d3ee", 7);
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

export default function MarketplaceOperationalMap({ projectId }: { projectId: string }) {
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [expanded, setExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

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

  const routeKey = useMemo(() => {
    const jobs = operational.data?.jobs ?? [];
    return jobs
      .map(
        (job) =>
          `${job.jobId}:${job.originLat ?? "x"}:${job.originLon ?? "x"}:${job.destinationLat ?? "x"}:${job.destinationLon ?? "x"}`,
      )
      .sort()
      .join("|");
  }, [operational.data?.jobs]);

  const routes = useQuery({
    queryKey: ["marketplace-operational-routes-live", projectId, routeKey],
    queryFn: () => getMarketplaceOperationalRoutes(projectId),
    enabled: Boolean(routeKey),
    staleTime: 10 * 60_000,
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

  useEffect(() => {
    const node = mapNodeRef.current;
    const config = mapConfig.data;
    if (!node || !config || mapRef.current) return;

    mapboxgl.accessToken = config.accessToken;
    const map = new mapboxgl.Map({
      container: node,
      style: `mapbox://styles/${config.mapStyle}`,
      center: [-82.3666, 23.1136],
      zoom: 11,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    setMapLoaded(false);
    map.on("load", () => {
      addOperationalLayers(map);
      setMapLoaded(true);
    });
    mapRef.current = map;

    return () => {
      setMapLoaded(false);
      for (const marker of driverMarkersRef.current.values()) marker.remove();
      driverMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [mapConfig.data]);

  useEffect(() => {
    const map = mapRef.current;
    const node = mapNodeRef.current;
    if (!map || !node) return;

    let frame = 0;
    const resize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.resize());
    };

    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
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
          element.style.width = "36px";
          element.style.height = "36px";
          element.style.display = "flex";
          element.style.alignItems = "center";
          element.style.justifyContent = "center";
          element.style.borderRadius = "9999px";
          element.style.borderWidth = "2px";
          element.style.borderStyle = "solid";
          element.style.fontSize = "19px";
          element.style.lineHeight = "1";
          element.style.userSelect = "none";
          element.style.pointerEvents = "none";

          marker = new mapboxgl.Marker({ element, anchor: "center" })
            .setLngLat(coordinate)
            .addTo(map);
          markers.set(driver.driverUserId, marker);
        }

        marker.setLngLat(coordinate);
        const element = marker.getElement();
        element.textContent = vehicleMapGlyph(driver.vehicleCategoryCode);
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
        element.style.backgroundColor = driver.locationFresh
          ? "rgba(249,115,22,0.96)"
          : "rgba(251,191,36,0.94)";
        element.style.borderColor = driver.activeJobId ? "#22d3ee" : "rgba(255,255,255,0.92)";
        element.style.boxShadow = driver.activeJobId
          ? "0 0 0 3px rgba(34,211,238,0.22), 0 6px 18px rgba(0,0,0,0.38)"
          : "0 6px 18px rgba(0,0,0,0.38)";
      }
    }

    for (const [driverUserId, marker] of markers.entries()) {
      if (!visible.has(driverUserId)) {
        marker.remove();
        markers.delete(driverUserId);
      }
    }
  }, [operational.data?.drivers, layers.drivers, mapLoaded]);

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
          properties: { kind: "pickup", jobId: job.jobId, selected: job.jobId === selectedJobId },
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
            selected: job.jobId === selectedJobId,
          },
        });
      }
    }

    return features;
  }, [operational.data, selectedJobId]);

  const routeFeatures = useMemo(() => {
    return (routes.data ?? []).flatMap((route) => {
      const coordinates = decodePolyline(route.polyline);
      if (coordinates.length < 2) return [];
      return [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: {
            jobId: route.jobId,
            selected: route.jobId === selectedJobId,
          },
        },
      ];
    });
  }, [routes.data, selectedJobId]);

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
    setLayerVisibility(map, MAP_LAYERS.pickups, layers.pickups);
    setLayerVisibility(map, MAP_LAYERS.destinations, layers.destinations);
    setLayerVisibility(map, MAP_LAYERS.routes, layers.routes);
    setLayerVisibility(map, MAP_LAYERS.routesSelected, layers.routes);
    setLayerVisibility(map, MAP_LAYERS.incidents, layers.incidents);
  }, [layers, pointFeatures, routeFeatures, mapLoaded]);

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

      const route = routes.data?.find((item) => item.jobId === job.jobId);
      if (route) {
        for (const coordinate of decodePolyline(route.polyline)) bounds.extend(coordinate);
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
  const runningJobs = data.jobs.filter((job) => job.status !== "published");
  const liveAt = formatTime(data.serverTime);
  const rootClass = expanded
    ? "fixed inset-0 z-[100] overflow-hidden bg-background p-3 sm:p-4"
    : "space-y-4";

  const layerButton = (key: LayerKey, label: string, dotClass: string) => (
    <button
      type="button"
      aria-pressed={layers[key]}
      onClick={() => setLayers((current) => ({ ...current, [key]: !current[key] }))}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
        layers[key]
          ? "border-border/70 bg-background/90 text-foreground shadow-sm"
          : "border-border/40 bg-background/45 text-muted-foreground opacity-60"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      {label}
    </button>
  );

  return (
    <div className={rootClass}>
      {!expanded ? (
        <section className="relative overflow-hidden rounded-[28px] border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.08] via-background/70 to-emerald-500/[0.045] p-5 shadow-[0_24px_70px_-46px_rgba(249,115,22,0.75)] sm:p-6">
          <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-300">
                Centro de operaciones en vivo
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Mapa operativo
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Conductores, recogidas, destinos, rutas e incidencias de los servicios activos.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:min-w-[390px]">
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.055] px-3 py-3">
                <p className="text-[10px] text-muted-foreground">Trabajando</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {data.summary.workingDrivers}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.055] px-3 py-3">
                <p className="text-[10px] text-muted-foreground">Con señal</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {data.summary.driversWithFreshLocation}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] px-3 py-3">
                <p className="text-[10px] text-muted-foreground">Servicios</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {data.summary.activeJobs}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div
        className={`grid gap-4 ${
          expanded
            ? panelOpen
              ? "h-full grid-cols-[minmax(0,1fr)_360px]"
              : "h-full grid-cols-1"
            : "xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]"
        }`}
      >
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-border/60 bg-background/35">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/55 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.055] px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                EN VIVO · {liveAt}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {data.summary.activeJobs ? "Actualización cada 5 s" : "Actualización cada 15 s"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {expanded ? (
                <Button size="sm" variant="outline" onClick={() => setPanelOpen((value) => !value)}>
                  {panelOpen ? (
                    <PanelRightClose className="mr-2 h-3.5 w-3.5" />
                  ) : (
                    <PanelRightOpen className="mr-2 h-3.5 w-3.5" />
                  )}
                  {panelOpen ? "Ocultar panel" : "Mostrar panel"}
                </Button>
              ) : null}

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

          <div className={`relative min-h-[420px] flex-1 bg-muted/15 ${expanded ? "min-h-0" : ""}`}>
            <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 rounded-2xl border border-border/60 bg-background/80 p-2 shadow-lg backdrop-blur">
              {layerButton("drivers", "Conductores", "bg-orange-500")}
              {layerButton("pickups", "Recogidas", "bg-emerald-500")}
              {layerButton("destinations", "Destinos", "bg-cyan-400")}
              {layerButton("routes", "Rutas", "bg-cyan-600")}
              {layerButton("incidents", "Incidencias", "bg-red-500")}
            </div>

            {mapConfig.data ? (
              <div
                ref={mapNodeRef}
                className={`absolute inset-0 w-full ${expanded ? "h-full min-h-0" : "min-h-[420px]"}`}
              />
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

          {!expanded ? (
            <div className="border-t border-border/55 px-4 py-3 text-xs text-muted-foreground">
              Naranja: conductor con señal reciente. Ambar: ultima ubicacion conocida con señal
              atrasada. Verde: recogida. Cian: destino y recorrido. Rojo: incidencia. Las capas se
              pueden activar o desactivar sin alterar la operacion.
            </div>
          ) : null}
        </section>

        {!expanded || panelOpen ? (
          <aside className={`space-y-4 ${expanded ? "min-h-0 overflow-y-auto pr-1" : ""}`}>
            <section className="rounded-[24px] border border-border/60 bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-cyan-300" />
                  <h4 className="font-semibold text-foreground">Servicios en curso</h4>
                </div>
                <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/[0.08] px-2.5 py-1 text-sm font-semibold text-cyan-200">
                  {runningJobs.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {runningJobs.length ? (
                  runningJobs.slice(0, 12).map((job) => {
                    const selected = job.jobId === selectedJobId;
                    return (
                      <button
                        type="button"
                        key={job.jobId}
                        onClick={() => {
                          setSelectedJobId(job.jobId);
                          focusJob(job);
                        }}
                        className={`w-full rounded-2xl border p-3 text-left transition ${
                          selected
                            ? "border-cyan-400/45 bg-cyan-500/[0.08] shadow-sm"
                            : "border-border/55 bg-background/55 hover:border-cyan-500/25"
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

            <section className="rounded-[24px] border border-border/60 bg-background/40 p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-300" />
                <h4 className="font-semibold text-foreground">Conductores</h4>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.055] px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-300">
                    Activos
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {data.summary.workingDrivers}
                  </p>
                </div>
                <div className="rounded-xl border border-border/55 bg-background/45 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Inactivos
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {data.summary.inactiveDrivers}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {data.drivers.length ? (
                  data.drivers.slice(0, 14).map((driver) => {
                    const hasLastPosition = driverCoordinate(driver) != null;
                    return (
                      <div
                        key={driver.driverUserId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {driver.driverDisplayName || "Conductor"}
                          </p>
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <VehicleModeIcon
                              code={driver.vehicleCategoryCode}
                              className="h-3.5 w-3.5 shrink-0 text-orange-300"
                            />
                            <span className="shrink-0 font-medium text-orange-200">
                              {vehicleCategoryLabel(driver.vehicleCategoryCode)}
                            </span>
                            <span className="truncate">
                              - {driver.vehicleName || driver.vehicleId}
                            </span>
                          </div>
                          {driver.activeJobId ? (
                            <p className="mt-1 text-[10px] font-semibold text-cyan-300">
                              Servicio activo · {statusLabel(driver.activeJobStatus)}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${
                              driver.locationFresh
                                ? "bg-orange-500"
                                : hasLastPosition
                                  ? "bg-amber-400"
                                  : "bg-muted-foreground/40"
                            }`}
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {driver.locationFresh
                              ? `Señal reciente · ${formatTime(driver.capturedAt)}`
                              : signalAgeLabel(driver.capturedAt, data.serverTime)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay conductores en modo Trabajando.
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

            {expanded ? (
              <section className="rounded-[24px] border border-border/60 bg-background/40 p-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-cyan-300" />
                  <h4 className="font-semibold text-foreground">Leyenda</h4>
                </div>
                <div className="mt-3 space-y-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                    <span>Conductor con señal reciente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span>Ultima ubicacion conocida</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span>Recogida</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                    <span>Destino</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-600" />
                    <span>Ruta del servicio</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span>Incidencia</span>
                  </div>
                </div>
                <p className="mt-3 border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  El icono dentro del marcador identifica la modalidad del vehiculo. Los botones
                  sobre el mapa permiten mostrar u ocultar cada capa sin alterar la operacion.
                </p>
              </section>
            ) : null}
            <section className="rounded-[24px] border border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Clock3 className="h-4 w-4 text-emerald-300" />
                <span className="font-semibold">Seguimiento operativo</span>
              </div>
              <p className="mt-2 leading-relaxed">
                Durante un servicio activo, la posición del conductor se considera reciente durante
                2 minutos. Si la señal se retrasa, conservamos temporalmente la última ubicación
                conocida para que la pérdida de señal sea visible y comprensible.
              </p>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
