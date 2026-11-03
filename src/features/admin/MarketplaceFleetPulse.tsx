import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Bike, CarFront, CheckCircle2, ChevronDown, CircleHelp,
  Loader2, MapPinned, PackageCheck, RefreshCw, Truck, Users,
} from "lucide-react";
import { supabaseServices, type MarketplaceDriver } from "@/lib/services";
import {
  FLEET_SERVICE_CODES, matchingFleetDrivers, summarizeFleet, UNCLASSIFIED_CATEGORY,
} from "@/lib/marketplace-fleet";

interface MarketplaceFleetPulseProps {
  projectId: string;
  enabled: boolean;
  onOpenDriver: (id: string) => void;
}

const SERVICE_DESIGN = {
  passenger: {
    name: "Pasajeros", Icon: Users, Watermark: CarFront,
    frame: "border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.09] via-background/75 to-background/45 hover:border-cyan-300/45",
    focused: "ring-1 ring-cyan-400/45 border-cyan-300/50",
    symbol: "border-cyan-400/25 bg-cyan-500/[0.12] text-cyan-200",
    ink: "text-cyan-300",
    fog: "bg-cyan-500/[0.08]",
  },
  cargo: {
    name: "Carga", Icon: Truck, Watermark: Truck,
    frame: "border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.09] via-background/75 to-background/45 hover:border-emerald-300/45",
    focused: "ring-1 ring-emerald-400/45 border-emerald-300/50",
    symbol: "border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-200",
    ink: "text-emerald-300",
    fog: "bg-emerald-500/[0.08]",
  },
  courier: {
    name: "Mensajería", Icon: PackageCheck, Watermark: PackageCheck,
    frame: "border-amber-400/20 bg-gradient-to-br from-amber-500/[0.09] via-background/75 to-background/45 hover:border-amber-300/45",
    focused: "ring-1 ring-amber-400/45 border-amber-300/50",
    symbol: "border-amber-400/25 bg-amber-500/[0.12] text-amber-200",
    ink: "text-amber-300",
    fog: "bg-amber-500/[0.08]",
  },
  tourism: {
    name: "Turismo", Icon: MapPinned, Watermark: MapPinned,
    frame: "border-violet-400/20 bg-gradient-to-br from-violet-500/[0.09] via-background/75 to-background/45 hover:border-violet-300/45",
    focused: "ring-1 ring-violet-400/45 border-violet-300/50",
    symbol: "border-violet-400/25 bg-violet-500/[0.12] text-violet-200",
    ink: "text-violet-300",
    fog: "bg-violet-500/[0.08]",
  },
} as const;

const CATEGORY_DESIGN = {
  light_car: { name: "Autos", Icon: CarFront },
  tricycle: { name: "Triciclos", Icon: Bike },
  motorcycle: { name: "Motocicletas", Icon: Bike },
  bicitaxi: { name: "Bicitaxis", Icon: Bike },
  van: { name: "Furgonetas", Icon: CarFront },
  truck: { name: "Camiones", Icon: Truck },
  other: { name: "Otros vehículos", Icon: CircleHelp },
  [UNCLASSIFIED_CATEGORY]: { name: "Sin clasificar", Icon: CircleHelp },
} as const;

function categoryDesign(code: string) {
  const match = CATEGORY_DESIGN[code as keyof typeof CATEGORY_DESIGN];
  if (match) return match;
  return { name: code.replaceAll("_", " ").replace(/^./, (char) => char.toLocaleUpperCase("es")), Icon: CarFront };
}

/** Consulta todas las páginas para evitar confundir una primera página con el total real. */
async function loadFleet(projectId: string): Promise<MarketplaceDriver[]> {
  const output: MarketplaceDriver[] = [];
  const seenCursors = new Set<string>();
  let cursor: { at: string; id: string } | null = null;
  for (;;) {
    const page = await supabaseServices.marketplace.listDrivers(projectId, { limit: 200, cursor });
    output.push(...page.items);
    if (!page.nextCursor) return output;
    const key = `${page.nextCursor.at}:${page.nextCursor.id}`;
    if (seenCursors.has(key)) throw new Error("La paginación del directorio devolvió un cursor repetido.");
    seenCursors.add(key);
    cursor = page.nextCursor;
  }
}

export default function MarketplaceFleetPulse({ projectId, enabled, onOpenDriver }: MarketplaceFleetPulseProps) {
  const [service, setService] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const fleet = useQuery({
    queryKey: ["marketplace-fleet-pulse", projectId],
    queryFn: () => loadFleet(projectId),
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const overview = useMemo(() => summarizeFleet(fleet.data ?? []), [fleet.data]);
  const selected = overview.find((item) => item.code === service);
  const filtered = useMemo(() =>
    service && category ? matchingFleetDrivers(fleet.data ?? [], service, category) : [],
  [fleet.data, service, category]);
  const selectedDesign = service ? SERVICE_DESIGN[service as keyof typeof SERVICE_DESIGN] : null;

  const chooseService = (code: string) => {
    setService((current) => current === code ? null : code);
    setCategory(null);
    setVisibleCount(12);
  };
  const chooseCategory = (code: string) => {
    setCategory((current) => current === code ? null : code);
    setVisibleCount(12);
  };

  return (
    <section aria-label="Conductores por modalidad y tipo de vehículo" className="relative overflow-hidden rounded-[28px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.035] via-background/65 to-violet-500/[0.025] p-4 shadow-[0_26px_76px_-57px_rgba(34,211,238,0.4)] sm:p-5 lg:p-6">
      <Users aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 text-cyan-300/[0.025]" strokeWidth={1} />
      <div className="relative mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.09] text-cyan-200 shadow-inner shadow-cyan-500/[0.07]">
            <Users className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/85">Equipo · Distribución de flota</p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">Conductores por modalidad</h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Selecciona una modalidad, después un tipo de vehículo, para ver sus conductores.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${fleet.isFetching ? "animate-spin" : ""}`} />
          {fleet.isLoading ? "Consultando flota" : fleet.isError ? "Sin conexión" : "Actualización automática"}
        </div>
      </div>

      {fleet.isError ? (
        <div role="alert" className="relative rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] p-4 text-sm text-amber-100">
          No fue posible cargar el desglose completo. No se muestran cifras parciales como si fueran totales.
          <button type="button" onClick={() => void fleet.refetch()} className="ml-3 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">Reintentar</button>
        </div>
      ) : (
        <>
          <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {FLEET_SERVICE_CODES.map((code) => {
              const design = SERVICE_DESIGN[code];
              const record = overview.find((item) => item.code === code);
              const active = service === code;
              const Icon = design.Icon;
              const Watermark = design.Watermark;
              return (
                <button key={code} type="button" aria-expanded={active} aria-controls="marketplace-fleet-vehicle-detail" onClick={() => chooseService(code)}
                  className={`group relative min-h-[174px] w-full overflow-hidden rounded-[23px] border p-4 text-left shadow-[0_20px_55px_-44px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${design.frame} ${active ? design.focused : ""}`}>
                  <span aria-hidden="true" className={`pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full blur-3xl ${design.fog}`} />
                  <Watermark aria-hidden="true" strokeWidth={0.7} className={`pointer-events-none absolute -right-5 bottom-0 h-36 w-36 rotate-[-11deg] opacity-[0.07] ${design.ink}`} />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${design.symbol}`}><Icon className="h-5 w-5" /></div>
                    <ChevronDown className={`mt-2 h-4 w-4 text-muted-foreground transition-transform ${active ? "rotate-180" : "group-hover:translate-y-0.5"}`} />
                  </div>
                  <div className="relative mt-4">
                    <p className="text-sm font-semibold text-foreground">{design.name}</p>
                    {fleet.isLoading ? <Loader2 className="mt-2 h-6 w-6 animate-spin text-muted-foreground" /> : (
                      <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-foreground" aria-label={`${record?.total ?? 0} conductores`}>{record?.total ?? 0}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">{record?.active ?? 0} activos · {record?.categories.length ?? 0} tipos de vehículo</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div id="marketplace-fleet-vehicle-detail" className="relative">
            {service && selected && selectedDesign && !fleet.isLoading ? (
              <div className="mt-4 overflow-hidden rounded-[23px] border border-border/60 bg-background/55 p-4 backdrop-blur-sm sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{selectedDesign.name} · Tipos de vehículo</p>
                    <h4 className="mt-1 text-base font-semibold text-foreground">{selected.total} conductores en esta modalidad</h4>
                  </div>
                  <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selectedDesign.symbol}`}>{selected.active} activos</span>
                </div>
                {selected.categories.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {selected.categories.map((item) => {
                      const vehicle = categoryDesign(item.code);
                      const VehicleIcon = vehicle.Icon;
                      const active = category === item.code;
                      return (
                        <button type="button" key={item.code} aria-pressed={active} onClick={() => chooseCategory(item.code)}
                          className={`group relative overflow-hidden rounded-[18px] border p-3.5 text-left transition duration-200 hover:border-cyan-400/35 hover:bg-cyan-500/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${active ? "border-cyan-400/50 bg-cyan-500/[0.09]" : "border-border/60 bg-background/45"}`}>
                          <VehicleIcon aria-hidden="true" strokeWidth={0.65} className="pointer-events-none absolute -right-3 -bottom-6 h-24 w-24 text-cyan-300/[0.055]" />
                          <div className="relative flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/[0.07] text-cyan-200"><VehicleIcon className="h-5 w-5" /></span>
                              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{vehicle.name}</span><span className="text-[11px] text-muted-foreground">{item.active} activos</span></span>
                            </div>
                            <span className="font-mono text-xl font-bold text-foreground">{item.total}</span>
                          </div>
                          <div className={`relative mt-3 flex items-center justify-end gap-1 text-[11px] font-medium ${active ? "text-cyan-200" : "text-muted-foreground"}`}>
                            {active ? "Seleccionado" : "Ver conductores"}<ArrowRight className="h-3.5 w-3.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl border border-border/50 bg-background/40 p-4 text-sm text-muted-foreground">Todavía no existen vehículos asignados a esta modalidad.</p>
                )}
                {category ? (
                  <div className="mt-5 border-t border-border/50 pt-4" aria-live="polite">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">Filtro activo</p>
                        <h5 className="mt-1 text-base font-semibold text-foreground">{selectedDesign.name} / {categoryDesign(category).name}</h5>
                        <p className="mt-1 text-xs text-muted-foreground">{filtered.length} conductores coinciden con esta selección</p>
                      </div>
                      <button type="button" onClick={() => setCategory(null)} className="rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">Quitar filtro de vehículo</button>
                    </div>
                    {filtered.length ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {filtered.slice(0, visibleCount).map((person) => (
                          <button type="button" key={person.userId} onClick={() => onOpenDriver(person.userId)}
                            className="group flex items-center gap-3 rounded-[16px] border border-cyan-400/15 bg-gradient-to-r from-cyan-500/[0.045] to-background/50 p-3 text-left transition hover:border-cyan-400/35 hover:from-cyan-500/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                            aria-label={`Abrir ficha 360 de ${person.displayName}`}>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/[0.09] text-cyan-200"><Users className="h-4 w-4" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{person.displayName}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{person.vehicleName || categoryDesign(person.vehicleCategoryCode || UNCLASSIFIED_CATEGORY).name} · {person.status === "active" ? "Activo" : person.status === "incomplete" ? "Incompleto" : person.status === "suspended" ? "Suspendido" : "Pendiente"}</span>
                            </span>
                            {person.status === "active" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : null}
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-cyan-200" />
                          </button>
                        ))}
                      </div>
                    ) : <p className="mt-3 rounded-xl border border-border/50 p-3 text-sm text-muted-foreground">No hay conductores asociados a esta combinación.</p>}
                    {visibleCount < filtered.length ? (
                      <button type="button" className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => setVisibleCount((amount) => amount + 12)}>
                        Mostrar más conductores ({filtered.length - visibleCount} restantes)
                      </button>
                    ) : null}
                  </div>
                ) : selected.categories.length ? (
                  <p className="mt-4 text-xs text-muted-foreground">Elige un tipo de vehículo para mostrar los conductores y abrir sus fichas 360°.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
      <p className="relative mt-4 text-[11px] text-muted-foreground">Cada conductor se cuenta una vez por modalidad y categoría. Si ofrece varios servicios, puede aparecer en más de una modalidad. Los valores se obtienen del directorio autorizado, no de cifras de ejemplo.</p>
    </section>
  );
}
