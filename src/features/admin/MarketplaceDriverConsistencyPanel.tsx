import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, Clock3, LocateFixed, RefreshCw, Trophy, UserRound } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import DriverVerifiedBadge from "@/features/admin/DriverVerifiedBadge";
import type { MarketplaceOperationalDriver } from "@/lib/marketplace-map";

type PeriodDays = 7 | 30;
type RankingMode = "days" | "hours";

type ConsistencyDriver = {
  driverUserId: string;
  driverName: string;
  activeDays: number;
  estimatedHours: number;
  completedSessions: number;
  vehicleCategoryCode: string | null;
  vehicleName: string | null;
};

function vehicleLabel(category: string | null) {
  return ({
    tricycle: "Triciclo",
    motorcycle: "Moto",
    bicitaxi: "Bicitaxi",
    light_car: "Auto",
    van: "Furgoneta",
    truck: "Camión",
  } as Record<string, string>)[category ?? ""] ?? "Vehículo";
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "C";
}

async function getConsistency(projectId: string, days: PeriodDays): Promise<ConsistencyDriver[]> {
  const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_driver_consistency", {
    target_project_id: projectId,
    target_days: days,
  });
  if (error) throw new Error(error.message);
  const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (!Array.isArray(payload.items)) throw new Error("El historial no tiene un formato válido.");
  return payload.items.map((raw: unknown) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const numeric = (value: unknown) => {
      const parsed = Number(value ?? 0);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    };
    return {
      driverUserId: String(row.driver_user_id ?? ""),
      driverName: String(row.driver_name ?? "Conductor"),
      activeDays: numeric(row.active_days),
      estimatedHours: numeric(row.estimated_hours),
      completedSessions: numeric(row.completed_sessions),
      vehicleCategoryCode: row.vehicle_category_code == null ? null : String(row.vehicle_category_code),
      vehicleName: row.vehicle_name == null ? null : String(row.vehicle_name),
    };
  }).filter((driver) => driver.driverUserId.length > 0);
}

export default function MarketplaceDriverConsistencyPanel({
  projectId,
  enabled,
  drivers,
  isVerified,
  onOpenDriver,
  onFocusDriver,
}: {
  projectId: string;
  enabled: boolean;
  drivers: MarketplaceOperationalDriver[];
  isVerified: (driverUserId: string) => boolean;
  onOpenDriver?: (driverUserId: string) => void;
  onFocusDriver: (driverUserId: string) => void;
}) {
  const [days, setDays] = useState<PeriodDays>(30);
  const [ranking, setRanking] = useState<RankingMode>("days");
  // Una sola ficha abierta; por defecto toda la lista queda compacta.
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["marketplace-driver-consistency", projectId, days],
    queryFn: () => getConsistency(projectId, days),
    enabled,
    staleTime: 60_000,
    refetchInterval: enabled ? 120_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const liveDrivers = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverUserId, driver])),
    [drivers],
  );
  const leaders = useMemo(() => [...(query.data ?? [])].sort((a, b) =>
    ranking === "days"
      ? b.activeDays - a.activeDays || b.estimatedHours - a.estimatedHours || a.driverName.localeCompare(b.driverName, "es")
      : b.estimatedHours - a.estimatedHours || b.activeDays - a.activeDays || a.driverName.localeCompare(b.driverName, "es")
  ), [query.data, ranking]);

  return (
    <section aria-label="Conductores más constantes" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/10 px-3 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">Más constantes</h4>
          <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-cyan-200">
            {leaders.length}
          </span>
          <button
            type="button"
            aria-label="Actualizar clasificación"
            title="Actualizar clasificación"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            className="rounded-md border border-white/15 p-1.5 text-slate-200 hover:bg-white/10 disabled:opacity-50"
          ><RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /></button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
          Ordena por días en Trabajando o por tiempo registrado en las jornadas.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div role="group" aria-label="Periodo de clasificación" className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/25 p-1">
            {([7, 30] as const).map((period) => (
              <button key={period} type="button" aria-pressed={days === period}
                className={`rounded-md px-2 py-1.5 text-[11px] font-semibold ${days === period ? "bg-cyan-500/20 text-cyan-100" : "text-slate-300 hover:bg-white/5"}`}
                onClick={() => { setDays(period); setExpandedDriverId(null); }}>{period} días</button>
            ))}
          </div>
          <div role="group" aria-label="Criterio de clasificación" className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/25 p-1">
            <button type="button" aria-pressed={ranking === "days"}
              className={`rounded-md px-1 py-1.5 text-[11px] font-semibold ${ranking === "days" ? "bg-cyan-500/20 text-cyan-100" : "text-slate-300 hover:bg-white/5"}`}
              onClick={() => { setRanking("days"); setExpandedDriverId(null); }}>Frecuencia</button>
            <button type="button" aria-pressed={ranking === "hours"}
              className={`rounded-md px-1 py-1.5 text-[11px] font-semibold ${ranking === "hours" ? "bg-cyan-500/20 text-cyan-100" : "text-slate-300 hover:bg-white/5"}`}
              onClick={() => { setRanking("hours"); setExpandedDriverId(null); }}>Horas</button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 [scrollbar-color:rgba(148,163,184,0.4)_transparent] [scrollbar-width:thin]">
        {query.isPending ? (
          <p className="p-4 text-xs text-slate-300">Calculando constancia de los conductores…</p>
        ) : query.isError ? (
          <div role="alert" className="m-2 rounded-xl border border-amber-400/25 p-3 text-xs text-amber-100">
            No se pudo consultar el historial de jornadas.
            <button type="button" className="mt-2 block font-semibold underline" onClick={() => void query.refetch()}>Reintentar</button>
          </div>
        ) : leaders.length === 0 ? (
          <p className="p-4 text-xs text-slate-300">Aún no hay jornadas registradas para este periodo.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {leaders.map((driver, index) => {
              const live = liveDrivers.get(driver.driverUserId);
              const canLocate = live != null && (
                (live.locationFresh && live.latitude != null && live.longitude != null) ||
                (live.lastLatitude != null && live.lastLongitude != null)
              );
              const verified = isVerified(driver.driverUserId);
              const rowExpanded = expandedDriverId === driver.driverUserId;
              const detailsId = `consistency-driver-details-${driver.driverUserId}`;
              const mainMetric = ranking === "days"
                ? `${driver.activeDays} días`
                : `${driver.estimatedHours.toLocaleString("es-CU", { maximumFractionDigits: 1 })} h`;
              const secondaryMetric = ranking === "days"
                ? `${driver.estimatedHours.toLocaleString("es-CU", { maximumFractionDigits: 1 })} h estimadas`
                : `${driver.activeDays} días de inicio`;
              return (
                <article key={driver.driverUserId} className={`overflow-hidden rounded-lg border transition-colors ${rowExpanded ? "border-cyan-400/30 bg-cyan-500/[0.06]" : "border-white/10 bg-white/[0.035]"}`}>
                  <button
                    type="button"
                    aria-expanded={rowExpanded}
                    aria-controls={detailsId}
                    aria-label={`${driver.driverName}, puesto ${index + 1}, ${mainMetric}. ${rowExpanded ? "Contraer" : "Desplegar"} información`}
                    onClick={() => setExpandedDriverId((current) => current === driver.driverUserId ? null : driver.driverUserId)}
                    className="flex min-h-12 w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-amber-200">{index + 1}</span>
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-[10px] font-bold text-cyan-100">{initials(driver.driverName)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1">
                        <strong title={driver.driverName} className="min-w-0 truncate text-xs font-semibold leading-snug text-white">{driver.driverName}</strong>
                        {verified && <DriverVerifiedBadge iconOnly />}
                      </span>
                      <span className="block truncate text-[10px] leading-snug text-slate-400">{secondaryMetric}</span>
                    </span>
                    {live?.locationFresh && live.acceptingJobs && !live.activeJobId ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400" title="Disponible, GPS reciente" aria-label="Disponible, GPS reciente" />
                    ) : null}
                    <span className="shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-cyan-100">{mainMetric}</span>
                    <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${rowExpanded ? "rotate-180" : ""}`} />
                  </button>
                  <div id={detailsId} hidden={!rowExpanded} className="border-t border-white/10 px-3 pb-2.5 pt-2">
                    {rowExpanded ? (
                      <>
                        <p className="mb-2 break-words text-xs font-medium text-slate-200">
                          {driver.driverName}
                          <span className="ml-1.5 font-normal text-slate-400">
                            · {vehicleLabel(driver.vehicleCategoryCode)}{driver.vehicleName ? ` · ${driver.vehicleName}` : ""}
                          </span>
                        </p>
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <div className="rounded-md bg-black/20 px-1 py-1.5">
                            <div className="text-sm font-bold tabular-nums text-cyan-100">{driver.activeDays}</div>
                            <div className="text-[10px] leading-tight text-slate-400">Días de inicio</div>
                          </div>
                          <div className="rounded-md bg-black/20 px-1 py-1.5">
                            <div className="flex items-center justify-center gap-1 text-sm font-bold tabular-nums text-amber-100">
                              <Clock3 className="h-3 w-3" aria-hidden="true" />
                              {driver.estimatedHours.toLocaleString("es-CU", { maximumFractionDigits: 1 })} h
                            </div>
                            <div className="text-[10px] leading-tight text-slate-400">Jornada estimada</div>
                          </div>
                          <div className="rounded-md bg-black/20 px-1 py-1.5">
                            <div className="text-sm font-bold tabular-nums text-slate-100">{driver.completedSessions}</div>
                            <div className="text-[10px] leading-tight text-slate-400">Jornadas cerradas</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                          <button type="button" disabled={!canLocate}
                            onClick={() => onFocusDriver(driver.driverUserId)}
                            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-orange-400/25 px-2.5 py-1 text-[11px] font-medium text-orange-200 enabled:hover:bg-orange-400/10 disabled:opacity-35">
                            <LocateFixed className="h-3.5 w-3.5" /> Mapa
                          </button>
                          {onOpenDriver && (
                            <button type="button" onClick={() => onOpenDriver(driver.driverUserId)}
                              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-cyan-400/25 px-2.5 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/10">
                              <UserRound className="h-3.5 w-3.5" /> Ficha 360
                            </button>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-white/10 bg-slate-950/80 px-3 py-2">
        <p className="text-[10px] leading-snug text-slate-400">
          <BarChart3 className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Basado en las entradas y salidas históricas de “Trabajando”.
          Las horas son estimadas (máx. 12 h por jornada); no equivalen a tiempo GPS verificado ni excluyen carreras en curso. 
          Una jornada abierta solo suma si el GPS está reciente y el conductor está disponible.
        </p>
      </div>
    </section>
  );
}
