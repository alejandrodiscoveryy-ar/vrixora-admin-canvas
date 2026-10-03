import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Navigation, RefreshCw, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getMarketplaceOperationalMap,
  getMarketplaceOperationalStaticMap,
  type MarketplaceOperationalMapPoint,
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

export default function MarketplaceOperationalMap({ projectId }: { projectId: string }) {
  const operational = useQuery({
    queryKey: ["marketplace-operational-map", projectId],
    queryFn: () => getMarketplaceOperationalMap(projectId),
    refetchInterval: 30_000,
  });

  const points = useMemo<MarketplaceOperationalMapPoint[]>(() => {
    const data = operational.data;
    if (!data) return [];

    const result: MarketplaceOperationalMapPoint[] = [];

    for (const driver of data.drivers) {
      if (
        driver.locationFresh &&
        driver.latitude != null &&
        driver.longitude != null
      ) {
        result.push({
          kind: "driver",
          lat: driver.latitude,
          lon: driver.longitude,
        });
      }
    }

    for (const job of data.jobs) {
      if (job.originLat != null && job.originLon != null) {
        result.push({
          kind: "customer",
          lat: job.originLat,
          lon: job.originLon,
        });
      }

      if (job.destinationLat != null && job.destinationLon != null) {
        result.push({
          kind: "destination",
          lat: job.destinationLat,
          lon: job.destinationLon,
        });
      }
    }

    return result;
  }, [operational.data]);

  const pointKey = points
    .map((point) => `${point.kind}:${point.lat.toFixed(5)}:${point.lon.toFixed(5)}`)
    .join("|");

  const mapImage = useQuery({
    queryKey: ["marketplace-operational-map-image", projectId, pointKey],
    queryFn: () => getMarketplaceOperationalStaticMap(projectId, points),
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

            <Button
              size="sm"
              variant="outline"
              disabled={operational.isFetching}
              onClick={() => operational.refetch()}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${operational.isFetching ? "animate-spin" : ""}`}
              />
              Actualizar
            </Button>
          </div>

          <div className="relative min-h-[420px] bg-muted/15">
            {mapImage.data ? (
              <img
                src={mapImage.data}
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
            La posición naranja solo se considera actual durante{" "}
            {Math.round(data.freshnessSeconds / 60)} minutos. El punto verde representa la
            recogida solicitada por el cliente, no un rastreo continuo de su teléfono.
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
                        {formatTime(driver.capturedAt)}
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