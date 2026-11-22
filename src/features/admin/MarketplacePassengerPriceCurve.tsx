import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bike, CalendarClock, CarFront, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { premiumSurface, premiumHeaderSurface, premiumMetricSurface, premiumControlSurface } from "@/components/admin/density";
import { getSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type VehicleCode = "motorcycle" | "tricycle" | "light_car" | "bicitaxi";
type PricePoint = { km: number } & Record<VehicleCode, number>;
type CurveResponse = { rows?: unknown; scenario_local?: unknown; rate?: unknown; rate_source?: unknown; scenario_shifted_to_next_week?: unknown; requested_scenario_local?: unknown };

// Distancias de consulta seleccionadas para comparar las cuatro modalidades.
const referenceKilometers = [2, 3, 5, 8, 9, 10, 12, 15, 20, 25] as const;

const vehicles = [
  { code: "motorcycle", name: "Moto", color: "#fb7185", icon: Bike },
  { code: "tricycle", name: "Triciclo", color: "#c084fc", icon: Truck },
  { code: "light_car", name: "Auto", color: "#60a5fa", icon: CarFront },
  { code: "bicitaxi", name: "Bicitaxi", color: "#2dd4bf", icon: Bike },
] as const;

const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—"
  : value.toLocaleString("es-CU", { maximumFractionDigits: 0 }) + " CUP";

// Importe final por distancia, no la tarifa marginal ni el costo de combustible.
const averageCostPerKm = (fare: number | undefined, km: number | undefined) =>
  fare == null || km == null || !Number.isFinite(fare) || !Number.isFinite(km) || km <= 0
    ? "—"
    : (fare / km).toLocaleString("es-CU", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }) + " CUP/km";

function havanaLocalInput(): string {
  const now = new Date();
  // Cuba retained UTC-4 in this period; IANA databases may still report UTC-5.
  if (now.getTime() >= Date.parse("2026-11-01T04:00:00Z")
      && now.getTime() < Date.parse("2027-11-07T05:00:00Z")) {
    return new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Havana", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const f = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return [f("year"), f("month"), f("day")].join("-") + "T" + f("hour") + ":" + f("minute");
}

function parsedCurve(value: unknown): PricePoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const data = raw as Record<string, unknown>;
    const km = Number(data.km), motorcycle = Number(data.motorcycle), tricycle = Number(data.tricycle);
    const light_car = Number(data.light_car), bicitaxi = Number(data.bicitaxi);
    if (![km, motorcycle, tricycle, light_car, bicitaxi].every(Number.isFinite) || km <= 0) return [];
    return [{ km, motorcycle, tricycle, light_car, bicitaxi }];
  });
}

/** Quotes calculated by the production engine, strictly read-only. */
export default function MarketplacePassengerPriceCurve({ projectId }: { projectId: string }) {
  const [maxKm, setMaxKm] = useState(25);
  const [selectedKm, setSelectedKm] = useState(8);
  const [focused, setFocused] = useState<VehicleCode | "all">("all");
  const [timeMode, setTimeMode] = useState<"current" | "custom">("current");
  const [localDateTime, setLocalDateTime] = useState(havanaLocalInput);

  const curve = useQuery({
    queryKey: ["marketplace-passenger-real-price-curve", projectId, maxKm, timeMode, localDateTime],
    enabled: Boolean(projectId) && (timeMode === "current" || Boolean(localDateTime)),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_passenger_price_curve", {
        target_project_id: projectId, target_max_km: maxKm, target_step_km: 0.5,
        target_local_datetime: timeMode === "current" ? null : localDateTime,
      });
      if (error) throw error;
      return data as CurveResponse;
    },
    staleTime: 60_000, refetchInterval: timeMode === "current" ? 120_000 : false, retry: 1,
  });

  const rows = useMemo(() => parsedCurve(curve.data?.rows), [curve.data?.rows]);
  const boundedKm = Math.min(maxKm, Math.max(0.5, selectedKm));
  const selected = rows.find((row) => Math.abs(row.km - boundedKm) < 0.001)
    ?? rows.reduce<PricePoint | null>(
      (prev, row) => !prev || Math.abs(row.km - boundedKm) < Math.abs(prev.km - boundedKm) ? row : prev, null,
    );
  const biggestPrice = rows.reduce((greatest, row) =>
    Math.max(greatest, row.light_car, row.tricycle, row.motorcycle, row.bicitaxi), 0);

  return (
    <section aria-label="Curva de precios por km" data-appearance="premium" data-density="compact"
      className={cn("relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] border", premiumSurface)}>
      <header className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-3 py-3 sm:px-4", premiumHeaderSurface)}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-compact)] border border-[var(--module-border,var(--border-default))] bg-[var(--module-surface,var(--surface-1))] text-primary" aria-hidden="true">
            <Activity className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Análisis tarifario · Pasajeros</p>
            <p className="mt-0.5 text-sm leading-snug text-text-secondary">Compara el precio final y el promedio por kilómetro de cada vehículo.</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--semantic-success-border,var(--border-default))] bg-[var(--semantic-success-surface,var(--surface-2))] px-2.5 py-1 text-xs font-medium text-text-secondary">
          <ShieldCheck className="size-3.5 text-[var(--semantic-success)]" aria-hidden="true" /> Consulta sin cambios
        </span>
      </header>
      <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
        <div className={cn("grid min-w-0 gap-3 rounded-[var(--radius-card)] border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:p-4", premiumHeaderSurface)}>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Rango de distancia
            <select
              aria-label="Rango máximo de kilómetros" value={maxKm}
              onChange={(event) => { const next = Number(event.target.value); setMaxKm(next); setSelectedKm((value) => Math.min(value, next)); }}
              className={cn("block min-h-11 w-full rounded-[var(--radius-control)] border border-border-default bg-surface-1 px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", premiumControlSurface)}
            >
              <option value={10}>0,5 a 10 km</option>
              <option value={15}>0,5 a 15 km</option>
              <option value={20}>0,5 a 20 km</option>
              <option value={25}>0,5 a 25 km</option>
            </select>
          </label>
          <div className="space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Escenario de Cuba</span>
            <div className={cn("flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] border border-border-default bg-surface-1 p-1", premiumControlSurface)}>
              {(["current", "custom"] as const).map((mode) => (
                <button
                  key={mode} type="button" aria-pressed={timeMode === mode}
                  onClick={() => setTimeMode(mode)}
                  className={"min-h-9 flex-1 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                    (timeMode === mode ? "bg-primary/15 text-text-primary" : "text-text-secondary hover:bg-surface-2 hover:text-text-primary")}
                >{mode === "current" ? "Ahora" : "Elegir fecha/hora"}</button>
              ))}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 max-sm:w-full" disabled={curve.isFetching} onClick={() => void curve.refetch()}>
            <RefreshCw className={"h-3.5 w-3.5 " + (curve.isFetching ? "animate-spin" : "")} /> Actualizar
          </Button>
        </div>

        {timeMode === "custom" ? (
          <label className="grid min-w-0 gap-2 rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-3 text-xs font-medium text-text-secondary sm:flex sm:items-center">
            <span className="flex items-center gap-2"><CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" /> Fecha y hora de La Habana</span>
            <input type="datetime-local" aria-label="Fecha y hora local de Cuba" value={localDateTime}
              onChange={(event) => setLocalDateTime(event.target.value)}
              className={cn("min-h-11 min-w-0 w-full rounded-[var(--radius-control)] border border-border-default bg-surface-1 px-3 text-sm text-text-primary sm:ml-auto sm:w-[270px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", premiumControlSurface)} />
          </label>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Comparativa del recorrido</span>
            <p className="text-sm font-medium text-text-secondary">Consulta cada tramo en CUP, sin modificar las tarifas.</p>
          </div>
          <Button type="button" variant="outline" size="sm"
            className="min-h-10 gap-2 text-xs"
            disabled={focused === "all"} onClick={() => setFocused("all")}>
            <Activity className="size-4" aria-hidden="true" /> Todas las curvas
          </Button>
        </div>

        {curve.isLoading ? (
          <div role="status" aria-busy="true" className="space-y-3">
            <p className="text-sm text-text-secondary">Consultando las tarifas vigentes de las cuatro modalidades…</p>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
              {vehicles.map(({ code, name }) => (
                <div key={code} className={cn("space-y-3 rounded-[var(--radius-card)] border p-3", premiumMetricSurface)}>
                  <span className="text-sm font-medium text-text-secondary">{name}</span>
                  <Skeleton className="h-7 w-3/4 rounded-md" />
                  <Skeleton className="h-4 w-1/2 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ) : curve.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-compact)] border border-[var(--semantic-warning-border,var(--border-default))] bg-[var(--semantic-warning-surface,var(--surface-2))] p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">No se pudieron cargar los precios</p>
              <p className="mt-1 text-xs text-text-secondary">Comprueba la conexión e inténtalo de nuevo. No se muestra ningún precio supuesto.</p>
            </div>
            <Button type="button" size="sm" variant="outline" className="min-h-11 gap-1.5"
              onClick={() => void curve.refetch()}><RefreshCw className="size-4" aria-hidden="true" /> Reintentar</Button>
          </div>
        ) : !rows.length ? (
          <div role="status" className="rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-4 text-sm text-text-secondary">
            No hay precios verificados para este escenario. Prueba otro horario o vuelve a actualizar.
          </div>
        ) : (
          <>
            <section aria-label="Distancia de consulta" className={cn(
              "min-w-0 space-y-3 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumHeaderSurface
            )}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-xs font-medium text-text-secondary">Distancia seleccionada</span>
                  <strong className="text-2xl font-semibold leading-none tabular-nums text-text-primary">
                    {selected?.km.toLocaleString("es-CU") ?? "—"} <span className="text-base text-text-secondary">km</span>
                  </strong>
                </div>
                <span className="text-xs text-text-tertiary">4 modalidades · CUP</span>
              </div>
              <div className="-mx-1 flex min-w-0 snap-x gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Kilómetros de referencia" tabIndex={0}>
                {referenceKilometers.filter((km) => km <= maxKm).map((km) => (
                  <button key={km} type="button" onClick={() => setSelectedKm(km)}
                    aria-pressed={selected?.km === km}
                    className={cn(
                      "min-h-11 min-w-[58px] shrink-0 snap-start rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected?.km === km ? "border-primary bg-primary/15 text-text-primary" : "border-border-default bg-surface-1 text-text-secondary hover:border-primary/40 hover:text-text-primary"
                    )}>
                    {km} km
                  </button>
                ))}
              </div>
              <label className="block min-w-0 space-y-2">
                <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
                  <span>Distancia intermedia · pasos de 0,5 km</span>
                  <span className="tabular-nums">{selected?.km.toLocaleString("es-CU") ?? "—"} / {maxKm} km</span>
                </span>
                <input type="range" aria-label="Kilómetros para comparar las cuatro modalidades"
                  min={0.5} max={maxKm} step={0.5} value={boundedKm}
                  onChange={(event) => setSelectedKm(Number(event.target.value))}
                  className="block min-h-6 w-full accent-primary" />
              </label>
            </section>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4" aria-label="Precio por modalidad">
              {vehicles.map(({ code, name, color, icon: VehicleIcon }) => (
                <button key={code} type="button" onClick={() => setFocused(focused === code ? "all" : code)}
                  aria-label={name + ": " + money(selected?.[code]) + ". Precio promedio: " + averageCostPerKm(selected?.[code], selected?.km) + ". Destacar curva"}
                  aria-pressed={focused === code}
                  className={cn(
                    "group relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 text-left transition-[border-color,box-shadow] duration-[var(--motion-interaction)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4",
                    premiumMetricSurface,
                    focused === code ? "border-primary ring-1 ring-primary/40" : "hover:border-border-strong"
                  )}>
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-full opacity-90" style={{ backgroundColor: color }} aria-hidden="true" />
                  <VehicleIcon className="pointer-events-none absolute bottom-4 right-3 size-14 opacity-[0.05] sm:size-16" aria-hidden="true" style={{ color }} />
                  <span className="relative z-10 block">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-secondary">
                      <VehicleIcon className="size-4 shrink-0" aria-hidden="true" style={{ color }} />
                      <span className="min-w-0 truncate">{name}</span>
                      {focused === code ? <span className="ml-auto size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-2 block break-words text-xl font-semibold leading-tight tracking-tight tabular-nums text-text-primary sm:text-2xl">
                      {money(selected?.[code])}
                    </span>
                    <span className="mt-1 block text-xs text-text-tertiary">Precio final · a {selected?.km.toLocaleString("es-CU") ?? "—"} km</span>
                    <span className="mt-3 block border-t border-border-default/65 pt-2.5">
                      <span className="block text-xs text-text-secondary">Costo promedio por km</span>
                      <strong className="mt-1 block break-words text-sm font-semibold tabular-nums text-text-primary sm:text-base">
                        {averageCostPerKm(selected?.[code], selected?.km)}
                      </strong>
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <section aria-label="Gráfica comparativa de precios" className={cn(
              "min-w-0 overflow-hidden rounded-[var(--radius-card)] border", premiumSurface
            )}>
              <header className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-3 py-3 sm:px-4", premiumHeaderSurface)}>
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Evolución del precio por distancia</h4>
                  <p className="mt-0.5 text-xs text-text-secondary">CUP frente a kilómetros. Toca una tarjeta para destacar su línea.</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Leyenda de modalidades">
                  {vehicles.map(({ code, name, color }) => (
                    <span key={code} className={cn("inline-flex items-center gap-1.5 text-xs", focused === "all" || focused === code ? "text-text-primary" : "text-text-tertiary")}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                      {name}
                    </span>
                  ))}
                </div>
              </header>
              <div className="px-2 py-3 sm:px-3">
              <div className="w-full overflow-x-auto pb-1" aria-label="Gráfico de precios, desplazable horizontalmente en móvil" tabIndex={0}>
                <div className="h-[310px] min-w-[700px] sm:h-[370px] lg:h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 18, right: 14, bottom: 8, left: -14 }}>
                    <CartesianGrid stroke="currentColor" strokeOpacity={0.10} vertical={false} />
                    <XAxis dataKey="km" type="number" domain={[0, maxKm]}
                      ticks={referenceKilometers.filter((km) => km <= maxKm)} interval={0}
                      tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, Math.ceil(biggestPrice / 1000) * 1000]}
                      tickFormatter={(value) => Number(value) >= 1000 ? String(Math.round(Number(value) / 1000)) + "k" : String(value)}
                      tick={{ fontSize: 11 }} width={44} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={(value) => Number(value).toLocaleString("es-CU") + " km"}
                      formatter={(value, name) => [money(Number(value)), vehicles.find((vehicle) => vehicle.code === name)?.name ?? String(name)]}
                      contentStyle={{ backgroundColor: "var(--surface-overlay)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-compact)", color: "var(--text-primary)", boxShadow: "var(--shadow-overlay)" }}
                    />
                    {referenceKilometers.filter((km) => km <= maxKm).map((km) => (
                      <ReferenceLine key={km} x={km} stroke="#94a3b8" strokeDasharray="3 5" strokeOpacity={0.24} />
                    ))}
                    <ReferenceLine x={selected?.km ?? boundedKm} stroke="#22d3ee" strokeWidth={1.5} strokeOpacity={0.9} />
                    {vehicles.map(({ code, color }) => (
                      <Line key={code} type="linear" dataKey={code} name={code} stroke={color}
                        strokeOpacity={focused === "all" || focused === code ? 1 : 0.15}
                        strokeWidth={focused === code ? 3.5 : 2.5} dot={false} activeDot={{ r: 5 }}
                        isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                </div>
              </div>
              <p className="mt-2 px-2 text-xs text-text-tertiary sm:hidden">Desliza horizontalmente para ver todos los kilómetros.</p>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-default/70 pt-3 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5 text-primary" aria-hidden="true" />
                {String(curve.data?.scenario_local ?? "—")} · hora oficial de Cuba
              </span>
              <span className="tabular-nums">
                1 USD = {Number(curve.data?.rate).toLocaleString("es-CU")} CUP
                <span className="ml-1 text-text-tertiary">· {String(curve.data?.rate_source ?? "tasa vigente")}</span>
              </span>
            </div>
            {curve.data?.scenario_shifted_to_next_week === true ? (
              <p role="status" className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] p-3 text-xs leading-relaxed text-foreground">
                La hora seleccionada ya pasó. Para mostrar las tarifas vigentes se usa el siguiente día equivalente:
                {" "}{String(curve.data.scenario_local)} (hora oficial de Cuba). Es una simulación actual, no un precio histórico.
              </p>
            ) : null}
            <details className="group rounded-[var(--radius-compact)] border border-border-default bg-surface-2 px-3 py-2.5">
              <summary className="cursor-pointer text-xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                Criterios del cálculo y alcance
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                Consulta de solo lectura cada 0,5 km, con recargos por día y horario.
                El costo promedio por km es el precio final dividido entre la distancia seleccionada.
                Marcas de consulta: 2, 3, 5, 8, 9, 10, 12, 15, 20 y 25 km.
                La corrección tarifaria vigente de 5 a 12 km sigue intacta.
                No incluye recargos especiales por destino (por ejemplo, aeropuerto), pasajeros adicionales ni paradas.
                Una sola tarifa por modalidad, sin distinción de combustible.
              </p>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
