import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Navigation, RefreshCw, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getMarketplaceOperationalMap,
  getMarketplaceOperationalStaticMap,
} from "@/lib/marketplace-map";

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

export default function MarketplaceOperationalMap({ projectId }: { projectId: string }) {
  const [showRoutes, setShowRoutes] = useState(true);
  const operational = useQuery({
    queryKey: ["marketplace-operational-map", projectId],
    queryFn: () => getMarketplaceOperationalMap(projectId),
    refetchInterval: 30_000,
  });

  const pointKey = useMemo(() => {
    const data = operational.data;
    if (!data) return "empty";

    const result: string[] = [];

    for (const driver of data.drivers) {
      if (
        driver.locationFresh &&
        driver.latitude != null &&
        driver.longitude != null
      ) {
        result.push(
          `driver:${driver.latitude.toFixed(5)}:${driver.longitude.toFixed(5)}`,
        );
      }
    }

    for (const job of data.jobs) {
      if (job.originLat != null && job.originLon != null) {
        result.push(
          `customer:${job.originLat.toFixed(5)}:${job.originLon.toFixed(5)}`,
        );
      }

      if (job.destinationLat != null && job.destinationLon != null) {
        result.push(
          `destination:${job.destinationLat.toFixed(5)}:${job.destinationLon.toFixed(5)}`,
        );
      }

      result.push(
        `job:${job.jobId}:${job.status}:${job.estimatedDistanceKm ?? "na"}:${job.routeDurationSeconds ?? "na"}`,
      );
    }

    return result.join("|") || "empty";
  }, [operational.data]);

  const mapImage = useQuery({
    queryKey: ["marketplace-operational-map-image", projectId, pointKey, showRoutes],
    queryFn: () =>
      getMarketplaceOperationalStaticMap(projectId, {
        showRoutes,
      }),
    enabled: Boolean(operational.data),
    staleTime: 25_000,
  });

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
          La pantalla está preparada, pero necesita el contrato de ubicación operativa del backend.
        </p>
      </div>
    );
  }

  const data = operational.data;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[28px] border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.08] via-background/70 to-emerald-500/[0.045] p-5 shadow-[0_24px_70px_-46px_rgba(249,115,22,0.75)] sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-300">
              Operación geográfica
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Mapa operativo
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Conductores trabajando, puntos de recogida y destinos de los servicios activos.
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]">
        <section className="overflow-hidden rounded-[26px] border border-border/60 bg-background/35">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/55 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                Conductor reciente
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Recogida del cliente
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                Destino
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-pressed={showRoutes}
                onClick={() => setShowRoutes((value) => !value)}
              >
                <Route className="mr-2 h-3.5 w-3.5" />
                {showRoutes ? "Rutas visibles" : "Rutas ocultas"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={operational.isFetching || mapImage.isFetching}
                onClick={() => {
                  void operational.refetch();
                  void mapImage.refetch();
                }}
              >
                <RefreshCw
                  className={`mr-2 h-3.5 w-3.5 ${
                    operational.isFetching || mapImage.isFetching ? "animate-spin" : ""
                  }`}
                />
                Actualizar
              </Button>
            </div>
          </div>

          <div className="relative min-h-[420px] bg-muted/15">
            {showRoutes && mapImage.data?.routeCount ? (
              <div className="absolute left-3 top-3 z-10 rounded-full border border-cyan-400/25 bg-background/85 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 shadow-sm backdrop-blur">
                {mapImage.data.routeCount} {mapImage.data.routeCount === 1 ? "ruta visible" : "rutas visibles"}
              </div>
            ) : null}

            {mapImage.data ? (
              <img
                src={mapImage.data.dataUrl}
                alt="Mapa operativo de TukTuk Marketplace"
                className="h-full min-h-[420px] w-full object-cover"
              />
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                <MapPin className="h-10 w-10 text-orange-300" />
                <p className="mt-3 font-semibold text-foreground">
                  {mapImage.isLoading ? "Cargando mapa..." : "Mapa base no disponible"}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Los datos operativos siguen visibles en el panel lateral.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-border/55 px-4 py-3 text-xs text-muted-foreground">
            La posición naranja solo se muestra mientras la señal siga vigente: hasta 5 minutos
            para un conductor disponible y hasta 2 minutos durante un servicio activo. El punto
            verde representa la recogida solicitada por el cliente. La capa de rutas reconstruye
            el trayecto vial entre origen y destino mediante Mapbox y puede mostrarse u ocultarse
            sin afectar los datos operativos.
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[24px] border border-border/60 bg-background/40 p-4">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-cyan-300" />
              <h4 className="font-semibold text-foreground">Servicios activos</h4>
            </div>

            <div className="mt-3 space-y-2">
              {data.jobs.length ? (
                data.jobs.slice(0, 8).map((job) => (
                  <div
                    key={job.jobId}
                    className="rounded-2xl border border-border/55 bg-background/55 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.07] px-2 py-1 text-[10px] font-semibold text-cyan-300">
                        {statusLabel(job.status)}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        {job.serviceCode}
                      </span>
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
                  </div>
                ))
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

            <div className="mt-3 space-y-2">
              {data.drivers.length ? (
                data.drivers.slice(0, 10).map((driver) => (
                  <div
                    key={driver.driverUserId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {driver.driverDisplayName || "Conductor"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {driver.vehicleName || driver.vehicleId}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          driver.locationFresh ? "bg-orange-500" : "bg-muted-foreground/40"
                        }`}
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {driver.locationFresh
                          ? `Señal reciente · ${formatTime(driver.capturedAt)}`
                          : driver.capturedAt
                            ? `Señal atrasada · ${formatTime(driver.capturedAt)}`
                            : "Sin ubicación"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay conductores en modo Trabajando.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}