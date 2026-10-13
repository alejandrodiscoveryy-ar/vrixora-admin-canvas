import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMarketplaceOperationalMapConfig } from "@/lib/marketplace-map";

export interface TestPoint {
  lat: number;
  lon: number;
  label: string;
}
interface Props {
  projectId: string;
  origin: TestPoint | null;
  destination: TestPoint | null;
  route: Array<{ lat: number; lon: number }>;
  picking: "origin" | "destination" | null;
  onPick: (kind: "origin" | "destination", lat: number, lon: number) => void;
}
const sourceId = "test-lab-route-source";
const layerId = "test-lab-route-layer";

export default function MarketplaceTestRouteMap({
  projectId,
  origin,
  destination,
  route,
  picking,
  onPick,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pins = useRef<mapboxgl.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const originRef = useRef(origin);
  const destinationRef = useRef(destination);
  const pickingRef = useRef(picking);
  const pickRef = useRef(onPick);
  originRef.current = origin;
  destinationRef.current = destination;
  pickingRef.current = picking;
  pickRef.current = onPick;

  useEffect(() => {
    if (!mount.current) return;
    let disposed = false;
    let created: mapboxgl.Map | null = null;
    setReady(false);
    setError(null);
    void getMarketplaceOperationalMapConfig(projectId)
      .then((config) => {
        if (disposed || !mount.current) return;
        if (!config.accessToken.startsWith("pk.")) throw Error("MAP_PUBLIC_CREDENTIAL_UNSAFE");
        mapboxgl.accessToken = config.accessToken;
        const style = config.mapStyle.startsWith("mapbox://styles/")
          ? config.mapStyle
          : `mapbox://styles/${config.mapStyle}`;
        created = new mapboxgl.Map({
          container: mount.current,
          style,
          center: [-82.3666, 23.1136],
          zoom: 11,
          attributionControl: false,
        });
        map.current = created;
        created.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        created.addControl(new mapboxgl.AttributionControl({ compact: true }));
        created.on("load", () => {
          if (!disposed) setReady(true);
        });
        created.on("click", (event) => {
          const kind = pickingRef.current;
          if (kind) pickRef.current(kind, event.lngLat.lat, event.lngLat.lng);
        });
        created.on("error", (event) => {
          if (!disposed) setError(event.error?.message ?? "No se pudo mostrar el mapa.");
        });
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "Mapa no disponible.");
      });
    return () => {
      disposed = true;
      pins.current.forEach((m) => m.remove());
      pins.current = [];
      created?.remove();
      map.current = null;
    };
  }, [projectId]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    pins.current.forEach((p) => p.remove());
    pins.current = [];
    for (const [kind, point, color] of [
      ["origin", origin, "#34d399"],
      ["destination", destination, "#22d3ee"],
    ] as const) {
      if (!point) continue;
      const marker = new mapboxgl.Marker({ color, draggable: true })
        .setLngLat([point.lon, point.lat])
        .addTo(m);
      marker.getElement().title =
        kind === "origin" ? "Origen: arrastra para ajustar" : "Destino: arrastra para ajustar";
      marker.on("dragend", () => {
        const c = marker.getLngLat();
        pickRef.current(kind, c.lat, c.lng);
      });
      pins.current.push(marker);
    }
    const points = [origin, destination].filter((x): x is TestPoint => x !== null);
    if (points.length === 2) {
      const bounds = new mapboxgl.LngLatBounds(
        [points[0].lon, points[0].lat],
        [points[1].lon, points[1].lat],
      );
      m.fitBounds(bounds, { padding: 62, maxZoom: 14, duration: 350 });
    } else if (points.length === 1)
      m.easeTo({ center: [points[0].lon, points[0].lat], zoom: 13, duration: 250 });
  }, [origin, destination, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const update = () => {
      if (!m.getSource(sourceId)) {
        m.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [] },
            properties: {},
          },
        });
      }
      if (!m.getLayer(layerId))
        m.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          paint: { "line-color": "#67e8f9", "line-width": 5, "line-opacity": 0.9 },
        });
      const coords = route
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => [p.lon, p.lat]);
      const source = m.getSource(sourceId) as mapboxgl.GeoJSONSource;
      source.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords.length >= 2 ? coords : [] },
        properties: {},
      });
    };
    if (m.isStyleLoaded()) update();
    else m.once("style.load", update);
  }, [route, ready]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/80">
      <div
        ref={mount}
        className={`h-60 w-full sm:h-72 ${picking ? "cursor-crosshair" : ""}`}
        role="application"
        aria-label="Mapa de selección del recorrido de prueba"
      />
      {picking && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-cyan-300/40 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-cyan-100">
          Pulsa en el mapa para marcar {picking === "origin" ? "origen" : "destino"}
        </div>
      )}
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60 text-sm text-slate-200">
          Cargando mapa…
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-3 rounded-lg border border-rose-400/40 bg-slate-950/95 p-3 text-xs text-rose-200"
        >
          Mapa no disponible: {error}
        </div>
      )}
    </div>
  );
}
