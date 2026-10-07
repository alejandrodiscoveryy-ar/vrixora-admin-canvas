import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Eye,
  Filter,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Route,
  ShieldCheck,
  Star,
  TestTube2,
  Trash2,
  UserRound,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import {
  supabaseServices,
  type MarketplaceCustomer360,
  type MarketplaceCustomerHistoryItem,
  type MarketplaceDriver360,
  type MarketplaceDriverFinancial360,
} from "@/lib/services";
import { useProjectPermissions } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MarketplaceOperationalMap from "@/features/admin/MarketplaceOperationalMap";
import MarketplaceDispatchSettingsCard from "@/features/admin/MarketplaceDispatchSettingsCard";

const PAGE_SIZE = 25;

const label = (value: string | null) =>
  ({
    requested: "Solicitado",
    published: "Publicado",
    accepted: "Aceptado",
    en_route: "En camino",
    pickup: "Recogida",
    in_progress: "En curso",
    completed: "Completado",
    settled: "Liquidado",
    incident: "Incidencia",
    expired: "Expirado",
    cancelled: "Cancelado",
    cancelled_by_customer: "Cancelado por cliente",
    cancelled_by_driver: "Cancelado por conductor",
    confirmed: "Confirmada",
    reconciled: "Conciliada",
    rejected: "Rechazada",
    active: "Activo",
    suspended: "Suspendido",
    incomplete: "Perfil incompleto",
    passenger: "Pasajeros",
    cargo: "Carga",
    courier: "Mensajería",
    tourism: "Turismo",
    wallet_commission: "Billetera",
    motorcycle: "Moto",
    bicitaxi: "Bicitaxi",
    tricycle: "Triciclo",
    light_car: "Auto",
  })[value ?? ""] ??
  value ??
  "—";

const text = (value: unknown) => (value == null || value === "" ? "—" : String(value));

const errorText = (error: unknown) =>
  error instanceof Error
    ? ({
        INITIAL_MINIMUM_DEPOSIT_REQUIRED: "El primer depósito debe alcanzar el mínimo configurado.",
        INVALID_MARKETPLACE_PROMOTION_DURATION: "La promoción debe durar entre 1 y 365 días.",
        INVALID_COMMISSION_RATE: "La comisión debe ser mayor que 0 % y no superar 100 %.",
        MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND:
          "No existe la configuración comercial del Marketplace para este proyecto.",
        RESOLUTION_NOTE_REQUIRED: "La nota de resolución es obligatoria.",
        SUSPENSION_REASON_REQUIRED: "El motivo es obligatorio.",
        JOB_NOT_IN_INCIDENT: "El trabajo ya no está en incidencia.",
        TEST_DRIVER_REQUIRED: "Selecciona el conductor de prueba.",
        TEST_FORCE_COMMISSION_REQUIRES_ENABLED_MODE: "Activa primero el modo de prueba.",
        TEST_DRIVER_NOT_FOUND: "No se encontró el conductor seleccionado.",
        JOB_IS_NOT_TEST: "Esta acción solo está disponible para carreras de prueba.",
        TEST_DELETE_REASON_REQUIRED: "Debes indicar el motivo de la eliminación.",
        TOPUP_AMOUNT_MUST_BE_POSITIVE: "El importe de la recarga debe ser mayor que cero.",
        INVALID_TOPUP_METHOD: "El método de pago seleccionado no es válido.",
        TOPUP_REFERENCE_REQUIRED: "Este método de pago requiere una referencia.",
        AUTHENTICATION_REQUIRED: "La sesión ha vencido. Vuelve a iniciar sesión.",
        PROFILE_NOT_FOUND: "No se encontró el perfil del conductor.",
        MARKETPLACE_DRIVER_NOT_FOUND: "No se encontró el conductor en Marketplace.",
        TOPUP_NOT_REQUESTED_OR_NOT_FOUND:
          "La recarga ya fue procesada o dejó de estar pendiente. Actualiza la lista.",
        IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION:
          "La operación ya fue procesada. Actualiza la lista antes de volver a intentarlo.",
      }[error.message] ?? error.message)
    : "No se pudo completar la operación.";

const rows = <T,>(query: { data?: { pages: Array<{ items: T[] }> } }) =>
  query.data?.pages.flatMap((page) => page.items) ?? [];

const formatAmount = (value: unknown, currency = "CUP") => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return `${text(value)} ${currency}`;
  }

  return `${parsed.toLocaleString("es", {
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
};

const formatDate = (value: unknown) => {
  if (!value) return "—";
  const parsed = new Date(String(value));

  if (Number.isNaN(parsed.getTime())) {
    return text(value);
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const statusClasses = (status: string | null) => {
  if (
    status === "completed" ||
    status === "settled" ||
    status === "confirmed" ||
    status === "reconciled" ||
    status === "active"
  ) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "published" || status === "accepted") {
    return "border-cyan-500/25 bg-cyan-500/10 text-cyan-300";
  }

  if (status === "en_route" || status === "pickup" || status === "in_progress") {
    return "border-violet-500/25 bg-violet-500/10 text-violet-300";
  }

  if (
    status === "cancelled" ||
    status === "cancelled_by_customer" ||
    status === "cancelled_by_driver" ||
    status === "rejected" ||
    status === "incident" ||
    status === "suspended"
  ) {
    return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  }

  if (status === "requested" || status === "expired" || status === "incomplete") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  }

  return "border-border/70 bg-muted/40 text-muted-foreground";
};

const serviceClasses = (serviceCode: string | null) => {
  if (serviceCode === "passenger") {
    return "border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-300";
  }

  if (serviceCode === "cargo") {
    return "border-amber-500/20 bg-amber-500/[0.08] text-amber-300";
  }

  if (serviceCode === "courier") {
    return "border-violet-500/20 bg-violet-500/[0.08] text-violet-300";
  }

  if (serviceCode === "tourism") {
    return "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300";
  }

  return "border-border/70 bg-muted/40 text-muted-foreground";
};

function StatusBadge({ status }: { status: string | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(
        status,
      )}`}
    >
      {label(status)}
    </span>
  );
}

function ServiceBadge({ service }: { service: string | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${serviceClasses(
        service,
      )}`}
    >
      {label(service)}
    </span>
  );
}

const panelVisuals = {
  emerald: {
    card: "border-emerald-500/20 bg-emerald-500/[0.02]",
    icon: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    strip: "from-emerald-500 via-emerald-400/45 to-transparent",
  },
  cyan: {
    card: "border-cyan-500/20 bg-cyan-500/[0.02]",
    icon: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
    strip: "from-cyan-500 via-cyan-400/45 to-transparent",
  },
  violet: {
    card: "border-violet-500/20 bg-violet-500/[0.02]",
    icon: "border-violet-500/25 bg-violet-500/10 text-violet-300",
    strip: "from-violet-500 via-violet-400/45 to-transparent",
  },
  amber: {
    card: "border-amber-500/20 bg-amber-500/[0.02]",
    icon: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    strip: "from-amber-500 via-amber-400/45 to-transparent",
  },
  rose: {
    card: "border-rose-500/20 bg-rose-500/[0.02]",
    icon: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    strip: "from-rose-500 via-rose-400/45 to-transparent",
  },
};

type PanelTone = keyof typeof panelVisuals;

function PremiumPanel({
  title,
  description,
  icon: Icon,
  tone = "emerald",
  action,
  backgroundImage,
  children,
}: {
  title: string;
  description?: string;
  icon: typeof BriefcaseBusiness;
  tone?: PanelTone;
  action?: ReactNode;
  backgroundImage?: string;
  children: ReactNode;
}) {
  const visual = panelVisuals[tone];

  return (
    <section className={`relative overflow-hidden rounded-2xl border shadow-sm ${visual.card}`}>
      {backgroundImage ? (
        <>
          <img
            src={backgroundImage}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-56 w-[42%] object-cover object-right opacity-[0.17] mix-blend-screen"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/5 via-background/20 to-cyan-500/[0.025]" />
        </>
      ) : null}

      <div className={`relative z-[1] h-1 bg-gradient-to-r ${visual.strip}`} />

      <div className="relative z-[1] flex flex-col gap-4 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${visual.icon}`}
          >
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        {action}
      </div>

      <div className="relative z-[1] p-5">{children}</div>
    </section>
  );
}

function EmptyMarketplaceState({
  title,
  description,
  icon: Icon = BriefcaseBusiness,
}: {
  title: string;
  description?: string;
  icon?: typeof BriefcaseBusiness;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/35 px-6 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-32 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function PaginationButton({
  query,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
  };
}) {
  if (!query.hasNextPage) return null;

  return (
    <div className="mt-4 flex justify-center">
      <Button
        variant="outline"
        disabled={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      >
        {query.isFetchingNextPage ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando…
          </>
        ) : (
          "Cargar más"
        )}
      </Button>
    </div>
  );
}

function FilterSelect({
  labelText,
  value,
  onChange,
  children,
}: {
  labelText: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative flex min-w-52 items-center gap-3 rounded-xl border border-border/70 bg-background/55 px-3 py-2">
      <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {labelText}
        </span>
        <select
          className="mt-0.5 w-full appearance-none bg-transparent pr-6 text-sm font-medium text-foreground outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
      </div>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
    </label>
  );
}

function MiniMetric({ labelText, value }: { labelText: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{labelText}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CustomerSummaryMetric({
  icon: Icon,
  labelText,
  value,
  accent = "violet",
}: {
  icon: typeof UserRound;
  labelText: string;
  value: ReactNode;
  accent?: "violet" | "cyan" | "emerald" | "amber" | "rose";
}) {
  const accentClasses = {
    violet: "border-violet-500/20 bg-violet-500/[0.06] text-violet-300",
    cyan: "border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-300",
    emerald: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300",
    amber: "border-amber-500/20 bg-amber-500/[0.06] text-amber-300",
    rose: "border-rose-500/20 bg-rose-500/[0.06] text-rose-300",
  }[accent];

  return (
    <div className="group rounded-2xl border border-border/60 bg-background/55 p-3.5 shadow-sm transition hover:border-violet-500/20 hover:bg-background/70 sm:p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${accentClasses}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        {labelText}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">{value}</p>
    </div>
  );
}

function Driver360Detail({
  detail,
  financial,
  canSeeFinancial,
  financialLoading,
}: {
  detail: MarketplaceDriver360;
  financial: MarketplaceDriverFinancial360 | null;
  canSeeFinancial: boolean;
  financialLoading: boolean;
}) {
  const displayName = detail.account?.displayName || "Conductor";
  const currency =
    financial?.topups[0]?.currency ??
    financial?.documents[0]?.currency ??
    financial?.referralCredits[0]?.currency ??
    "CUP";
  const availableBalance = financial
    ? financial.wallet.realAvailableBalance + financial.wallet.promotionalAvailableBalance
    : 0;
  const referralCreditTotal =
    financial?.referralCredits.reduce((sum, item) => sum + item.amount, 0) ?? 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[28px] border border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.10] via-background/80 to-emerald-500/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                Conductor Marketplace
              </span>
              <StatusBadge status={detail.driver.status} />
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {displayName}
            </h3>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-cyan-300" />
            Alta {formatDate(detail.driver.activatedAt ?? detail.driver.createdAt)}
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <MiniMetric labelText="Teléfono" value={detail.account?.phone ?? "Sin teléfono"} />
          <MiniMetric labelText="Correo" value={detail.account?.email ?? "Sin correo"} />
        </div>
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
          Operación
        </p>
        <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
          Actividad del conductor
        </h4>
        <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3">
          <CustomerSummaryMetric icon={BriefcaseBusiness} labelText="Trabajos" value={detail.jobsSummary.total} accent="cyan" />
          <CustomerSummaryMetric icon={CheckCircle2} labelText="Completados" value={detail.jobsSummary.completedOrSettled} accent="emerald" />
          <CustomerSummaryMetric icon={Clock3} labelText="Activos" value={detail.jobsSummary.active} accent="violet" />
          <CustomerSummaryMetric icon={AlertCircle} labelText="Incidencias" value={detail.incidents} accent="rose" />
          <CustomerSummaryMetric
            icon={Star}
            labelText="Valoración"
            value={detail.ratings.count ? `${detail.ratings.average.toFixed(1)} / 5 · ${detail.ratings.count}` : "Sin valoraciones"}
            accent="amber"
          />
          <CustomerSummaryMetric icon={Users} labelText="Referidos premiados" value={detail.referral.rewardedCount} accent="cyan" />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-[22px] border border-border/60 bg-background/45 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Promoción</p>
          {detail.promotion ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">
                {detail.promotion.durationDaysSnapshot} días · regla v{detail.promotion.ruleVersionSnapshot}
              </p>
              <p className="text-muted-foreground">Inicio: {formatDate(detail.promotion.startedAt)}</p>
              <p className="text-muted-foreground">Fin: {formatDate(detail.promotion.endsAt)}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Sin promoción registrada.</p>
          )}
        </section>

        <section className="rounded-[22px] border border-border/60 bg-background/45 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">Referidos</p>
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-medium text-foreground">Código: {detail.referral.code ?? "Sin código"}</p>
            <p className="text-muted-foreground">Referidos: {detail.referral.referredCount}</p>
            <p className="text-muted-foreground">Premiados: {detail.referral.rewardedCount}</p>
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-border/60 bg-background/35 p-4 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Vehículos</p>
        {detail.vehicles.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {detail.vehicles.map((item) => (
              <div key={item.vehicle.id} className="rounded-2xl border border-border/55 bg-background/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{item.vehicle.name || "Vehículo"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[item.vehicle.brand, item.vehicle.model, item.vehicle.year].filter(Boolean).join(" · ") || "Sin datos de marca/modelo"}
                    </p>
                  </div>
                  <StatusBadge status={item.vehicle.marketplaceStatus} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.vehicle.categoryCode ? (
                    <span className="rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
                      {label(item.vehicle.categoryCode)}
                    </span>
                  ) : null}
                  {item.assignment ? (
                    <span className="rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
                      {item.assignment.isAvailable ? "Disponible" : "No disponible"}
                    </span>
                  ) : null}
                </div>
                {item.services.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.services.map((service) => (
                      <ServiceBadge key={service} service={service} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Sin vehículos asociados.</p>
        )}
      </section>

      <section className="rounded-[24px] border border-border/60 bg-background/35 p-4 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Finanzas</p>
        {!canSeeFinancial ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Tu rol no tiene permiso para consultar la información financiera del conductor.
          </p>
        ) : financialLoading ? (
          <div className="mt-3"><LoadingState /></div>
        ) : financial ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <CustomerSummaryMetric icon={Wallet} labelText="Saldo real" value={formatAmount(financial.wallet.realBalance, currency)} accent="emerald" />
              <CustomerSummaryMetric icon={WalletCards} labelText="Promocional" value={formatAmount(financial.wallet.promotionalBalance, currency)} accent="violet" />
              <CustomerSummaryMetric icon={CircleDollarSign} labelText="Disponible" value={formatAmount(availableBalance, currency)} accent="cyan" />
              <CustomerSummaryMetric icon={Banknote} labelText="Comisiones" value={formatAmount(financial.commissionTotal, currency)} accent="amber" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MiniMetric labelText="Recargas" value={financial.topups.length} />
              <MiniMetric labelText="Comprobantes" value={financial.documents.length} />
              <MiniMetric labelText="Créditos por referidos" value={formatAmount(referralCreditTotal, currency)} />
            </div>
            {financial.topups.length ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">Últimas recargas</p>
                {financial.topups.slice(0, 5).map((topup) => (
                  <div key={topup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/55 bg-background/55 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatAmount(topup.amount, topup.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(topup.requestedAt)} · {topup.method}</p>
                    </div>
                    <StatusBadge status={topup.status} />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No se pudo cargar la información financiera.</p>
        )}
      </section>
    </div>
  );
}

function Customer360Detail({
  detail,
  history,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  detail: MarketplaceCustomer360;
  history: MarketplaceCustomerHistoryItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const km = (value: number | null) =>
    value == null
      ? "\u2014"
      : `${value.toLocaleString("es", { maximumFractionDigits: 1 })} km`;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.12] via-background/80 to-cyan-500/[0.08] p-5 shadow-[0_24px_70px_-42px_rgba(139,92,246,0.85)] sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-400/25 bg-violet-500/10 text-violet-200 shadow-inner shadow-violet-500/10">
                <UserRound className="h-7 w-7" />
              </div>

              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
                  Cliente Marketplace
                </div>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {detail.customer.displayName}
                </h3>
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
              <CalendarDays className="h-3.5 w-3.5 text-violet-300" />
              Cliente desde {formatDate(detail.customer.createdAt)}
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-border/55 bg-background/55 px-3.5 py-3 backdrop-blur">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
                <Phone className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">WhatsApp</p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {detail.customer.whatsappPhone}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border/55 bg-background/55 px-3.5 py-3 backdrop-blur">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.07] text-cyan-300">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Correo</p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {detail.customer.email ?? "Sin correo registrado"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
              Resumen
            </p>
            <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
              Actividad del cliente
            </h4>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          <CustomerSummaryMetric
            icon={BriefcaseBusiness}
            labelText="Viajes"
            value={detail.summary.tripsCompleted}
            accent="violet"
          />
          <CustomerSummaryMetric
            icon={Route}
            labelText="Km recorridos"
            value={km(detail.summary.distanceKm)}
            accent="cyan"
          />
          <CustomerSummaryMetric
            icon={Banknote}
            labelText="Gasto total"
            value={formatAmount(detail.summary.totalSpent, detail.summary.currency)}
            accent="emerald"
          />
          <CustomerSummaryMetric
            icon={CircleDollarSign}
            labelText="Ticket medio"
            value={formatAmount(detail.summary.averageTicket, detail.summary.currency)}
            accent="amber"
          />
          <CustomerSummaryMetric
            icon={BriefcaseBusiness}
            labelText="Solicitudes"
            value={detail.summary.requestsTotal}
            accent="violet"
          />
          <CustomerSummaryMetric
            icon={AlertCircle}
            labelText="Cancelaciones"
            value={detail.summary.cancellations}
            accent="rose"
          />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-[22px] border border-border/60 bg-gradient-to-br from-background/75 to-violet-500/[0.035] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.07] text-violet-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {"\u00daltimo servicio"}
              </p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {detail.summary.lastServiceAt
                  ? formatDate(detail.summary.lastServiceAt)
                  : "Sin viajes completados"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-border/60 bg-gradient-to-br from-background/75 to-amber-500/[0.035] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/[0.07] text-amber-300">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Valoraciones realizadas
              </p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {detail.ratings.givenCount
                  ? `${detail.ratings.averageGiven.toFixed(1)} / 5 \u00b7 ${detail.ratings.givenCount}`
                  : "Sin valoraciones"}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-border/60 bg-background/35 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Preferencias
          </p>
          <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            Modalidades utilizadas
          </h4>
        </div>

        {detail.modalities.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {detail.modalities.map((item) => (
              <div
                key={`${item.serviceCode}:${item.vehicleCategoryCode ?? "none"}`}
                className="rounded-2xl border border-border/55 bg-background/60 p-4 transition hover:border-cyan-500/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <ServiceBadge service={item.serviceCode} />
                  <span className="rounded-full border border-border/60 bg-muted/25 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    {item.tripsCompleted} viajes
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  {item.vehicleCategoryCode
                    ? label(item.vehicleCategoryCode)
                    : "Sin categor\u00eda de veh\u00edculo"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 text-xs text-muted-foreground">
                    {km(item.distanceKm)}
                  </span>
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 text-xs text-muted-foreground">
                    {formatAmount(item.totalSpent, detail.summary.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/40 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] text-cyan-300">
              <CarFront className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Sin modalidades registradas</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Aparecer\u00e1n cuando el cliente complete su primer viaje.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[24px] border border-border/60 bg-background/35 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
            Trazabilidad
          </p>
          <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            Historial de servicios
          </h4>
        </div>

        {!history.length ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/40 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.05] text-violet-300">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Sin servicios reales</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                El historial aparecer\u00e1 aqu\u00ed cuando existan operaciones reales del cliente.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative mt-4 space-y-3 pl-5">
            <div className="absolute bottom-3 left-[6px] top-3 w-px bg-gradient-to-b from-violet-400/45 via-border/50 to-transparent" />

            {history.map((item) => (
              <article
                key={item.jobId}
                className="relative rounded-2xl border border-border/60 bg-background/60 p-4 transition hover:border-violet-500/20"
              >
                <span className="absolute -left-[18px] top-5 h-3 w-3 rounded-full border-2 border-background bg-violet-400 shadow-[0_0_0_3px_rgba(139,92,246,0.12)]" />

                <div className="flex flex-wrap items-center gap-2">
                  <ServiceBadge service={item.serviceCode} />
                  <StatusBadge status={item.status} />
                  <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                    {formatDate(item.createdAt)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/50 bg-background/55 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Origen
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-foreground">{item.originText}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/55 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Destino
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                      {item.destinationText}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5">
                    {formatAmount(item.finalPrice, item.currency)}
                  </span>
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5">
                    {km(item.distanceKm)}
                  </span>
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5">
                    {item.driverDisplayName ?? "Sin conductor asignado"}
                  </span>
                  {item.vehicleCategoryCode ? (
                    <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5">
                      {label(item.vehicleCategoryCode)}
                    </span>
                  ) : null}
                </div>

                {item.ratingStars ? (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2.5 text-sm">
                    <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <div>
                      <span className="font-medium text-foreground">
                        {"Valoraci\u00f3n: "}
                        {item.ratingStars}/5
                      </span>
                      {item.ratingComment ? (
                        <p className="mt-1 text-muted-foreground">{item.ratingComment}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {hasMore ? (
          <div className="mt-4 flex justify-center">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {"Cargando\u2026"}
                </>
              ) : (
                "Cargar m\u00e1s"
              )}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
export default function MarketplaceSection({ projectId }: { projectId: string }) {
  const { data: permissions = [] } = useProjectPermissions(projectId);

  const [tab, setTab] = useState("resumen");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [incidentState, setIncidentState] = useState("open");
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSort, setCustomerSort] = useState<"points_desc" | "recent">(
    "points_desc",
  );

  const [jobId, setJobId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [driver, setDriver] = useState<{
    id: string;
    suspended: boolean;
  } | null>(null);
  const [driver360Id, setDriver360Id] = useState<string | null>(null);
  const [incident, setIncident] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<"completed" | "cancelled">("completed");
  const [error, setError] = useState<string | null>(null);

  const [topup, setTopup] = useState<{
    id: string;
    driver: string;
    confirmationKey: string;
  } | null>(null);
  const [newTopup, setNewTopup] = useState(false);
  const [topupStatus, setTopupStatus] = useState("");
  const [topupDriver, setTopupDriver] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [createTopupKey, setCreateTopupKey] = useState(() => crypto.randomUUID());
  const [promotionDays, setPromotionDays] = useState("");
  const [commission, setCommission] = useState("");
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testDriverUserId, setTestDriverUserId] = useState("");
  const [testForceCommission, setTestForceCommission] = useState(false);

  const canCustomers = permissions.includes("customers.view");
  const canPayments = permissions.includes("payments.view");
  const canManagePayments = permissions.includes("payments.manage");
  const canSettings = permissions.includes("settings.view");
  const canManageSettings = permissions.includes("settings.manage");
  const canManageMarketplace = permissions.includes("marketplace.manage");

  const queryClient = useQueryClient();

  const invalidate = (...keys: string[]) =>
    Promise.all(
      keys.map((key) =>
        queryClient.invalidateQueries({
          queryKey: [key, projectId],
        }),
      ),
    );

  const overview = useQuery({
    queryKey: ["marketplace-overview", projectId],
    queryFn: () => supabaseServices.marketplace.overview(projectId),
    refetchInterval: 30_000,
  });

  const jobs = useInfiniteQuery({
    queryKey: ["marketplace-jobs", projectId, status, service],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listJobs(projectId, {
        status: status || undefined,
        serviceCode: service || undefined,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "trabajos",
  });

  const drivers = useInfiniteQuery({
    queryKey: ["marketplace-drivers", projectId],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listDrivers(projectId, {
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "conductores",
  });

  const customers = useInfiniteQuery({
    queryKey: [
      "marketplace-customers",
      projectId,
      customerSearch,
      customerSort,
    ],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listCustomers(projectId, {
        search: customerSearch || undefined,
        sort: customerSort,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | {
      at: string;
      id: string;
      score?: number;
    },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "clientes" && canCustomers,
  });

  const wallets = useInfiniteQuery({
    queryKey: ["marketplace-wallets", projectId],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listWallets(projectId, {
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "billeteras" && canPayments,
  });

  const topups = useInfiniteQuery({
    queryKey: ["marketplace-topups", projectId, topupStatus],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listTopups(projectId, {
        status: topupStatus || undefined,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "recargas" && canPayments,
  });

  const paymentMethods = useQuery({
    queryKey: ["marketplace-payment-methods", projectId],
    queryFn: () => supabaseServices.marketplace.listPaymentMethods(projectId),
    enabled: tab === "recargas" && canPayments,
  });

  const financialDocuments = useQuery({
    queryKey: ["marketplace-financial-documents", projectId],
    queryFn: () =>
      supabaseServices.marketplace.listFinancialDocuments(projectId, {
        limit: 200,
      }),
    enabled: tab === "recargas" && canManagePayments,
  });

  const incidents = useInfiniteQuery({
    queryKey: ["marketplace-incidents", projectId, incidentState],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listIncidents(projectId, {
        resolved: incidentState === "all" ? undefined : incidentState === "resolved",
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "incidencias",
  });

  const settings = useQuery({
    queryKey: ["marketplace-commercial-settings", projectId],
    queryFn: () => supabaseServices.marketplace.commercialSettings(projectId),
    enabled: tab === "configuracion" && canSettings,
  });

  const testMode = useQuery({
    queryKey: ["marketplace-test-mode", projectId],
    queryFn: () => supabaseServices.marketplace.testMode(projectId),
    enabled: tab === "configuracion" && canSettings,
  });

  const testModeDrivers = useQuery({
    queryKey: ["marketplace-test-mode-drivers", projectId],
    queryFn: () =>
      supabaseServices.marketplace.listDrivers(projectId, {
        limit: 200,
      }),
    enabled: tab === "configuracion" && canSettings,
  });

  const topupDrivers = useQuery({
    queryKey: ["marketplace-topup-drivers", projectId],
    queryFn: () =>
      supabaseServices.marketplace.listDrivers(projectId, {
        limit: 200,
      }),
    enabled: newTopup,
  });

  const detail = useQuery({
    queryKey: ["marketplace-job-detail", projectId, jobId],
    queryFn: () => supabaseServices.marketplace.getJobDetail(projectId, jobId!),
    enabled: Boolean(jobId),
  });

  const driver360 = useQuery({
    queryKey: ["marketplace-driver-360", projectId, driver360Id],
    queryFn: () => supabaseServices.marketplace.getDriver360(projectId, driver360Id!),
    enabled: Boolean(driver360Id),
  });

  const driverFinancial360 = useQuery({
    queryKey: ["marketplace-driver-financial-360", projectId, driver360Id],
    queryFn: () => supabaseServices.marketplace.getDriverFinancial360(projectId, driver360Id!),
    enabled: Boolean(driver360Id) && canManagePayments,
  });

  const customer360 = useQuery({
    queryKey: ["marketplace-customer-360", projectId, customerId],
    queryFn: () => supabaseServices.marketplace.getCustomer360(projectId, customerId!),
    enabled: Boolean(customerId),
  });

  const customerHistory = useInfiniteQuery({
    queryKey: ["marketplace-customer-history", projectId, customerId],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listCustomerHistory(projectId, customerId!, {
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(customerId),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCustomerSearch(customerSearchInput.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [customerSearchInput]);

  useEffect(() => {
    if (settings.data) {
      setPromotionDays(String(settings.data.promotionDurationDays));
      setCommission(String(settings.data.commissionRate * 100));
    }
  }, [settings.data]);

  useEffect(() => {
    if (testMode.data) {
      setTestModeEnabled(testMode.data.enabled);
      setTestDriverUserId(testMode.data.targetDriverUserId ?? "");
      setTestForceCommission(testMode.data.forceWalletCommission);
    }
  }, [testMode.data]);

  const suspend = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.setDriverSuspension(projectId, {
        userId: driver!.id,
        suspended: driver!.suspended,
        reason,
      }),
    onSuccess: () => {
      setDriver(null);
      setReason("");
      void invalidate(
        "marketplace-overview",
        "marketplace-drivers",
        "marketplace-jobs",
        "marketplace-incidents",
        "marketplace-driver-360",
      );
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const resolve = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.resolveIncident(projectId, {
        jobId: incident!,
        resolution,
        note: reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setIncident(null);
      setReason("");
      void invalidate(
        "marketplace-overview",
        "marketplace-jobs",
        "marketplace-drivers",
        "marketplace-incidents",
        "marketplace-wallets",
      );
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const create = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.createTopup(projectId, {
        userId: topupDriver,
        amount: Number(amount),
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        idempotencyKey: createTopupKey,
      }),
    onSuccess: () => {
      setError(null);
      setNewTopup(false);
      setTopupDriver("");
      setAmount("");
      setMethod("");
      setReference("");
      setNotes("");
      setCreateTopupKey(crypto.randomUUID());
      void invalidate("marketplace-topups", "marketplace-overview");
    },
    onError: (mutationError) => {
      setError(errorText(mutationError));
      void invalidate("marketplace-topups", "marketplace-overview");
    },
  });

  const confirm = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.confirmTopup(
        projectId,
        topup!.id,
        topup!.confirmationKey,
      ),
    onSuccess: () => {
      setError(null);
      setTopup(null);
      void invalidate(
        "marketplace-topups",
        "marketplace-wallets",
        "marketplace-overview",
        "marketplace-drivers",
        "marketplace-financial-documents",
      );
    },
    onError: (mutationError) => {
      setError(errorText(mutationError));
      void invalidate("marketplace-topups", "marketplace-financial-documents");
    },
  });

  const reject = useMutation({
    mutationFn: () => supabaseServices.marketplace.rejectTopup(projectId, topup!.id, reason),
    onSuccess: () => {
      setError(null);
      setTopup(null);
      setReason("");
      void invalidate("marketplace-topups", "marketplace-overview");
    },
    onError: (mutationError) => {
      setError(errorText(mutationError));
      void invalidate("marketplace-topups", "marketplace-overview");
    },
  });

  const save = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.updateCommercialSettings(projectId, {
        promotionDurationDays: Number(promotionDays),
        commissionRate: Number(commission) / 100,
      }),
    onSuccess: () => {
      setError(null);
      void invalidate("marketplace-commercial-settings", "marketplace-overview");
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const saveTestMode = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.setTestMode(projectId, {
        enabled: testModeEnabled,
        targetDriverUserId: testModeEnabled ? testDriverUserId || null : null,
        forceWalletCommission: testModeEnabled ? testForceCommission : false,
      }),
    onSuccess: () => {
      setError(null);
      void invalidate(
        "marketplace-test-mode",
        "marketplace-jobs",
        "marketplace-drivers",
        "marketplace-overview",
      );
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const deleteTestJob = useMutation({
    mutationFn: (input: { jobId: string; reason: string }) =>
      supabaseServices.marketplace.deleteTestJob(projectId, input),
    onSuccess: () => {
      setError(null);
      void invalidate(
        "marketplace-jobs",
        "marketplace-wallets",
        "marketplace-drivers",
        "marketplace-overview",
      );
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const deleteAllTestJobs = useMutation({
    mutationFn: (reasonText: string) =>
      supabaseServices.marketplace.deleteAllTestJobs(projectId, reasonText),
    onSuccess: () => {
      setError(null);
      void invalidate(
        "marketplace-jobs",
        "marketplace-wallets",
        "marketplace-drivers",
        "marketplace-overview",
      );
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const jobRows = rows(jobs);
  const driverRows = rows(drivers);
  const customerRows = rows(customers);
  const walletRows = rows(wallets);
  const topupRows = rows(topups);
  const selectedPaymentMethod = paymentMethods.data?.find((item) => item.code === method);
  const paymentMethodLabel = (code: string) =>
    paymentMethods.data?.find((item) => item.code === code)?.name ?? code;
  const incidentRows = rows(incidents);

  const testDriver = testModeDrivers.data?.items.find((item) => item.userId === testDriverUserId);

  const services = useMemo(() => [...new Set(jobRows.map((job) => job.serviceCode))], [jobRows]);

  const statusOptions = [
    "requested",
    "published",
    "accepted",
    "en_route",
    "pickup",
    "in_progress",
    "completed",
    "settled",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "incident",
    "expired",
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-background/45 p-1.5 shadow-[0_18px_50px_-42px_rgba(0,0,0,0.9)]">
          <TabsTrigger
            value="resumen"
            className="shrink-0 gap-2 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.025] px-3.5 py-2.5 text-xs text-cyan-300/80 shadow-none transition-all hover:border-cyan-400/35 hover:bg-cyan-500/[0.07] hover:text-cyan-100 sm:text-sm data-[state=active]:border-cyan-400/60 data-[state=active]:bg-cyan-500/[0.16] data-[state=active]:text-cyan-50 data-[state=active]:shadow-[0_10px_30px_-18px_rgba(34,211,238,0.75)]"
          >
            <Eye className="h-4 w-4" />
            Resumen
          </TabsTrigger>

          <TabsTrigger
            value="trabajos"
            className="shrink-0 gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.025] px-3.5 py-2.5 text-xs text-emerald-300/80 shadow-none transition-all hover:border-emerald-400/35 hover:bg-emerald-500/[0.07] hover:text-emerald-100 sm:text-sm data-[state=active]:border-emerald-400/60 data-[state=active]:bg-emerald-500/[0.16] data-[state=active]:text-emerald-50 data-[state=active]:shadow-[0_10px_30px_-18px_rgba(52,211,153,0.75)]"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            Operaciones
          </TabsTrigger>

          <TabsTrigger
            value="mapa"
            className="shrink-0 gap-2 rounded-xl border border-orange-500/15 bg-orange-500/[0.025] px-3.5 py-2.5 text-xs text-orange-300/80 shadow-none transition-all hover:border-orange-400/35 hover:bg-orange-500/[0.07] hover:text-orange-100 sm:text-sm data-[state=active]:border-orange-400/60 data-[state=active]:bg-orange-500/[0.16] data-[state=active]:text-orange-50 data-[state=active]:shadow-[0_10px_30px_-18px_rgba(251,146,60,0.75)]"
          >
            <MapPin className="h-4 w-4" />
            Mapa
          </TabsTrigger>

          <TabsTrigger
            value="conductores"
            className="shrink-0 gap-2 rounded-xl border border-transparent px-3.5 py-2.5 text-xs shadow-none sm:text-sm data-[state=active]:border-amber-500/25 data-[state=active]:bg-amber-500/[0.08] data-[state=active]:text-amber-100 data-[state=active]:shadow-none"
          >
            <Users className="h-4 w-4" />
            Conductores
          </TabsTrigger>

          {canCustomers ? (
            <TabsTrigger
              value="clientes"
              className="shrink-0 gap-2 rounded-xl border border-transparent px-3.5 py-2.5 text-xs shadow-none sm:text-sm data-[state=active]:border-violet-500/30 data-[state=active]:bg-violet-500/[0.10] data-[state=active]:text-violet-100 data-[state=active]:shadow-none"
            >
              <UserRound className="h-4 w-4" />
              Clientes
            </TabsTrigger>
          ) : null}

          {canPayments ? (
            <>
              <TabsTrigger
                value="billeteras"
                className="shrink-0 gap-2 rounded-xl border border-transparent px-3.5 py-2.5 text-xs shadow-none sm:text-sm data-[state=active]:border-amber-500/25 data-[state=active]:bg-amber-500/[0.08] data-[state=active]:text-amber-100 data-[state=active]:shadow-none"
              >
                <Wallet className="h-4 w-4" />
                Billeteras
              </TabsTrigger>

              <TabsTrigger
                value="recargas"
                className="shrink-0 gap-2 rounded-xl border border-sky-500/15 bg-sky-500/[0.025] px-3.5 py-2.5 text-xs text-sky-300/80 shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/[0.07] hover:text-sky-100 sm:text-sm data-[state=active]:border-sky-400/60 data-[state=active]:bg-sky-500/[0.16] data-[state=active]:text-sky-50 data-[state=active]:shadow-[0_10px_30px_-18px_rgba(56,189,248,0.7)]"
              >
                <WalletCards className="h-4 w-4" />
                Recargas
              </TabsTrigger>
            </>
          ) : null}

          <TabsTrigger
            value="incidencias"
            className="shrink-0 gap-2 rounded-xl border border-rose-500/15 bg-rose-500/[0.025] px-3.5 py-2.5 text-xs text-rose-300/80 shadow-none transition-all hover:border-rose-400/35 hover:bg-rose-500/[0.07] hover:text-rose-100 sm:text-sm data-[state=active]:border-rose-400/60 data-[state=active]:bg-rose-500/[0.16] data-[state=active]:text-rose-50 data-[state=active]:shadow-[0_10px_30px_-18px_rgba(251,113,133,0.75)]"
          >
            <AlertTriangle className="h-4 w-4" />
            Incidencias
          </TabsTrigger>

          {canSettings ? (
            <TabsTrigger
              value="configuracion"
              className="shrink-0 gap-2 rounded-xl border border-slate-400/15 bg-slate-400/[0.025] px-3.5 py-2.5 text-xs text-slate-300/80 shadow-none transition-all hover:border-slate-300/35 hover:bg-slate-400/[0.07] hover:text-slate-100 sm:text-sm data-[state=active]:border-slate-300/55 data-[state=active]:bg-slate-400/[0.14] data-[state=active]:text-slate-50 data-[state=active]:shadow-[0_10px_30px_-18px_rgba(148,163,184,0.6)]"
            >
              <ShieldCheck className="h-4 w-4" />
              Configuración
            </TabsTrigger>
          ) : null}
        </TabsList>
<TabsContent value="resumen">
          <PremiumPanel
            title="Pulso operativo"
            description="Visión general del estado actual del Marketplace"
            icon={Eye}
            tone="emerald"
            backgroundImage="/admin-premium/overview.svg"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Conductores",
                  eyebrow: "Equipo",
                  value: overview.data?.driversTotal,
                  Icon: Users,
                  shell:
                    "border-cyan-400/18 bg-gradient-to-br from-cyan-500/[0.075] via-background/62 to-background/45",
                  icon:
                    "border-cyan-400/20 bg-cyan-500/[0.09] text-cyan-300",
                  glow: "bg-cyan-400/[0.07]",
                },
                {
                  label: "Activos",
                  eyebrow: "Operación",
                  value: overview.data?.driversActive,
                  Icon: Users,
                  shell:
                    "border-emerald-400/18 bg-gradient-to-br from-emerald-500/[0.075] via-background/62 to-background/45",
                  icon:
                    "border-emerald-400/20 bg-emerald-500/[0.09] text-emerald-300",
                  glow: "bg-emerald-400/[0.07]",
                },
                {
                  label: "En promoción",
                  eyebrow: "Beneficio",
                  value: overview.data?.driversTrialActive,
                  Icon: BriefcaseBusiness,
                  shell:
                    "border-violet-400/18 bg-gradient-to-br from-violet-500/[0.075] via-background/62 to-background/45",
                  icon:
                    "border-violet-400/20 bg-violet-500/[0.09] text-violet-300",
                  glow: "bg-violet-400/[0.07]",
                },
                {
                  label: "Post-promoción activos",
                  eyebrow: "Comercial",
                  value: overview.data?.driversPostTrialActive,
                  Icon: WalletCards,
                  shell:
                    "border-amber-400/18 bg-gradient-to-br from-amber-500/[0.07] via-background/62 to-background/45",
                  icon:
                    "border-amber-400/20 bg-amber-500/[0.08] text-amber-300",
                  glow: "bg-amber-400/[0.06]",
                },
                {
                  label: "Trabajos publicados",
                  eyebrow: "Marketplace",
                  value: overview.data?.jobsPublished,
                  Icon: BriefcaseBusiness,
                  shell:
                    "border-emerald-400/18 bg-gradient-to-br from-emerald-500/[0.065] via-background/62 to-cyan-500/[0.02]",
                  icon:
                    "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300",
                  glow: "bg-emerald-400/[0.06]",
                },
                {
                  label: "Trabajos activos",
                  eyebrow: "Actividad",
                  value: overview.data?.jobsActive,
                  Icon: BriefcaseBusiness,
                  shell:
                    "border-cyan-400/18 bg-gradient-to-br from-cyan-500/[0.065] via-background/62 to-violet-500/[0.02]",
                  icon:
                    "border-cyan-400/20 bg-cyan-500/[0.08] text-cyan-300",
                  glow: "bg-cyan-400/[0.06]",
                },
                {
                  label: "Incidencias abiertas",
                  eyebrow: "Atención",
                  value: overview.data?.jobsIncidentOpen,
                  Icon: AlertTriangle,
                  shell:
                    "border-rose-400/18 bg-gradient-to-br from-rose-500/[0.07] via-background/62 to-background/45",
                  icon:
                    "border-rose-400/20 bg-rose-500/[0.08] text-rose-300",
                  glow: "bg-rose-400/[0.06]",
                },
              ].map(
                ({
                  label: metricLabel,
                  eyebrow,
                  value,
                  Icon,
                  shell,
                  icon,
                  glow,
                }) => (
                  <article
                    key={metricLabel}
                    className={`group relative min-h-[128px] overflow-hidden rounded-[22px] border p-4 shadow-[0_20px_52px_-42px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5 ${shell}`}
                  >
                    <div
                      className={`pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-3xl ${glow}`}
                    />

                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {eyebrow}
                          </p>
                          <p className="mt-1.5 text-xs font-semibold text-foreground/80">
                            {metricLabel}
                          </p>
                        </div>

                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${icon}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="mt-5">
                        {overview.isLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          <p className="font-mono text-3xl font-bold tracking-tight text-foreground">
                            {Number(value ?? 0)}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                ),
              )}

              {!overview.isLoading &&
              overview.data?.pendingTopups !== null ? (
                <article className="group relative min-h-[128px] overflow-hidden rounded-[22px] border border-amber-400/18 bg-gradient-to-br from-amber-500/[0.07] via-background/62 to-violet-500/[0.02] p-4 shadow-[0_20px_52px_-42px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5">
                  <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-amber-400/[0.06] blur-3xl" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Finanzas
                        </p>
                        <p className="mt-1.5 text-xs font-semibold text-foreground/80">
                          Recargas pendientes
                        </p>
                      </div>

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-500/[0.08] text-amber-300">
                        <WalletCards className="h-4 w-4" />
                      </div>
                    </div>

                    <p className="mt-5 font-mono text-3xl font-bold tracking-tight text-foreground">
                      {overview.data?.pendingTopups ?? 0}
                    </p>
                  </div>
                </article>
              ) : null}
            </div>
          </PremiumPanel>
        </TabsContent>
        <TabsContent value="trabajos" className="mt-3">
          <div className="space-y-3 sm:space-y-4">
            <section className="rounded-[22px] border border-white/10 bg-gradient-to-br from-background/70 via-background/45 to-emerald-500/[0.025] p-3 shadow-[0_22px_60px_-44px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-4">
              <div className="mb-3 flex flex-col gap-3 rounded-[18px] border border-white/10 bg-background/45 p-2.5 shadow-[0_16px_42px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1.5 text-xs font-semibold text-emerald-200">
                    <BriefcaseBusiness className="h-3.5 w-3.5" />
                    {jobs.isLoading
                      ? "Consultando..."
                      : `${jobRows.length} ${jobRows.length === 1 ? "trabajo" : "trabajos"}`}
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.055] px-2.5 py-1.5 text-[11px] text-emerald-200">
                    Publicados
                    <strong className="text-foreground">
                      {overview.data?.jobsPublished ?? 0}
                    </strong>
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.055] px-2.5 py-1.5 text-[11px] text-cyan-200">
                    Activos
                    <strong className="text-foreground">
                      {overview.data?.jobsActive ?? 0}
                    </strong>
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/[0.055] px-2.5 py-1.5 text-[11px] text-rose-200">
                    Incidencias
                    <strong className="text-foreground">
                      {overview.data?.jobsIncidentOpen ?? 0}
                    </strong>
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <FilterSelect labelText="Estado" value={status} onChange={setStatus}>
                    <option value="">Todos los estados</option>
                    {statusOptions.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect labelText="Servicio" value={service} onChange={setService}>
                    <option value="">Todos los servicios</option>
                    {[...new Set([...services, "passenger", "cargo", "courier", "tourism"])].map(
                      (item) => (
                        <option key={item} value={item}>
                          {label(item)}
                        </option>
                      ),
                    )}
                  </FilterSelect>
                </div>
              </div>
              {jobs.isLoading ? (
                <LoadingState />
              ) : !jobRows.length ? (
                <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-border/65 bg-background/35 px-5 py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
                    <BriefcaseBusiness className="h-4.5 w-4.5" />
                  </div>
                  <p className="mt-3 font-semibold text-foreground">No hay trabajos</p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    No existen operaciones que coincidan con los filtros seleccionados.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {jobRows.map((job) => (
                      <article
                        key={job.jobId}
                        className={`group relative overflow-hidden rounded-[26px] border p-4 shadow-[0_18px_52px_-40px_rgba(0,0,0,0.85)] transition duration-200 hover:-translate-y-0.5 sm:p-5 ${
                          job.isTest
                            ? "border-violet-500/25 bg-gradient-to-br from-violet-500/[0.08] via-background/60 to-background/45 hover:border-violet-400/40"
                            : "border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.065] via-background/60 to-cyan-500/[0.025] hover:border-emerald-400/35"
                        }`}
                      >
                        <div
                          className={`pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full blur-3xl ${
                            job.isTest ? "bg-violet-500/10" : "bg-emerald-500/10"
                          }`}
                        />

                        <div className="relative">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={job.status} />
                                <ServiceBadge service={job.serviceCode} />

                                {job.isTest ? (
                                  <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-violet-300">
                                    PRUEBA
                                  </span>
                                ) : null}

                                <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                                  {formatDate(job.createdAt)}
                                </span>
                              </div>

                              <div className="mt-5 rounded-2xl border border-border/55 bg-background/50 p-4">
                                <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
                                      <MapPin className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                        Origen
                                      </p>
                                      <p className="mt-1.5 font-medium leading-snug text-foreground">
                                        {text(job.originText)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="hidden items-center gap-1 md:flex">
                                    <div className="h-px w-7 bg-border/70" />
                                    <Route className="h-4 w-4 text-cyan-300" />
                                    <div className="h-px w-7 bg-border/70" />
                                  </div>

                                  <div className="flex min-w-0 items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.07] text-cyan-300">
                                      <ArrowRight className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                        Destino
                                      </p>
                                      <p className="mt-1.5 font-medium leading-snug text-foreground">
                                        {text(job.destinationText)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-2xl border border-border/50 bg-background/45 p-3.5">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] text-cyan-300">
                                      <UserRound className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                                        Cliente
                                      </p>
                                      <p className="mt-1 truncate text-sm font-semibold text-foreground">
                                        {job.customerDisplayName || "Sin nombre registrado"}
                                      </p>
                                      {job.customerWhatsappPhone ? (
                                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                          <Phone className="h-3.5 w-3.5" />
                                          {job.customerWhatsappPhone}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-border/50 bg-background/45 p-3.5">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-500/15 bg-amber-500/[0.05] text-amber-300">
                                      <CarFront className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                                        Conductor
                                      </p>
                                      <p className="mt-1 truncate text-sm font-semibold text-foreground">
                                        {job.driverDisplayName || "Sin conductor asignado"}
                                      </p>
                                      <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {job.vehicleName || "Sin vehículo asignado"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <aside className="shrink-0 rounded-2xl border border-border/55 bg-background/55 p-4 lg:w-[220px]">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                                Precio final
                              </p>
                              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
                                {formatAmount(job.finalPrice, job.currency)}
                              </p>

                              <div className="mt-4 space-y-2 border-t border-border/50 pt-4 text-xs text-muted-foreground">
                                <div className="flex items-center justify-between gap-3">
                                  <span>Programado</span>
                                  <span className="text-right font-medium text-foreground">
                                    {formatDate(job.scheduledFor)}
                                  </span>
                                </div>
                                {job.commissionAmountSnapshot != null ? (
                                  <div className="flex items-center justify-between gap-3">
                                    <span>Comisión</span>
                                    <span className="font-medium text-foreground">
                                      {formatAmount(job.commissionAmountSnapshot, job.currency)}
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              <div className="mt-4 grid gap-2">
                                <Button
                                  className="w-full justify-center border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100 hover:bg-emerald-500/[0.12]"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setJobId(job.jobId)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  Abrir detalle
                                </Button>

                                {job.isTest && canManageMarketplace ? (
                                  <Button
                                    className="w-full"
                                    size="sm"
                                    variant="destructive"
                                    disabled={deleteTestJob.isPending}
                                    onClick={() => {
                                      const why = window.prompt(
                                        "Motivo de eliminación de esta carrera de prueba:",
                                        "Prueba operativa",
                                      );

                                      if (!why?.trim()) return;

                                      if (
                                        !window.confirm(
                                          "Se eliminará esta carrera de prueba y se revertirá su efecto financiero si corresponde. ¿Continuar?",
                                        )
                                      ) {
                                        return;
                                      }

                                      deleteTestJob.mutate({
                                        jobId: job.jobId,
                                        reason: why.trim(),
                                      });
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar prueba
                                  </Button>
                                ) : null}
                              </div>
                            </aside>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <PaginationButton query={jobs} />
                </>
              )}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="mapa" className="mt-3">
          <MarketplaceOperationalMap
            projectId={projectId}
            canViewCustomers={canCustomers}
            onOpenCustomer={setCustomerId}
            onOpenJob={setJobId}
          />
        </TabsContent>
<TabsContent value="conductores">
          <PremiumPanel
            title="Conductores"
            description={
              drivers.isLoading
                ? "Consultando conductores…"
                : `${driverRows.length} ${
                    driverRows.length === 1
                      ? "conductor mostrado"
                      : "conductores mostrados"
                  }`
            }
            icon={Users}
            tone="cyan"
            backgroundImage="/admin-premium/drivers.svg"
          >
            {drivers.isLoading ? (
              <LoadingState />
            ) : !driverRows.length ? (
              <EmptyMarketplaceState
                title="No hay conductores"
                description="Todavía no existen conductores registrados en Marketplace."
                icon={Users}
              />
            ) : (
              <>
                <div className="space-y-2.5">
                  {driverRows.map((item) => (
                    <article
                      key={item.userId}
                      className="group relative overflow-hidden rounded-[22px] border border-cyan-400/14 bg-gradient-to-r from-cyan-500/[0.055] via-background/60 to-emerald-500/[0.025] px-4 py-3.5 shadow-[0_18px_50px_-40px_rgba(34,211,238,0.9)] transition duration-200 hover:border-cyan-400/26 hover:from-cyan-500/[0.075] hover:to-emerald-500/[0.04]"
                    >
                      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-cyan-400/[0.035] blur-3xl" />

                      <div className="relative grid gap-3 lg:grid-cols-[minmax(220px,1.15fr)_minmax(190px,0.8fr)_minmax(220px,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/[0.07] text-cyan-200 shadow-inner shadow-cyan-500/[0.04]">
                              <Users className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                              <h4 className="truncate font-semibold text-foreground">
                                {item.displayName}
                              </h4>

                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <StatusBadge status={item.status} />

                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                                    item.isAvailable
                                      ? "border-emerald-500/25 bg-emerald-500/[0.09] text-emerald-300"
                                      : "border-border/70 bg-muted/35 text-muted-foreground"
                                  }`}
                                >
                                  {item.isAvailable
                                    ? "Disponible"
                                    : "No disponible"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-cyan-400/10 bg-background/45 px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                            WhatsApp
                          </p>

                          <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            <span className="truncate">
                              {item.phone ?? "Sin WhatsApp"}
                            </span>
                          </p>
                        </div>

                        <div className="rounded-xl border border-cyan-400/10 bg-background/45 px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                            Vehículo
                          </p>

                          <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <CarFront className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            <span className="truncate">
                              {item.vehicleName ?? "Sin vehículo"}
                            </span>
                          </p>
                        </div>

                        {canManageMarketplace ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className={`w-full lg:w-auto ${
                              item.status === "suspended"
                                ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200 hover:bg-emerald-500/[0.12] hover:text-emerald-100"
                                : "border-rose-500/20 bg-rose-500/[0.035] text-rose-200 hover:bg-rose-500/[0.08] hover:text-rose-100"
                            }`}
                            onClick={() =>
                              setDriver({
                                id: item.userId,
                                suspended: item.status !== "suspended",
                              })
                            }
                          >
                            {item.status === "suspended"
                              ? "Reactivar"
                              : "Suspender"}
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <PaginationButton query={drivers} />
              </>
            )}
          </PremiumPanel>
        </TabsContent>
        {canCustomers ? (
          <TabsContent value="clientes">
            <PremiumPanel
              title="Clientes"
              description={
                customers.isLoading
                  ? "Consultando clientes…"
                  : `${customerRows.length} ${
                      customerRows.length === 1
                        ? "cliente mostrado"
                        : "clientes mostrados"
                    }`
              }
              icon={UserRound}
              tone="violet"
              backgroundImage="/admin-premium/customers.svg"
              action={
                <div className="flex w-full flex-col gap-2 rounded-[18px] border border-violet-400/15 bg-background/55 p-1.5 shadow-[0_14px_45px_-32px_rgba(139,92,246,0.9)] backdrop-blur-sm sm:w-auto sm:flex-row sm:items-center">
                  <label className="relative min-w-0 sm:w-72">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-300" />
                    <Input
                      value={customerSearchInput}
                      onChange={(event) =>
                        setCustomerSearchInput(event.target.value)
                      }
                      placeholder="Buscar nombre o WhatsApp"
                      className="h-9 rounded-xl border-violet-400/20 bg-black/20 pl-9 shadow-inner shadow-violet-500/[0.04] focus-visible:border-violet-400/40"
                    />
                  </label>

                  <div className="flex rounded-xl border border-violet-400/15 bg-black/20 p-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={
                        customerSort === "points_desc"
                          ? "border border-violet-400/25 bg-violet-500/20 text-violet-100 shadow-[0_8px_24px_-14px_rgba(139,92,246,0.95)] hover:bg-violet-500/25 hover:text-violet-50"
                          : "text-muted-foreground hover:bg-violet-500/[0.08] hover:text-violet-100"
                      }
                      onClick={() => setCustomerSort("points_desc")}
                    >
                      Más puntos
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className={
                        customerSort === "recent"
                          ? "border border-violet-400/25 bg-violet-500/20 text-violet-100 shadow-[0_8px_24px_-14px_rgba(139,92,246,0.95)] hover:bg-violet-500/25 hover:text-violet-50"
                          : "text-muted-foreground hover:bg-violet-500/[0.08] hover:text-violet-100"
                      }
                      onClick={() => setCustomerSort("recent")}
                    >
                      Más recientes
                    </Button>
                  </div>
                </div>
              }
            >
              {customers.isLoading ? (
                <LoadingState />
              ) : !customerRows.length ? (
                <EmptyMarketplaceState
                  title={
                    customerSearch
                      ? "No encontramos clientes"
                      : "No hay clientes"
                  }
                  description={
                    customerSearch
                      ? "Prueba con otro nombre o número de WhatsApp."
                      : "Todavía no existen clientes registrados en Marketplace."
                  }
                  icon={UserRound}
                />
              ) : (
                <>
                  <div className="relative overflow-hidden rounded-[24px] border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.075] via-background/62 to-cyan-500/[0.025] shadow-[0_24px_65px_-44px_rgba(139,92,246,0.9)]">
                    <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-500/[0.055] blur-3xl" />
                    <div className="relative hidden grid-cols-[minmax(240px,1.5fr)_130px_80px_80px_80px_minmax(150px,0.9fr)_36px] items-center gap-3 border-b border-violet-400/18 bg-violet-500/[0.07] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/70 backdrop-blur-sm lg:grid">
                      <span>Cliente</span>
                      <span>Ranking</span>
                      <span>Trabajos</span>
                      <span>Activos</span>
                      <span>Liquidados</span>
                      <span>Última actividad</span>
                      <span />
                    </div>

                    <div className="relative divide-y divide-violet-400/[0.09]">
                      {customerRows.map((customer) => (
                        <button
                          key={customer.customerId}
                          type="button"
                          onClick={() =>
                            setCustomerId(customer.customerId)
                          }
                          className="group relative w-full px-4 py-3.5 text-left transition duration-200 hover:bg-gradient-to-r hover:from-violet-500/[0.085] hover:via-violet-500/[0.035] hover:to-cyan-500/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
                        >
                          <div className="hidden grid-cols-[minmax(240px,1.5fr)_130px_80px_80px_80px_minmax(150px,0.9fr)_36px] items-center gap-3 lg:grid">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {customer.displayName}
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                                {customer.whatsappPhone}
                              </p>
                            </div>

                            <div className="inline-flex w-fit min-w-[104px] items-center gap-2 rounded-xl border border-violet-400/16 bg-violet-500/[0.065] px-3 py-2 shadow-inner shadow-violet-500/[0.04]">
                              <Star className="h-4 w-4 shrink-0 text-violet-300" />
                              <div>
                                <p className="font-semibold text-violet-100">
                                  {customer.points.toLocaleString("es")} pt
                                </p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {customer.distanceKm.toLocaleString("es", {
                                    maximumFractionDigits: 1,
                                  })}{" "}
                                  km
                                </p>
                              </div>
                            </div>

                            <p className="font-semibold text-foreground">
                              {customer.jobsTotal}
                            </p>

                            <p className="font-semibold text-cyan-200">
                              {customer.jobsActive}
                            </p>

                            <p className="font-semibold text-emerald-200">
                              {customer.jobsSettled}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {customer.lastJobAt
                                ? formatDate(customer.lastJobAt)
                                : "Sin actividad"}
                            </p>

                            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-500/[0.06] text-violet-300 transition group-hover:border-violet-400/30 group-hover:bg-violet-500/[0.12]">
                              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                            </span>
                          </div>

                          <div className="lg:hidden">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">
                                  {customer.displayName}
                                </p>
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Phone className="h-3.5 w-3.5 text-emerald-300" />
                                  {customer.whatsappPhone}
                                </p>
                              </div>

                              <div className="shrink-0 rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-3 py-2 text-right">
                                <p className="font-semibold text-violet-200">
                                  {customer.points.toLocaleString("es")} pt
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {customer.distanceKm.toLocaleString("es", {
                                    maximumFractionDigits: 1,
                                  })}{" "}
                                  km
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <MiniMetric
                                labelText="Trabajos"
                                value={customer.jobsTotal}
                              />
                              <MiniMetric
                                labelText="Activos"
                                value={customer.jobsActive}
                              />
                              <MiniMetric
                                labelText="Liquidados"
                                value={customer.jobsSettled}
                              />
                              <MiniMetric
                                labelText="Última actividad"
                                value={
                                  customer.lastJobAt
                                    ? formatDate(customer.lastJobAt)
                                    : "Sin actividad"
                                }
                              />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <PaginationButton query={customers} />
                </>
              )}
            </PremiumPanel>
          </TabsContent>
        ) : null}

        {canPayments ? (
          <>
            <TabsContent value="billeteras" className="mt-3">
          <section className="relative overflow-hidden rounded-[26px] border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.065] via-background/60 to-background/40 shadow-[0_28px_80px_-52px_rgba(245,158,11,0.95)]">
            <img
              src="/admin-premium/wallets.svg"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-0 hidden h-52 w-[38%] object-cover object-right opacity-[0.11] mix-blend-screen sm:block xl:h-60 xl:w-[42%] xl:opacity-[0.16]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/5 via-background/18 to-amber-500/[0.025]" />
            <div className="relative z-[1] flex flex-col gap-3 border-b border-amber-400/15 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/[0.09] text-amber-300">
                  <Wallet className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-300">
                    Finanzas del conductor
                  </p>
                  <h3 className="mt-0.5 text-lg font-semibold text-foreground">Billeteras</h3>
                </div>
              </div>

              <div className="rounded-xl border border-border/55 bg-background/50 px-3 py-2 text-sm">
                {wallets.isLoading
                  ? "Consultando..."
                  : `${walletRows.length} ${
                      walletRows.length === 1 ? "billetera visible" : "billeteras visibles"
                    }`}
              </div>
            </div>

            <div className="relative z-[1] p-3 sm:p-4">
              {wallets.isLoading ? (
                <LoadingState />
              ) : !walletRows.length ? (
                <EmptyMarketplaceState
                  title="No hay billeteras"
                  description="No existen billeteras disponibles para mostrar."
                  icon={Wallet}
                />
              ) : (
                <>
                  <div className="space-y-2.5">
                    {walletRows.map((wallet) => {
                      const reserved =
                        Number(wallet.realReservedBalance) +
                        Number(wallet.promotionalReservedBalance);

                      return (
                        <article
                          key={wallet.userId}
                          className="group relative overflow-hidden rounded-[20px] border border-amber-400/12 bg-gradient-to-r from-amber-500/[0.035] via-background/58 to-background/48 p-3.5 shadow-[0_16px_48px_-40px_rgba(245,158,11,0.85)] transition hover:border-amber-400/22 hover:bg-background/65 sm:p-4"
                        >
                          <img
                            src="/admin-premium/wallets.svg"
                            alt=""
                            aria-hidden="true"
                            className="pointer-events-none absolute right-0 top-1/2 hidden h-[115%] w-48 -translate-y-1/2 object-cover object-right opacity-[0.035] mix-blend-screen sm:block xl:w-56 xl:opacity-[0.045]"
                          />
                          <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full bg-amber-400/[0.03] blur-3xl" />

                          <div className="relative grid gap-3 lg:grid-cols-[minmax(200px,0.9fr)_minmax(0,3.1fr)] lg:items-center">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Conductor
                              </p>
                              <p className="mt-1 truncate font-semibold text-foreground">
                                {wallet.driverDisplayName}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {wallet.driverPhone || "Sin teléfono registrado"}
                              </p>
                              <div className="mt-2">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                    wallet.initialDepositConfirmed
                                      ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
                                      : "border-amber-500/20 bg-amber-500/[0.07] text-amber-300"
                                  }`}
                                >
                                  {wallet.initialDepositConfirmed
                                    ? "DEPÓSITO INICIAL OK"
                                    : "DEPÓSITO INICIAL PENDIENTE"}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
                              <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2.5">
                              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                                Total
                              </p>
                              <p className="mt-1 text-lg font-semibold text-foreground">
                                {formatAmount(wallet.totalBalance, wallet.currency)}
                              </p>
                            </div>

                            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2.5">
                              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                                Disponible
                              </p>
                              <p className="mt-1 text-lg font-semibold text-foreground">
                                {formatAmount(wallet.availableBalance, wallet.currency)}
                              </p>
                            </div>

                            <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] px-3 py-2.5">
                              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                                Promocional
                              </p>
                              <p className="mt-1 font-semibold text-foreground">
                                {formatAmount(wallet.promotionalBalance, wallet.currency)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Disp. {formatAmount(wallet.promotionalAvailableBalance, wallet.currency)}
                              </p>
                            </div>

                              <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.035] px-3 py-2.5">
                                <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                                  Reservado
                                </p>
                                <p className="mt-1 font-semibold text-foreground">
                                  {formatAmount(reserved, wallet.currency)}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  Real {formatAmount(wallet.realReservedBalance, wallet.currency)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <PaginationButton query={wallets} />
                </>
              )}
            </div>
          </section>
        </TabsContent>
<TabsContent value="recargas">
              <PremiumPanel
                title="Recargas"
                description={
                  topups.isLoading
                    ? "Consultando recargas…"
                    : `${topupRows.length} ${
                        topupRows.length === 1 ? "recarga cargada" : "recargas cargadas"
                      }`
                }
                icon={Banknote}
                tone="cyan"
                backgroundImage="/admin-premium/topups.svg"
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1 rounded-2xl border border-cyan-400/15 bg-background/60 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-sm">
                      {[
                        ["", "Todas"],
                        ["requested", "Pendientes"],
                        ["confirmed", "Confirmadas"],
                        ["reconciled", "Conciliadas"],
                        ["rejected", "Rechazadas"],
                      ].map(([value, name]) => (
                        <Button
                          key={value || "all"}
                          size="sm"
                          variant={topupStatus === value ? "default" : "ghost"}
                          onClick={() => setTopupStatus(value)}
                        >
                          {name}
                        </Button>
                      ))}
                    </div>

                    {canManagePayments ? (
                      <Button
                        className="rounded-xl border border-cyan-300/20 shadow-[0_0_26px_-12px_rgba(34,211,238,0.95)]"
                        onClick={() => {
                          setError(null);
                          setNewTopup(true);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Registrar recarga
                      </Button>
                    ) : null}
                  </div>
                }
              >
                {topups.isLoading ? (
                  <LoadingState />
                ) : !topupRows.length ? (
                  <EmptyMarketplaceState
                    title="No hay recargas"
                    description="Cuando se registre una recarga aparecerá aquí."
                    icon={Banknote}
                  />
                ) : (
                  <>
                    <div className="space-y-3">
                      {topupRows.map((item) => {
                        const receipt = financialDocuments.data?.find(
                          (document) => document.topupId === item.topupId,
                        );

                        return (
                          <article
                            key={item.topupId}
                            className="group relative overflow-hidden rounded-[22px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.045] via-background/60 to-background/45 p-3.5 shadow-[0_18px_55px_-42px_rgba(34,211,238,0.85)] transition-colors hover:border-cyan-400/25"
                          >
                            <img
                              src="/admin-premium/topups.svg"
                              alt=""
                              aria-hidden="true"
                              className="pointer-events-none absolute right-0 top-0 h-full w-64 object-cover object-right opacity-[0.055] mix-blend-screen"
                            />
                            <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-cyan-400/[0.035] blur-3xl" />

                            <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(250px,0.72fr)_auto] lg:items-start">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-semibold text-foreground">
                                    {item.driverDisplayName}
                                  </h4>
                                  <StatusBadge status={item.status} />
                                </div>

                                <div className="mt-2 space-y-1.5 text-sm">
                                  <p className="text-muted-foreground">
                                    Método:{" "}
                                    <span className="font-medium text-foreground">
                                      {paymentMethodLabel(item.method)}
                                    </span>
                                  </p>

                                  {item.driverPhone ? (
                                    <p className="text-muted-foreground">
                                      Teléfono:{" "}
                                      <span className="font-medium text-foreground">
                                        {item.driverPhone}
                                      </span>
                                    </p>
                                  ) : null}

                                  {item.reference ? (
                                    <p className="text-muted-foreground">
                                      Referencia:{" "}
                                      <span className="text-foreground">{item.reference}</span>
                                    </p>
                                  ) : null}

                                  {item.notes ? (
                                    <p className="text-muted-foreground">
                                      Notas:{" "}
                                      <span className="text-foreground">{item.notes}</span>
                                    </p>
                                  ) : null}

                                  {item.rejectionReason ? (
                                    <p className="text-muted-foreground">
                                      Motivo:{" "}
                                      <span className="text-foreground">
                                        {item.rejectionReason}
                                      </span>
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="grid gap-2 rounded-2xl border border-border/55 bg-background/40 px-3.5 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                                <p className="text-muted-foreground">
                                  Solicitada:{" "}
                                  <span className="font-medium text-foreground">
                                    {formatDate(item.requestedAt)}
                                  </span>
                                </p>

                                {item.confirmedAt ? (
                                  <p className="text-muted-foreground">
                                    Confirmada:{" "}
                                    <span className="font-medium text-foreground">
                                      {formatDate(item.confirmedAt)}
                                    </span>
                                  </p>
                                ) : null}

                                {item.rejectedAt ? (
                                  <p className="text-muted-foreground">
                                    Rechazada:{" "}
                                    <span className="font-medium text-foreground">
                                      {formatDate(item.rejectedAt)}
                                    </span>
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
                                <div className="min-w-[112px] rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.055] px-3.5 py-2.5 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                                    Importe
                                  </p>
                                  <p className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
                                    {formatAmount(item.amount, item.currency)}
                                  </p>
                                </div>

                                {canManagePayments && item.status === "requested" ? (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setError(null);
                                      setTopup({
                                        id: item.topupId,
                                        driver: item.driverDisplayName,
                                        confirmationKey: crypto.randomUUID(),
                                      });
                                      setReason("");
                                    }}
                                  >
                                    Gestionar
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            {receipt ? (
                              <div className="relative mt-3 rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-emerald-500/[0.075] via-emerald-500/[0.035] to-cyan-500/[0.035] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                                <div className="flex items-center gap-2.5">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300">
                                    <ShieldCheck className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-emerald-300">
                                      Comprobante {receipt.documentNumber}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      Emitido {formatDate(receipt.issuedAt)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>

                    <PaginationButton query={topups} />
                  </>
                )}
              </PremiumPanel>
            </TabsContent>
          </>
        ) : null}

        <TabsContent value="incidencias">
          <PremiumPanel
            title="Incidencias"
            description={
              incidents.isLoading
                ? "Consultando incidencias…"
                : `${incidentRows.length} ${
                    incidentRows.length === 1 ? "incidencia cargada" : "incidencias cargadas"
                  }`
            }
            icon={AlertTriangle}
            tone="rose"
            action={
              <div className="flex flex-wrap gap-1 rounded-xl border border-border/70 bg-background/50 p-1">
                {[
                  ["open", "Abiertas"],
                  ["resolved", "Resueltas"],
                  ["all", "Todas"],
                ].map(([id, name]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={incidentState === id ? "default" : "ghost"}
                    onClick={() => setIncidentState(id)}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            }
          >
            {incidents.isLoading ? (
              <LoadingState />
            ) : !incidentRows.length ? (
              <EmptyMarketplaceState
                title="No hay incidencias"
                description={
                  incidentState === "open"
                    ? "No existen incidencias abiertas en este momento."
                    : "No existen incidencias para el filtro seleccionado."
                }
                icon={CheckCircle2}
              />
            ) : (
              <>
                <div className="space-y-3">
                  {incidentRows.map((item) => (
                    <article
                      key={item.jobId}
                      className={`rounded-2xl border p-4 ${
                        item.resolved
                          ? "border-border/65 bg-background/45"
                          : "border-rose-500/20 bg-rose-500/[0.035]"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <ServiceBadge service={item.serviceCode} />
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                item.resolved
                                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                  : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                              }`}
                            >
                              {item.resolved ? "Resuelta" : "Abierta"}
                            </span>
                          </div>

                          <p className="mt-3 font-medium text-foreground">
                            {text(item.incidentReason)}
                          </p>

                          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                            <UserRound className="h-4 w-4" />
                            {item.driverDisplayName || "Sin conductor asignado"}
                          </p>
                        </div>

                        {canManageMarketplace && !item.resolved ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIncident(item.jobId);
                              setReason("");
                            }}
                          >
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Resolver
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <PaginationButton query={incidents} />
              </>
            )}
          </PremiumPanel>
        </TabsContent>

        {canSettings ? (
          <TabsContent value="configuracion" className="mt-3">
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="relative overflow-hidden rounded-[28px] border border-amber-400/40 bg-gradient-to-br from-amber-500/[0.13] via-background/92 to-background/80 shadow-[0_28px_85px_-42px_rgba(245,158,11,0.95)]">
                <img
                  src="/admin-premium/economy.svg"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-7 h-36 w-48 object-contain object-right opacity-[0.16] mix-blend-screen"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/5 via-background/15 to-amber-500/[0.035]" />
                <div className="flex items-center gap-3 border-b border-amber-500/15 bg-amber-500/[0.025] px-5 py-5 sm:px-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/35 bg-amber-400/[0.11] text-amber-300 shadow-[0_0_26px_-10px_rgba(251,191,36,0.9)]">
                    <CircleDollarSign className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-300">
                      Economía
                    </p>
                    <h3 className="mt-0.5 text-lg font-semibold text-foreground">
                      Configuración comercial
                    </h3>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  {settings.isLoading ? (
                    <LoadingState />
                  ) : settings.isError ? (
                    <p className="text-sm text-rose-300">
                      No se pudo cargar la configuración comercial.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        <MiniMetric
                          labelText="Moneda"
                          value={settings.data?.walletCurrency ?? "CUP"}
                        />
                        <MiniMetric
                          labelText="Promoción"
                          value={
                            settings.data ? `${settings.data.promotionDurationDays} días` : "—"
                          }
                        />
                        <MiniMetric
                          labelText="Comisión"
                          value={settings.data ? `${settings.data.commissionRate * 100} %` : "—"}
                        />
                      </div>

                      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                          <p>
                            Regla comercial v{settings.data?.promotionRuleVersion ?? "—"}. Durante
                            la promoción no se cobra la comisión habitual. Al finalizar, se aplica
                            automáticamente la comisión configurada.
                          </p>
                          <p>Última actualización: {formatDate(settings.data?.updatedAt)}.</p>
                        </div>
                      </div>

                      {canManageSettings ? (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label htmlFor="marketplace-promotion-days">
                                Duración de la promoción
                              </Label>
                              <div className="relative mt-1.5">
                                <Input
                                  id="marketplace-promotion-days"
                                  type="number"
                                  min="1"
                                  max="365"
                                  step="1"
                                  className="pr-14"
                                  value={promotionDays}
                                  onChange={(event) => setPromotionDays(event.target.value)}
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                                  días
                                </span>
                              </div>
                            </div>

                            <div>
                              <Label htmlFor="marketplace-commission">Comisión Marketplace</Label>
                              <div className="relative mt-1.5">
                                <Input
                                  id="marketplace-commission"
                                  type="number"
                                  min="0.01"
                                  max="100"
                                  step="0.01"
                                  className="pr-12"
                                  value={commission}
                                  onChange={(event) => setCommission(event.target.value)}
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                                  %
                                </span>
                              </div>
                            </div>
                          </div>

                          <Button
                            className="w-full"
                            disabled={
                              save.isPending ||
                              !Number.isInteger(Number(promotionDays)) ||
                              Number(promotionDays) < 1 ||
                              Number(promotionDays) > 365 ||
                              Number(commission) <= 0 ||
                              Number(commission) > 100
                            }
                            onClick={() => save.mutate()}
                          >
                            {save.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-2 h-4 w-4" />
                            )}
                            Guardar configuración comercial
                          </Button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
              <section className="relative overflow-hidden rounded-[28px] border border-violet-400/40 bg-gradient-to-br from-violet-500/[0.13] via-background/92 to-background/80 shadow-[0_28px_85px_-42px_rgba(139,92,246,0.95)]">
                <img
                  src="/admin-premium/test-lab.svg"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-7 h-44 w-52 object-contain object-right opacity-[0.15] mix-blend-screen"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/5 via-background/15 to-violet-500/[0.04]" />
                <div className="flex items-center justify-between gap-3 border-b border-violet-500/15 bg-violet-500/[0.025] px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-400/[0.11] text-violet-300 shadow-[0_0_26px_-10px_rgba(167,139,250,0.9)]">
                      <TestTube2 className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-300">
                        Entorno controlado
                      </p>
                      <h3 className="mt-0.5 text-lg font-semibold text-foreground">
                        Modo de prueba
                      </h3>
                    </div>
                  </div>

                  <Switch
                    checked={testModeEnabled}
                    disabled={
                      testMode.isLoading ||
                      testModeDrivers.isLoading ||
                      !canManageSettings ||
                      !canManageMarketplace
                    }
                    onCheckedChange={(checked) => {
                      setTestModeEnabled(checked);
                      if (!checked) setTestForceCommission(false);
                    }}
                  />
                </div>

                <div className="p-4 sm:p-5">
                  {testMode.isLoading || testModeDrivers.isLoading ? (
                    <LoadingState />
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Las carreras creadas en este modo son PRUEBA y solo las recibe el conductor seleccionado.
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="marketplace-test-driver">Conductor de prueba</Label>
                          <select
                            id="marketplace-test-driver"
                            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none disabled:opacity-50"
                            value={testDriverUserId}
                            disabled={!testModeEnabled || !canManageSettings || !canManageMarketplace}
                            onChange={(event) => setTestDriverUserId(event.target.value)}
                          >
                            <option value="">Selecciona conductor</option>
                            {testModeDrivers.data?.items.map((item) => (
                              <option key={item.userId} value={item.userId}>
                                {item.displayName}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/55 bg-background/45 px-3 py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Probar comisión real
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Incluso durante el período gratuito.
                            </p>
                          </div>
                          <Switch
                            checked={testForceCommission}
                            disabled={
                              !testModeEnabled || !canManageSettings || !canManageMarketplace
                            }
                            onCheckedChange={setTestForceCommission}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <MiniMetric
                          labelText="Estado"
                          value={testModeEnabled ? "ACTIVO · SOLO PRUEBAS" : "Desactivado"}
                        />
                        <MiniMetric
                          labelText="Conductor"
                          value={testDriver?.displayName ?? testMode.data?.targetDriverDisplayName ?? "—"}
                        />
                        <MiniMetric
                          labelText="Comisión"
                          value={
                            settings.data
                              ? `${(settings.data.commissionRate * 100).toLocaleString("es")} %`
                              : "—"
                          }
                        />
                        <MiniMetric
                          labelText="Saldo disponible"
                          value={
                            testDriver?.walletAvailableBalance == null
                              ? "—"
                              : formatAmount(
                                  testDriver.walletAvailableBalance,
                                  settings.data?.walletCurrency ?? "CUP",
                                )
                          }
                        />
                      </div>

                      {canManageSettings && canManageMarketplace ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button
                            className="w-full"
                            disabled={saveTestMode.isPending || (testModeEnabled && !testDriverUserId)}
                            onClick={() => saveTestMode.mutate()}
                          >
                            {saveTestMode.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-2 h-4 w-4" />
                            )}
                            Guardar modo de prueba
                          </Button>

                          <Button
                            className="w-full"
                            variant="destructive"
                            disabled={deleteAllTestJobs.isPending}
                            onClick={() => {
                              const why = window.prompt(
                                "Motivo para eliminar todas las carreras de prueba:",
                                "Limpieza de pruebas",
                              );

                              if (!why?.trim()) return;

                              if (
                                !window.confirm(
                                  "Se eliminarán TODAS las carreras marcadas como PRUEBA. Las carreras reales no se tocarán. ¿Continuar?",
                                )
                              ) {
                                return;
                              }

                              deleteAllTestJobs.mutate(why.trim());
                            }}
                          >
                            {deleteAllTestJobs.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Limpiar pruebas
                          </Button>
                        </div>
                      ) : null}

                      <p className="text-[11px] text-muted-foreground">
                        Los controles de prueba nunca pueden eliminar una carrera real.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <MarketplaceDispatchSettingsCard
                projectId={projectId}
                canManage={canManageSettings}
              />
            </div>
          </TabsContent>        ) : null}
      </Tabs>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Dialog
        open={Boolean(driver360Id)}
        onOpenChange={(open) => {
          if (!open) setDriver360Id(null);
        }}
      >
        <DialogContent className="max-h-[94vh] overflow-y-auto border-cyan-500/20 bg-background/95 p-0 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-w-5xl">
          <div className="sticky top-0 z-20 border-b border-border/55 bg-background/90 px-5 py-4 pr-14 backdrop-blur-xl sm:px-6 sm:py-5">
            <DialogHeader className="text-left">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                  Perfil de conductor
                </span>
              </div>
              <DialogTitle className="text-xl tracking-tight sm:text-2xl">
                Ficha 360 del conductor
              </DialogTitle>
              <DialogDescription className="max-w-2xl">
                Perfil, vehículo, promoción, actividad, referidos, valoraciones y situación financiera.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-4 sm:p-6">
            {driver360.isLoading ? (
              <LoadingState />
            ) : driver360.data ? (
              <Driver360Detail
                detail={driver360.data}
                financial={driverFinancial360.data ?? null}
                canSeeFinancial={canManagePayments}
                financialLoading={driverFinancial360.isLoading}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/45 p-5 text-sm text-muted-foreground">
                No se encontró el conductor.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(customerId)}
        onOpenChange={(open) => {
          if (!open) setCustomerId(null);
        }}
      >
        <DialogContent className="max-h-[94vh] overflow-y-auto border-violet-500/20 bg-background/95 p-0 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-w-5xl">
          <div className="sticky top-0 z-20 border-b border-border/55 bg-background/90 px-5 py-4 pr-14 backdrop-blur-xl sm:px-6 sm:py-5">
            <DialogHeader className="text-left">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.75)]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
                  Perfil de cliente
                </span>
              </div>
              <DialogTitle className="text-xl tracking-tight sm:text-2xl">
                Ficha 360 del cliente
              </DialogTitle>
              <DialogDescription className="max-w-2xl">
                Actividad, consumo, modalidades e historial real de servicios en Marketplace.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-4 sm:p-6">
            {customer360.isLoading ? (
              <LoadingState />
            ) : customer360.data ? (
              <Customer360Detail
                detail={customer360.data}
                history={rows(customerHistory)}
                hasMore={Boolean(customerHistory.hasNextPage)}
                loadingMore={customerHistory.isFetchingNextPage}
                onLoadMore={() => customerHistory.fetchNextPage()}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/45 p-5 text-sm text-muted-foreground">
                {"No se encontr\u00f3 el cliente."}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(jobId)} onOpenChange={() => setJobId(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto border-emerald-500/20 bg-background/95 p-0 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-w-5xl">
          <div className="sticky top-0 z-20 border-b border-border/55 bg-background/90 px-5 py-4 pr-14 backdrop-blur-xl sm:px-6 sm:py-5">
            <DialogHeader className="text-left">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Operacion Marketplace
                </span>
              </div>
              <DialogTitle className="text-xl tracking-tight sm:text-2xl">
                Detalle del trabajo
              </DialogTitle>
              <DialogDescription className="max-w-2xl">
                Ruta, participantes, estado financiero y trazabilidad completa.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-4 sm:p-6">
            {detail.isLoading ? (
              <LoadingState />
            ) : detail.data ? (
              <JobDetail detail={detail.data} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/45 p-5 text-sm text-muted-foreground">
                No se encontro el trabajo.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(driver)} onOpenChange={() => setDriver(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {driver?.suspended ? "Suspender conductor" : "Reactivar conductor"}
            </DialogTitle>
            <DialogDescription>
              {driver?.suspended
                ? "La suspensión impedirá que el conductor opere normalmente en Marketplace."
                : "El conductor recuperará su estado operativo."}
            </DialogDescription>
          </DialogHeader>

          {driver?.suspended ? (
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo obligatorio"
            />
          ) : null}

          <Button
            disabled={suspend.isPending || Boolean(driver?.suspended && !reason.trim())}
            onClick={() => suspend.mutate()}
          >
            {suspend.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {driver?.suspended ? "Suspender" : "Confirmar reactivación"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(incident)} onOpenChange={() => setIncident(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver incidencia</DialogTitle>
            <DialogDescription>
              Define el resultado administrativo y deja constancia de la resolución.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={resolution === "completed" ? "default" : "outline"}
              onClick={() => setResolution("completed")}
            >
              Completar
            </Button>
            <Button
              variant={resolution === "cancelled" ? "default" : "outline"}
              onClick={() => setResolution("cancelled")}
            >
              Cancelar
            </Button>
          </div>

          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo / nota de resolución"
          />

          <Button disabled={resolve.isPending || !reason.trim()} onClick={() => resolve.mutate()}>
            {resolve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Resolver incidencia
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newTopup}
        onOpenChange={(open) => {
          setNewTopup(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar recarga</DialogTitle>
            <DialogDescription>
              Registra una nueva solicitud utilizando los métodos de pago habilitados.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="topup-driver">Conductor</Label>
            <select
              id="topup-driver"
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none"
              value={topupDriver}
              onChange={(event) => setTopupDriver(event.target.value)}
            >
              <option value="">Selecciona conductor</option>
              {topupDrivers.data?.items.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="topup-amount">Importe</Label>
            <Input
              id="topup-amount"
              className="mt-1.5"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Importe"
            />
          </div>

          <div>
            <Label htmlFor="topup-method">Método de pago</Label>

            {paymentMethods.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Cargando métodos de pago…
              </p>
            ) : paymentMethods.isError ? (
              <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm text-amber-200">
                No se pudo cargar el catálogo de métodos de pago. La recarga no se
                registrará hasta resolver el permiso del catálogo.
              </div>
            ) : (
              <select
                id="topup-method"
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value);
                  setReference("");
                }}
              >
                <option value="">Selecciona método</option>
                {paymentMethods.data?.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedPaymentMethod?.requiresReference ? (
            <div>
              <Label htmlFor="topup-reference">Referencia obligatoria</Label>
              <Input
                id="topup-reference"
                className="mt-1.5"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Número o referencia del pago"
              />
            </div>
          ) : null}

          <div>
            <Label htmlFor="topup-notes">Notas</Label>
            <Textarea
              id="topup-notes"
              className="mt-1.5"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opcional"
            />
          </div>

          <Button
            disabled={
              create.isPending ||
              paymentMethods.isLoading ||
              paymentMethods.isError ||
              !topupDriver ||
              Number(amount) <= 0 ||
              !selectedPaymentMethod ||
              (selectedPaymentMethod.requiresReference && !reference.trim())
            }
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Registrar recarga
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(topup)}
        onOpenChange={(open) => {
          if (!open) {
            setTopup(null);
            setReason("");
            void invalidate("marketplace-topups", "marketplace-financial-documents");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gestionar recarga de {topup?.driver}</DialogTitle>
            <DialogDescription>
              Confirmar acredita la billetera una sola vez. Para rechazar debes indicar
              el motivo.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo obligatorio solo para rechazar"
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={confirm.isPending || reject.isPending}
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar
            </Button>

            <Button
              variant="destructive"
              disabled={reject.isPending || confirm.isPending || !reason.trim()}
              onClick={() => reject.mutate()}
            >
              {reject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Rechazar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function JobDetail({ detail }: { detail: import("@/lib/services/types").MarketplaceJobDetail }) {
  const { job, serviceRequest, assignment, customer, financial, timeline, incidentResolution } =
    detail;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.11] via-background/80 to-cyan-500/[0.07] p-5 shadow-[0_24px_70px_-42px_rgba(16,185,129,0.8)] sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-14 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={text(job.status)} />
            <ServiceBadge service={text(serviceRequest.service_code)} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/55 bg-background/55 p-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    Origen
                  </p>
                  <p className="mt-1.5 font-medium leading-snug text-foreground">
                    {text(serviceRequest.origin_text)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/55 bg-background/55 p-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.07] text-cyan-300">
                  <ArrowRight className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    Destino
                  </p>
                  <p className="mt-1.5 font-medium leading-snug text-foreground">
                    {text(serviceRequest.destination_text)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
            Resumen
          </p>
          <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            Datos de la operacion
          </h4>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.06] text-violet-300">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Programado
                </p>
                <p className="mt-1.5 font-semibold text-foreground">
                  {formatDate(serviceRequest.scheduled_for)}
                </p>
              </div>
            </div>
          </div>

          {financial ? (
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300">
                  <Banknote className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Importe
                  </p>
                  <p className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
                    {formatAmount(financial.amount, text(financial.currency))}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {customer ? (
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-300">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Cliente
                  </p>
                  <p className="mt-1.5 font-semibold text-foreground">
                    {text(customer.display_name)}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {text(customer.whatsapp_phone)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {assignment ? (
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-amber-300">
                  <CarFront className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Conductor / vehiculo
                  </p>
                  <p className="mt-1.5 break-all text-sm font-semibold text-foreground">
                    {text(assignment.driver_user_id)}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {text(assignment.vehicle_id)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {financial ? (
        <section className="rounded-[22px] border border-border/60 bg-gradient-to-br from-background/70 to-emerald-500/[0.035] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300">
              <CircleDollarSign className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Estado financiero
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {label(text(financial.reservation_status))}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {incidentResolution ? (
        <section className="rounded-[22px] border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.07] to-background/50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/[0.07] text-rose-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-300">
                Resolucion de incidencia
              </p>
              <p className="mt-1.5 font-semibold text-foreground">
                {label(text(incidentResolution.resolution))}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {text(incidentResolution.resolution_note)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[24px] border border-border/60 bg-background/35 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Trazabilidad
          </p>
          <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            Historial de estados
          </h4>
        </div>

        {timeline.length ? (
          <div className="relative mt-4 space-y-3 pl-5">
            <div className="absolute bottom-3 left-[6px] top-3 w-px bg-gradient-to-b from-cyan-400/45 via-border/50 to-transparent" />

            {timeline.map((event, index) => (
              <div
                key={String(event.event_id ?? index)}
                className="relative rounded-2xl border border-border/60 bg-background/60 p-4"
              >
                <span className="absolute -left-[18px] top-5 h-3 w-3 rounded-full border-2 border-background bg-cyan-400 shadow-[0_0_0_3px_rgba(34,211,238,0.10)]" />
                <p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>
                <p className="mt-1.5 font-medium text-foreground">
                  {text(event.action)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-lg border border-border/55 bg-background/55 px-2.5 py-1.5">
                    {label(text(event.from_status))}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span className="rounded-lg border border-border/55 bg-background/55 px-2.5 py-1.5">
                    {label(text(event.to_status))}
                  </span>
                </div>
                {event.reason ? (
                  <p className="mt-2 text-xs text-muted-foreground">{text(event.reason)}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/40 p-4">
            <Clock3 className="h-5 w-5 text-cyan-300" />
            <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
          </div>
        )}
      </section>
    </div>
  );
}
