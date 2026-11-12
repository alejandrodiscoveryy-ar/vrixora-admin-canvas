import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Mail,
  LayoutDashboard,
  FileText,
  Phone,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { supabaseServices } from "@/lib/services";
import type {
  MarketplaceDriver360,
  MarketplaceDriverFinancial360,
  MarketplaceDriverRecordSummary,
} from "@/lib/services";
import type { MarketplaceDirectoryDriverMedia } from "@/lib/marketplace-map";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/admin/MetricCard";
import { premiumSurface, premiumHeaderSurface, premiumColumnHeaderSurface, premiumControlSurface } from "@/components/admin/density";
import { driverWhatsAppLinks } from "@/lib/driver-whatsapp";
import MarketplaceDriverManagementPanel from "@/features/admin/MarketplaceDriverManagementPanel";
import MarketplaceDriverVehicleEditor from "@/features/admin/MarketplaceDriverVehicleEditor";

const date = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(parsed);
};
const amount = (value: number, currency: string) =>
  `${new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
const text = (value: string | null | undefined, fallback = "No registrado") =>
  value?.trim() ? value : fallback;
const statusText = (status: string) =>
  (
    ({
      active: "Activo",
      suspended: "Suspendido",
      incomplete: "Perfil incompleto",
      published: "Publicado",
      accepted: "Aceptado",
      en_route: "En camino",
      pickup: "Recogida",
      in_progress: "En curso",
      completed: "Completado",
      settled: "Liquidado",
      incident: "Incidencia",
      expired: "Expirado",
      cancelled_by_customer: "Cancelado por cliente",
      cancelled_by_driver: "Cancelado por conductor",
      cancelled: "Cancelado",
    }) as Record<string, string>
  )[status] ?? status;
const serviceText = (service: string) =>
  ({ passenger: "Pasajeros", cargo: "Carga", courier: "Mensajería", tourism: "Turismo" })[
    service
  ] ?? service;
const statusClass = (status: string) => {
  if (["active", "completed", "settled"].includes(status))
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (["incident", "suspended", "cancelled_by_customer", "cancelled_by_driver"].includes(status))
    return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  return "border-cyan-400/20 bg-cyan-400/[0.07] text-primary";
};

function ImageWithFallback({
  url,
  alt,
  variant,
}: {
  url: string | null | undefined;
  alt: string;
  variant: "portrait" | "vehicle";
}) {
  return (
    <div
      className={
        variant === "portrait"
          ? "relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-default bg-surface-2 text-primary sm:h-20 sm:w-20"
          : "relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] text-primary"
      }
    >
      {variant === "portrait" ? (
        <UserRound className="h-9 w-9" />
      ) : (
        <CarFront className="h-9 w-9" />
      )}
      {url ? (
        <img
          key={url}
          src={url}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words text-[13px] font-medium text-foreground">{value}</div>
    </div>
  );
}

function RecordMetric({
  label,
  value,
  note,
  tone = "cyan",
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "cyan" | "emerald" | "amber";
}) {
  return <MetricCard density="compact" appearance="premium" label={label} value={value}
    description={note} semanticState={tone === "emerald" ? "success" : tone === "amber" ? "warning" : "info"} />;
}

type DriverTab = "overview" | "vehicle" | "management" | "activity" | "financial";
const driverTabs = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "vehicle", label: "Vehículo", icon: CarFront },
  { id: "management", label: "Expediente", icon: FileText },
  { id: "activity", label: "Actividad", icon: Clock3 },
  { id: "financial", label: "Finanzas", icon: Wallet },
] as const;

export default function MarketplaceDriver360Record({
  projectId,
  driverUserId,
  detail,
  media,
  financial,
  financialLoading,
  canSeeFinancial,
  canManageDriver,
  isAvailable,
  onOpenJob,
  onChangeSuspension,
}: {
  projectId: string;
  driverUserId: string;
  detail: MarketplaceDriver360;
  media: MarketplaceDirectoryDriverMedia | null;
  financial: MarketplaceDriverFinancial360 | null;
  financialLoading: boolean;
  canSeeFinancial: boolean;
  canManageDriver: boolean;
  isAvailable: boolean | null;
  onOpenJob: (jobId: string) => void;
  onChangeSuspension: (suspend: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<DriverTab>("overview");
  const record = useInfiniteQuery({
    queryKey: ["marketplace-driver-360-record", projectId, driverUserId],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.getDriverRecord(projectId, driverUserId, {
        limit: 10,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    retry: 1,
  });

  const summary: MarketplaceDriverRecordSummary | null = record.data?.pages[0]?.summary ?? null;
  const history = record.data?.pages.flatMap((page) => page.items) ?? [];
  const displayName = text(detail.account?.displayName, "Conductor");
  const currency = financial?.topups[0]?.currency ?? financial?.documents[0]?.currency ?? "CUP";
  const availableBalance = financial
    ? financial.wallet.realAvailableBalance + financial.wallet.promotionalAvailableBalance
    : null;
  const completionRate =
    summary && summary.services > 0
      ? `${Math.round((summary.completed / summary.services) * 100)} %`
      : "—";
  const rating =
    summary && summary.ratingCount > 0 && summary.ratingAverage != null
      ? `${summary.ratingAverage.toFixed(1)} / 5`
      : "—";
  const contactPhone = detail.account?.phone?.trim() || null;
  const whatsApp = driverWhatsAppLinks(contactPhone);
  const contactEmail = detail.account?.email?.trim() || null;
  const mainVehicle =
    detail.vehicles.find((entry) => entry.assignment?.isActive) ?? detail.vehicles[0];

  return (
    <div className="min-w-0 space-y-3">
      <section className={cn("relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumHeaderSurface)}>
        <div aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3 select-none text-5xl font-bold leading-none text-primary opacity-[0.06] sm:text-6xl dark:opacity-[0.07]">360°</div>
        <div className="relative flex min-w-0 flex-wrap items-start gap-3 sm:items-center">
          <ImageWithFallback
            url={media?.avatarUrl}
            alt={`Imagen de perfil de ${displayName}`}
            variant="portrait"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Expediente del conductor
            </p>
            <h2 className="mt-1 break-words text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {displayName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(detail.driver.status)}`}
              >
                {statusText(detail.driver.status)}
              </span>
              {isAvailable != null ? (
                <span className={cn("rounded-full border bg-surface-1 px-2.5 py-1 text-[11px] text-foreground", premiumControlSurface)}>
                  {isAvailable ? "Disponible para trabajos" : "No disponible"}
                </span>
              ) : null}
            </div>
            <p className="mt-2.5 break-words text-sm text-muted-foreground">
              {mainVehicle?.vehicle.name
                ? `Vehículo principal: ${mainVehicle.vehicle.name}`
                : "Sin vehículo principal"}
              {" · "}Alta: {date(detail.driver.activatedAt ?? detail.driver.createdAt)}
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap gap-2 max-sm:[&_a]:min-h-11 sm:ml-auto sm:w-auto sm:self-center">
            {whatsApp ? (
              <Button size="sm" variant="outline" asChild>
                <a
                  className="border-emerald-500/30 text-emerald-200"
                  href={whatsApp.web}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              </Button>
            ) : null}
            {contactPhone ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${contactPhone}`}>
                  <Phone className="mr-1.5 h-4 w-4" />
                  Llamar
                </a>
              </Button>
            ) : null}
            {contactEmail ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${contactEmail}`}>
                  <Mail className="mr-1.5 h-4 w-4" />
                  Correo
                </a>
              </Button>
            ) : null}
          </div>
        </div>
        <div className="relative mt-3 grid gap-2 border-t border-cyan-400/10 pt-3 sm:grid-cols-2">
          <Fact label="Teléfono / WhatsApp" value={text(contactPhone)} />
          <Fact label="Correo" value={text(contactEmail)} />
        </div>
        {detail.driver.status === "suspended" && detail.driver.suspensionReason ? (
          <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-200">
            Motivo de suspensión: {detail.driver.suspensionReason}
          </div>
        ) : null}
      </section>


      <nav aria-label="Secciones de la ficha 360" className={cn("min-w-0 rounded-[var(--radius-card)] border p-1.5", premiumSurface)}>
        <div role="tablist" aria-label="Contenido del conductor" className="grid min-w-0 grid-cols-2 gap-1 sm:flex sm:flex-wrap">
          {driverTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={"driver-tab-" + id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls="driver-360-current-panel"
              onClick={() => setActiveTab(id)}
              className={activeTab === id
                ? "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-primary/40 bg-primary/10 px-2 text-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
                : "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-transparent px-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring sm:px-3"}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div id="driver-360-current-panel" role="tabpanel" aria-labelledby={"driver-tab-" + activeTab} className="min-w-0 space-y-3 max-sm:[&_button]:min-h-11">
      {activeTab === "overview" ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className={cn("relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
            <div aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 select-none text-5xl font-bold leading-none text-primary opacity-[0.05]">TT</div>
            <div className="relative flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Vehículo principal</p>
                <h3 className="mt-1 text-lg font-semibold text-text-primary">{text(mainVehicle?.vehicle.name, "Sin vehículo asociado")}</h3>
              </div>
              {mainVehicle?.assignment?.isActive ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">Principal</span>
              ) : null}
            </div>
            {mainVehicle ? (
              <div className="relative mt-3 grid min-w-0 gap-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
                <ImageWithFallback variant="vehicle" url={media?.vehiclePhotos[mainVehicle.vehicle.id]} alt="Fotografía del vehículo principal" />
                <div className="min-w-0 space-y-2">
                  <Fact label="Categoría" value={text(mainVehicle.vehicle.categoryCode)} />
                  <Fact label="Marca y modelo" value={[mainVehicle.vehicle.brand, mainVehicle.vehicle.model].filter(Boolean).join(" · ") || "No registrados"} />
                  <p className="text-xs text-text-secondary">{mainVehicle.services.map(serviceText).join(" · ") || "Sin servicios activos"}</p>
                </div>
              </div>
            ) : <p className="relative mt-4 text-sm text-text-secondary">Este conductor aún no tiene un vehículo asociado.</p>}
            <Button variant="outline" size="sm" className="relative mt-4 border-cyan-400/30 text-primary" onClick={() => setActiveTab("vehicle")}>Ver ficha del vehículo <ArrowUpRight className="ml-1.5 h-4 w-4" /></Button>
          </section>

          <section className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)} aria-label="Indicadores esenciales del conductor">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Vista ejecutiva</p>
                <h3 className="mt-1 text-lg font-semibold text-text-primary">Actividad y reputación</h3>
              </div>
              <Button size="sm" variant="ghost" className="text-primary" onClick={() => setActiveTab("activity")}>Detalle <ArrowUpRight className="ml-1 h-4 w-4" /></Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <RecordMetric label="Carreras reales" value={summary?.services ?? "—"} />
              <RecordMetric label="Completadas" value={summary?.completed ?? "—"} tone="emerald" />
              <RecordMetric label="Valoración" value={rating} tone="amber" />
              <RecordMetric label="Incidencias" value={summary?.incidents ?? "—"} />
            </div>
            <div className={cn("mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border p-3", premiumColumnHeaderSurface)}>
              <span className="text-sm text-text-secondary">Situación administrativa</span>
              <Button size="sm" variant="outline" className="h-8 border-cyan-400/20" onClick={() => setActiveTab("management")}>Abrir expediente</Button>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "vehicle" ? (
      <section
        aria-label="Información del vehículo"
        className={cn("rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}
      >
        <div className="flex items-center gap-2">
          <CarFront className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Información del vehículo</h3>
        </div>
        {detail.vehicles.length ? (
          <div className="mt-3 space-y-4">
            {detail.vehicles.map((item) => (
              <div
                key={item.vehicle.id}
                className={cn("grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)] sm:items-start", premiumColumnHeaderSurface)}
              >
                <div className="min-w-0">
                  <ImageWithFallback
                    variant="vehicle"
                    url={media?.vehiclePhotos[item.vehicle.id]}
                    alt={`Vehículo ${item.vehicle.name}`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold text-foreground">
                      {text(item.vehicle.name, "Vehículo")}
                    </p>
                    {item.assignment?.isActive ? (
                      <span className="text-xs text-emerald-300">Principal</span>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {[item.vehicle.brand, item.vehicle.model, item.vehicle.year]
                      .filter(Boolean)
                      .join(" · ") || "Sin marca o modelo registrados"}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Fact label="Categoría" value={text(item.vehicle.categoryCode)} />
                    <Fact
                      label="Estado"
                      value={statusText(item.vehicle.marketplaceStatus ?? "incomplete")}
                    />
                    {item.vehicle.registration ? (
                      <Fact label="Matrícula" value={item.vehicle.registration} />
                    ) : null}
                    {item.assignment ? (
                      <Fact
                        label="Disponibilidad"
                        value={item.assignment.isAvailable ? "Disponible" : "No disponible"}
                      />
                    ) : null}
                  </div>
                  {item.services.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.services.map((service) => (
                        <span
                          key={service}
                          className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[11px] text-primary"
                        >
                          {serviceText(service)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {canManageDriver ? (
                  <MarketplaceDriverVehicleEditor
                    projectId={projectId}
                    driverUserId={driverUserId}
                    vehicleId={item.vehicle.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Sin vehículos asociados.</p>
        )}
      </section>
      ) : null}

      {canManageDriver && activeTab === "management" ? (
        <MarketplaceDriverManagementPanel
          projectId={projectId}
          driverUserId={driverUserId}
          onOpenJob={onOpenJob}
        />
      ) : null}

      {canManageDriver && activeTab === "management" ? (
        <section
          aria-label="Acciones administrativas sensibles"
          className="flex flex-col gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">Acciones administrativas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cambiar el estado del conductor requiere una confirmación independiente.
            </p>
          </div>
          <Button
            type="button"
            variant={detail.driver.status === "suspended" ? "outline" : "destructive"}
            onClick={() => onChangeSuspension(detail.driver.status !== "suspended")}
          >
            {detail.driver.status === "suspended" ? "Reactivar conductor" : "Suspender conductor"}
          </Button>
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <>
      <section aria-label="Récord profesional" className="space-y-2.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Trayectoria
            </p>
            <h3 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
              Récord profesional
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Solo servicios reales, sin pruebas eliminadas
          </p>
        </div>
        {record.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-sm text-amber-200"
          >
            No se pudo consultar el récord actualizado. La información existente del perfil sigue
            disponible.
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <RecordMetric
            label="Servicios realizados"
            value={summary?.services ?? "—"}
            note="Sin carreras de prueba"
          />
          <RecordMetric
            label="Completados"
            value={summary?.completed ?? "—"}
            note={summary ? `${completionRate} finalizados` : "Consultando…"}
            tone="emerald"
          />
          <RecordMetric
            label="Valoración"
            value={rating}
            note={summary?.ratingCount ? `${summary.ratingCount} evaluaciones` : "Sin evaluaciones"}
            tone="amber"
          />
          <RecordMetric
            label="Incidencias"
            value={summary?.incidents ?? "—"}
            note={summary ? `${summary.cancelled} cancelaciones` : "Consultando…"}
          />
        </div>
        {summary && summary.testServices > 0 ? (
          <p className="text-xs text-muted-foreground">
            Además, {summary.testServices}{" "}
            {summary.testServices === 1
              ? "servicio de prueba visible"
              : "servicios de prueba visibles"}
            , excluidos del récord profesional.
          </p>
        ) : null}
      </section>

      <div className="min-w-0">
        <section
          className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}
          aria-label="Historial de servicios"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/55 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                Actividad
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">
                Historial de servicios
              </h3>
            </div>
            <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
              Más recientes primero
            </span>
          </div>
          {record.isPending ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Consultando historial…</p>
          ) : null}
          {record.isError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Historial temporalmente no disponible.
            </p>
          ) : null}
          {!record.isPending && !record.isError && history.length === 0 ? (
            <div className="py-10 text-center">
              <Clock3 className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold text-foreground">
                Todavía no registra servicios
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Las carreras aparecerán aquí cuando se asignen al conductor.
              </p>
            </div>
          ) : null}
          {history.length > 0 ? (
            <ol className="mt-4 space-y-2.5">
              {history.map((job) => (
                <li
                  key={job.jobId}
                  className={cn("min-w-0 rounded-xl border p-3", premiumColumnHeaderSurface)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {serviceText(job.serviceCode)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{date(job.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {job.isTest ? (
                        <span className="rounded-lg border border-amber-400/25 px-2 py-0.5 text-[11px] text-amber-200">
                          Prueba
                        </span>
                      ) : null}
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-[11px] ${statusClass(job.status)}`}
                      >
                        {statusText(job.status)}
                      </span>
                    </div>
                  </div>
                  {job.originText && job.destinationText ? (
                    <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                      {job.originText} → {job.destinationText}
                    </p>
                  ) : null}
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                    <span className="text-sm font-semibold text-foreground">
                      {amount(job.finalPrice, job.currency)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-primary"
                      onClick={() => onOpenJob(job.jobId)}
                    >
                      Ver servicio <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {job.ratingStars != null ? (
                    <p className="mt-1 text-xs text-amber-200">Evaluación: {job.ratingStars} / 5</p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          {record.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              disabled={record.isFetchingNextPage}
              onClick={() => void record.fetchNextPage()}
            >
              {record.isFetchingNextPage ? "Cargando…" : "Ver servicios anteriores"}
            </Button>
          ) : null}
        </section>

      </div>
        </>
      ) : null}

      {activeTab === "financial" ? (
        <div className="min-w-0">
        <aside className="grid min-w-0 gap-4 md:grid-cols-2" aria-label="Datos del expediente">
          <section className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-300" />
              <h3 className="text-sm font-semibold text-foreground">Promoción y referidos</h3>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Fact
                label="Promoción"
                value={
                  detail.promotion
                    ? `${detail.promotion.durationDaysSnapshot} días · regla v${detail.promotion.ruleVersionSnapshot}`
                    : "Sin promoción"
                }
              />
              {detail.promotion ? (
                <>
                  <Fact label="Inicio de promoción" value={date(detail.promotion.startedAt)} />
                  <Fact label="Válida hasta" value={date(detail.promotion.endsAt)} />
                </>
              ) : null}
              <Fact label="Código de referido" value={text(detail.referral.code)} />
              <Fact
                label="Referidos / premiados"
                value={`${detail.referral.referredCount} / ${detail.referral.rewardedCount}`}
              />
            </div>
          </section>

          <section className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-300" />
              <h3 className="text-sm font-semibold text-foreground">Situación financiera</h3>
            </div>
            {!canSeeFinancial ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4" /> Información restringida por permisos.
              </p>
            ) : financialLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Consultando saldos…</p>
            ) : financial ? (
              <>
                <p className="mt-3 text-xs text-muted-foreground">Saldo disponible</p>
                <p className="mt-1 text-xl font-bold text-emerald-200">
                  {amount(availableBalance ?? 0, currency)}
                </p>
                <details className={cn("group mt-3 rounded-xl border p-3", premiumColumnHeaderSurface)}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-foreground">
                    Desglose financiero{" "}
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Fact
                      label="Saldo real"
                      value={amount(financial.wallet.realBalance, currency)}
                    />
                    <Fact
                      label="Promocional"
                      value={amount(financial.wallet.promotionalBalance, currency)}
                    />
                    <Fact
                      label="Reservado"
                      value={amount(
                        financial.wallet.realReservedBalance +
                          financial.wallet.promotionalReservedBalance,
                        currency,
                      )}
                    />
                    <Fact label="Comisiones" value={amount(financial.commissionTotal, currency)} />
                    <Fact label="Recargas" value={String(financial.topups.length)} />
                    <Fact label="Comprobantes" value={String(financial.documents.length)} />
                    <Fact
                      label="Créditos por referidos"
                      value={amount(
                        financial.referralCredits.reduce((sum, credit) => sum + credit.amount, 0),
                        currency,
                      )}
                    />
                  </div>
                  {financial.topups.length ? (
                    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                      <p className="text-xs font-semibold text-foreground">Últimas recargas</p>
                      {financial.topups.slice(0, 5).map((topup) => (
                        <div
                          key={topup.id}
                          className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
                        >
                          <span>
                            {date(topup.requestedAt)} · {topup.status}
                          </span>
                          <span className="font-semibold text-foreground">
                            {amount(topup.amount, topup.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {financial.documents.length ? (
                    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                      <p className="text-xs font-semibold text-foreground">Últimos comprobantes</p>
                      {financial.documents.slice(0, 5).map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
                        >
                          <span>
                            {text(doc.documentNumber)} · {date(doc.issuedAt)}
                          </span>
                          <span className="font-semibold text-foreground">
                            {amount(doc.amount, doc.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </details>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No se pudo consultar el saldo.</p>
            )}
          </section>
        </aside>
      </div>
      ) : null}

      {activeTab === "activity" ? (
      <div className={cn("rounded-xl border px-3 py-2.5 text-xs text-muted-foreground", premiumColumnHeaderSurface)}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Registro administrativo de solo
          lectura.
        </div>
        <p className="mt-1">
          Las pruebas eliminadas no forman parte del récord. Cada servicio conserva su detalle
          original.
        </p>
      </div>
      ) : null}
      </div>
    </div>
  );
}
