import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, RefreshCw, Route, Clock3, Users, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";
import type { MarketplacePricingTariff } from "@/lib/services";

type ServiceCode = "passenger" | "cargo" | "courier";

type PricingBreakdown = {
  components_usd?: {
    base?: number;
    distance?: number;
    extra_passengers?: number;
    stops?: number;
    structural_subtotal?: number;
  };
  dynamic_adjustment_applied_usd?: number;
  adjustments?: Array<{ name?: string; applied_amount_usd?: number }>;
  total_usd?: number;
  exchange_rate?: number;
  exchange_rate_fallback_used?: boolean;
};

type Quote = {
  recommended_price?: number;
  currency?: string;
  pricing_breakdown?: PricingBreakdown;
};

type QuoteResult = {
  code: string;
  name: string;
  priceCup: number | null;
  totalUsd: number | null;
  breakdown?: PricingBreakdown;
  error?: string;
};

const labels: Record<string, string> = {
  light_car: "Auto ligero",
  bicitaxi: "Bicitaxi",
  bicycle: "Bicicleta",
  motorcycle: "Motocicleta",
  tricycle: "Triciclo",
  van: "Furgoneta",
  truck: "Camión",
  other: "Otro",
};

function initialHavanaTime(): string {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Havana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (key: string) => dateParts.find((part) => part.type === key)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

function havanaDateTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal)) return null;
  const tz = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Havana",
    timeZoneName: "shortOffset",
  });
  let actual = nominal;
  for (let i = 0; i < 2; i++) {
    const offsetName = tz.formatToParts(new Date(actual)).find((part) => part.type === "timeZoneName")?.value;
    const found = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offsetName ?? "");
    if (!found) return null;
    const offsetMinutes = (found[1] === "+" ? 1 : -1) * (Number(found[2]) * 60 + Number(found[3] ?? "0"));
    actual = nominal - offsetMinutes * 60_000;
  }
  if (!Number.isFinite(actual)) return null;
  // Validar fecha civil y horario de Cuba: evita 30 de febrero y horas que no existen al cambiar DST.
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Havana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(actual));
  const local = (kind: string) => localParts.find((part) => part.type === kind)?.value ?? "";
  const normalized = `${local("year")}-${local("month")}-${local("day")}T${local("hour")}:${local("minute")}`;
  if (normalized !== value) return null;
  return new Date(actual).toISOString();
}

const money = (value: number, currency: "USD" | "CUP") =>
  new Intl.NumberFormat(currency === "CUP" ? "es-CU" : "en-US", {
    maximumFractionDigits: currency === "CUP" ? 0 : 2,
    minimumFractionDigits: currency === "CUP" ? 0 : 2,
  }).format(value) + ` ${currency}`;

export default function MarketplacePricingLaboratoryV2({
  serviceCode,
  tariffs,
  exchangeRate,
}: {
  serviceCode: ServiceCode;
  tariffs: MarketplacePricingTariff[];
  exchangeRate: number;
}) {
  const [distance, setDistance] = useState("5");
  const [passengers, setPassengers] = useState("1");
  const [stops, setStops] = useState("0");
  const [cubaTime, setCubaTime] = useState(initialHavanaTime);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<QuoteResult[]>([]);
  const [scenario, setScenario] = useState<string | null>(null);
  const requestSerial = useRef(0);

  const serviceTariffs = useMemo(
    () => tariffs.filter((tariff) => tariff.serviceCode === serviceCode),
    [tariffs, serviceCode],
  );
  // La simulación previa deja de mostrarse si se publica una nueva tarifa en esta pantalla.
  const tariffFingerprint = serviceTariffs
    .map((tariff) => [
      tariff.serviceCode,
      tariff.vehicleCategoryCode,
      tariff.updatedAt,
      tariff.basePriceUsd,
      tariff.minimumPriceUsd,
      tariff.perKmPriceUsd,
      tariff.perExtraPassengerPriceUsd,
      tariff.perStopPriceUsd,
    ].join("|"))
    .sort()
    .join(";");

  useEffect(() => {
    requestSerial.current += 1;
    setIsLoading(false);
    setResults([]);
    setError(null);
    setScenario(null);
  }, [serviceCode, distance, passengers, stops, cubaTime, tariffFingerprint, exchangeRate]);

  const run = async () => {
    const km = Number(distance);
    const count = Number(passengers);
    const stopCount = Number(stops);
    const when = havanaDateTimeToIso(cubaTime);
    if (!Number.isFinite(km) || km <= 0 || km > 5000) {
      setError("Indica una distancia mayor que cero y hasta 5.000 km.");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 30 || !Number.isInteger(stopCount) || stopCount < 0 || stopCount > 20) {
      setError("Revisa la cantidad de pasajeros (1 a 30) y paradas (0 a 20).");
      return;
    }
    if (!when) {
      setError("Indica una fecha y hora válidas de Cuba.");
      return;
    }
    if (serviceTariffs.length === 0) {
      setError("No hay tarifas activas configuradas para este servicio.");
      return;
    }

    const serial = ++requestSerial.current;
    setIsLoading(true);
    setError(null);
    setResults([]);
    try {
      const all = await Promise.all(serviceTariffs.map(async (tariff): Promise<QuoteResult> => {
        const name = labels[tariff.vehicleCategoryCode] ?? tariff.vehicleCategoryCode;
        try {
          const { data, error: rpcError } = await getSupabaseClient().rpc("admin_preview_marketplace_quote_lab_v2", {
            target_service_code: serviceCode,
            target_vehicle_category_code: tariff.vehicleCategoryCode,
            target_passenger_count: serviceCode === "passenger" ? count : 1,
            target_distance_km: km,
            target_stop_count: stopCount,
            target_scheduled_for: when,
          });
          if (rpcError) throw new Error(rpcError.message);
          const quote = data as Quote | null;
          const priceCup = Number(quote?.recommended_price);
          const totalUsd = Number(quote?.pricing_breakdown?.total_usd);
          if (!quote || quote.currency !== "CUP" || !Number.isFinite(priceCup) || priceCup <= 0 || !Number.isFinite(totalUsd)) {
            throw new Error("El servidor no devolvió una cotización válida.");
          }
          return {
            code: tariff.vehicleCategoryCode,
            name,
            priceCup,
            totalUsd,
            breakdown: quote.pricing_breakdown,
          };
        } catch (cause) {
          return {
            code: tariff.vehicleCategoryCode,
            name,
            priceCup: null,
            totalUsd: null,
            error: cause instanceof Error ? cause.message : "Cotización no disponible",
          };
        }
      }));
      if (requestSerial.current !== serial) return;
      setResults(all);
      setScenario(`${km.toLocaleString("es-CU")} km · ${serviceCode === "passenger" ? `${count} pasajero(s) · ` : ""}${stopCount} parada(s) · ${cubaTime.replace("T", " ")} (Cuba)`);
    } catch (cause) {
      if (requestSerial.current === serial) {
        setError(cause instanceof Error ? cause.message : "No fue posible consultar el motor de precios.");
      }
    } finally {
      if (requestSerial.current === serial) setIsLoading(false);
    }
  };

  return (
    <section aria-label="Laboratorio de precios de carreras" className="rounded-2xl border border-cyan-500/20 bg-card/75 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-2 text-cyan-500"><FlaskConical className="h-5 w-5" /></span>
          <div>
            <h3 className="text-base font-bold text-foreground">Laboratorio de precios</h3>
            <p className="text-xs text-muted-foreground">Compara las tarifas publicadas en el motor oficial, sin crear carreras.</p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-500">Solo lectura · no publica cambios</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="lab-km" className="flex items-center gap-1.5 text-xs"><Route className="h-3.5 w-3.5"/>Distancia (km)</Label><Input id="lab-km" type="number" inputMode="decimal" min="0.1" max="5000" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="lab-passengers" className="flex items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5"/>Pasajeros</Label><Input id="lab-passengers" type="number" min="1" max="30" step="1" value={passengers} onChange={(e) => setPassengers(e.target.value)} disabled={serviceCode !== "passenger"} /></div>
        <div className="space-y-1.5"><Label htmlFor="lab-stops" className="flex items-center gap-1.5 text-xs"><MapPin className="h-3.5 w-3.5"/>Paradas</Label><Input id="lab-stops" type="number" min="0" max="20" step="1" value={stops} onChange={(e) => setStops(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="lab-time" className="flex items-center gap-1.5 text-xs"><Clock3 className="h-3.5 w-3.5"/>Fecha y hora de Cuba</Label><Input id="lab-time" type="datetime-local" value={cubaTime} onChange={(e) => setCubaTime(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void run()} disabled={isLoading || serviceTariffs.length === 0}>
          {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : <FlaskConical className="mr-2 h-4 w-4"/>}
          {isLoading ? "Calculando…" : "Comparar modalidades"}
        </Button>
        <p className="text-xs text-muted-foreground">{serviceTariffs.length} modalidades con tarifa publicada</p>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {scenario ? <p className="mt-4 text-xs text-muted-foreground">Escenario calculado: {scenario}</p> : null}
      {results.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
          {results.map((result) => (
            <article key={result.code} className="rounded-xl border border-border/60 bg-background/55 p-3">
              <p className="text-xs font-semibold text-muted-foreground">{result.name}</p>
              {result.priceCup == null ? (
                <p className="mt-2 text-xs text-destructive" title={result.error}>Sin cotización: {result.error}</p>
              ) : (
                <>
                  <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{money(result.priceCup, "CUP")}</p>
                  <p className="text-xs text-muted-foreground">{money(result.totalUsd ?? 0, "USD")} antes de conversión y redondeo</p>
                  <details className="mt-2 rounded-lg border border-border/55 px-2 py-1.5 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium">Ver desglose</summary>
                    <div className="mt-2 space-y-1">
                      {([ ["Base",result.breakdown?.components_usd?.base], ["Distancia",result.breakdown?.components_usd?.distance], ["Pasajeros",result.breakdown?.components_usd?.extra_passengers], ["Paradas",result.breakdown?.components_usd?.stops], ["Ajustes",result.breakdown?.dynamic_adjustment_applied_usd] ] as const).map(([label,amount]) => (
                        <div key={label} className="flex justify-between gap-2"><span>{label}</span><span>{money(Number(amount ?? 0), "USD")}</span></div>
                      ))}
                      {result.breakdown?.exchange_rate_fallback_used ? <p className="text-amber-500">Se utilizó la tasa de respaldo del sistema.</p> : null}
                    </div>
                  </details>
                </>
              )}
            </article>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Simulación de precio con distancia indicada manualmente: no valida el recorrido en el mapa, la capacidad del vehículo ni reproduce recargos de destino geográfico. Los precios se consultan al servidor y pueden cambiar con la tasa USD/CUP. No se modifica ninguna tarifa, carrera ni liquidación. Los borradores de nuevos precios se incorporarán en la siguiente fase.</p>
    </section>
  );
}
