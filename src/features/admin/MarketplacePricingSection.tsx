import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  SlidersHorizontal,
  Bike,
  Boxes,
  CarFront,
  DollarSign,
  Package,
  Pencil,
  RefreshCw,
  Route,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  supabaseServices,
  type MarketplacePricingAdjustment,
  type MarketplacePricingTariff,
  type MarketplacePricingTariffInput,
} from "@/lib/services";
import { getElToqueIntegration } from "@/lib/eltoque-integration";
import { PRICING_WORKSPACE_VIEWS } from "@/lib/admin-navigation";
import MarketplacePricingLaboratoryV2 from "@/features/admin/MarketplacePricingLaboratoryV2";
import MarketplacePricingV3Diagnostics from "@/features/admin/MarketplacePricingV3Diagnostics";
import MarketplacePricingV3Hierarchy from "@/features/admin/MarketplacePricingV3Hierarchy";
import MarketplaceTemporalDraftsV3 from "@/features/admin/MarketplaceTemporalDraftsV3";
import MarketplacePricingMapV3, { type PricingRouteScenario } from "@/features/admin/MarketplacePricingMapV3";
import MarketplacePricingGlobalAdjustment from "@/features/admin/MarketplacePricingGlobalAdjustment";
import { useProjectPermissions } from "@/hooks/useProjects";

type PricingFieldKey =
  | "basePriceUsd"
  | "minimumPriceUsd"
  | "perKmPriceUsd"
  | "perExtraPassengerPriceUsd"
  | "perStopPriceUsd";

type ServiceCode = "passenger" | "cargo" | "courier";

// El inicio solo muestra rutas de navegación. Cada herramienta se monta al abrir su área.
const pricingWorkspaceOptions = [
  { code: "tariffs", title: "Tarifas actuales", description: "Revisar y editar precios por vehículo.", note: "Precios reales", icon: DollarSign },
  { code: "temporal", title: "Horarios y recargos", description: "Configurar noche, fines de semana y festivos.", note: "Solo borradores", icon: CalendarClock },
  { code: "simulation", title: "Probar un precio", description: "Elegir una ruta y consultar el importe.", note: "Sin crear viajes", icon: Route },
  { code: "advanced", title: "Herramientas avanzadas", description: "Revisar diagnósticos y comparaciones.", note: "Solo análisis", icon: SlidersHorizontal },
] as const;
type PricingWorkspace = (typeof pricingWorkspaceOptions)[number]["code"] | "global" | "service-menu";

type EditingTarget = {
  serviceCode: ServiceCode;
  vehicleCategoryCode: string;
  tariff: MarketplacePricingTariff | null;
};

const serviceVisuals: Record<
  ServiceCode,
  {
    active: string;
    idle: string;
    card: string;
    strip: string;
    pricePanel: string;
    text: string;
  }
> = {
  passenger: {
    active: "bg-sky-600 text-white shadow-sm",
    idle: "bg-sky-500/[0.06] text-sky-700 ring-1 ring-inset ring-sky-500/15 hover:bg-sky-500/10 dark:text-sky-300",
    card: "border-sky-500/25 bg-sky-500/[0.025]",
    strip: "from-sky-500 via-sky-400/55 to-transparent",
    pricePanel: "border-sky-500/20 bg-sky-500/[0.06]",
    text: "text-sky-600 dark:text-sky-400",
  },
  cargo: {
    active: "bg-amber-600 text-white shadow-sm",
    idle: "bg-amber-500/[0.07] text-amber-700 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/10 dark:text-amber-300",
    card: "border-amber-500/25 bg-amber-500/[0.03]",
    strip: "from-amber-500 via-amber-400/55 to-transparent",
    pricePanel: "border-amber-500/20 bg-amber-500/[0.07]",
    text: "text-amber-600 dark:text-amber-400",
  },
  courier: {
    active: "bg-emerald-600 text-white shadow-sm",
    idle: "bg-emerald-500/[0.06] text-emerald-700 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/10 dark:text-emerald-300",
    card: "border-emerald-500/25 bg-emerald-500/[0.025]",
    strip: "from-emerald-500 via-emerald-400/55 to-transparent",
    pricePanel: "border-emerald-500/20 bg-emerald-500/[0.06]",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};

const vehicleVisuals: Record<string, string> = {
  light_car: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  bicitaxi: "border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  bicycle: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  motorcycle: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  tricycle: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  van: "border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400",
  truck: "border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  other: "border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

const passengerCategories = ["light_car", "bicitaxi", "motorcycle", "tricycle"] as const;

const cargoCategories = [
  "light_car",
  "bicitaxi",
  "tricycle",
  "motorcycle",
  "van",
  "truck",
  "other",
] as const;
const courierCategories = ["bicycle",...cargoCategories] as const;

const passengerFields: Array<[PricingFieldKey, string]> = [
  ["basePriceUsd", "Precio base"],
  ["minimumPriceUsd", "Precio mínimo"],
  ["perKmPriceUsd", "Por km"],
  ["perExtraPassengerPriceUsd", "Pasajero adicional"],
  ["perStopPriceUsd", "Parada adicional"],
];

const cargoCourierFields: Array<[PricingFieldKey, string]> = [
  ["basePriceUsd", "Precio base"],
  ["minimumPriceUsd", "Precio mínimo"],
  ["perKmPriceUsd", "Por km"],
  ["perStopPriceUsd", "Parada adicional"],
];

const numberValue = (value: number | null) => (value == null ? "" : String(value));

const usd = (value: number | null) =>
  value == null
    ? "—"
    : `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const cup = (usdValue: number | null, rate: number) =>
  usdValue == null || rate <= 0
    ? "—"
    : `${(usdValue * rate).toLocaleString("es-CU", {
        maximumFractionDigits: 0,
      })} CUP`;

function inputFrom(tariff: MarketplacePricingTariff): MarketplacePricingTariffInput {
  return {
    serviceCode: tariff.serviceCode,
    vehicleCategoryCode: tariff.vehicleCategoryCode,
    basePriceUsd: tariff.basePriceUsd ?? 0,
    minimumPriceUsd: tariff.minimumPriceUsd ?? 0,
    perKmPriceUsd: tariff.perKmPriceUsd ?? 0,
    perExtraPassengerPriceUsd: tariff.perExtraPassengerPriceUsd ?? 0,
    perStopPriceUsd: tariff.perStopPriceUsd ?? 0,
  };
}

function emptyInput(
  serviceCode: ServiceCode,
  vehicleCategoryCode: string,
): MarketplacePricingTariffInput {
  return {
    serviceCode,
    vehicleCategoryCode,
    basePriceUsd: 0,
    minimumPriceUsd: 0,
    perKmPriceUsd: 0,
    perExtraPassengerPriceUsd: 0,
    perStopPriceUsd: 0,
  };
}

function serviceLabel(code: string) {
  return (
    (
      {
        passenger: "Pasajeros",
        cargo: "Carga",
        courier: "Mensajería",
      } as Record<string, string>
    )[code] ?? code
  );
}

function serviceDescription(code: ServiceCode) {
  return (
    {
      passenger: "Tarifas para traslados de personas según la modalidad del vehículo.",
      cargo: "Tarifas para mover objetos y mercancías según capacidad del vehículo.",
      courier: "Tarifas para paquetes y entregas rápidas según la modalidad utilizada.",
    } as Record<ServiceCode, string>
  )[code];
}

function categoryLabel(code: string) {
  return (
    (
      {
        light_car: "Auto ligero",
        bicitaxi: "Bicitaxi",
        bicycle: "Bicicleta",
        motorcycle: "Motocicleta",
        tricycle: "Triciclo",
        van: "Furgoneta",
        truck: "Camión",
        other: "Otro",
      } as Record<string, string>
    )[code] ?? code
  );
}

function VehicleIcon({ code }: { code: string }) {
  const className = "h-5 w-5";
  switch (code) {
    case "light_car":
      return <CarFront className={className} />;
    case "motorcycle":
    case "bicycle":
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

function Metric({
  label,
  value,
  cupValue,
}: {
  label: string;
  value: number | null;
  cupValue: string;
}) {
  return (
    <div className="tuktuk-v3-metric min-w-0 rounded-xl border border-slate-500/50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{usd(value)}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">≈ {cupValue}</p>
    </div>
  );
}

export default function MarketplacePricingSection({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("marketplace.manage");

  const tariffs = useQuery({
    queryKey: ["marketplace-pricing-tariffs", projectId],
    queryFn: () => supabaseServices.marketplace.listPricingTariffs(projectId),
  });

  const publication = useQuery({
    queryKey: ["marketplace-modality-visibility", projectId],
    queryFn: () => supabaseServices.marketplace.listModalityVisibility(projectId),
    retry: 1,
  });

  const visibility = useMutation({
    mutationFn: (input: { serviceCode: string; vehicleCategoryCode: string; isPublished: boolean }) =>
      supabaseServices.marketplace.setModalityVisibility(projectId, input),
    onSuccess: (_, input) => {
      toast.success(input.isPublished ? "Modalidad publicada." : "Modalidad oculta para clientes.");
      void client.invalidateQueries({ queryKey: ["marketplace-modality-visibility", projectId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const adjustments = useQuery({
    queryKey: ["marketplace-pricing-adjustments", projectId],
    queryFn: () => supabaseServices.marketplace.listPricingAdjustments(projectId),
  });

  const exchange = useQuery({
    queryKey: ["eltoque-integration", projectId],
    queryFn: () => getElToqueIntegration(projectId),
    refetchInterval: 60_000,
  });

  const pricingRoute = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).precio,
  });
  const [selectedService, setSelectedService] = useState<ServiceCode>(
    pricingRoute === "cargo" || pricingRoute === "courier" ? pricingRoute : "passenger",
  );
  const [workspace, setWorkspace] = useState<PricingWorkspace | null>(
    pricingRoute === "passenger" || pricingRoute === "cargo" || pricingRoute === "courier" ? "service-menu" : "global",
  );
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [draft, setDraft] = useState<MarketplacePricingTariffInput | null>(null);
  const [pricingRouteScenario, setPricingRouteScenario] = useState<PricingRouteScenario | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<{
    item: MarketplacePricingAdjustment;
    value: number;
    enabled: boolean;
  } | null>(null);

  // El menú lateral selecciona la pantalla sin modificar las tarifas.
  useEffect(() => {
    if (pricingRoute === "passenger" || pricingRoute === "cargo" || pricingRoute === "courier") {
      setSelectedService(pricingRoute);
      setWorkspace("service-menu");
    } else {
      setWorkspace("global");
    }
    setPricingRouteScenario(null);
    setEditing(null);
    setDraft(null);
  }, [pricingRoute]);

  const save = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.savePricingTariff(projectId, {
        ...draft!,
        perExtraPassengerPriceUsd:
          draft!.serviceCode === "passenger" ? draft!.perExtraPassengerPriceUsd : 0,
      }),
    onSuccess: () => {
      toast.success("Tarifa guardada. La visibilidad no ha cambiado.");
      setEditing(null);
      setDraft(null);
      void client.invalidateQueries({
        queryKey: ["marketplace-pricing-tariffs", projectId],
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const publishAdjustment = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.publishPricingAdjustment(projectId, {
        code: adjustmentDraft!.item.code,
        adjustmentValue: adjustmentDraft!.value,
        enabled: adjustmentDraft!.enabled,
      }),
    onSuccess: () => {
      toast.success("Nueva versión del ajuste publicada.");
      setAdjustmentDraft(null);
      void client.invalidateQueries({
        queryKey: ["marketplace-pricing-adjustments", projectId],
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const rate = exchange.data?.currentRate ?? 0;
  const airport = adjustments.data?.find((item) => item.code === "airport_destination_auto");
  const categories = selectedService === "passenger" ? passengerCategories : selectedService === "cargo" ? cargoCategories : courierCategories;

  const serviceTariffs = tariffs.data?.filter((item) => item.serviceCode === selectedService) ?? [];
  const configuredCount = categories.filter((vehicleCategoryCode) =>
    serviceTariffs.some((item) => item.vehicleCategoryCode === vehicleCategoryCode),
  ).length;

  const selectedVisual = serviceVisuals[selectedService];
  const activeWorkspace = pricingWorkspaceOptions.find((item) => item.code === workspace);
  const selectedPricingView = PRICING_WORKSPACE_VIEWS.find((view) => view.code === pricingRoute) ?? PRICING_WORKSPACE_VIEWS[0];
  const SelectedPricingIcon = selectedPricingView.icon;

  const openTariff = (
    serviceCode: ServiceCode,
    vehicleCategoryCode: string,
    tariff: MarketplacePricingTariff | null,
  ) => {
    setEditing({ serviceCode, vehicleCategoryCode, tariff });
    setDraft(tariff ? inputFrom(tariff) : emptyInput(serviceCode, vehicleCategoryCode));
  };

  return (
    <section aria-label="Centro de precios" className="tuktuk-pricing-v3-sheet min-w-0">
      <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[252px_minmax(0,1fr)]">
        <nav aria-label="Secciones del Centro de precios" className="relative isolate overflow-hidden rounded-[22px] border border-border/70 bg-gradient-to-br from-card/95 via-card/90 to-cyan-950/[0.09] p-2.5 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.8)] xl:sticky xl:top-4 admin-graphite-panel">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 z-0 h-52 w-52 rounded-full bg-cyan-400/[0.045] blur-3xl" />
          <div className="relative z-10 px-2.5 pb-2 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400/85">Centro de precios</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Gestión económica del proyecto</p>
          </div>
          <div className="relative z-10 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {PRICING_WORKSPACE_VIEWS.map((view) => {
              const Icon = view.icon;
              const selected = view.code === selectedPricingView.code;
              return (
                <Link key={view.code} to="/admin/proyectos/$id/$section" params={{ id: projectId, section: "planes" }} search={{ precio: view.code }}
                  aria-current={selected ? "page" : undefined}
                  className={`group relative isolate flex admin-graphite-nav-item min-w-0 items-center gap-2.5 overflow-hidden rounded-[16px] border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${selected ? "border-primary/40 bg-primary/10 text-foreground shadow-none" : "border-transparent bg-transparent text-foreground/85 hover:border-border/65 hover:bg-surface-3"}`}>
                  <Icon aria-hidden="true" className={`pointer-events-none absolute -right-4 -top-5 z-0 h-28 w-28 -rotate-12 ${selected ? "text-cyan-300 opacity-[0.075]" : "text-muted-foreground opacity-[0.045]"}`} />
                  <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-inner ${selected ? "border-cyan-400/30 bg-cyan-400/[0.11] text-cyan-300" : "border-border-default bg-surface-2 text-text-secondary"}`}>
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">{view.number}</span>
                    <span className="mt-0.5 block text-sm font-semibold leading-tight text-foreground">{view.label}</span>
                    <span className="mt-1 hidden text-[11px] leading-snug text-muted-foreground xl:block">{view.subtitle}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={`relative z-10 hidden h-4 w-4 shrink-0 xl:block ${selected ? "text-cyan-300" : "text-muted-foreground/45"}`} />
                </Link>
              );
            })}
          </div>
          <div className="relative z-10 mt-2 border-t border-border/50 px-2.5 pt-2.5 text-[10px] text-muted-foreground">Precios y accesos según permisos</div>
        </nav>
        <div className="min-w-0 space-y-3">
          <header className="relative isolate overflow-hidden rounded-[22px] border border-cyan-400/20 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/75 px-4 py-4 text-white shadow-[0_18px_42px_-35px_rgba(14,165,233,0.45)] sm:px-5 admin-graphite-header">
            <SelectedPricingIcon aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 z-0 h-44 w-44 -rotate-12 text-cyan-100 opacity-[0.06]" />
            <div className="relative z-10 grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(235px,320px)]">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/90">{selectedPricingView.number} / {selectedPricingView.eyebrow}</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-200"><SelectedPricingIcon className="h-5 w-5" /></span>
                  <h2 className="text-xl font-semibold tracking-tight text-white">{selectedPricingView.label}</h2>
                </div>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-300">{selectedPricingView.description}</p>
              </div>
              <aside aria-label="Tasa USD CUP informativa integrada en Centro de precios" className="min-w-0 rounded-2xl border border-cyan-400/20 bg-slate-950/55 px-3.5 py-3 shadow-inner shadow-black/25 admin-graphite-control">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-200"><DollarSign className="h-4 w-4 text-cyan-300" />Tasa USD/CUP · API</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${exchange.isError || (exchange.data?.autoSyncEnabled && exchange.data?.lastAutoSyncStatus !== "ok") ? "border-amber-400/40 bg-amber-500/10 text-amber-200" : exchange.data?.autoSyncEnabled ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-slate-400/30 bg-slate-500/10 text-slate-300"}`}>
                    {exchange.isLoading ? "Consultando" : exchange.isError ? "Sin conexión" : !exchange.data?.autoSyncEnabled ? "Manual" : exchange.data.lastAutoSyncStatus === "ok" ? "Automática" : "Revisar sincronización"}
                  </span>
                </div>
                {exchange.isLoading ? <p className="mt-2 text-xs text-slate-300">Consultando tasa vigente…</p>
                  : exchange.isError ? <p className="mt-2 text-xs text-amber-300">Tasa temporalmente no disponible</p>
                  : <>
                    <p className="mt-2 text-right text-lg font-bold tabular-nums text-white">1 USD = {rate.toLocaleString("es-CU")} CUP</p>
                    <p className="mt-1 text-right text-[10px] text-slate-300">{exchange.data?.rateSource ?? "Fuente automática"} · {exchange.data?.rateUpdatedAt ? new Date(exchange.data.rateUpdatedAt).toLocaleString("es-CU") : "sin fecha de actualización"}</p>
                  </>}
              </aside>
            </div>
          </header>
      {workspace === "service-menu" ? (
        <section aria-label="Menú de precios por modalidad" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card/50 px-4 py-3 admin-graphite-inset">
            <p className="text-sm font-medium text-foreground">Herramientas del servicio</p>
            <p className="text-xs text-muted-foreground">{configuredCount} de {categories.length} tarifas configuradas</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {pricingWorkspaceOptions.map((item) => {
              const AreaIcon = item.icon;
              return (
                <button key={item.code} type="button"
                  onClick={() => { setWorkspace(item.code); setPricingRouteScenario(null); }}
                  className="group relative isolate flex min-h-[135px] items-start gap-4 overflow-hidden rounded-[22px] border border-border/70 bg-card/80 p-5 text-left transition hover:border-cyan-400/65 hover:bg-cyan-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 admin-graphite-inset">
                  <AreaIcon aria-hidden="true" className="pointer-events-none absolute -right-6 -top-7 z-0 h-40 w-40 -rotate-12 text-cyan-300 opacity-[0.055]" />
                  <span className="relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-400"><AreaIcon className="h-6 w-6" /></span>
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="block text-base font-semibold text-foreground">{item.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                    <span className="mt-3 block text-xs font-semibold text-cyan-400">{item.note}</span>
                  </span>
                  <ChevronRight className="relative z-10 mt-1 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
                </button>
              );
            })}
          </div>
        </section>
      ) : workspace === "global" ? null : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/65 bg-card/65 p-3 shadow-sm sm:p-4 admin-graphite-inset">
          {workspace !== "global" ? (
            <Button type="button" variant="outline" className="h-10 gap-2" onClick={() => {
              setWorkspace("service-menu");
              setPricingRouteScenario(null);
            }}>
              <ArrowLeft className="h-4 w-4" /> Volver al servicio
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{workspace === "global" ? "Centro de precios / General" : `Centro de precios / ${serviceLabel(selectedService)}`}</p>
            <h3 className="text-lg font-semibold text-foreground">{workspace === "global" ? "Ajuste general" : activeWorkspace?.title}</h3>
          </div>
          <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">{workspace === "global" ? "Gestión transversal" : activeWorkspace?.note}</span>
        </div>
      )}

      {workspace === "global" ? (
        <MarketplacePricingGlobalAdjustment
          projectId={projectId}
          tariffs={tariffs.data ?? []}
          exchangeRate={rate}
          canManage={permissions.includes("marketplace.pricing.manage")}
          tariffsLoading={tariffs.isLoading}
          tariffsError={tariffs.isError}
        />
      ) : null}

      {workspace === "advanced" ? (
        <section aria-label="Herramientas avanzadas" className="space-y-4">
          <MarketplacePricingV3Diagnostics
            serviceCode={selectedService}
            tariffs={tariffs.data ?? []}
            adjustments={adjustments.data ?? []}
          />
          {selectedService === "passenger" ? (
            <MarketplacePricingV3Hierarchy
              projectId={projectId}
              tariffs={tariffs.data ?? []}
              exchangeRate={rate}
            />
          ) : null}
        </section>
      ) : null}

      {workspace === "temporal" ? (
        <section aria-label="Horarios y recargos" className="space-y-3">
          <p className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 text-sm text-foreground">
            Estos recargos son borradores. Guardarlos no cambia las tarifas que pagan los clientes.
          </p>
          <MarketplaceTemporalDraftsV3
            projectId={projectId}
            serviceCode={selectedService}
            canManage={canManage}
            tariffs={tariffs.data ?? []}
            exchangeRate={rate}
          />
        </section>
      ) : null}

      {workspace === "simulation" ? (
        <section aria-label="Prueba de precios" className="space-y-3">
          <p className="rounded-xl border border-slate-500/35 bg-card/60 p-3 text-sm text-muted-foreground admin-graphite-inset">
            Consulta tarifas vigentes marcando una ruta. Esta prueba no crea viajes ni modifica precios.
          </p>
          <MarketplacePricingMapV3
            projectId={projectId}
            serviceCode={selectedService}
            tariffs={tariffs.data ?? []}
            canManage={canManage}
            onScenarioChange={setPricingRouteScenario}
            onEditTariff={(vehicleCategoryCode) => {
              if (!canManage) return;
              const tariff = tariffs.data?.find((item) =>
                item.serviceCode === selectedService && item.vehicleCategoryCode === vehicleCategoryCode
              ) ?? null;
              openTariff(selectedService, vehicleCategoryCode, tariff);
            }}
          />
          <details className="tuktuk-v3-secondary rounded-xl border border-slate-500/45 px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">Introducir distancia manualmente</summary>
            <div className="mt-3">
              <MarketplacePricingLaboratoryV2
                serviceCode={selectedService}
                tariffs={tariffs.data ?? []}
                exchangeRate={rate}
              />
            </div>
          </details>
        </section>
      ) : null}

      {workspace === "tariffs" ? (
      <section aria-label="Tarifas actuales" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Tarifas reales por vehículo</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">Guardar una tarifa puede cambiar los importes cobrados. Los cambios de visibilidad también afectan a los clientes.</p>
          </div>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-300">Edición con efecto real</span>
        </div>
      {tariffs.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando tarifas…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((vehicleCategoryCode) => {
            const tariff =
              tariffs.data?.find(
                (item) =>
                  item.serviceCode === selectedService &&
                  item.vehicleCategoryCode === vehicleCategoryCode,
              ) ?? null;

            const vehicleVisual = vehicleVisuals[vehicleCategoryCode] ?? vehicleVisuals.other;
            const published = publication.data?.find((item) =>
              item.serviceCode === selectedService && item.vehicleCategoryCode === vehicleCategoryCode
            )?.isPublished ?? false;

            const secondaryMetrics =
              selectedService === "passenger"
                ? ([
                    ["Base", tariff?.basePriceUsd ?? null],
                    ["Mínimo", tariff?.minimumPriceUsd ?? null],
                    ["Pasajero extra", tariff?.perExtraPassengerPriceUsd ?? null],
                    ["Parada", tariff?.perStopPriceUsd ?? null],
                  ] as const)
                : ([
                    ["Base", tariff?.basePriceUsd ?? null],
                    ["Mínimo", tariff?.minimumPriceUsd ?? null],
                    ["Parada", tariff?.perStopPriceUsd ?? null],
                  ] as const);

            return (
              <div
                key={`${selectedService}:${vehicleCategoryCode}`}
                className={`tuktuk-v3-full-tariff group relative overflow-hidden rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedVisual.card}`}
              >
                <div className={`h-1 bg-gradient-to-r ${selectedVisual.strip}`} />

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${vehicleVisual}`}
                      >
                        <VehicleIcon code={vehicleCategoryCode} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-foreground">
                          {categoryLabel(vehicleCategoryCode)}
                        </h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {serviceLabel(selectedService)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-[10px] font-semibold ${published ? "text-emerald-400" : "text-amber-400"}`}>
                        {publication.isLoading ? "Comprobando" : publication.isError ? "Sin conexión" : published ? "Publicada" : "No publicada"}
                      </span>
                      {canManage ? (
                        <Switch
                          aria-label={`Publicar ${categoryLabel(vehicleCategoryCode)} en ${serviceLabel(selectedService)}`}
                          checked={published}
                          disabled={!tariff || !publication.isSuccess || visibility.isPending}
                          onCheckedChange={(isPublished) => {
                            if (!isPublished && !window.confirm(`¿Ocultar ${categoryLabel(vehicleCategoryCode)} para los clientes de ${serviceLabel(selectedService)}? Se conservará su tarifa.`)) return;
                            visibility.mutate({ serviceCode: selectedService, vehicleCategoryCode, isPublished });
                          }}
                        />
                      ) : null}
                    </div>
                    {canManage ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => openTariff(selectedService, vehicleCategoryCode, tariff)}
                        aria-label={tariff ? "Editar tarifa" : "Configurar tarifa"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>

                  {!tariff ? (
                    <div className="mt-5 rounded-xl border border-dashed border-border/80 bg-background/40 p-5 text-center admin-graphite-inset">
                      <p className="text-sm font-medium text-foreground">Tarifa sin configurar</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Define la estructura comercial para esta modalidad.
                      </p>
                      {canManage ? (
                        <Button
                          className="mt-4"
                          size="sm"
                          onClick={() => openTariff(selectedService, vehicleCategoryCode, null)}
                        >
                          Configurar tarifa
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className={`tuktuk-v3-price-km mt-5 rounded-xl border p-4 ${selectedVisual.pricePanel}`}>
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Route className={`h-3.5 w-3.5 ${selectedVisual.text}`} />
                          Precio por kilómetro
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-2xl font-semibold tracking-tight text-foreground">
                              {usd(tariff.perKmPriceUsd ?? null)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              ≈ {cup(tariff.perKmPriceUsd ?? null, rate)} / km
                            </p>
                          </div>
                          <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            por km
                          </span>
                        </div>
                      </div>

                      <div
                        className={`mt-3 grid gap-2 ${
                          selectedService === "passenger" ? "grid-cols-2" : "grid-cols-3"
                        }`}
                      >
                        {secondaryMetrics.map(([label, value]) => (
                          <Metric
                            key={label}
                            label={label}
                            value={value}
                            cupValue={cup(value, rate)}
                          />
                        ))}
                      </div>

                      {selectedService === "passenger" &&
                      vehicleCategoryCode === "light_car" &&
                      airport ? (
                        <div className="tuktuk-v3-special mt-3 rounded-xl border border-amber-500/35 p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-500">
                                  Regla especial
                                </span>

                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                    airport.status === "active"
                                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                                      : "border-border/70 bg-background/60 text-muted-foreground"
                                  }`}
                                >
                                  {airport.status === "active" ? "Activa" : "Inactiva"}
                                </span>
                              </div>

                              <p className="mt-1 text-sm font-semibold text-foreground">
                                Aeropuerto José Martí
                              </p>

                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Destino · radio {String(airport.conditionConfig.radius_km ?? 3)} km
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">
                                  +{usd(airport.adjustmentValue)}
                                </p>

                                <p className="text-[10px] text-muted-foreground">
                                  ≈ {cup(airport.adjustmentValue, rate)}
                                </p>
                              </div>

                              {canManage ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() =>
                                    setAdjustmentDraft({
                                      item: airport,
                                      value: airport.adjustmentValue,
                                      enabled: airport.status === "active",
                                    })
                                  }
                                >
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                  Editar regla
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {canManage ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4 w-full"
                          onClick={() => openTariff(selectedService, vehicleCategoryCode, tariff)}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Editar tarifa
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </section>
      ) : null}

      <Dialog
        open={Boolean(editing && draft)}
        onOpenChange={(open) => {
          if (!open && !save.isPending) {
            setEditing(null);
            setDraft(null);
          }
        }}
      >
        {editing && draft ? (
          <DialogContent className="tuktuk-v3-editor sm:max-w-3xl admin-graphite-dialog">
            <DialogHeader className="pr-8">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    serviceVisuals[editing.serviceCode].active.split(" ")[0]
                  }`}
                />
                <DialogTitle>
                  {editing.tariff ? "Editar" : "Configurar"} tarifa ·{" "}
                  {serviceLabel(editing.serviceCode)} · {categoryLabel(editing.vehicleCategoryCode)}
                </DialogTitle>
              </div>

              <DialogDescription>
                Los importes CUP se actualizan al cambiar la tasa y no se almacenan.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 md:grid-cols-2">
              {(editing.serviceCode === "passenger" ? passengerFields : cargoCourierFields).map(
                ([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{label} (USD)</Label>

                    <Input
                      className="tuktuk-v3-field h-12 border-slate-400/65 bg-slate-800/90 px-3 text-base font-semibold text-white focus-visible:border-cyan-300 focus-visible:ring-cyan-400/70"
                      type="number"
                      min={key === "basePriceUsd" || key === "minimumPriceUsd" ? 0.0001 : 0}
                      step="0.0001"
                      value={numberValue(draft[key])}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          [key]: Number(event.target.value),
                          ...(editing.serviceCode === "passenger"
                            ? {}
                            : { perExtraPassengerPriceUsd: 0 }),
                        })
                      }
                    />

                    <p className="text-xs text-muted-foreground">
                      Vista previa: ≈ {cup(draft[key], rate)}
                    </p>
                  </div>
                ),
              )}
            </div>

            {pricingRouteScenario && pricingRouteScenario.serviceCode === editing.serviceCode && (() => {
              const quote = pricingRouteScenario.quotes[editing.vehicleCategoryCode];
              const rateSnapshot = Number(quote?.exchange_rate_snapshot);
              const increment = Number(quote?.pricing_breakdown?.rounding_increment ?? 100);
              const currentCup = Number(quote?.recommended_price);
              const hasSurcharges = Boolean(quote?.pricing_breakdown?.adjustments?.length);
              const km = pricingRouteScenario.distanceKm;
              const projectedUsd = Math.max(
                draft.minimumPriceUsd,
                draft.basePriceUsd + draft.perKmPriceUsd * km,
              );
              const validPreview = Number.isFinite(projectedUsd) && projectedUsd > 0 &&
                Number.isFinite(rateSnapshot) && rateSnapshot > 0 &&
                Number.isFinite(increment) && increment > 0 && Number.isFinite(currentCup);
              const projectedCup = validPreview ? Math.ceil(projectedUsd * rateSnapshot / increment) * increment : null;
              return (
                <div className="tuktuk-v3-impact mb-3 rounded-xl border border-cyan-400/45 p-3">
                  <p className="mb-2 text-xs font-semibold text-cyan-200">Impacto sobre la ruta · {km.toFixed(2)} km</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-slate-300">Tarifa publicada</p><p className="text-xl font-bold tabular-nums text-foreground">{Number.isFinite(currentCup) ? `${currentCup.toLocaleString("es-CU")} CUP` : "—"}</p></div>
                    <div><p className="text-xs text-slate-300">Propuesta estructural</p><p className="text-xl font-bold tabular-nums text-foreground">{projectedCup == null ? "—" : `${projectedCup.toLocaleString("es-CU")} CUP`}</p></div>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">
                    {hasSurcharges
                      ? "Hay recargos activos en esta ruta: la propuesta mostrada excluye esos recargos y NO equivale a una cotización final."
                      : "Estimación de base, mínimo y kilómetros con la tasa automática de la cotización. No publica cambios."}
                  </p>
                </div>
              );
            })()}
            <DialogFooter className="border-t border-border/60 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => {
                  setEditing(null);
                  setDraft(null);
                }}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                disabled={
                  save.isPending ||
                  draft.basePriceUsd <= 0 ||
                  draft.minimumPriceUsd <= 0 ||
                  draft.perKmPriceUsd < 0 ||
                  draft.perStopPriceUsd < 0
                }
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <DollarSign className="mr-2 h-4 w-4" />
                )}
                Guardar tarifa
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(adjustmentDraft)}
        onOpenChange={(open) => {
          if (!open && !publishAdjustment.isPending) {
            setAdjustmentDraft(null);
          }
        }}
      >
        {adjustmentDraft ? (
          <DialogContent className="sm:max-w-lg admin-graphite-dialog">
            <DialogHeader className="pr-8">
              <DialogTitle>Regla especial · Aeropuerto José Martí</DialogTitle>

              <DialogDescription>
                Recargo aplicado a Auto ligero cuando el destino corresponde al Aeropuerto
                Internacional José Martí.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              <div className="space-y-1.5">
                <Label>Recargo (USD)</Label>

                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustmentDraft.value}
                  onChange={(event) =>
                    setAdjustmentDraft({
                      ...adjustmentDraft,
                      value: Number(event.target.value),
                    })
                  }
                />

                <p className="text-xs text-muted-foreground">
                  Vista previa: ≈ {cup(adjustmentDraft.value, rate)}
                </p>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-border/70 bg-background/40 p-3 admin-graphite-inset">
                <div>
                  <p className="text-sm font-medium text-foreground">Regla activa</p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Se aplicará automáticamente cuando coincidan las condiciones configuradas.
                  </p>
                </div>

                <Switch
                  checked={adjustmentDraft.enabled}
                  onCheckedChange={(enabled) =>
                    setAdjustmentDraft({
                      ...adjustmentDraft,
                      enabled,
                    })
                  }
                />
              </label>

              <div className="rounded-xl border border-border/60 bg-background/35 p-3 text-xs text-muted-foreground admin-graphite-inset">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Dirección: {String(adjustmentDraft.item.conditionConfig.direction ?? "destino")}
                  </span>

                  <span>
                    Radio: {String(adjustmentDraft.item.conditionConfig.radius_km ?? 3)} km
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border/60 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={publishAdjustment.isPending}
                onClick={() => setAdjustmentDraft(null)}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                disabled={publishAdjustment.isPending || adjustmentDraft.value < 0}
                onClick={() => publishAdjustment.mutate()}
              >
                {publishAdjustment.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <DollarSign className="mr-2 h-4 w-4" />
                )}
                Guardar regla
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
        </div>
      </div>
    </section>
  );
}
