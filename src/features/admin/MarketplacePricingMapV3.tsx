import { useEffect, useRef, useState } from "react";
import { MapPin, Route, RefreshCw, Pencil, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./MarketplacePricingMapV3.css";
import { getSupabaseClient } from "@/lib/supabase";
import type { MarketplacePricingTariff } from "@/lib/services";
import MarketplaceTestRouteMap, { type TestPoint } from "./MarketplaceTestRouteMap";

type ServiceCode = "passenger" | "cargo" | "courier";
type Breakdown = {
  adjustments?: Array<{ name?: string; applied_amount_usd?: number }>;
  components_usd?: { structural_subtotal?: number };
  rounding_increment?: number;
};
export type PricingMapQuote = {
  recommended_price?: number;
  currency?: string;
  exchange_rate_snapshot?: number;
  pricing_breakdown?: Breakdown;
};
export interface PricingRouteScenario {
  serviceCode: ServiceCode;
  distanceKm: number;
  durationSeconds: number;
  quotes: Record<string, PricingMapQuote>;
}

const names: Record<string, string> = {
  bicitaxi: "Bicitaxi", motorcycle: "Motocicleta", tricycle: "Triciclo",
  light_car: "Auto ligero", van: "Furgoneta", truck: "Camión", other: "Otro",
};

interface Props {
  projectId: string;
  serviceCode: ServiceCode;
  tariffs: MarketplacePricingTariff[];
  canManage: boolean;
  onEditTariff: (code: string) => void;
  onScenarioChange: (scenario: PricingRouteScenario | null) => void;
}

export default function MarketplacePricingMapV3({
  projectId, serviceCode, tariffs, canManage, onEditTariff, onScenarioChange,
}: Props) {
  const [origin, setOrigin] = useState<TestPoint | null>(null);
  const [destination, setDestination] = useState<TestPoint | null>(null);
  const [picking, setPicking] = useState<"origin" | "destination" | null>("origin");
  const [routePoints, setRoutePoints] = useState<Array<{ lat: number; lon: number }>>([]);
  const [scenario, setScenario] = useState<PricingRouteScenario | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const tariffsForService = tariffs.filter((t) => t.serviceCode === serviceCode);
  const tariffFingerprint = tariffsForService
    .map((t) => `${t.vehicleCategoryCode}:${t.updatedAt}:${t.basePriceUsd}:${t.perKmPriceUsd}`)
    .sort().join("|");
  const tariffRef = useRef(tariffsForService);
  tariffRef.current = tariffsForService;
  const callbackRef = useRef(onScenarioChange);
  callbackRef.current = onScenarioChange;

  function selectPoint(kind: "origin" | "destination", lat: number, lon: number) {
    const point = { lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
    if (kind === "origin") {
      setOrigin(point);
      setPicking("destination");
    } else {
      setDestination(point);
      setPicking(null);
    }
  }

  useEffect(() => {
    const serial = ++requestRef.current;
    setScenario(null);
    setRoutePoints([]);
    setError(null);
    callbackRef.current(null);
    setLoading(false);
    if (!origin || !destination) return;
    const timer = setTimeout(() => {
      const calculate = async () => {
        setLoading(true);
        try {
          const { data, error: routeError } = await getSupabaseClient().functions.invoke(
            "marketplace-map-gateway",
            {
              body: {
                operation: "route_quote",
                origin: { lat: origin.lat, lon: origin.lon },
                destination: { lat: destination.lat, lon: destination.lon },
                pricing: { vehicle_category_code: "tricycle", passenger_count: 1, stop_count: 0 },
              },
            },
          );
          if (routeError || data?.error) throw new Error(routeError?.message ?? String(data?.error));
          const payload = data?.data;
          const distance = Number(payload?.distance_km);
          const duration = Number(payload?.duration_seconds);
          if (!Number.isFinite(distance) || distance <= 0 || distance > 5000 || !Number.isFinite(duration) || duration <= 0) {
            throw new Error("La ruta no devolvió una distancia válida.");
          }
          let quotes: Record<string, PricingMapQuote> = {};
          if (serviceCode === "passenger") {
            quotes = payload?.prices?.passenger_by_category ?? {};
          } else {
            const entries = await Promise.all(tariffRef.current.map(async (tariff) => {
              const { data: quote, error: quoteError } = await getSupabaseClient().rpc(
                "admin_preview_marketplace_quote_lab_v2",
                {
                  target_service_code: serviceCode,
                  target_vehicle_category_code: tariff.vehicleCategoryCode,
                  target_passenger_count: 1,
                  target_distance_km: distance,
                  target_stop_count: 0,
                  target_scheduled_for: null,
                },
              );
              if (quoteError) throw new Error(quoteError.message);
              return [tariff.vehicleCategoryCode, quote as PricingMapQuote] as const;
            }));
            quotes = Object.fromEntries(entries);
          }
          if (serial !== requestRef.current) return;
          const next = { serviceCode, distanceKm: distance, durationSeconds: duration, quotes };
          setScenario(next);
          setRoutePoints(Array.isArray(payload?.route_points) ? payload.route_points : []);
          callbackRef.current(next);
        } catch (cause) {
          if (serial === requestRef.current) setError(cause instanceof Error ? cause.message : "No se pudo calcular la ruta.");
        } finally {
          if (serial === requestRef.current) setLoading(false);
        }
      };
      void calculate();
    }, 350);
    return () => { clearTimeout(timer); requestRef.current += 1; };
  // Se recalcula cuando cambian los pines, servicio o tarifas publicadas.
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon, serviceCode, tariffFingerprint]);

  return (
    <section aria-label="Simulador cartográfico de tarifas" className="tuktuk-price-map-v3 rounded-2xl border border-slate-400/45 p-3 shadow-lg sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">Mapa de tarifas</h3>
          <p className="text-xs text-muted-foreground">Marca salida y destino. La ruta y los precios se calculan automáticamente.</p>
        </div>
        <span className="rounded-full border border-slate-500/35 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-100">Prueba sin crear carreras</span>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <Button variant={picking === "origin" ? "default" : "outline"} type="button" onClick={() => setPicking("origin")}
          className="tuktuk-price-map-v3-point h-11 justify-start border-slate-400/65 text-left text-sm text-white hover:border-cyan-300">
          <MapPin className="mr-2 h-4 w-4 text-emerald-400" />
          {origin ? `Salida: ${origin.label}` : "1. Marcar salida en el mapa"}
        </Button>
        <Button variant={picking === "destination" ? "default" : "outline"} type="button" onClick={() => setPicking("destination")}
          className="tuktuk-price-map-v3-point h-11 justify-start border-slate-400/65 text-left text-sm text-white hover:border-cyan-300">
          <MapPin className="mr-2 h-4 w-4 text-cyan-400" />
          {destination ? `Destino: ${destination.label}` : "2. Marcar destino en el mapa"}
        </Button>
      </div>
      <MarketplaceTestRouteMap
        projectId={projectId}
        origin={origin} destination={destination}
        route={routePoints} picking={picking} onPick={selectPoint}
      />
      <div className="tuktuk-price-map-v3-stats mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-400/50 px-3 py-3 text-sm text-white">
        <span className="flex items-center gap-1.5"><Route className="h-4 w-4" /> {scenario ? `${scenario.distanceKm.toFixed(2)} km` : "— km"}</span>
        <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" /> {scenario ? `${Math.ceil(scenario.durationSeconds / 60)} min` : "— min"}</span>
        {loading && <span className="flex items-center gap-1.5 text-cyan-300"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Recalculando…</span>}
      </div>
      {error && <p role="alert" className="mt-2 rounded-lg border border-rose-400/35 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {scenario && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {tariffsForService.map((tariff) => {
            const quote = scenario.quotes[tariff.vehicleCategoryCode];
            const price = Number(quote?.recommended_price);
            const available = quote?.currency === "CUP" && Number.isFinite(price) && price > 0;
            return (
              <button key={tariff.vehicleCategoryCode} type="button"
                disabled={!canManage || !available}
                onClick={() => onEditTariff(tariff.vehicleCategoryCode)}
                className="tuktuk-price-map-v3-price group rounded-xl border border-slate-400/50 p-3 text-left transition hover:border-cyan-300 disabled:cursor-default disabled:opacity-65">
                <span className="text-xs font-semibold text-slate-200">{names[tariff.vehicleCategoryCode] ?? tariff.vehicleCategoryCode}</span>
                <div className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {available ? `${price.toLocaleString("es-CU")} CUP` : "Sin cotización"}
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-300"><Pencil className="h-3.5 w-3.5" /> {canManage ? "Editar esta tarifa" : "Solo lectura"}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">El recorrido utiliza el servicio de mapas existente. Las cotizaciones publicadas proceden del servidor. En carga y mensajería, las previsualizaciones por vehículo no incluyen recargos geográficos.</p>
    </section>
  );
}
