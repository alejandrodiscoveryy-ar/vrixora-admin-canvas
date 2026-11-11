import { lazy, Suspense, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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
  Radar,
  Search,
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
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";
import { MARKETPLACE_WORKSPACE_VIEWS } from "@/lib/admin-navigation";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";

import MarketplaceDriver360Record from "@/features/admin/MarketplaceDriver360Record";
import MarketplaceFleetPulse from "@/features/admin/MarketplaceFleetPulse";
import { EmptyMarketplaceState, LoadingState, PaginationButton, FilterSelect, MiniMetric } from "@/features/admin/MarketplaceListPrimitives";
import { driverWhatsAppLinks } from "@/lib/driver-whatsapp";



import MarketplaceRadarReadinessCard from "@/features/admin/MarketplaceRadarReadinessCard";

import {
  getMarketplaceOperationalMap,
  getMarketplaceJobNotificationRecipients,
  getMarketplaceOperationalMapConfig,
  getMarketplaceDirectoryDriverMedia,
  type MarketplaceDirectoryDriverMedia,
} from "@/lib/marketplace-map";

// Evitar descargar mapas de pruebas y sus dependencias en las otras vistas.
const MarketplaceOperationalMap = lazy(() => import("@/features/admin/MarketplaceOperationalMap"));
const MarketplaceConfigurationWorkspace = lazy(() => import("@/features/admin/MarketplaceConfigurationWorkspace"));
const MarketplaceCustomerCareWorkspace = lazy(() => import("@/features/admin/MarketplaceCustomerCareWorkspace"));

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
        ADMIN_FINISH_REASON_REQUIRED: "Debes indicar el motivo del cierre.",
        ADMIN_FINISH_RESPONSE_INVALID: "No se pudo verificar el cierre. Actualiza los trabajos.",
        FINISH_REASON_TOO_LONG: "El motivo no puede superar 1000 caracteres.",
        INVALID_JOB_TRANSITION: "La carrera ya no permite esta operación. Actualiza la lista.",
        SETTLEMENT_PRECONDITION_FAILED: "La liquidación requiere una revisión antes de continuar.",
        INSUFFICIENT_MARKETPLACE_WALLET_BALANCE: "No se puede liquidar por saldo insuficiente.",
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

// Formato exclusivamente visual: no modifica precios almacenados.
const formatOperationPrice = (value: unknown, currency = "CUP") => {
  if (value == null || value === "") return `— ${currency}`;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${text(value)} ${currency}`;

  return `${amount.toLocaleString("es-ES", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  })} ${currency}`;
};

const operationRowClasses = (status: string | null) => {
  if (["completed", "settled", "confirmed", "reconciled"].includes(status ?? "")) {
    return "border-emerald-500/45 border-l-4 border-l-emerald-400 bg-emerald-500/[0.10] hover:bg-emerald-500/[0.15]";
  }

  if (
    [
      "cancelled",
      "cancelled_by_customer",
      "cancelled_by_driver",
      "expired",
      "rejected",
      "incident",
    ].includes(status ?? "")
  ) {
    return "border-rose-500/45 border-l-4 border-l-rose-400 bg-rose-500/[0.10] hover:bg-rose-500/[0.15]";
  }

  if (
    ["requested", "published", "accepted", "en_route", "pickup", "in_progress", "active"].includes(
      status ?? "",
    )
  ) {
    return "border-amber-500/45 border-l-4 border-l-amber-400 bg-amber-500/[0.10] hover:bg-amber-500/[0.15]";
  }

  return "border-border/60 border-l-4 border-l-border bg-background/60 hover:bg-muted/30";
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

// Fechas administrativas de clientes con zona horaria fija de Cuba,
 // independientes del país o zona del dispositivo del operador.
const formatCustomerDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CU", {
    timeZone: "America/Havana",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
  headerless = false,
  children,
}: {
  title: string;
  description?: string;
  icon: typeof BriefcaseBusiness;
  tone?: PanelTone;
  action?: ReactNode;
  backgroundImage?: string;
  headerless?: boolean;
  children: ReactNode;
}) {
  const visual = panelVisuals[tone];

  // La pestaÃ±a ya identifica la secciÃ³n; presentar los datos sin repetir una cabecera grande.
  // Los controles de filtro y las acciones se conservan en una barra compacta.
  if (headerless) {
    return (
      <section aria-label={title} className="min-w-0">
        {action ? (
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-start gap-2 sm:mb-3 sm:justify-end">{action}</div>
        ) : null}
        <div className="min-w-0">{children}</div>
      </section>
    );
  }

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
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-xl border ${accentClasses}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        {labelText}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
        {value}
      </p>
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
    value == null ? "\u2014" : `${value.toLocaleString("es", { maximumFractionDigits: 1 })} km`;

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
              Cliente desde {formatCustomerDateTime(detail.customer.createdAt)} (Cuba)
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-border/55 bg-background/55 px-3.5 py-3 backdrop-blur">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
                <Phone className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  WhatsApp
                </p>
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
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Correo
                </p>
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
function normalizeDriverText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

function dateOfRegistration(value: string | null | undefined) {
  const parsed = new Date(value ?? "");
  return Number.isNaN(parsed.getTime()) ? "No disponible" :
    parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Havana" });
}

export default function MarketplaceSection({ projectId }: { projectId: string }) {
  const { data: permissions = [] } = useProjectPermissions(projectId);

  const requestedView = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).vista,
  });
  const alertDriverId = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).conductor,
  });
  const alertJobId = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).carrera,
  });
  const navigate = useNavigate();
  const activeView = MARKETPLACE_WORKSPACE_VIEWS.find(
    (view) => view.slug === requestedView && permissions.includes(view.permission),
  );
  const tab = activeView?.slug ?? "resumen";
  // Remove the entity ID from the URL when a linked detail is dismissed.
  // Keep the active workspace tab; the detail must not reopen on refresh.
  const dismissAlertDeepLink = () => {
    void navigate({
      to: "/admin/proyectos/$id/$section",
      params: { id: projectId, section: "trabajos" },
      search: { vista: tab },
      replace: true,
    });
  };
  const [mapVisited, setMapVisited] = useState(false);
  const [showAllPulseMetrics, setShowAllPulseMetrics] = useState(false);
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [incidentState, setIncidentState] = useState("open");
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSort, setCustomerSort] = useState<"points_desc" | "recent">("points_desc");
  const [driverSearch, setDriverSearch] = useState("");
  const [driverStatusFilter, setDriverStatusFilter] = useState("");
  const [driverAvailabilityFilter, setDriverAvailabilityFilter] = useState("");
  const [driverCategoryFilter, setDriverCategoryFilter] = useState("");
  const [driverPeriodFilter, setDriverPeriodFilter] = useState("");
  const [driverVisibleCount, setDriverVisibleCount] = useState(25);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobDetailInitialTab, setJobDetailInitialTab] = useState<"overview" | "radar">("overview");
  const [expandedOperationId, setExpandedOperationId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [driver, setDriver] = useState<{
    id: string;
    suspended: boolean;
  } | null>(null);
  const [driver360Id, setDriver360Id] = useState<string | null>(null);
  // Enlaces profundos desde la campana y las notificaciones de Windows.
  // Abrir solo registros con identificadores validos; el backend conserva el control de acceso.
  useEffect(() => {
    if (typeof alertDriverId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(alertDriverId)) {
      setDriver360Id(alertDriverId);
    }
  }, [alertDriverId, projectId]);
  useEffect(() => {
    if (typeof alertJobId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(alertJobId)) {
      setJobId(alertJobId);
    }
  }, [alertJobId, projectId]);
  const [incident, setIncident] = useState<string | null>(null);
  const [adminFinish, setAdminFinish] = useState<{
    jobId: string;
    idempotencyKey: string;
  } | null>(null);
  const [assistedCancel, setAssistedCancel] = useState<{
    jobId: string; status: string; customer: string; key: string
  } | null>(null);
  const [assistedCancelReason, setAssistedCancelReason] = useState("");
  const [assistedCancelError, setAssistedCancelError] = useState<string | null>(null);
  const [adminFinishReason, setAdminFinishReason] = useState("");
  const [adminFinishError, setAdminFinishError] = useState<string | null>(null);
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
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testDriverUserId, setTestDriverUserId] = useState("");
  const [testForceCommission, setTestForceCommission] = useState(false);

  const canCustomers = permissions.includes("customers.view");
  const canPayments = permissions.includes("payments.view");
  const canManagePayments = permissions.includes("payments.manage");
  const canSettings = permissions.includes("settings.view");
  const canManageSettings = permissions.includes("settings.manage");
  const canManageMarketplace = permissions.includes("marketplace.manage");
  const canFinishAdmin = canManageMarketplace && canManagePayments;

  const queryClient = useQueryClient();

  // Mantener montado el mapa al alternar vistas, pero no cargarlo hasta abrir Mapa.
  useEffect(() => {
    if (tab === "mapa") setMapVisited(true);
  }, [tab]);

  useEffect(() => {
    // No competir con los datos del panel inicial. Precalentar al entrar en Mapa,
    // en paralelo a la descarga diferida del módulo visual.
    if (tab !== "mapa" || !permissions.includes("marketplace.view")) return;

    void queryClient.prefetchQuery({
      queryKey: ["marketplace-operational-map-config", projectId],
      queryFn: () => getMarketplaceOperationalMapConfig(projectId),
      staleTime: 15 * 60_000,
    });

    void queryClient.prefetchQuery({
      queryKey: ["marketplace-operational-map-live", projectId],
      queryFn: () => getMarketplaceOperationalMap(projectId),
      staleTime: 5_000,
    });
  }, [permissions, projectId, queryClient, tab]);

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
        limit: 200,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "conductores",
  });

  // Buscar y filtrar contra el directorio entero, no solo la primera página.
  // La RPC existente mantiene la comprobación de permisos y la paginación segura.
  useEffect(() => {
    if (tab !== "conductores" || !drivers.hasNextPage || drivers.isFetching || drivers.isError) return;
    void drivers.fetchNextPage();
  }, [tab, drivers.hasNextPage, drivers.isFetching, drivers.isError, drivers.fetchNextPage]);

  const customers = useInfiniteQuery({
    queryKey: ["marketplace-customers", projectId, customerSearch, customerSort],
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

  const adminFinishMutation = useMutation({
    mutationFn: async () => {
      if (!canFinishAdmin || !adminFinish || adminFinishReason.trim().length < 8) {
        throw new Error("ADMIN_FINISH_REASON_REQUIRED");
      }

      return supabaseServices.marketplace.finishJob(projectId, {
        jobId: adminFinish.jobId,
        reason: adminFinishReason.trim(),
        idempotencyKey: adminFinish.idempotencyKey,
      });
    },
    onSuccess: () => {
      setAdminFinish(null);
      setAdminFinishReason("");
      setAdminFinishError(null);

      void invalidate(
        "marketplace-overview",
        "marketplace-jobs",
        "marketplace-job-detail",
        "marketplace-drivers",
        "marketplace-wallets",
        "marketplace-incidents",
        "marketplace-operational-map-live",
      );
    },
    onError: (mutationError) => {
      setAdminFinishError(errorText(mutationError));
      void invalidate("marketplace-jobs", "marketplace-job-detail");
    },
  });
  const assistedCancelMutation = useMutation({
    mutationFn: async () => {
      if (!canManageMarketplace || !assistedCancel ||
          assistedCancelReason.trim().length < 8) {
        throw new Error("CARE_CANCEL_REASON_REQUIRED");
      }

      const { data, error } = await getSupabaseClient().rpc(
        "admin_cancel_assisted_marketplace_job",
        {
          target_project_id: projectId,
          target_job_id: assistedCancel.jobId,
          target_expected_status: assistedCancel.status,
          target_reason: assistedCancelReason.trim(),
          target_idempotency_key: assistedCancel.key,
        },
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setAssistedCancel(null);
      setAssistedCancelReason("");
      setAssistedCancelError(null);
      toast.success("Carrera cancelada por solicitud del cliente.");

      void invalidate(
        "marketplace-jobs",
        "marketplace-overview",
        "marketplace-drivers",
        "marketplace-wallets",
        "marketplace-job-detail",
        "marketplace-operational-map-live",
        "marketplace-assisted-job-ids",
      );
    },
    onError: (e) => setAssistedCancelError(errorText(e)),
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
      supabaseServices.marketplace.confirmTopup(projectId, topup!.id, topup!.confirmationKey),
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
  const assistedJobIds = useQuery({
    queryKey: [
      "marketplace-assisted-job-ids",
      projectId,
      jobRows.map((j) => j.jobId),
    ],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_list_assisted_job_ids",
        {
          target_project_id: projectId,
          target_job_ids: jobRows.map((j) => j.jobId),
        },
      );

      if (error) throw error;

      return new Set(
        ((data ?? []) as Array<{ job_id: string }>)
          .map((j) => j.job_id)
      );
    },
    enabled: tab === "trabajos" &&
      canManageMarketplace &&
      jobRows.length > 0,
    refetchInterval: 30_000,
  });


  const driverRows = rows(drivers);
  const driverCategories = [...new Set(
    driverRows.map((item) => item.vehicleCategoryCode).filter((code): code is string => Boolean(code)),
  )].sort();
  const filteredDriverRows = driverRows.filter((item) => {
    const query = normalizeDriverText(driverSearch);
    const phoneDigits = driverSearch.replace(/\D/g, "");
    if (query && !normalizeDriverText(item.displayName).includes(query) &&
        !(phoneDigits && (item.phone ?? "").replace(/\D/g, "").includes(phoneDigits))) return false;
    if (driverStatusFilter && item.status !== driverStatusFilter) return false;
    if (driverAvailabilityFilter === "available" && !item.isAvailable) return false;
    if (driverAvailabilityFilter === "unavailable" && item.isAvailable) return false;
    if (driverCategoryFilter && item.vehicleCategoryCode !== driverCategoryFilter) return false;
    if (driverPeriodFilter) {
      const registered = new Date(item.createdAt);
      if (Number.isNaN(registered.getTime())) return false;
      if (driverPeriodFilter === "today" && dateOfRegistration(item.createdAt) !==
        new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Havana" })) return false;
      const days = Number(driverPeriodFilter);
      if (Number.isFinite(days) && Date.now() - registered.getTime() > days * 86_400_000) return false;
    }
    return true;
  });
  const visibleDriverRows = filteredDriverRows.slice(0, driverVisibleCount);
  const driverMediaIds = visibleDriverRows.map((row) => row.userId);
  const driverFiltersActive = Boolean(driverSearch || driverStatusFilter || driverAvailabilityFilter ||
    driverCategoryFilter || driverPeriodFilter);
  useEffect(() => {
    setDriverVisibleCount(25);
  }, [driverSearch, driverStatusFilter, driverAvailabilityFilter, driverCategoryFilter, driverPeriodFilter, projectId]);
  const driverMedia = useQuery({
    queryKey: ["marketplace-driver-directory-media", projectId, driverMediaIds],
    queryFn: () => getMarketplaceDirectoryDriverMedia(projectId, driverMediaIds),
    enabled: tab === "conductores" && driverMediaIds.length > 0,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const selectedDriverMedia = useQuery({
    queryKey: ["marketplace-driver-360-media", projectId, driver360Id],
    queryFn: () => getMarketplaceDirectoryDriverMedia(projectId, [driver360Id!]),
    enabled: Boolean(driver360Id),
    staleTime: 5 * 60_000,
    retry: 1,
  });
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
    <div className="min-w-0 space-y-3 sm:space-y-6">
      <Tabs value={tab}>
        <TabsContent value="resumen">
          <section
            aria-label="Indicadores operativos de Pulso"
            className="relative overflow-hidden rounded-[20px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.035] via-background/65 to-violet-500/[0.025] p-3 shadow-[0_26px_76px_-57px_rgba(34,211,238,0.4)] sm:rounded-[28px] sm:p-5 lg:p-6"
          >
            <Eye aria-hidden="true" strokeWidth={0.65} className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 text-cyan-300/[0.025]" />
            <header className="relative mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-5 sm:items-start sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 sm:items-start sm:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/[0.09] text-cyan-200 shadow-inner shadow-cyan-500/[0.07] sm:h-12 sm:w-12 sm:rounded-2xl">
                  <Eye className="h-4 w-4 sm:h-6 sm:w-6" />
                </span>
                <div>
                  <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/85 sm:block">Centro de control · Indicadores</p>
                  <h2 className="text-base font-bold tracking-tight text-foreground sm:mt-1 sm:text-xl">Pulso operativo</h2>
                  <p className="mt-1 hidden text-xs text-muted-foreground sm:block sm:text-sm">Actividad, equipo y gestión del Marketplace.</p>
                </div>
              </div>
              <span role="status" aria-label={overview.isError ? "Error de actualización" : overview.isFetching ? "Actualizando datos" : "Datos actualizados cada 30 segundos"} className="shrink-0 rounded-lg border border-border/60 bg-background/55 px-2 py-1.5 text-[10px] text-muted-foreground sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs">
                <span className="sm:hidden">{overview.isError ? "Error" : overview.isFetching ? "Actualizando" : "Cada 30 s"}</span>
                <span className="hidden sm:inline">{overview.isError ? "Error de actualización" : overview.isFetching ? "Actualizando..." : "Datos cada 30 s"}</span>
              </span>
            </header>
            <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Conductores",
                  detail: "Perfiles registrados",
                  eyebrow: "Equipo",
                  value: overview.data?.driversTotal,
                  Icon: Users,
                  shell:
                    "border-cyan-400/18 bg-gradient-to-br from-cyan-500/[0.075] via-background/62 to-background/45",
                  icon: "border-cyan-400/20 bg-cyan-500/[0.09] text-cyan-300",
                  glow: "bg-cyan-400/[0.07]",
                },
                {
                  label: "Activos",
                  detail: "Perfiles habilitados",
                  eyebrow: "Operación",
                  value: overview.data?.driversActive,
                  Icon: Users,
                  shell:
                    "border-emerald-400/18 bg-gradient-to-br from-emerald-500/[0.075] via-background/62 to-background/45",
                  icon: "border-emerald-400/20 bg-emerald-500/[0.09] text-emerald-300",
                  glow: "bg-emerald-400/[0.07]",
                },
                {
                  label: "En promoción",
                  detail: "Beneficio vigente",
                  eyebrow: "Beneficio",
                  value: overview.data?.driversTrialActive,
                  Icon: BriefcaseBusiness,
                  shell:
                    "border-violet-400/18 bg-gradient-to-br from-violet-500/[0.075] via-background/62 to-background/45",
                  icon: "border-violet-400/20 bg-violet-500/[0.09] text-violet-300",
                  glow: "bg-violet-400/[0.07]",
                },
                {
                  label: "Post-promoción activos",
                  detail: "Activos tras el beneficio",
                  eyebrow: "Comercial",
                  value: overview.data?.driversPostTrialActive,
                  Icon: WalletCards,
                  shell:
                    "border-amber-400/18 bg-gradient-to-br from-amber-500/[0.07] via-background/62 to-background/45",
                  icon: "border-amber-400/20 bg-amber-500/[0.08] text-amber-300",
                  glow: "bg-amber-400/[0.06]",
                },
                {
                  label: "Trabajos publicados",
                  detail: "Solicitudes publicadas",
                  eyebrow: "Marketplace",
                  value: overview.data?.jobsPublished,
                  Icon: BriefcaseBusiness,
                  shell:
                    "border-emerald-400/18 bg-gradient-to-br from-emerald-500/[0.065] via-background/62 to-cyan-500/[0.02]",
                  icon: "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300",
                  glow: "bg-emerald-400/[0.06]",
                },
                {
                  label: "Trabajos activos",
                  detail: "Operaciones en desarrollo",
                  eyebrow: "Actividad",
                  value: overview.data?.jobsActive,
                  Icon: BriefcaseBusiness,
                  shell:
                    "border-cyan-400/18 bg-gradient-to-br from-cyan-500/[0.065] via-background/62 to-violet-500/[0.02]",
                  icon: "border-cyan-400/20 bg-cyan-500/[0.08] text-cyan-300",
                  glow: "bg-cyan-400/[0.06]",
                },
                {
                  label: "Incidencias abiertas",
                  detail: "Pendientes de resolver",
                  eyebrow: "Atención",
                  value: overview.data?.jobsIncidentOpen,
                  Icon: AlertTriangle,
                  shell:
                    "border-rose-400/18 bg-gradient-to-br from-rose-500/[0.07] via-background/62 to-background/45",
                  icon: "border-rose-400/20 bg-rose-500/[0.08] text-rose-300",
                  glow: "bg-rose-400/[0.06]",
                },
              ].map(({ label: metricLabel, eyebrow, detail, value, Icon, shell, icon, glow }) => (
                <article
                  key={metricLabel}
                  className={`group relative min-h-[126px] overflow-hidden rounded-[17px] border p-3 shadow-[0_20px_55px_-44px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5 sm:min-h-[174px] sm:rounded-[23px] sm:p-4 ${!showAllPulseMetrics && ["En promoción", "Post-promoción activos", "Trabajos publicados"].includes(metricLabel) ? "hidden sm:block" : ""} ${shell}`}
                >
                  <div
                    className={`pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-3xl ${glow}`}
                  />
                  <Icon aria-hidden="true" strokeWidth={0.65} className="pointer-events-none absolute -right-5 bottom-0 hidden h-36 w-36 rotate-[-11deg] text-cyan-300/[0.065] sm:block" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">
                           {eyebrow}
                        </p>
                        <p className="text-xs font-semibold leading-snug text-foreground sm:mt-1.5 sm:text-sm">
                           {metricLabel}
                        </p>
                      </div>

                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border sm:h-11 sm:w-11 sm:rounded-xl ${icon}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-2 sm:mt-5">
                       {overview.isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <p className="font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                           {overview.isError ? "—" : Number(value ?? 0)}
                        </p>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:mt-1 sm:text-[11px]">{detail}</p>
                  </div>
                </article>
              ))}

              {!overview.isLoading && overview.data?.pendingTopups !== null ? (
                <article className={`group relative min-h-[126px] overflow-hidden rounded-[17px] border border-amber-400/18 bg-gradient-to-br from-amber-500/[0.07] via-background/62 to-violet-500/[0.02] p-3 shadow-[0_20px_55px_-44px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5 sm:min-h-[174px] sm:rounded-[23px] sm:p-4 ${!showAllPulseMetrics && !(Number(overview.data?.pendingTopups ?? 0) > 0) ? "hidden sm:block" : ""}`}>
                  <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-amber-400/[0.06] blur-3xl" />
                  <WalletCards aria-hidden="true" strokeWidth={0.65} className="pointer-events-none absolute -right-5 bottom-0 hidden h-36 w-36 rotate-[-11deg] text-amber-300/[0.065] sm:block" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Finanzas
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          Recargas pendientes
                        </p>
                      </div>

                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-500/[0.08] text-amber-300 sm:h-11 sm:w-11 sm:rounded-xl">
                        <WalletCards className="h-5 w-5" />
                      </div>
                    </div>

                    <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground sm:mt-5 sm:text-3xl">
                       {overview.isError ? "—" : (overview.data?.pendingTopups ?? 0)}
                    </p>
                    <p className="relative mt-1 text-[11px] text-muted-foreground">En revisión financiera</p>
                  </div>
                </article>
              ) : null}
            </div>
            <button type="button" aria-expanded={showAllPulseMetrics} onClick={() => setShowAllPulseMetrics((open) => !open)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 sm:hidden">
              {showAllPulseMetrics ? "Mostrar indicadores principales" : "Ver todos los indicadores"}
              <ChevronDown className={`h-4 w-4 transition-transform ${showAllPulseMetrics ? "rotate-180" : ""}`} />
            </button>
          </section>
          <MarketplaceFleetPulse projectId={projectId} enabled={tab === "resumen"} onOpenDriver={setDriver360Id} />
        </TabsContent>
        <TabsContent value="trabajos" className="mt-3">
          <div className="space-y-3 sm:space-y-4">
            <MarketplaceRadarReadinessCard projectId={projectId} />
            <section className="relative overflow-hidden rounded-[26px] border border-emerald-400/16 bg-gradient-to-br from-emerald-500/[0.055] via-background/60 to-cyan-500/[0.025] p-3 shadow-[0_24px_70px_-48px_rgba(16,185,129,0.85)] backdrop-blur-xl sm:p-4">
              <img
                src="/admin-premium/operations.svg"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 hidden h-60 w-[38%] object-cover object-right opacity-[0.12] mix-blend-screen md:block xl:w-[34%]"
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/5 via-background/20 to-emerald-500/[0.015]" />

              <div className="relative mb-2 flex flex-col gap-2 rounded-[16px] border border-emerald-400/14 bg-background/55 p-2.5 sm:mb-3 sm:gap-3 sm:rounded-[20px] sm:p-3 shadow-[0_18px_46px_-34px_rgba(16,185,129,0.75)] backdrop-blur-md xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.10] px-3 py-2 text-xs font-semibold text-emerald-100 shadow-inner shadow-emerald-500/[0.04]">
                    <BriefcaseBusiness className="h-4 w-4" />
                    {jobs.isLoading
                      ? "Consultando..."
                      : `${jobRows.length} ${jobRows.length === 1 ? "trabajo" : "trabajos"}`}
                  </span>

                  <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/16 bg-emerald-500/[0.055] px-3 py-2 text-[11px] text-emerald-200">
                    <span>Publicados</span>
                    <strong className="rounded-md bg-emerald-500/[0.10] px-1.5 py-0.5 text-foreground">
                      {overview.data?.jobsPublished ?? 0}
                    </strong>
                  </span>

                  <span className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/16 bg-cyan-500/[0.055] px-3 py-2 text-[11px] text-cyan-200">
                    <span>Activos</span>
                    <strong className="rounded-md bg-cyan-500/[0.10] px-1.5 py-0.5 text-foreground">
                      {overview.data?.jobsActive ?? 0}
                    </strong>
                  </span>

                  <span className="inline-flex items-center gap-2 rounded-xl border border-rose-400/16 bg-rose-500/[0.05] px-3 py-2 text-[11px] text-rose-200">
                    <span>Incidencias</span>
                    <strong className="rounded-md bg-rose-500/[0.09] px-1.5 py-0.5 text-foreground">
                      {overview.data?.jobsIncidentOpen ?? 0}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap xl:justify-end">
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
                <div className="relative flex min-h-44 overflow-hidden rounded-[22px] border border-dashed border-emerald-400/18 bg-gradient-to-br from-emerald-500/[0.035] via-background/42 to-cyan-500/[0.02] px-5 py-8">
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/[0.035] blur-3xl" />

                  <div className="relative m-auto flex flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/22 bg-emerald-500/[0.08] text-emerald-300 shadow-[0_14px_34px_-20px_rgba(16,185,129,0.8)]">
                      <BriefcaseBusiness className="h-5 w-5" />
                    </div>

                    <p className="mt-4 font-semibold text-foreground">No hay trabajos</p>

                    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                      No existen operaciones que coincidan con los filtros seleccionados.
                    </p>

                    <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-300/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
                      Operación sin actividad pendiente
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {jobRows.map((job) => (
                      <article
                        key={job.jobId}
                        className={`group relative min-w-0 overflow-hidden rounded-xl border px-3 py-2 transition-colors sm:px-4 sm:py-2.5 ${operationRowClasses(job.status)}`}
                      >
                        <button
                          type="button"
                          aria-expanded={expandedOperationId === job.jobId}
                          aria-controls={`operation-content-${job.jobId}`}
                          onClick={() =>
                            setExpandedOperationId((current) =>
                              current === job.jobId ? null : job.jobId,
                            )
                          }
                          className="relative flex w-full min-w-0 flex-col gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              <StatusBadge status={job.status} />
                              <ServiceBadge service={job.serviceCode} />
                              {!job.isTest &&
                              assistedJobIds.data?.has(job.jobId) ? (
                                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                                  ASISTENCIA
                                </span>
                              ) : null}
                              {job.isTest ? (
                                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                                  PRUEBA
                                </span>
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                                <span className="min-w-0 truncate" title={text(job.originText)}>
                                  {text(job.originText)}
                                </span>
                                <ArrowRight
                                  className="h-3.5 w-3.5 shrink-0 text-cyan-300"
                                  aria-hidden="true"
                                />
                                <span
                                  className="min-w-0 truncate"
                                  title={text(job.destinationText)}
                                >
                                  {text(job.destinationText)}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {formatDate(job.createdAt)} ·{" "}
                                {job.customerDisplayName || "Sin nombre registrado"} ·{" "}
                                {job.driverDisplayName || "Sin conductor asignado"}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/40 pt-2 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                            <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                              {formatOperationPrice(job.finalPrice, job.currency)}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-cyan-300 transition-transform ${expandedOperationId === job.jobId ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </div>
                        </button>
                        {expandedOperationId === job.jobId ? (
                          <div
                            id={`operation-content-${job.jobId}`}
                            className="relative mt-2 border-t border-border/50 pt-3"
                          >
                            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between lg:gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="rounded-xl border border-border/55 bg-background/50 p-3">
                                  <div className="grid gap-2.5 md:grid-cols-[1fr_auto_1fr] md:items-center">
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

                                <JobNotificationReach projectId={projectId} jobId={job.jobId} compact />

                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  <div className="rounded-xl border border-border/50 bg-background/45 p-3">
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

                                  <div className="rounded-xl border border-border/50 bg-background/45 p-3">
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

                              <div className="w-full min-w-0 shrink-0 space-y-2 lg:w-[200px]">
                              <aside className="rounded-xl border border-border/55 bg-background/55 p-2.5">
                                <div className="space-y-2 text-xs text-muted-foreground">
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
                                        {formatOperationPrice(
                                          job.commissionAmountSnapshot,
                                          job.currency,
                                        )}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>

                                <div className="mt-2 grid gap-2">
                                  <Button
                                    className="w-full justify-center border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100 hover:bg-emerald-500/[0.12]"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setJobId(job.jobId)}
                                  >
                                    <Eye className="mr-2 h-4 w-4" />
                                    Abrir detalle
                                  </Button>

                                  {canManageMarketplace &&
                                  assistedJobIds.data?.has(job.jobId) &&
                                  ["published", "accepted", "en_route", "pickup"]
                                    .includes(job.status) ? (
                                    <Button
                                      className="h-auto min-h-10 w-full whitespace-normal px-2 py-2 text-center text-xs leading-snug"
                                      size="sm"
                                      variant="destructive"
                                      disabled={assistedCancelMutation.isPending}
                                      onClick={() => {
                                        setAssistedCancel({
                                          jobId: job.jobId,
                                          status: job.status,
                                          customer: job.customerDisplayName || "Cliente",
                                          key: crypto.randomUUID(),
                                        });
                                        setAssistedCancelReason("");
                                        setAssistedCancelError(null);
                                      }}
                                    >
                                      <AlertCircle className="h-4 w-4 shrink-0" />
                                      <span className="min-w-0 whitespace-normal break-words text-center">Cancelar por solicitud del cliente</span>
                                    </Button>
                                  ) : null}
                                  {canFinishAdmin &&
                                  ["accepted", "en_route", "pickup", "in_progress"].includes(
                                    job.status,
                                  ) ? (
                                    <Button
                                      className="w-full"
                                      size="sm"
                                      variant="outline"
                                      disabled={adminFinishMutation.isPending}
                                      onClick={() => {
                                        setAdminFinish({
                                          jobId: job.jobId,
                                          idempotencyKey: crypto.randomUUID(),
                                        });
                                        setAdminFinishReason("");
                                        setAdminFinishError(null);
                                      }}
                                    >
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                      Finalizar carrera
                                    </Button>
                                  ) : null}
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
                              <JobRadarShortcut
                                projectId={projectId}
                                jobId={job.jobId}
                                onOpen={() => {
                                  setJobDetailInitialTab("radar");
                                  setJobId(job.jobId);
                                }}
                              />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>

                  <PaginationButton query={jobs} />
                </>
              )}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="atencion" className="mt-3">
          <Suspense fallback={<div role="status" className="rounded-2xl border border-border/60 bg-background/45 p-6 text-sm text-muted-foreground">Cargando atención al cliente…</div>}>
            <MarketplaceCustomerCareWorkspace
              projectId={projectId}
              canManageContact={permissions.includes("whatsapp_settings.manage")}
              canViewCustomers={canCustomers}
              canManageMarketplace={canManageMarketplace}
              canRegisterCustomers={permissions.includes("customers.manage")}
              onOpenCustomer={setCustomerId}
              onOpenJob={setJobId}
            />
          </Suspense>
        </TabsContent>
        {mapVisited ? (
          <TabsContent value="mapa" forceMount className="mt-0 sm:mt-3 data-[state=inactive]:hidden">
            <Suspense
              fallback={
                <div role="status" className="flex min-h-[320px] w-full items-center justify-center rounded-[26px] border border-border/60 bg-background/35 px-4 text-sm text-muted-foreground">
                  Preparando mapa interactivo…
                </div>
              }
            >
              <MarketplaceOperationalMap
                projectId={projectId}
                canViewCustomers={canCustomers}
                onOpenDriver={setDriver360Id}
                onOpenCustomer={setCustomerId}
                onOpenJob={setJobId}
              />
            </Suspense>
          </TabsContent>
        ) : null}
        <TabsContent value="conductores">
          <PremiumPanel
            headerless
            title="Conductores"
            description={
              drivers.isLoading
                ? "Consultando conductores…"
                : `${filteredDriverRows.length} de ${driverRows.length} conductores coinciden con la búsqueda`
            }
            icon={Users}
            tone="cyan"
            backgroundImage="/admin-premium/drivers.svg"
          >
            <div className="mb-4 space-y-3 rounded-2xl border border-cyan-400/15 bg-background/45 p-3 sm:p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
                <span className="sr-only">Buscar conductor por nombre o número de celular</span>
                <Input
                  value={driverSearch}
                  onChange={(event) => setDriverSearch(event.target.value)}
                  placeholder="Buscar por nombre o número de celular"
                  autoComplete="off"
                  className="h-10 rounded-xl border-cyan-400/20 bg-background/70 pl-9 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <FilterSelect labelText="Estado del perfil" value={driverStatusFilter} onChange={setDriverStatusFilter}>
                  <option value="">Todos los estados</option>
                  <option value="active">Activos</option>
                  <option value="incomplete">Incompletos</option>
                  <option value="suspended">Suspendidos</option>
                </FilterSelect>
                <FilterSelect labelText="Disponibilidad" value={driverAvailabilityFilter} onChange={setDriverAvailabilityFilter}>
                  <option value="">Todos</option>
                  <option value="available">Disponibles</option>
                  <option value="unavailable">No disponibles</option>
                </FilterSelect>
                <FilterSelect labelText="Vehículo" value={driverCategoryFilter} onChange={setDriverCategoryFilter}>
                  <option value="">Todos los vehículos</option>
                  {driverCategories.map((category) => (
                    <option key={category} value={category}>{label(category)}</option>
                  ))}
                </FilterSelect>
                <FilterSelect labelText="Inscripción" value={driverPeriodFilter} onChange={setDriverPeriodFilter}>
                  <option value="">Todas las fechas</option>
                  <option value="today">Hoy (Cuba)</option>
                  <option value="7">Últimos 7 días</option>
                  <option value="30">Últimos 30 días</option>
                </FilterSelect>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span aria-live="polite">
                  {drivers.isLoading || drivers.hasNextPage ? "Cargando directorio completo…" :
                    `${filteredDriverRows.length} coincidencias de ${driverRows.length} conductores registrados`}
                </span>
                {driverFiltersActive ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => {
                    setDriverSearch("");
                    setDriverStatusFilter("");
                    setDriverAvailabilityFilter("");
                    setDriverCategoryFilter("");
                    setDriverPeriodFilter("");
                  }}>Limpiar filtros</Button>
                ) : null}
              </div>
            </div>
            {drivers.isError ? (
              <EmptyMarketplaceState title="No se pudo cargar el directorio"
                description="Reintenta la consulta antes de buscar conductores." icon={Users} />
            ) : drivers.isLoading || drivers.hasNextPage ? (
              <LoadingState />
            ) : !driverRows.length ? (
              <EmptyMarketplaceState
                title="No hay conductores"
                description="Todavía no existen conductores registrados en Marketplace."
                icon={Users}
              />
            ) : !filteredDriverRows.length ? (
              <EmptyMarketplaceState title="No hay coincidencias"
                description="Prueba otro nombre, número o combinación de filtros." icon={Search} />
            ) : (
              <>
                <div className="space-y-2.5">
                  {visibleDriverRows.map((item) => (
                    <article
                      key={item.userId}
                      className="group relative overflow-hidden rounded-[17px] border border-cyan-400/14 bg-gradient-to-r from-cyan-500/[0.055] via-background/60 to-emerald-500/[0.025] px-3 py-2.5 shadow-[0_18px_50px_-40px_rgba(34,211,238,0.9)] transition duration-200 hover:border-cyan-400/26 hover:from-cyan-500/[0.075] hover:to-emerald-500/[0.04]"
                    >
                      <button
                        type="button"
                        className="absolute inset-0 z-10 cursor-pointer rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                        onClick={() => setDriver360Id(item.userId)}
                        aria-label={`Abrir ficha 360 de ${item.displayName}`}
                      />
                      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-cyan-400/[0.035] blur-3xl" />

                      <div className="pointer-events-none relative grid gap-3 lg:grid-cols-[minmax(220px,1.15fr)_minmax(190px,0.8fr)_minmax(220px,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/20 bg-cyan-500/[0.07] text-cyan-200 shadow-inner shadow-cyan-500/[0.04]">
                              <Users className="h-5 w-5" />
                              {driverMedia.data?.[item.userId]?.avatarUrl ? (
                                <img
                                  src={driverMedia.data?.[item.userId]?.avatarUrl ?? undefined}
                                  alt={`Foto de ${item.displayName}`}
                                  className="absolute inset-0 h-full w-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : null}
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
                                  {item.isAvailable ? "Disponible" : "No disponible"}
                                </span>
                              </div>
                              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                                Inscripción: {dateOfRegistration(item.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-cyan-400/10 bg-background/45 px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                            WhatsApp
                          </p>

                          <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            <span className="truncate">{item.phone ?? "Sin WhatsApp"}</span>
                          </p>
                        </div>

                        <div className="rounded-xl border border-cyan-400/10 bg-background/45 px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                            Vehículo
                          </p>

                          <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <span className="relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-400/15 bg-cyan-500/[0.04] text-cyan-300">
                              <CarFront className="h-4 w-4" />
                              {driverMedia.data?.[item.userId]?.vehiclePhotos[
                                item.vehicleId ?? ""
                              ] ? (
                                <img
                                  src={
                                    driverMedia.data?.[item.userId]?.vehiclePhotos[
                                      item.vehicleId ?? ""
                                    ] ?? undefined
                                  }
                                  alt={`Foto del vehículo ${item.vehicleName ?? ""}`}
                                  className="absolute inset-0 h-full w-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : null}
                            </span>
                            <span className="truncate">{item.vehicleName ?? "Sin vehículo"}</span>
                          </p>
                        </div>

                        <div className="pointer-events-none relative z-20 flex flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
                          {driverWhatsAppLinks(item.phone) ? (
                            <Button
                              asChild
                              type="button"
                              size="sm"
                              variant="outline"
                              className="pointer-events-auto w-full border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200 sm:w-auto"
                            >
                              <a
                                href={driverWhatsAppLinks(item.phone)!.web}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Abrir WhatsApp Web con ${item.displayName}`}
                              >
                                WhatsApp
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {visibleDriverRows.length < filteredDriverRows.length ? (
                  <div className="mt-4 flex justify-center">
                    <Button variant="outline" className="w-full sm:w-auto"
                      onClick={() => setDriverVisibleCount((count) => count + 25)}>
                      Mostrar más ({filteredDriverRows.length - visibleDriverRows.length} restantes)
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </PremiumPanel>
        </TabsContent>
        {canCustomers ? (
          <TabsContent value="clientes">
            <PremiumPanel
              headerless
              title="Clientes"
              description={
                customers.isLoading
                  ? "Consultando clientes…"
                  : `${customerRows.length} ${
                      customerRows.length === 1 ? "cliente mostrado" : "clientes mostrados"
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
                      onChange={(event) => setCustomerSearchInput(event.target.value)}
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
                  title={customerSearch ? "No encontramos clientes" : "No hay clientes"}
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
                          onClick={() => setCustomerId(customer.customerId)}
                          className="group relative w-full px-3 py-2.5 text-left transition duration-200 sm:px-4 sm:py-3.5 hover:bg-gradient-to-r hover:from-violet-500/[0.085] hover:via-violet-500/[0.035] hover:to-cyan-500/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
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
                              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                                <span>Registrado: <time dateTime={customer.createdAt}>{formatCustomerDateTime(customer.createdAt)}</time></span>
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

                            <p className="font-semibold text-foreground">{customer.jobsTotal}</p>

                            <p className="font-semibold text-cyan-200">{customer.jobsActive}</p>

                            <p className="font-semibold text-emerald-200">{customer.jobsSettled}</p>

                            <p className="text-xs text-muted-foreground">
                              {customer.lastJobAt
                                ? formatCustomerDateTime(customer.lastJobAt)
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

                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                              <span>Registrado: <time dateTime={customer.createdAt}>{formatCustomerDateTime(customer.createdAt)}</time></span>
                            </p>
                            <p className="mt-1.5 text-[11px] text-muted-foreground sm:hidden">
                              {customer.jobsTotal} trabajos · {customer.jobsActive} activos · {customer.jobsSettled} liquidados
                            </p>
                            {customer.lastJobAt ? (
                              <p className="mt-1 text-[11px] text-muted-foreground sm:hidden">
                                Última carrera: <time dateTime={customer.lastJobAt}>{formatCustomerDateTime(customer.lastJobAt)}</time>
                              </p>
                            ) : null}
                            <div className="mt-3 hidden grid-cols-2 gap-2 sm:grid sm:grid-cols-4">
                              <MiniMetric labelText="Trabajos" value={customer.jobsTotal} />
                              <MiniMetric labelText="Activos" value={customer.jobsActive} />
                              <MiniMetric labelText="Liquidados" value={customer.jobsSettled} />
                              <MiniMetric
                                labelText="Última actividad"
                                value={
                                  customer.lastJobAt
                                    ? formatCustomerDateTime(customer.lastJobAt)
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
              <section aria-label="Billeteras" className="min-w-0">
                <div className="min-w-0">
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
                              className="group relative overflow-hidden rounded-[17px] border border-amber-400/12 bg-gradient-to-r from-amber-500/[0.035] via-background/58 to-background/48 p-3 shadow-[0_16px_48px_-40px_rgba(245,158,11,0.85)] transition hover:border-amber-400/22 hover:bg-background/65 sm:p-4"
                            >
                              <img
                                src="/admin-premium/wallets.svg"
                                alt=""
                                aria-hidden="true"
                                className="pointer-events-none absolute right-0 top-1/2 hidden h-[115%] w-48 -translate-y-1/2 object-cover object-right opacity-[0.035] mix-blend-screen sm:block xl:w-56 xl:opacity-[0.045]"
                              />
                              <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full bg-amber-400/[0.03] blur-3xl" />

                              {/* En móvil: resumen de los saldos críticos y desglose bajo demanda. */}
                              <div className="relative min-w-0 space-y-2.5 sm:hidden">
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{wallet.driverDisplayName}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                      {wallet.driverPhone || "Sin teléfono registrado"}
                                    </p>
                                  </div>
                                  <span className={wallet.initialDepositConfirmed
                                    ? "shrink-0 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200"
                                    : "shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200"}>
                                    {wallet.initialDepositConfirmed ? "Depósito OK" : "Depósito pendiente"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="min-w-0 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-2.5">
                                    <p className="text-[10px] font-semibold text-emerald-300">Disponible</p>
                                    <p className="mt-1 break-words text-base font-bold tabular-nums text-foreground">
                                      {formatAmount(wallet.availableBalance, wallet.currency)}
                                    </p>
                                  </div>
                                  <div className="min-w-0 rounded-xl border border-rose-400/20 bg-rose-500/[0.045] p-2.5">
                                    <p className="text-[10px] font-semibold text-rose-300">Reservado</p>
                                    <p className="mt-1 break-words text-base font-bold tabular-nums text-foreground">
                                      {formatAmount(reserved, wallet.currency)}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  Saldo total: <span className="font-semibold text-foreground">{formatAmount(wallet.totalBalance, wallet.currency)}</span>
                                </p>
                                <details className="group rounded-xl border border-border/60 bg-background/40">
                                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-semibold text-cyan-200 [&::-webkit-details-marker]:hidden">
                                    Ver detalles de la billetera
                                    <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                                  </summary>
                                  <div className="space-y-2 border-t border-border/50 px-3 py-3 text-xs text-muted-foreground">
                                    <div className="flex justify-between gap-2">
                                      <span>Saldo real</span>
                                      <strong className="text-right font-semibold text-foreground">{formatAmount(wallet.realBalance, wallet.currency)}</strong>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span>Saldo promocional</span>
                                      <strong className="text-right font-semibold text-foreground">{formatAmount(wallet.promotionalBalance, wallet.currency)}</strong>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span>Promocional disponible</span>
                                      <strong className="text-right font-semibold text-foreground">{formatAmount(wallet.promotionalAvailableBalance, wallet.currency)}</strong>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span>Real reservado</span>
                                      <strong className="text-right font-semibold text-foreground">{formatAmount(wallet.realReservedBalance, wallet.currency)}</strong>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span>Promocional reservado</span>
                                      <strong className="text-right font-semibold text-foreground">{formatAmount(wallet.promotionalReservedBalance, wallet.currency)}</strong>
                                    </div>
                                    <p className="border-t border-border/50 pt-2 text-[11px]">
                                      Última actualización: {formatDate(wallet.updatedAt)}
                                    </p>
                                  </div>
                                </details>
                              </div>

                              <div className="relative hidden gap-3 sm:grid lg:grid-cols-[minmax(200px,0.9fr)_minmax(0,3.1fr)] lg:items-center">
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
                                    <p className="mt-1 break-words text-sm font-semibold tabular-nums text-foreground sm:text-lg">
                                      {formatAmount(wallet.totalBalance, wallet.currency)}
                                    </p>
                                  </div>

                                  <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2.5">
                                    <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                                      Disponible
                                    </p>
                                    <p className="mt-1 break-words text-sm font-semibold tabular-nums text-foreground sm:text-lg">
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
                                      Disp.{" "}
                                      {formatAmount(
                                        wallet.promotionalAvailableBalance,
                                        wallet.currency,
                                      )}
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
                                      Real{" "}
                                      {formatAmount(wallet.realReservedBalance, wallet.currency)}
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
                headerless
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
                  <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                    <div className="flex max-w-full flex-nowrap gap-1 overflow-x-auto overscroll-x-contain rounded-2xl border border-cyan-400/15 bg-background/60 p-1 sm:flex-wrap shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-sm">
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
                          className="shrink-0"
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

                            {/* En móvil: importe, estado y gestión pendientes siempre visibles. */}
                            <div className="relative min-w-0 space-y-2.5 sm:hidden">
                              <div className="flex min-w-0 items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className="truncate text-sm font-semibold text-foreground">{item.driverDisplayName}</h4>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    Solicitada: <time dateTime={item.requestedAt}>{formatDate(item.requestedAt)}</time>
                                  </p>
                                </div>
                                <StatusBadge status={item.status} />
                              </div>
                              <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.045] p-2.5">
                                <div className="min-w-0">
                                  <p className="text-[10px] uppercase tracking-wide text-cyan-300">Importe</p>
                                  <p className="mt-0.5 break-words text-lg font-bold tabular-nums text-foreground">
                                    {formatAmount(item.amount, item.currency)}
                                  </p>
                                </div>
                                <p className="min-w-0 text-right text-[11px] text-muted-foreground">
                                  {paymentMethodLabel(item.method)}
                                </p>
                              </div>
                              {canManagePayments && item.status === "requested" ? (
                                <Button
                                  size="sm"
                                  className="min-h-11 w-full"
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
                                  Gestionar recarga pendiente
                                </Button>
                              ) : null}
                              <details className="group rounded-xl border border-border/60 bg-background/40">
                                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-semibold text-cyan-200 [&::-webkit-details-marker]:hidden">
                                  Ver detalles de la recarga
                                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="space-y-2 border-t border-border/50 px-3 py-3 text-xs text-muted-foreground">
                                  {item.driverPhone ? <p>Teléfono: <span className="text-foreground">{item.driverPhone}</span></p> : null}
                                  <p>Método: <span className="text-foreground">{paymentMethodLabel(item.method)}</span></p>
                                  {item.reference ? <p className="break-words">Referencia: <span className="text-foreground">{item.reference}</span></p> : null}
                                  {item.notes ? <p className="break-words">Notas: <span className="text-foreground">{item.notes}</span></p> : null}
                                  {item.rejectionReason ? <p className="break-words text-rose-300">Motivo: {item.rejectionReason}</p> : null}
                                  {item.confirmedAt ? <p>Confirmada: <time dateTime={item.confirmedAt} className="text-foreground">{formatDate(item.confirmedAt)}</time></p> : null}
                                  {item.rejectedAt ? <p>Rechazada: <time dateTime={item.rejectedAt} className="text-foreground">{formatDate(item.rejectedAt)}</time></p> : null}
                                  {receipt ? (
                                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] p-2.5">
                                      <p className="font-semibold text-emerald-200">Comprobante {receipt.documentNumber}</p>
                                      <p className="mt-1">Emitido: {formatDate(receipt.issuedAt)}</p>
                                    </div>
                                  ) : null}
                                </div>
                              </details>
                            </div>

                            <div className="relative hidden gap-3 sm:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(250px,0.72fr)_auto] lg:items-start">
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
                                      Notas: <span className="text-foreground">{item.notes}</span>
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
                              <div className="relative mt-3 hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-emerald-500/[0.075] via-emerald-500/[0.035] to-cyan-500/[0.035] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:block">
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
            headerless
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
                      className={`rounded-2xl border p-3 sm:p-4 ${
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
            <Suspense fallback={<div role="status" className="rounded-2xl border border-border/60 bg-background/45 p-6 text-sm text-muted-foreground">Cargando configuración de TukTuk…</div>}>
              <MarketplaceConfigurationWorkspace
                projectId={projectId}
                canManageSettings={canManageSettings}
                canManageMarketplace={canManageMarketplace}
                canManagePayments={canManagePayments}
                canManageTerritory={permissions.includes("marketplace.map.manage")}
                onOpenJob={setJobId}
              />
            </Suspense>
          </TabsContent>
        ) : null}
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
          if (!open) {
            setDriver360Id(null);
            if (typeof alertDriverId === "string") dismissAlertDeepLink();
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-y-auto border-cyan-500/20 bg-background/95 p-0 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-w-6xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Ficha 360 del conductor</DialogTitle>
            <DialogDescription>Expediente completo del conductor</DialogDescription>
          </DialogHeader>

          <div className="p-4 pt-10 sm:p-6 sm:pt-10">
            {driver360.isLoading ? (
              <LoadingState />
            ) : driver360.data ? (
              <MarketplaceDriver360Record
                projectId={projectId}
                driverUserId={driver360Id!}
                detail={driver360.data}
                financial={driverFinancial360.data ?? null}
                canSeeFinancial={canManagePayments}
                canManageDriver={canManageMarketplace}
                financialLoading={driverFinancial360.isLoading}
                media={
                  selectedDriverMedia.data?.[driver360Id ?? ""] ??
                  driverMedia.data?.[driver360Id ?? ""] ??
                  null
                }
                isAvailable={
                  driverRows.find((item) => item.userId === driver360Id)?.isAvailable ?? null
                }
                onOpenJob={(id) => {
                  setDriver360Id(null);
                  setJobId(id);
                  if (typeof alertDriverId === "string") {
                    void navigate({
                      to: "/admin/proyectos/$id/$section",
                      params: { id: projectId, section: "trabajos" },
                      search: { vista: "trabajos", carrera: id },
                      replace: true,
                    });
                  }
                }}
                onChangeSuspension={(suspended) => {
                  if (!driver360Id) return;
                  setReason("");
                  setDriver({ id: driver360Id, suspended });
                  setDriver360Id(null);
                }}
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
      <Dialog open={Boolean(jobId)} onOpenChange={(open) => {
        if (!open) {
          setJobId(null);
          setJobDetailInitialTab("overview");
          if (typeof alertJobId === "string") dismissAlertDeepLink();
        }
      }}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-y-auto border-cyan-500/20 bg-[#081116]/95 p-0 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-w-6xl">
          <DialogHeader className="sr-only">
            <DialogTitle>360 de carrera</DialogTitle>
            <DialogDescription>
              Expediente integral: ruta, participantes, radar, finanzas y trazabilidad.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 pt-10 sm:p-6 sm:pt-10">
            {detail.isLoading ? (
              <LoadingState />
            ) : detail.data ? (
              <JobDetail key={`${jobId}:${jobDetailInitialTab}`} detail={detail.data} projectId={projectId} jobId={jobId!} initialTab={jobDetailInitialTab} />
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

      <Dialog
        open={Boolean(assistedCancel)}
        onOpenChange={(open) => {
          if (!open && !assistedCancelMutation.isPending) {
            setAssistedCancel(null);
            setAssistedCancelReason("");
            setAssistedCancelError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancelar carrera por solicitud del cliente
            </DialogTitle>
            <DialogDescription>
              Exclusivo para carreras creadas por asistencia.
              La cancelación quedará registrada y actualizará el estado.
              Si existe un conductor asignado, se aplicarán las reglas
              de liberación y de comisión correspondientes.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {assistedCancel?.customer} · Estado:
            {" "}{label(assistedCancel?.status ?? null)}
          </p>

          <Label htmlFor="care-assisted-cancel-reason">
            Motivo indicado por el cliente
          </Label>

          <Textarea
            id="care-assisted-cancel-reason"
            value={assistedCancelReason}
            rows={3}
            maxLength={500}
            disabled={assistedCancelMutation.isPending}
            placeholder="El cliente ya no necesita el servicio"
            onChange={(e) => setAssistedCancelReason(e.target.value)}
          />

          <p className="text-xs text-muted-foreground">
            Motivo obligatorio. Mínimo 8 caracteres para confirmar.
          </p>

          {assistedCancelError ? (
            <p role="alert" className="text-sm text-rose-300">
              {assistedCancelError}
            </p>
          ) : null}

          <Button
            className="w-full"
            variant="destructive"
            disabled={
              !assistedCancel ||
              assistedCancelReason.trim().length < 8 ||
              assistedCancelMutation.isPending
            }
            onClick={() => {
              if (!assistedCancel) return;

              if (window.confirm(
                "¿Confirmar la cancelación REAL de esta carrera por solicitud del cliente?"
              )) {
                assistedCancelMutation.mutate();
              }
            }}
          >
            {assistedCancelMutation.isPending
              ? "Cancelando..."
              : "Confirmar cancelación de carrera"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(adminFinish)}
        onOpenChange={(open) => {
          if (!open && !adminFinishMutation.isPending) {
            setAdminFinish(null);
            setAdminFinishReason("");
            setAdminFinishError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar carrera desde Admin</DialogTitle>
            <DialogDescription>
              Utiliza esta operación únicamente cuando hayas confirmado que el servicio terminó. El
              cierre quedará registrado y se aplicará la liquidación correspondiente una sola vez.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="marketplace-admin-finish-reason">
              Motivo del cierre administrativo
            </Label>
            <Textarea
              id="marketplace-admin-finish-reason"
              value={adminFinishReason}
              maxLength={1000}
              rows={4}
              disabled={adminFinishMutation.isPending}
              onChange={(event) => setAdminFinishReason(event.target.value)}
              placeholder="Explica por qué Administración confirma el cierre"
            />
            <p className="text-xs text-muted-foreground">
              Debes escribir al menos 8 caracteres. La operación no puede deshacerse desde este
              formulario.
            </p>
          </div>

          {adminFinishError ? (
            <p role="alert" className="text-sm text-rose-300">
              {adminFinishError}
            </p>
          ) : null}

          <Button
            className="w-full"
            variant="destructive"
            disabled={
              !canFinishAdmin ||
              !adminFinish ||
              adminFinishReason.trim().length < 8 ||
              adminFinishMutation.isPending
            }
            onClick={() => adminFinishMutation.mutate()}
          >
            {adminFinishMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Confirmar cierre y liquidación
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
              <p className="mt-2 text-sm text-muted-foreground">Cargando métodos de pago…</p>
            ) : paymentMethods.isError ? (
              <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm text-amber-200">
                No se pudo cargar el catálogo de métodos de pago. La recarga no se registrará hasta
                resolver el permiso del catálogo.
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
              Confirmar acredita la billetera una sola vez. Para rechazar debes indicar el motivo.
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


type JobRadarImpact = {
  driver_user_id: string;
  radius_stage: number | null;
  radius_limit_km: number | null;
  distance_km_at_selection: number | null;
};

type JobRadarAnalysis = {
  status: "yes" | "no" | "unrecorded";
  first_evaluation_at: string | null;
  first_radar_at: string | null;
  evaluation_count: number;
  total_offers_enqueued: number;
  radar_settings: {
    r1?: number | null;
    r2?: number | null;
    r3?: number | null;
    expansion_seconds?: number | null;
  };
  impacts: JobRadarImpact[];
};

function JobRadarShortcut({ projectId, jobId, onOpen }: {
  projectId: string;
  jobId: string;
  onOpen: () => void;
}) {
  const analysis = useQuery({
    queryKey: ["marketplace-job-radar-analysis", projectId, jobId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_job_radar_analysis",
        { target_project_id: projectId, target_job_id: jobId },
      );
      if (error) throw error;
      return data as JobRadarAnalysis;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const state = analysis.isPending || analysis.isError
    ? "unknown"
    : analysis.data?.status === "yes" ? "yes"
    : analysis.data?.status === "no" ? "no" : "unknown";
  const total = Array.isArray(analysis.data?.impacts) ? analysis.data.impacts.length : 0;
  const queued = analysis.data?.total_offers_enqueued ?? 0;
  const headline = analysis.isPending ? "Consultando radar"
    : analysis.isError ? "Radar no disponible"
    : state === "yes" ? "Radar utilizado"
    : state === "no" ? "Radar no utilizado" : "Sin registro histórico";
  const active = state === "yes";
  const inactive = state === "no";
  const tone = active
    ? "border-cyan-300/45 bg-gradient-to-br from-[#0b3642] via-[#0b2633] to-[#071b27] text-cyan-100 hover:border-cyan-200/80"
    : inactive
      ? "border-slate-600/45 bg-gradient-to-br from-[#1d2730] to-[#121920] text-slate-400 hover:border-slate-500/70"
      : "border-slate-500/30 bg-[#131d24] text-slate-300 hover:border-slate-400/55";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={headline + ". Ver recorrido de notificaciones por kilómetros de esta carrera"}
      title={headline + ". Abrir etapas y distancias de notificación"}
      className={"group relative flex min-h-[104px] w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-[16px] border px-2.5 py-2.5 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-cyan-300 " + tone}
    >
      <span aria-hidden="true" className={"pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full blur-3xl " + (active ? "bg-cyan-300/[0.10]" : "bg-slate-300/[0.025]")} />
      <span aria-hidden="true" className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center">
        <span className={"absolute inset-0 rounded-full border " + (active ? "border-cyan-300/40" : "border-slate-500/45")} />
        <span className={"absolute inset-[10px] rounded-full border " + (active ? "border-cyan-300/25" : "border-slate-500/25")} />
        <span className={"absolute inset-[20px] rounded-full border " + (active ? "border-cyan-300/20" : "border-slate-500/20")} />
        {active ? (
          <span
            className="absolute inset-0 rounded-full motion-safe:animate-[spin_6s_linear_infinite]"
            style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 302deg, rgba(34,211,238,.24) 342deg, transparent 360deg)" }}
          />
        ) : null}
        <span className={"absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full " + (active ? "bg-cyan-200 shadow-[0_0_12px_rgba(34,211,238,.8)]" : "bg-slate-500")} />
        {active && total > 0 ? (
          <span className="absolute right-[7px] top-[12px] h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.9)]" />
        ) : null}
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className={"rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] " + (active ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-100" : "border-slate-500/35 bg-slate-500/10 text-slate-400")}>
          {active ? "Activo" : inactive ? "Inactivo" : "Sin confirmar"}
        </span>
        <span className="text-[11px] font-bold leading-tight">{headline}</span>
        {active ? (
          <span className="text-[10px] leading-tight text-cyan-100/75">{total} registros · {queued} avisos encolados</span>
        ) : null}
        <span className={"text-[10px] font-semibold leading-tight " + (active ? "text-cyan-200" : "text-slate-400")}>
          Ver recorrido por km
        </span>
      </span>
    </button>
  );
}

function JobNotificationReach({
  projectId, jobId, assignedDriverId, compact = false,
}: {
  projectId: string;
  jobId: string;
  assignedDriverId?: string | null;
  compact?: boolean;
}) {
  const radar = useQuery({
    queryKey: ["marketplace-job-radar-analysis", projectId, jobId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_job_radar_analysis",
        {
          target_project_id: projectId,
          target_job_id: jobId,
        },
      );
      if (error) throw error;
      return data as JobRadarAnalysis;
    },
    staleTime: 15_000,
  });

  // Consulta solamente cuando se despliega la operacion o su ficha.
  const recipients = useQuery({
    queryKey: ["marketplace-job-notification-recipients", projectId, jobId],
    queryFn: () => getMarketplaceJobNotificationRecipients(projectId, jobId),
    staleTime: 15_000,
  });

  if (recipients.isPending) {
    return <p className="mt-3 text-xs text-muted-foreground">Consultando alcance de la solicitud…</p>;
  }
  if (recipients.isError) {
    return <p role="alert" className="mt-3 text-xs text-amber-300">No se pudo consultar el alcance de esta carrera.</p>;
  }

  const all = recipients.data;
  const actual = all.filter((item) => !item.isTestRecipient);
  const sent = actual.filter((item) => item.deliveryStatus === "sent").length;
  const simulated = all.filter((item) => item.isTestRecipient).length;
  const nearest = actual.reduce<number | null>((previous, item) =>
    item.distanceKm == null ? previous : previous == null
      ? item.distanceKm : Math.min(previous, item.distanceKm), null);
  const kilometers = (value: number) =>
    new Intl.NumberFormat("es-CU", { maximumFractionDigits: 2 }).format(value) + " km";
  const order = [...all].sort((a, b) =>
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));

  const radarByDriver = new Map(
    (radar.data?.impacts ?? []).map(
      (impact) => [impact.driver_user_id, impact] as const
    )
  );

  const radarLabel = radar.isPending
    ? "Consultando..."
    : radar.isError
      ? "No disponible"
      : radar.data?.status === "yes"
        ? "Sí"
        : radar.data?.status === "no"
          ? "No"
          : "Sin registro histórico";

  const radarStages = [...new Set(
    actual
      .map((item) => radarByDriver.get(item.driverUserId)?.radius_stage)
      .filter((stage): stage is number => typeof stage === "number")
  )].sort((a, b) => a - b);

  const stageGroups = radarStages.map((stage) => ({
    stage,
    count: actual.filter(
      (item) =>
        radarByDriver.get(item.driverUserId)?.radius_stage === stage
    ).length,
    radius: radar.data?.impacts.find(
      (impact) => impact.radius_stage === stage
    )?.radius_limit_km ?? null,
  }));

  const configuredRadii = [
    radar.data?.radar_settings?.r1,
    radar.data?.radar_settings?.r2,
    radar.data?.radar_settings?.r3,
  ];
  const snapshotRadii = configuredRadii.filter(
    (km): km is number => typeof km === "number" && Number.isFinite(km) && km > 0
  );

  // Los registros guardan el primer aviso por conductor, no todos los reintentos.
  // Un radio sin destinatarios no demuestra que se ejecutara la etapa.
  const notificationStageNumbers = [...new Set([
    ...configuredRadii.flatMap((km, index) =>
      typeof km === "number" && Number.isFinite(km) && km > 0 ? [index + 1] : []
    ),
    ...stageGroups.map(({ stage }) => stage).filter((stage) => stage > 0),
  ])].sort((a, b) => a - b);
  const notificationRoute = notificationStageNumbers.map((stage) => {
    const recipientsAtStage = actual.filter(
      (item) => radarByDriver.get(item.driverUserId)?.radius_stage === stage
    );
    const recorded = stageGroups.find((group) => group.stage === stage);
    return {
      stage,
      radius: recorded?.radius ?? configuredRadii[stage - 1] ?? null,
      recipients: recipientsAtStage,
      sent: recipientsAtStage.filter((item) => item.deliveryStatus === "sent").length,
    };
  });

  if (compact) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.035] px-3 py-1.5 text-[11px] sm:text-xs">
        <span className="font-semibold text-cyan-200">Alcance de la solicitud</span>
        <span className="text-foreground">Radar: <strong>{radarLabel}</strong></span>
        <span className="text-foreground">Destinatarios: <strong>{actual.length}</strong></span>
        <span className="text-foreground">Avisos enviados: <strong>{sent}</strong></span>
        {simulated > 0 ? <span className="text-violet-300">Prueba: {simulated} seleccionados</span> : null}
        <span className="text-muted-foreground">Más cercano: {nearest == null ? "Sin dato histórico" : kilometers(nearest)}</span>
      </div>
    );
  }

  return (
    <section className="rounded-[24px] border border-cyan-500/20 bg-cyan-500/[0.035] p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Alcance de la solicitud</p>
      <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">Conductores y distancias al aviso</h4>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border/55 bg-background/50 p-3">
          <p className="text-[11px] text-muted-foreground">Destinatarios reales</p>
          <p className="mt-1 text-xl font-bold text-foreground">{actual.length}</p>
        </div>
        <div className="rounded-xl border border-border/55 bg-background/50 p-3">
          <p className="text-[11px] text-muted-foreground">Avisos enviados</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">{sent}</p>
        </div>
        <div className="rounded-xl border border-border/55 bg-background/50 p-3">
          <p className="text-[11px] text-muted-foreground">Sin aceptación registrada</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {actual.filter((item) => item.driverUserId !== assignedDriverId).length}
          </p>
        </div>
        <div className="rounded-xl border border-border/55 bg-background/50 p-3">
          <p className="text-[11px] text-muted-foreground">Distancia mínima conocida</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {nearest == null ? "—" : kilometers(nearest)}
          </p>
        </div>
      </div>
      <section className="mt-3 rounded-2xl border border-cyan-400/20 bg-background/55 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
            <Radar className="h-4 w-4" />
            Análisis del radar
          </p>
          <span className="text-sm font-semibold text-foreground">
            {radarLabel}
          </span>
        </div>

        {radar.isError ? (
          <p role="alert" className="mt-2 text-xs text-amber-300">
            No fue posible consultar el registro del radar.
          </p>
        ) : null}

        {radar.data ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-border/50 p-2">
                <span className="block text-muted-foreground">Evaluaciones</span>
                <strong>{radar.data.evaluation_count ?? 0}</strong>
              </div>
              <div className="rounded-xl border border-border/50 p-2">
                <span className="block text-muted-foreground">Impactados</span>
                <strong>{actual.length}</strong>
              </div>
              <div className="rounded-xl border border-border/50 p-2">
                <span className="block text-muted-foreground">Avisos nuevos encolados</span>
                <strong>{radar.data.total_offers_enqueued ?? 0}</strong>
              </div>
            </div>

            {radar.data.first_radar_at ? (
              <p className="text-xs text-muted-foreground">
                Primera ejecución radial:{" "}
                {new Date(radar.data.first_radar_at).toLocaleString("es-CU")}
              </p>
            ) : null}

            {snapshotRadii.length > 0 && radar.data.status === "yes" ? (
              <p className="text-xs text-muted-foreground">
                Radios configurados al primer uso:{" "}
                {snapshotRadii.map((km) => km + " km").join(" / ")}
              </p>
            ) : null}

            {radar.data.status === "yes" ? (
              <section aria-label="Recorrido de notificaciones por kilómetros" className="rounded-2xl border border-cyan-300/20 bg-[#0c2530]/50 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
                    <Radar className="h-4 w-4" aria-hidden="true" />
                    Recorrido de notificación por km
                  </h5>
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                    Radar activo en esta carrera
                  </span>
                </div>
                {notificationRoute.length > 0 ? (
                  <ol className="mt-3 space-y-2">
                    {notificationRoute.map(({ stage, radius, recipients: stageRecipients, sent: stageSent }) => (
                      <li key={stage} className="rounded-xl border border-cyan-300/[0.12] bg-black/20 p-2.5 sm:p-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span aria-hidden="true" className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold " + (stageRecipients.length > 0 ? "border-cyan-300/45 bg-cyan-400/15 text-cyan-100" : "border-slate-500/35 bg-slate-500/10 text-slate-400")}>
                            {stage}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground">
                              Etapa {stage} · {radius == null ? "Radio sin registro" : "Hasta " + kilometers(radius)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {stageRecipients.length} destinatario{stageRecipients.length === 1 ? "" : "s"} con aviso · {stageSent} marcado{stageSent === 1 ? "" : "s"} como enviado{stageSent === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                        {stageRecipients.length > 0 ? (
                          <details className="group mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02]">
                            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-2.5 text-[11px] font-semibold text-cyan-200 [&::-webkit-details-marker]:hidden">
                              Ver avisos de esta etapa
                              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                            </summary>
                            <ul className="space-y-1 border-t border-white/[0.08] px-2.5 py-2">
                              {stageRecipients.map((recipient) => (
                                <li key={recipient.driverUserId} className="flex min-w-0 flex-wrap justify-between gap-x-2 gap-y-1 text-[11px]">
                                  <span className="min-w-0 break-words text-foreground">{recipient.driverDisplayName}</span>
                                  <span className="text-muted-foreground">
                                    {recipient.distanceKm == null ? "Distancia sin registro" : kilometers(recipient.distanceKm)}
                                    {" · "}{recipient.deliveryStatus === "sent" ? "Enviado por push" : recipient.deliveryStatus === "failed" ? "Envío fallido" : "En cola / pendiente"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-400">
                            Sin avisos conservados para este radio; no confirma que se haya ejecutado la etapa.
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-xs text-amber-200">
                    Se registró uso del radar, pero faltan radios y etapas para reconstruir sus avisos.
                  </p>
                )}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  Cobertura documental por radios, no una ruta GPS. Se conserva la primera selección por conductor; no se reconstruyen kilómetros intermedios ni reintentos sin registro.
                </p>
              </section>
            ) : radar.data.status === "no" ? (
              <p className="rounded-xl border border-slate-500/25 bg-slate-500/[0.06] px-3 py-2 text-xs text-slate-400">
                El radar no se utilizó en esta carrera. No existe un recorrido radial que mostrar.
              </p>
            ) : null}

            {radar.data.status === "unrecorded" ? (
              <p className="text-xs text-muted-foreground">
                Esta carrera no tiene registro histórico de ejecución.
                Los avisos y distancias conservados se muestran debajo.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
      {simulated > 0 ? (
        <p className="mt-3 text-xs text-violet-300">Simulador: {simulated} conductores seleccionados (no equivale a notificación enviada).</p>
      ) : null}
      {all.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No constan destinatarios ni avisos para esta carrera.</p>
      ) : (
        <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {order.map((item) => (
            <div key={item.driverUserId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-background/50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.driverDisplayName}
                  {item.driverUserId === assignedDriverId ? <span className="ml-2 text-xs text-emerald-300">Aceptó</span> : null}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.isTestRecipient ? "Seleccionado para prueba" : item.deliveryStatus === "sent" ? "Enviado por sistema push" :
                    item.deliveryStatus === "failed" ? "Falló el envío" : "En cola / pendiente"}
                  {!item.isTestRecipient && item.notificationCount > 1 ? " · " + item.notificationCount + " avisos registrados" : ""}
                </p>
                {!item.isTestRecipient ? (
                  <p className="mt-1 text-[11px] text-cyan-200/80">
                    {(() => {
                      const impact = radarByDriver.get(item.driverUserId);
                      if (impact?.radius_stage == null) {
                        return "Etapa del radar sin registro";
                      }
                      if (impact.radius_stage === 0) {
                        return "Distribución sin filtro radial";
                      }
                      return "Etapa " + impact.radius_stage +
                        (impact.radius_limit_km == null
                          ? ""
                          : " · radio hasta " +
                            kilometers(impact.radius_limit_km));
                    })()}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs font-semibold text-cyan-200">
                {item.distanceKm == null ? "Sin distancia histórica" : kilometers(item.distanceKm)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Distancia aproximada en línea recta al generar un aviso, solo con GPS de hasta cinco minutos de antigüedad.
        Los viajes anteriores no tienen distancia recuperable si no fue registrada. «Enviado» no confirma que se haya visto en el móvil.
      </p>
    </section>
  );
}

function JobDetail({ detail, projectId, jobId, initialTab = "overview" }: {
  detail: import("@/lib/services/types").MarketplaceJobDetail;
  projectId: string;
  jobId: string;
  initialTab?: "overview" | "radar";
}) {
  const { job, serviceRequest, assignment, customer, financial, timeline, incidentResolution } = detail;
  const [activeTab, setActiveTab] = useState<"overview" | "radar" | "finance" | "history">(initialTab);
  const state = text(job.status);
  const hasDriver = Boolean(assignment?.driver_user_id);
  const driverCode = typeof assignment?.driver_user_id === "string" ? assignment.driver_user_id : null;
  const vehicleCode = typeof assignment?.vehicle_id === "string" ? assignment.vehicle_id : null;
  const customerPhone = typeof customer?.whatsapp_phone === "string" ? customer.whatsapp_phone.trim() : "";
  const displayPrice = Number(financial?.amount ?? job.final_price);
  const currency = text(financial?.currency ?? job.currency);
  const readablePrice = Number.isFinite(displayPrice) && displayPrice > 0
    ? formatOperationPrice(displayPrice, currency)
    : "No disponible";
  const closed = ["cancelled_by_customer", "cancelled_by_driver", "expired", "settled", "completed"].includes(state);
  const tabs = [
    { id: "overview", label: "Resumen ejecutivo", Icon: Eye },
    { id: "radar", label: "Radar y cobertura", Icon: Radar },
    { id: "finance", label: "Finanzas", Icon: WalletCards },
    { id: "history", label: "Trazabilidad", Icon: Clock3 },
  ] as const;
  const sectionTitle = (eyebrow: string, title: string, description: string) => (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-300">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">{description}</p>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <section aria-label="Identidad de la carrera" className="relative isolate overflow-hidden rounded-[26px] border border-cyan-400/25 bg-gradient-to-br from-[#123b43] via-[#101d23] to-[#0a141b] p-4 shadow-[0_20px_60px_-26px_rgba(22,190,202,0.32)] sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-3 -top-12 select-none text-[130px] font-black leading-none tracking-tighter text-cyan-200/[0.055] sm:text-[180px]">360°</div>
        <div className="pointer-events-none absolute -left-20 -bottom-28 h-64 w-64 rounded-full bg-emerald-500/[0.11] blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-64 rounded-full bg-cyan-400/[0.08] blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-cyan-200">
                <BriefcaseBusiness className="h-3.5 w-3.5" /> Expediente 360 de carrera
              </span>
              <StatusBadge status={state} />
              <ServiceBadge service={text(serviceRequest.service_code)} />
            </div>
            <h2 className="mt-4 max-w-2xl text-[23px] font-bold leading-tight tracking-tight text-white sm:text-[30px]">
              Carrera <span className="text-cyan-200">#{jobId.slice(0,8).toUpperCase()}</span>
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Control integral del servicio, la asignación, el alcance del radar y sus eventos.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(job.created_at)}</span>
              <span className="inline-flex items-center gap-1.5"><Route className="h-3.5 w-3.5" />{label(text(serviceRequest.service_code))}</span>
              <span className="font-mono text-[10px] text-slate-500" title={jobId}>ID {jobId.slice(0,13)}…</span>
            </div>
          </div>
          <div className="relative w-full rounded-[20px] border border-emerald-300/20 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm lg:w-60">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-200/75">Valor de la carrera</p>
            <p className="mt-2 break-words text-[25px] font-black leading-none tracking-tight text-white sm:text-[28px]">{readablePrice}</p>
            <div className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-400">
              {closed ? "Servicio con estado cerrado" : "Servicio bajo seguimiento operativo"}
            </div>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2 border-t border-cyan-400/15 pt-4 md:grid-cols-4">
          {[
            { title: "Estado", value: label(state), icon: CheckCircle2 },
            { title: "Conductor", value: hasDriver ? "Asignado" : "Sin asignar", icon: CarFront },
            { title: "Eventos", value: String(timeline.length), icon: Clock3 },
            { title: "Programación", value: serviceRequest.scheduled_for ? "Programada" : "Sin horario", icon: CalendarDays },
          ].map(({title, value, icon: Icon}) => (
            <div key={title} className="min-w-0 rounded-xl border border-white/10 bg-[#071217]/55 px-3 py-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Icon className="h-3.5 w-3.5 text-cyan-200" />{title}</div>
              <div className="mt-1.5 break-words text-[15px] font-bold text-white">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <nav aria-label="Secciones del expediente 360 de carrera" className="rounded-2xl border border-cyan-400/15 bg-[#0b151b] p-1.5 shadow-inner shadow-black/30">
        <div role="tablist" aria-label="Contenido de la carrera" className="flex gap-1 overflow-x-auto pb-0.5">
          {tabs.map(({id,label:tabLabel,Icon}) => (
            <button key={id} type="button" role="tab"
              aria-selected={activeTab === id}
              aria-controls="marketplace-job-premium-panel"
              onClick={() => setActiveTab(id)}
              className={activeTab === id
                ? "flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/15 px-3.5 text-xs font-bold text-white shadow-[0_0_18px_-8px_rgba(34,211,238,0.38)] sm:text-sm"
                : "flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-transparent px-3.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white sm:text-sm"}>
              <Icon className="h-4 w-4" />{tabLabel}
              {id === "history" ? <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{timeline.length}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      <div id="marketplace-job-premium-panel" role="tabpanel" className="min-w-0 space-y-4">
        {activeTab === "overview" ? (
          <>
            <section className="relative overflow-hidden rounded-[24px] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.08] via-[#101b22] to-[#0b151b] p-4 sm:p-5">
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-cyan-400/[0.08] blur-3xl" />
              {sectionTitle("01 / Recorrido", "Ruta del servicio", "Origen, destino y referencias operativas de la solicitud.")}
              <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] lg:items-stretch">
                <div className="rounded-[18px] border border-emerald-400/20 bg-[#080f13]/65 p-4">
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-400/10"><MapPin className="h-4 w-4" /></span> 01 · Punto de recogida</p>
                  <p className="break-words text-base font-semibold leading-relaxed text-white">{text(serviceRequest.origin_text)}</p>
                </div>
                <div className="hidden items-center justify-center lg:flex"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/10 text-cyan-200"><ArrowRight className="h-5 w-5" /></span></div>
                <div className="rounded-[18px] border border-cyan-400/20 bg-[#080f13]/65 p-4">
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-cyan-300"><span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-400/10"><MapPin className="h-4 w-4" /></span> 02 · Destino</p>
                  <p className="break-words text-base font-semibold leading-relaxed text-white">{text(serviceRequest.destination_text)}</p>
                </div>
              </div>
            </section>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <section className="rounded-[23px] border border-border/50 bg-gradient-to-br from-[#101c22] to-[#0b141a] p-4 sm:p-5">
                {sectionTitle("02 / Participantes", "Cliente", "Información de contacto relacionada con esta carrera.")}
                <div className="flex gap-3 rounded-2xl border border-cyan-400/15 bg-black/20 p-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"><UserRound className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="break-words text-lg font-semibold text-white">{customer ? text(customer.display_name) : "Cliente no registrado"}</p>
                    <p className="mt-1 text-sm text-slate-400">{customerPhone || "Teléfono no disponible"}</p>
                    {customerPhone ? <a href={`tel:${customerPhone}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-200 hover:underline"><Phone className="h-3.5 w-3.5" />Llamar al cliente</a> : null}
                  </div>
                </div>
              </section>
              <section className="rounded-[23px] border border-border/50 bg-gradient-to-br from-[#101c22] to-[#0b141a] p-4 sm:p-5">
                {sectionTitle("03 / Asignación", "Conductor y vehículo", "Situación de la asignación vinculada al servicio.")}
                <div className="flex gap-3 rounded-2xl border border-amber-400/15 bg-black/20 p-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-200"><CarFront className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-white">{hasDriver ? "Conductor asignado" : "Sin conductor asignado"}</p>
                    {driverCode ? <p className="mt-1 break-all font-mono text-[11px] text-slate-400">ID conductor: {driverCode}</p> : <p className="mt-1 text-sm text-slate-400">No se ha registrado una asignación.</p>}
                    {vehicleCode ? <p className="mt-1 break-all text-xs text-slate-400">Vehículo: {vehicleCode}</p> : null}
                  </div>
                </div>
              </section>
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_1.1fr]">
              <section className="rounded-[23px] border border-border/50 bg-[#0e181e] p-4 sm:p-5">
                {sectionTitle("04 / Programación", "Datos de servicio", "Agenda y condiciones básicas de la carrera.")}
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-black/20 p-3.5">
                  <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-violet-300" />
                  <div><p className="text-xs text-slate-400">Hora programada</p><p className="mt-1 text-sm font-semibold text-white">{formatDate(serviceRequest.scheduled_for)}</p></div>
                </div>
              </section>
              <section className="rounded-[23px] border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[0.07] to-[#0d181f] p-4 sm:p-5">
                {sectionTitle("05 / Inteligencia operativa", "Cobertura del radar", "Consulta impactos por conductor y kilómetros registrados al aviso.")}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-400/15 bg-black/20 px-3.5 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100"><Radar className="h-5 w-5 text-cyan-300" />Análisis de distribución</div>
                  <Button type="button" size="sm" variant="outline" className="border-cyan-400/25 text-cyan-100" onClick={() => setActiveTab("radar")}>Explorar radar <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </section>
            </div>
          </>
        ) : null}

        {activeTab === "radar" ? (
          <section aria-label="Radar y alcance de la carrera" className="space-y-4">
            <div className="rounded-[23px] border border-cyan-400/20 bg-gradient-to-br from-[#122b33] to-[#0b161b] p-4 sm:p-5">
              {sectionTitle("Inteligencia operativa", "Radar y alcance real", "Ejecuciones, conductores impactados, distancias históricas y etapas de distribución.")}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-300" />Las distancias proceden de registros históricos; nunca se sustituyen por el GPS actual.</div>
            </div>
            <JobNotificationReach projectId={projectId} jobId={jobId} assignedDriverId={typeof assignment?.driver_user_id === "string" ? assignment.driver_user_id : null} />
          </section>
        ) : null}

        {activeTab === "finance" ? (
          <section className="space-y-4">
            {sectionTitle("Estado económico", "Finanzas de la operación", "Importe contratado, comisión y situación registrada de la reserva.")}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[23px] border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.10] via-[#142621] to-[#0b1718] p-5">
                <Banknote className="mb-3 h-6 w-6 text-emerald-300" />
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/75">Importe de carrera</p>
                <p className="mt-2 break-words text-3xl font-black tracking-tight text-white">{readablePrice}</p>
                <p className="mt-3 text-xs text-slate-400">Precio registrado del servicio.</p>
              </div>
              <div className="rounded-[23px] border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[0.07] to-[#0c181f] p-5">
                <WalletCards className="mb-3 h-6 w-6 text-cyan-200" />
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200/75">Estado de comisión / reserva</p>
                <p className="mt-2 text-xl font-bold text-white">{financial ? label(text(financial.reservation_status)) : "Sin información financiera"}</p>
                <p className="mt-3 text-xs text-slate-400">No equivale a un cargo liquidado si todavía no consta en el sistema.</p>
              </div>
            </div>
            {incidentResolution ? (
              <div className="rounded-[22px] border border-rose-400/25 bg-rose-400/[0.06] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-200"><AlertTriangle className="h-4 w-4" />Resolución de incidencia</p>
                <p className="mt-2 font-medium text-white">{label(text(incidentResolution.resolution))}</p>
                <p className="mt-1 text-sm text-slate-300">{text(incidentResolution.resolution_note)}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="rounded-[24px] border border-cyan-400/15 bg-gradient-to-br from-[#0e1c22] to-[#0a141b] p-4 sm:p-6">
            {sectionTitle("Auditoría del servicio", "Línea de tiempo", "Historial de cambios de estado, responsables y motivos registrados.")}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-black/20 px-3.5 py-3">
              <p className="text-sm text-slate-300">Eventos registrados</p><p className="text-2xl font-bold text-cyan-200">{timeline.length}</p>
            </div>
            {timeline.length ? (
              <ol className="relative ml-2 space-y-3 border-l border-cyan-400/30 pl-6">
                {timeline.map((event, index) => (
                  <li key={String(event.event_id ?? index)} className="relative rounded-[18px] border border-border/50 bg-black/20 p-4">
                    <span className="absolute -left-[32px] top-5 h-3.5 w-3.5 rounded-full border-[3px] border-[#112128] bg-cyan-300 shadow-[0_0_14px_2px_rgba(34,211,238,0.22)]" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-slate-400">{formatDate(event.created_at)}</p>
                      {event.actor_kind ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-300">Actor: {text(event.actor_kind)}</span> : null}
                    </div>
                    <p className="mt-2 break-words text-sm font-bold text-white">{text(event.action)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-lg border border-border/50 bg-black/20 px-2.5 py-1.5 text-slate-300">{label(text(event.from_status))}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-cyan-300" />
                      <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.08] px-2.5 py-1.5 font-semibold text-cyan-100">{label(text(event.to_status))}</span>
                    </div>
                    {event.reason ? <p className="mt-3 rounded-lg border border-amber-400/10 bg-amber-400/[0.035] p-2.5 text-xs leading-relaxed text-slate-300">Motivo: {text(event.reason)}</p> : null}
                  </li>
                ))}
              </ol>
            ) : <div className="rounded-xl border border-dashed border-border/50 p-5 text-sm text-slate-400">No constan eventos registrados.</div>}
          </section>
        ) : null}
      </div>
    </div>
  );
}
