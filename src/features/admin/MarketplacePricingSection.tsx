import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bike,
  Boxes,
  CarFront,
  DollarSign,
  ExternalLink,
  Package,
  Pencil,
  RefreshCw,
  Route,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/admin/SectionCard";
import {
  supabaseServices,
  type MarketplacePricingAdjustment,
  type MarketplacePricingTariff,
  type MarketplacePricingTariffInput,
} from "@/lib/services";
import { getElToqueIntegration } from "@/lib/eltoque-integration";
import { useProjectPermissions } from "@/hooks/useProjects";

type PricingFieldKey =
  | "basePriceUsd"
  | "minimumPriceUsd"
  | "perKmPriceUsd"
  | "perExtraPassengerPriceUsd"
  | "perStopPriceUsd";

type ServiceCode = "passenger" | "cargo" | "courier";

type EditingTarget = {
  serviceCode: ServiceCode;
  vehicleCategoryCode: string;
  tariff: MarketplacePricingTariff | null;
};

const serviceOptions: Array<{
  code: ServiceCode;
  label: string;
  caption: string;
}> = [
  { code: "passenger", label: "Pasajeros", caption: "Traslados de personas" },
  { code: "cargo", label: "Carga", caption: "Objetos y mercancías" },
  { code: "courier", label: "Mensajería", caption: "Paquetes y entregas" },
];

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
  motorcycle: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  tricycle: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  van: "border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400",
  truck: "border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  other: "border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

const passengerCategories = ["light_car", "bicitaxi", "motorcycle", "tricycle"] as const;

const cargoCourierCategories = [
  "light_car",
  "bicitaxi",
  "tricycle",
  "motorcycle",
  "van",
  "truck",
  "other",
] as const;

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
    <div className="min-w-0 rounded-xl border border-border/60 bg-background/55 px-3 py-2.5">
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

  const adjustments = useQuery({
    queryKey: ["marketplace-pricing-adjustments", projectId],
    queryFn: () => supabaseServices.marketplace.listPricingAdjustments(projectId),
  });

  const exchange = useQuery({
    queryKey: ["eltoque-integration", projectId],
    queryFn: () => getElToqueIntegration(projectId),
    refetchInterval: 60_000,
  });

  const [selectedService, setSelectedService] = useState<ServiceCode>("passenger");
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [draft, setDraft] = useState<MarketplacePricingTariffInput | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<{
    item: MarketplacePricingAdjustment;
    value: number;
    enabled: boolean;
  } | null>(null);

  const save = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.savePricingTariff(projectId, {
        ...draft!,
        perExtraPassengerPriceUsd:
          draft!.serviceCode === "passenger" ? draft!.perExtraPassengerPriceUsd : 0,
      }),
    onSuccess: () => {
      toast.success("Nueva tarifa publicada.");
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
  const categories = selectedService === "passenger" ? passengerCategories : cargoCourierCategories;

  const serviceTariffs = tariffs.data?.filter((item) => item.serviceCode === selectedService) ?? [];
  const configuredCount = categories.filter((vehicleCategoryCode) =>
    serviceTariffs.some((item) => item.vehicleCategoryCode === vehicleCategoryCode),
  ).length;

  const selectedVisual = serviceVisuals[selectedService];

  const openTariff = (
    serviceCode: ServiceCode,
    vehicleCategoryCode: string,
    tariff: MarketplacePricingTariff | null,
  ) => {
    setEditing({ serviceCode, vehicleCategoryCode, tariff });
    setDraft(tariff ? inputFrom(tariff) : emptyInput(serviceCode, vehicleCategoryCode));
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Tasa USD/CUP vigente</h3>
                {!exchange.isLoading && !exchange.isError ? (
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                    Disponible
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Conversión de referencia. Las tarifas maestras permanecen en USD.
              </p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link
              to="/admin/proyectos/$id/$section"
              params={{ id: projectId, section: "integraciones" }}
            >
              Gestionar tasa <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="border-t border-border/60 bg-background/35 px-5 py-3">
          {exchange.isLoading ? (
            <p className="text-sm text-muted-foreground">Consultando tasa vigente…</p>
          ) : exchange.isError ? (
            <p className="text-sm text-destructive">
              No se pudo consultar la tasa. Las tarifas siguen expresadas en USD.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">Cambio</span>
                <strong className="ml-2 text-sm text-foreground">
                  1 USD = {rate.toLocaleString("es-CU")} CUP
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground">Fuente</span>
                <span className="ml-2 font-medium text-foreground">
                  {exchange.data?.rateSource ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Estado</span>
                <span className="ml-2 font-medium text-foreground">
                  {exchange.data?.lastAutoSyncStatus ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Actualizada</span>
                <span className="ml-2 font-medium text-foreground">
                  {exchange.data?.rateUpdatedAt
                    ? new Date(exchange.data.rateUpdatedAt).toLocaleString("es-CU")
                    : "—"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/55 p-2 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          {serviceOptions.map((service) => {
            const active = selectedService === service.code;
            const visual = serviceVisuals[service.code];

            return (
              <button
                key={service.code}
                type="button"
                onClick={() => {
                  setSelectedService(service.code);
                  setEditing(null);
                  setDraft(null);
                }}
                className={`rounded-xl px-3 py-3 text-left transition ${
                  active ? visual.active : visual.idle
                }`}
              >
                <span className="block text-sm font-semibold">{service.label}</span>
                <span
                  className={`mt-0.5 hidden text-[11px] sm:block ${
                    active ? "text-white/80" : "text-muted-foreground"
                  }`}
                >
                  {service.caption}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${selectedVisual.text}`} />
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {serviceLabel(selectedService)}
            </h3>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {serviceDescription(selectedService)}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/70 bg-card px-3 py-1.5">
            {configuredCount} de {categories.length} modalidades configuradas
          </span>
          <span className="hidden rounded-full border border-border/70 bg-card px-3 py-1.5 md:inline-flex">
            USD · conversión automática a CUP
          </span>
        </div>
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
                className={`group relative overflow-hidden rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedVisual.card}`}
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
                    <div className="mt-5 rounded-xl border border-dashed border-border/80 bg-background/40 p-5 text-center">
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
                      <div className={`mt-5 rounded-xl border p-4 ${selectedVisual.pricePanel}`}>
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

      {editing && draft ? (
        <SectionCard
          title={`${editing.tariff ? "Editar" : "Configurar"} tarifa USD · ${serviceLabel(
            editing.serviceCode,
          )} · ${categoryLabel(editing.vehicleCategoryCode)}`}
          description="Los importes CUP se actualizan al cambiar la tasa y no se almacenan."
          module="planes"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {(editing.serviceCode === "passenger" ? passengerFields : cargoCourierFields).map(
              ([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label} (USD)</Label>
                  <Input
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

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={
                save.isPending ||
                draft.basePriceUsd <= 0 ||
                draft.minimumPriceUsd <= 0 ||
                draft.perKmPriceUsd < 0 ||
                draft.perStopPriceUsd < 0
              }
              onClick={() => {
                const fieldSet =
                  editing.serviceCode === "passenger" ? passengerFields : cargoCourierFields;

                const summary = fieldSet
                  .map(([key, label]) => {
                    const oldValue = editing.tariff ? inputFrom(editing.tariff)[key] : null;
                    return `${label}: ${
                      oldValue == null ? "Sin configurar" : `$${oldValue} USD`
                    } → $${draft[key]} USD (≈ ${cup(draft[key], rate)})`;
                  })
                  .join("\n");

                if (
                  window.confirm(
                    `Publicar tarifa para ${categoryLabel(
                      editing.vehicleCategoryCode,
                    )}\n\nServicio: ${serviceLabel(
                      editing.serviceCode,
                    )}\n${summary}\n\nLas operaciones anteriores no cambian.`,
                  )
                ) {
                  save.mutate();
                }
              }}
            >
              {save.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <DollarSign className="mr-2 h-4 w-4" />
              )}
              Publicar nueva tarifa
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {selectedService === "passenger" ? (
        <div className="pt-2">
          <SectionCard
            title="Ajustes especiales"
            description="Reglas comerciales avanzadas que se aplican después de la tarifa base."
            module="planes"
          >
            {!airport ? (
              <p className="text-sm text-muted-foreground">
                No hay ajuste de aeropuerto configurado.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">Aeropuerto José Martí · Auto</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Recargo fijo · {airport.status === "active" ? "Activo" : "Inactivo"}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold">{usd(airport.adjustmentValue)}</p>
                      <p className="text-xs text-muted-foreground">
                        ≈ {cup(airport.adjustmentValue, rate)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/70 px-2.5 py-1">
                      Zona:{" "}
                      {String(
                        airport.conditionConfig.zone_name ?? "Aeropuerto Internacional José Martí",
                      )}
                    </span>
                    <span className="rounded-full border border-border/70 px-2.5 py-1">
                      Dirección: {String(airport.conditionConfig.direction ?? "destino")}
                    </span>
                    <span className="rounded-full border border-border/70 px-2.5 py-1">
                      Radio: {String(airport.conditionConfig.radius_km ?? 3)} km
                    </span>
                  </div>

                  {canManage ? (
                    <Button
                      className="mt-4"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAdjustmentDraft({
                          item: airport,
                          value: airport.adjustmentValue,
                          enabled: airport.status === "active",
                        })
                      }
                    >
                      Editar ajuste
                    </Button>
                  ) : null}
                </div>

                {adjustmentDraft ? (
                  <div className="space-y-3 rounded-xl border border-border/70 p-4">
                    <Label>Importe USD</Label>
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
                      ≈ {cup(adjustmentDraft.value, rate)} · CUP solo visual.
                    </p>
                    <label className="flex items-center gap-2">
                      Activo
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
                    <Button
                      disabled={publishAdjustment.isPending || adjustmentDraft.value < 0}
                      onClick={() => {
                        const old = adjustmentDraft.item;
                        if (
                          window.confirm(
                            `Ajuste: Aeropuerto José Martí - Auto\nValor actual: $${old.adjustmentValue} USD\nValor nuevo: $${adjustmentDraft.value} USD (≈ ${cup(
                              adjustmentDraft.value,
                              rate,
                            )})\nEstado actual: ${old.status}\nEstado nuevo: ${
                              adjustmentDraft.enabled ? "Activo" : "Inactivo"
                            }\n\nSe creará una nueva versión de esta regla. Las operaciones anteriores conservarán las condiciones con las que fueron calculadas.`,
                          )
                        ) {
                          publishAdjustment.mutate();
                        }
                      }}
                    >
                      Publicar nueva versión
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
