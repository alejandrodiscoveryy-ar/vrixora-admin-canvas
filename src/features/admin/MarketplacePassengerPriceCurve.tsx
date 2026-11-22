import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bike, CalendarClock, CarFront, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";

type VehicleCode = "motorcycle" | "tricycle" | "light_car" | "bicitaxi";
type PricePoint = { km: number } & Record<VehicleCode, number>;
type CurveResponse = { rows?: unknown; scenario_local?: unknown; rate?: unknown; rate_source?: unknown };

// Distancias de consulta seleccionadas para comparar las cuatro modalidades.
const referenceKilometers = [3, 5, 8, 10, 12, 15, 20, 25] as const;

const vehicles = [
  { code: "motorcycle", name: "Moto", color: "#fb7185", icon: Bike },
  { code: "tricycle", name: "Triciclo", color: "#c084fc", icon: Truck },
  { code: "light_car", name: "Auto", color: "#60a5fa", icon: CarFront },
  { code: "bicitaxi", name: "Bicitaxi", color: "#2dd4bf", icon: Bike },
] as const;

const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—"
  : value.toLocaleString("es-CU", { maximumFractionDigits: 0 }) + " CUP";

function havanaLocalInput(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Havana", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
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
    <section aria-label="Curva de precios por km" className="relative overflow-hidden rounded-[22px] border border-border/70 bg-card/80 shadow-sm admin-graphite-panel">
      <Activity aria-hidden="true" className="pointer-events-none absolute -right-9 -top-8 h-40 w-40 opacity-[0.04]" />
      <header className="relative flex flex-wrap items-start justify-between gap-3 border-b border-border/65 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">Curva de precios por km</h3>
          <p className="mt-1 text-xs text-muted-foreground">Precios finales de pasajeros en CUP, calculados por el motor vigente.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> Consulta sin cambios
        </span>
      </header>
      <div className="space-y-4 p-3 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Rango de distancia
            <select
              aria-label="Rango máximo de kilómetros" value={maxKm}
              onChange={(event) => { const next = Number(event.target.value); setMaxKm(next); setSelectedKm((value) => Math.min(value, next)); }}
              className="block h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value={10}>0,5 a 10 km</option>
              <option value={15}>0,5 a 15 km</option>
              <option value={20}>0,5 a 20 km</option>
              <option value={25}>0,5 a 25 km</option>
            </select>
          </label>
          <div className="space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Escenario de Cuba</span>
            <div className="flex h-10 items-center gap-1 rounded-xl border border-border bg-background p-1">
              {(["current", "custom"] as const).map((mode) => (
                <button
                  key={mode} type="button" aria-pressed={timeMode === mode}
                  onClick={() => setTimeMode(mode)}
                  className={"h-8 flex-1 rounded-lg px-2 text-xs font-semibold transition " +
                    (timeMode === mode ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" : "text-muted-foreground hover:text-foreground")}
                >{mode === "current" ? "Ahora" : "Elegir fecha/hora"}</button>
              ))}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5" disabled={curve.isFetching} onClick={() => void curve.refetch()}>
            <RefreshCw className={"h-3.5 w-3.5 " + (curve.isFetching ? "animate-spin" : "")} /> Actualizar
          </Button>
        </div>

        {timeMode === "custom" ? (
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0 text-cyan-500" />
            Fecha y hora de La Habana
            <input type="datetime-local" aria-label="Fecha y hora local de Cuba" value={localDateTime}
              onChange={(event) => setLocalDateTime(event.target.value)}
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground sm:max-w-64" />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Destacar modalidad">
          <button type="button" aria-pressed={focused === "all"} onClick={() => setFocused("all")}
            className={"rounded-full border px-3 py-1.5 text-xs font-semibold " +
              (focused === "all" ? "border-cyan-500/40 bg-cyan-500/10 text-foreground" : "border-border text-muted-foreground")}>Todas</button>
          {vehicles.map(({ code, name, color }) => (
            <button key={code} type="button" aria-pressed={focused === code}
              onClick={() => setFocused(focused === code ? "all" : code)}
              className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold " +
                (focused === code ? "border-border bg-muted text-foreground" : "border-border/70 text-muted-foreground")}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {name}
            </button>
          ))}
        </div>

        {curve.isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground" role="status">Consultando las cuatro tarifas reales…</div>
        ) : curve.isError ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground">
            No pudimos consultar la curva de precios. Revisa los permisos y vuelve a intentarlo.
            <Button type="button" size="sm" variant="outline" className="ml-2" onClick={() => void curve.refetch()}>Reintentar</Button>
          </div>
        ) : !rows.length ? (
          <div role="status" className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No hay precios verificados para este escenario.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {vehicles.map(({ code, name, color, icon: VehicleIcon }) => (
                <button key={code} type="button" onClick={() => setFocused(focused === code ? "all" : code)}
                  aria-pressed={focused === code}
                  className="min-w-0 rounded-xl border border-border/70 bg-background/50 p-3 text-left transition hover:border-cyan-500/40 admin-graphite-inset">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <VehicleIcon className="h-4 w-4 shrink-0" style={{ color }} /> {name}
                  </div>
                  <p className="mt-1 break-words text-lg font-bold tabular-nums text-foreground sm:text-xl">{money(selected?.[code])}</p>
                  <span className="text-[11px] text-muted-foreground">a {selected?.km.toLocaleString("es-CU") ?? "—"} km</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-border/65 bg-background/35 px-2 py-3 sm:px-3 admin-graphite-inset">
              <div className="mb-2 flex items-center justify-between gap-2 px-2 text-xs text-muted-foreground">
                <span>Precio final · CUP</span><span>Distancia · km</span>
              </div>
              <div className="h-[300px] w-full min-w-0 sm:h-[380px]">
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
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }}
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

            <div className="space-y-2 rounded-xl border border-border/70 bg-background/35 p-3">
              <p className="text-xs font-medium text-muted-foreground">Consulta rápida por kilómetros</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="group" aria-label="Kilómetros de referencia">
                {referenceKilometers.filter((km) => km <= maxKm).map((km) => (
                  <button key={km} type="button" onClick={() => setSelectedKm(km)}
                    aria-pressed={selected?.km === km}
                    className={"min-h-10 rounded-lg border px-2 py-2 text-xs font-semibold tabular-nums transition " +
                      (selected?.km === km ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" : "border-border/70 bg-card/75 text-foreground hover:border-cyan-500/40")}
                  >{km} km</button>
                ))}
              </div>
            </div>

            <label className="block space-y-2 rounded-xl border border-border/70 bg-background/35 p-3 text-xs text-muted-foreground">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>Desliza para consultar un kilómetro</span>
                <strong className="text-base text-foreground tabular-nums">{selected?.km.toLocaleString("es-CU") ?? "—"} km</strong>
              </span>
              <input type="range" aria-label="Kilómetros para comparar las cuatro modalidades"
                min={0.5} max={maxKm} step={0.5} value={boundedKm}
                onChange={(event) => setSelectedKm(Number(event.target.value))}
                className="w-full accent-cyan-500" />
              <span className="flex justify-between text-[11px] text-muted-foreground"><span>0,5 km</span><span>{maxKm} km</span></span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>Escenario: {String(curve.data?.scenario_local ?? "—")} · hora oficial de Cuba</span>
              <span>1 USD = {Number(curve.data?.rate).toLocaleString("es-CU")} CUP · {String(curve.data?.rate_source ?? "tasa vigente")}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Consulta de solo lectura cada 0,5 km, con recargos por día y horario.
              Marcas de consulta: 3, 5, 8, 10, 12, 15, 20 y 25 km. La corrección tarifaria vigente de 5 a 12 km sigue intacta.
              No incluye recargos especiales por destino (por ejemplo, aeropuerto), pasajeros adicionales ni paradas.
              Una sola tarifa por modalidad, sin distinción de combustible.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
