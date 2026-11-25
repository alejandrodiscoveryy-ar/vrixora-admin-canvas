import MarketplaceServiceShareButton from "@/features/admin/MarketplaceServiceShareButton";
import MarketplaceRecoverServiceButton from "@/features/admin/MarketplaceRecoverServiceButton";
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
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/admin/MetricCard";
import { premiumSurface, premiumControlSurface, premiumHeaderSurface, premiumColumnHeaderSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";

import MarketplaceDriver360Record from "@/features/admin/MarketplaceDriver360Record";
import DriverVerifiedBadge from "@/features/admin/DriverVerifiedBadge";
import { useDriverVerifications } from "@/hooks/useDriverVerifications";
import { usePendingDriverVerifications } from "@/hooks/usePendingDriverVerifications";
import { countPendingDriverVerifications, matchesDriverVerification, matchesPendingDriverVerification } from "@/features/admin/driver-verification-filter";
import MarketplaceFleetPulse from "@/features/admin/MarketplaceFleetPulse";
import MarketplacePulseDecisions from "@/features/admin/MarketplacePulseDecisions";
import { EmptyMarketplaceState, LoadingState, PaginationButton, FilterSelect } from "@/features/admin/MarketplaceListPrimitives";
import { driverWhatsAppLinks, driverWelcomeMessage } from "@/lib/driver-whatsapp";
import AdminWhatsAppOpenChooser from "@/features/admin/AdminWhatsAppOpenChooser";
import { MarketplaceTopupPaymentDestination, useTopupPaymentDestination, topupPaymentInstructionsMessage } from "@/features/admin/MarketplaceTopupPaymentDestination";



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

function DriverDirectoryPortrait({
  name,
  url,
  googleUrl,
}: {
  name: string;
  url: string | null;
  googleUrl: string | null;
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  useEffect(() => setFailedUrls([]), [url, googleUrl]);
  const activeUrl = [url, googleUrl].find((candidate) => candidate && !failedUrls.includes(candidate));
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-default bg-surface-2 text-primary">
      <Users className="h-5 w-5" aria-hidden="true" />
      {activeUrl ? (
        <img
          key={activeUrl}
          src={activeUrl}
          alt={`Foto de ${name}`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedUrls((previous) => previous.includes(activeUrl)
            ? previous : [...previous, activeUrl])}
        />
      ) : null}
    </span>
  );
}

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
        TOPUP_ALREADY_REVERSED: "Esta recarga ya fue anulada. Actualiza la lista.",
        TOPUP_NOT_REVERSIBLE: "La recarga no permite anulación. Actualiza la lista y revisa su estado.",
        TOPUP_REVERSAL_REAL_BALANCE_RESERVED: "El saldo de esta recarga está reservado y no puede retirarse hasta liberar las reservas.",
        TOPUP_LEDGER_NOT_FOUND: "No se encontró el movimiento original; no se efectuó ninguna anulación.",
        PERMISSION_DENIED: "Tu usuario no tiene permisos para corregir pagos.",
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

const formatWalletAmount = (value:unknown,currency:string) => formatAmount(value,currency==="CUP"?"MN":currency);

const operationRowClasses = (status: string | null) => {
  if (["completed", "settled", "confirmed", "reconciled"].includes(status ?? "")) {
    return "border-emerald-500/45 border-l-4 border-l-emerald-400 bg-emerald-500/[0.10] hover:bg-emerald-500/[0.15] dark:bg-[color:color-mix(in_oklab,color-mix(in_oklab,var(--surface-3)_84%,var(--text-secondary)_16%)_93%,var(--semantic-success)_7%)] dark:hover:bg-[color:color-mix(in_oklab,color-mix(in_oklab,var(--surface-3)_80%,var(--text-secondary)_20%)_90%,var(--semantic-success)_10%)]";
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
    return "border-rose-500/45 border-l-4 border-l-rose-400 bg-rose-500/[0.10] hover:bg-rose-500/[0.15] dark:bg-[color:color-mix(in_oklab,color-mix(in_oklab,var(--surface-3)_84%,var(--text-secondary)_16%)_93%,var(--semantic-danger)_7%)] dark:hover:bg-[color:color-mix(in_oklab,color-mix(in_oklab,var(--surface-3)_80%,var(--text-secondary)_20%)_90%,var(--semantic-danger)_10%)]";
  }

  if (
    ["requested", "published", "accepted", "en_route", "pickup", "in_progress", "active"].includes(
      status ?? "",
    )
  ) {
    return "border-amber-500/45 border-l-4 border-l-amber-400 bg-amber-500/[0.10] hover:bg-amber-500/[0.15] dark:bg-[color:color-mix(in_oklab,color-mix(in_oklab,var(--surface-3)_84%,var(--text-secondary)_16%)_93%,var(--semantic-warning)_7%)] dark:hover:bg-[color:color-mix(in_oklab,color-mix(in_oklab,var(--surface-3)_80%,var(--text-secondary)_20%)_90%,var(--semantic-warning)_10%)]";
  }

  return "border-border/60 border-l-4 border-l-border bg-surface-1 hover:bg-muted/30 dark:bg-[color:color-mix(in_oklab,var(--surface-3)_89%,var(--text-secondary)_11%)] dark:hover:bg-[color:color-mix(in_oklab,var(--surface-3)_82%,var(--text-secondary)_18%)]";
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


// Mensaje administrativo listo para revisar y enviar manualmente por WhatsApp.
function topupWhatsAppMessage(
  item: {
    driverDisplayName: string;
    amount: unknown;
    currency: string;
    method: string;
    reference?: string | null;
    status: string;
    rejectionReason?: string | null;
    confirmedAt?: string | null;
    rejectedAt?: string | null;
  },
  methodLabel: string,
  receiptNumber?: string | null,
) {
  const rejected = item.status === "rejected";
  const state = rejected ? "Rechazada" : item.status === "reconciled" ? "Confirmada y conciliada" : "Confirmada";
  const handledAt = rejected ? item.rejectedAt : item.confirmedAt;

  return [
    "🛺 *Agencia TukTuk*",
    "",
    `👋 Hola, ${item.driverDisplayName}.`,
    "",
    rejected ? "❌ *Recarga rechazada*" : "✅ *Recarga confirmada*",
    rejected
      ? "Te informamos que tu solicitud de recarga fue rechazada."
      : "Tu recarga fue confirmada y acreditada a tu billetera TukTuk.",
    "",
    `💰 *Importe:* ${formatAmount(item.amount, item.currency)}`,
    `${rejected ? "❌" : "✅"} *Estado:* ${state}`,
    `💳 *Método:* ${methodLabel}`,
    ...(item.reference ? [`🔖 *Referencia:* ${item.reference}`] : []),
    ...(rejected && item.rejectionReason ? [`⚠️ *Motivo:* ${item.rejectionReason}`] : []),
    ...(!rejected && receiptNumber ? [`🧾 *Comprobante:* ${receiptNumber}`] : []),
    ...(handledAt ? [`🗓️ *Fecha:* ${formatCustomerDateTime(handledAt)} (hora de Cuba)`] : []),
    "",
    "🤝 *Equipo de Agencia TukTuk*",
  ].join("\n");
}

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

function StatusBadge({ status, compact = false }: { status: string | null; compact?: boolean }) {
  return (
    <span
      data-marketplace-status={status ?? "unknown"}
      className={`inline-flex items-center rounded-full border ${compact ? "px-2 py-0.5 leading-tight" : "px-2.5 py-1"} text-[11px] font-semibold ${statusClasses(
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
    <section className={`relative min-w-0 overflow-hidden rounded-2xl border shadow-sm ${visual.card} admin-graphite-panel`}>
      {backgroundImage ? (
        <>
          <img
            src={backgroundImage}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-3 right-3 h-16 w-16 object-contain opacity-[0.06] dark:opacity-[0.07]"
          />
          <div className="pointer-events-none absolute inset-0" />
        </>
      ) : null}

      <div className={`relative z-[1] h-1 bg-gradient-to-r ${visual.strip}`} />

      <div className="relative z-[1] flex min-w-0 flex-col gap-2 border-b border-border-default px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between admin-graphite-header">
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

      <div className="relative z-[1] min-w-0 p-3 sm:p-4">{children}</div>
    </section>
  );
}

// Shared, responsive record presentation; no duplicated desktop/mobile markup.
function recordMatches(search: string, ...values: (string | null | undefined)[]) {
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  const query = normalized(search.trim());
  if (!query) return true;
  const digits = query.replace(/\D/g, "");
  return values.some((value) => value && (normalized(value).includes(query) ||
    (digits.length >= 3 && /^[+\d\s().-]+$/.test(query) && value.replace(/\D/g, "").includes(digits))));
}

function RecordMetric({ labelText, value, tone }: { labelText: string; value: ReactNode; tone?: "available" | "reserved" | "accent" | "danger" }) {
  return <div className="min-w-0">
    <p className="text-[11px] font-medium leading-tight text-text-secondary">{labelText}</p>
    <p className={cn("mt-0.5 break-words text-sm font-semibold tabular-nums text-foreground", tone === "available" && "marketplace-value-available", tone === "reserved" && "marketplace-value-reserved", tone === "accent" && "marketplace-value-accent", tone === "danger" && "marketplace-value-danger")}>{value}</p>
  </div>;
}

function RecordIdentity({ icon: Icon, name, children, portrait }: { icon: typeof UserRound; name: string; children?: ReactNode; portrait?: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-2.5">
    {portrait ?? <span className="marketplace-record-icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>}
    <div className="min-w-0 flex-1">
      <p className="break-words text-sm font-semibold leading-snug text-foreground">{name}</p>
      <div className="mt-0.5 min-w-0 space-y-0.5 text-xs text-text-secondary">{children}</div>
    </div>
  </div>;
}

function RecordSearch({ value, onChange, placeholder, labelText }: { value: string; onChange: (value: string) => void; placeholder: string; labelText: string }) {
  return <label className="relative block min-w-0 flex-1">
    <span className="sr-only">{labelText}</span>
    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn("min-h-11 min-w-0 pl-9", premiumControlSurface)} />
  </label>;
}

function RecordLoadError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-default bg-surface-2 px-3 py-2 text-sm text-foreground">
    <span className="flex min-w-0 items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" /> No se pudo actualizar la lista.</span>
    <Button size="sm" variant="outline" onClick={onRetry}>Reintentar</Button>
  </div>;
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
    <div className={cn("flex min-w-0 items-start gap-2 rounded-xl border p-2.5", premiumColumnHeaderSurface, "shadow-none")}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border ${accentClasses}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0"><p className="text-[11px] font-medium leading-tight text-text-secondary">
        {labelText}
      </p>
      <p className="mt-0.5 break-words text-base font-semibold tabular-nums text-foreground sm:text-lg">
        {value}
      </p></div>
    </div>
  );
}

function Customer360Detail({
  detail,
  history,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenJob,
}: {
  detail: MarketplaceCustomer360;
  history: MarketplaceCustomerHistoryItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpenJob?: (id: string) => void;
}) {
  const km = (value: number | null) =>
    value == null ? "\u2014" : `${value.toLocaleString("es", { maximumFractionDigits: 1 })} km`;

  const phone = detail.customer.whatsappPhone?.trim() || "";
  const whatsapp = phone ? driverWhatsAppLinks(phone) : null;
  const sections = [
    { id: "overview", label: "Resumen", Icon: Eye },
    { id: "activity", label: "Actividad", Icon: BriefcaseBusiness },
    { id: "modalities", label: "Modalidades", Icon: CarFront },
    { id: "history", label: "Historial", Icon: Clock3 },
  ] as const;
  return (
    <div data-nav-tone="usuarios" className="marketplace-360 marketplace-360-customer min-w-0 space-y-3">
      <section aria-label="Identidad del cliente" className={cn("marketplace-360-hero relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <span aria-hidden="true" className="marketplace-360-watermark">360°</span>
        <div className="relative flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="marketplace-360-avatar"><UserRound className="h-7 w-7" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="marketplace-360-kicker">Expediente 360 · Cliente</p>
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2 className="min-w-0 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">{detail.customer.displayName}</h2>
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-text-secondary"><CalendarDays className="h-3.5 w-3.5 shrink-0" />Cliente desde {formatCustomerDateTime(detail.customer.createdAt)} (Cuba)</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end">
            {whatsapp ? <AdminWhatsAppOpenChooser links={whatsapp} driverName={detail.customer.displayName} inviteToGroup={false} buttonClassName="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-default px-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10" /> : null}
            {phone ? <Button variant="outline" size="sm" asChild><a href={`tel:${phone}`} className="min-h-11"><Phone className="mr-1.5 h-4 w-4" />Llamar</a></Button> : null}
            {detail.customer.email ? <Button variant="outline" size="sm" asChild><a href={`mailto:${detail.customer.email}`} className="min-h-11"><Mail className="mr-1.5 h-4 w-4" />Correo</a></Button> : null}
          </div>
        </div>
        <div className="relative mt-3 grid min-w-0 gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
          <RecordMetric labelText="Teléfono / WhatsApp" value={phone || "No registrado"} />
          <RecordMetric labelText="Correo" value={detail.customer.email ?? "Sin correo registrado"} />
        </div>
      </section>
      <Tabs defaultValue="overview" className="min-w-0">
        <nav aria-label="Secciones de la ficha 360 del cliente" className={cn("marketplace-360-nav rounded-[var(--radius-card)] border p-1.5", premiumSurface)}>
          <TabsList aria-label="Contenido del cliente" className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0 sm:flex sm:flex-wrap sm:justify-start">
            {sections.map(({ id, label: tabLabel, Icon }) => (
              <TabsTrigger key={id} value={id} className="marketplace-360-tab min-h-11 min-w-0 gap-1.5 whitespace-normal px-2 sm:px-3">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{tabLabel}
              </TabsTrigger>
            ))}
          </TabsList>
        </nav>
        <TabsContent value="overview" className="marketplace-360-content space-y-3">
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <section aria-label="Indicadores esenciales del cliente" className={cn("marketplace-360-panel min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
              <p className="marketplace-360-kicker">Vista ejecutiva</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Actividad y consumo</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CustomerSummaryMetric icon={BriefcaseBusiness} labelText="Viajes completados" value={detail.summary.tripsCompleted} />
                <CustomerSummaryMetric icon={Route} labelText="Km recorridos" value={km(detail.summary.distanceKm)} accent="cyan" />
                <CustomerSummaryMetric icon={Banknote} labelText="Gasto total" value={formatAmount(detail.summary.totalSpent, detail.summary.currency)} accent="emerald" />
                <CustomerSummaryMetric icon={CircleDollarSign} labelText="Ticket medio" value={formatAmount(detail.summary.averageTicket, detail.summary.currency)} accent="amber" />
              </div>
            </section>
            <section aria-label="Reputación del cliente" className={cn("marketplace-360-panel min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
              <p className="marketplace-360-kicker">Relación con TukTuk</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Último servicio y valoración</h3>
              <div className="mt-3 space-y-2">
                <CustomerSummaryMetric icon={Clock3} labelText="Último servicio" value={detail.summary.lastServiceAt ? formatDate(detail.summary.lastServiceAt) : "Sin viajes completados"} />
                <CustomerSummaryMetric icon={Star} labelText="Valoraciones realizadas" value={detail.ratings.givenCount ? `${detail.ratings.averageGiven.toFixed(1)} / 5 · ${detail.ratings.givenCount}` : "Sin valoraciones"} accent="amber" />
              </div>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="activity" className="marketplace-360-content space-y-3">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] marketplace-value-accent">
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
        <section className="rounded-xl border border-border/60 bg-gradient-to-br from-background/75 to-violet-500/[0.035] p-3 admin-graphite-panel">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.07] marketplace-value-accent">
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

        <section className="rounded-xl border border-border/60 bg-gradient-to-br from-background/75 to-amber-500/[0.035] p-3 admin-graphite-panel">
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

        </TabsContent>
        <TabsContent value="modalities" className="marketplace-360-content">
      <section className={cn("marketplace-360-panel min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] marketplace-value-accent">
            Preferencias
          </p>
          <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            Modalidades utilizadas
          </h4>
        </div>

        {detail.modalities.length ? (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {detail.modalities.map((item) => (
              <div
                key={`${item.serviceCode}:${item.vehicleCategoryCode ?? "none"}`}
                className="rounded-2xl border border-border/55 bg-background/60 p-3 transition hover:border-cyan-500/20 admin-graphite-inset"
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
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 text-xs text-muted-foreground admin-graphite-inset">
                    {km(item.distanceKm)}
                  </span>
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 text-xs text-muted-foreground admin-graphite-inset">
                    {formatAmount(item.totalSpent, detail.summary.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/40 p-4 admin-graphite-inset">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] marketplace-value-accent">
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

        </TabsContent>
        <TabsContent value="history" className="marketplace-360-content">
      <section className={cn("marketplace-360-panel min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] marketplace-value-accent">
            Trazabilidad
          </p>
          <h4 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            Historial de servicios
          </h4>
        </div>

        {!history.length ? (
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/40 p-4 admin-graphite-inset">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.05] marketplace-value-accent">
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
          <div className="relative mt-2 space-y-3 pl-5">
            <div className="absolute bottom-3 left-[6px] top-3 w-px bg-gradient-to-b from-violet-400/45 via-border/50 to-transparent" />

            {history.map((item) => (
              <article
                key={item.jobId}
                className="relative rounded-2xl border border-border/60 bg-background/60 p-3 transition hover:border-violet-500/20 admin-graphite-inset"
              >
                <span className="absolute -left-[18px] top-5 h-3 w-3 rounded-full border-2 border-background bg-violet-400 shadow-[0_0_0_3px_rgba(139,92,246,0.12)]" />

                <div className="flex flex-wrap items-center gap-2">
                  <ServiceBadge service={item.serviceCode} />
                  <StatusBadge status={item.status} />
                  <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                    {formatDate(item.createdAt)}
                  </span>
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/50 bg-background/55 p-3 admin-graphite-inset">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Origen
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-foreground">{item.originText}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/55 p-3 admin-graphite-inset">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Destino
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                      {item.destinationText}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 admin-graphite-inset">
                    {formatAmount(item.finalPrice, item.currency)}
                  </span>
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 admin-graphite-inset">
                    {km(item.distanceKm)}
                  </span>
                  <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 admin-graphite-inset">
                    {item.driverDisplayName ?? "Sin conductor asignado"}
                  </span>
                  {item.vehicleCategoryCode ? (
                    <span className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-1.5 admin-graphite-inset">
                      {label(item.vehicleCategoryCode)}
                    </span>
                  ) : null}
                </div>

                {onOpenJob ? <div className="mt-2 flex justify-end"><Button type="button" size="sm" variant="ghost" className="min-h-11 marketplace-360-link" onClick={() => onOpenJob(item.jobId)}>Ver carrera <ArrowRight className="ml-1.5 h-4 w-4" /></Button></div> : null}
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
          <div className="mt-2 flex justify-center">
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
        </TabsContent>
      </Tabs>
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

export default function MarketplaceSection({ projectId, welcomeDrivers = false }: { projectId: string; welcomeDrivers?: boolean }) {
  const { data: permissions = [] } = useProjectPermissions(projectId);

  const requestedView = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).vista,
  });
  const pulsoTopupState = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).estadoRecarga,
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
  const [welcomeCopyFallback, setWelcomeCopyFallback] = useState<string | null>(null);

  // Keep the original anchor navigation; clipboard work must never delay or cancel it.
  const copyDriverWelcome = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Bienvenida copiada. Si no aparece en WhatsApp, pégala con Ctrl+V.");
    } catch {
      setWelcomeCopyFallback(message);
      toast.error("No se pudo copiar la bienvenida. Puedes copiarla manualmente desde Admin.");
    }
  };
  const [driverStatusFilter, setDriverStatusFilter] = useState("");
  const [driverAvailabilityFilter, setDriverAvailabilityFilter] = useState("");
  const [driverCategoryFilter, setDriverCategoryFilter] = useState("");
  const [driverPeriodFilter, setDriverPeriodFilter] = useState("");
  const [driverVerificationFilter, setDriverVerificationFilter] = useState("");
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
    method: string;
    confirmationKey: string;
  } | null>(null);
  const [receivedPaymentReference, setReceivedPaymentReference] = useState("");
  const [verifiedPaymentReceived, setVerifiedPaymentReceived] = useState(false);
  const [topupReversal, setTopupReversal] = useState<{
    id: string;
    driver: string;
    amount: number;
    currency: string;
    documentNumber: string | null;
    idempotencyKey: string;
  } | null>(null);
  const [topupReversalReason, setTopupReversalReason] = useState("");
  const [topupReversalAcknowledged, setTopupReversalAcknowledged] = useState(false);
  const [newTopup, setNewTopup] = useState(false);
  const [topupStatus, setTopupStatus] = useState("requested");
  const [walletSearch, setWalletSearch] = useState("");
  const [walletFilter, setWalletFilter] = useState<"" | "deposit_pending" | "deposit_confirmed" | "has_available" | "no_available" | "reserved">("has_available");
  const [topupSearch, setTopupSearch] = useState("");
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
  const canCorrectPayments = permissions.includes("payments.correct");
  const canSettings = permissions.includes("settings.view");
  const canManageSettings = permissions.includes("settings.manage");
  const canManageMarketplace = permissions.includes("marketplace.manage");
  const canFinishAdmin = canManageMarketplace && canManagePayments;
  const paymentDestination = useTopupPaymentDestination(projectId, canManagePayments && tab === "recargas");

  const queryClient = useQueryClient();

  // Mantener montado el mapa al alternar vistas, pero no cargarlo hasta abrir Mapa.
  useEffect(() => {
    if (tab === "mapa") setMapVisited(true);
  }, [tab]);

  // Al entrar o regresar a Recargas, priorizar solicitudes pendientes.
  // Los otros filtros siguen siendo seleccionables durante la visita.
  useEffect(() => {
    if (tab !== "recargas") return;
    // Desde Pulso, «Recargas vigentes» debe abrir Confirmadas, no Pendientes.
    // En la navegación ordinaria se conserva Pendientes como filtro inicial.
    setTopupStatus(pulsoTopupState === "confirmed" ? "confirmed" : "requested");
    setTopupSearch("");
  }, [tab, pulsoTopupState]);

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

  const wallets = useQuery({
    queryKey: ["marketplace-wallets", projectId, "complete"],
    queryFn: async ({signal}) => {
      const all = new Map<string, Awaited<ReturnType<typeof supabaseServices.marketplace.listWallets>>["items"][number]>();
      let cursor: {at:string;id:string}|null = null;
      const seen = new Set<string>();
      for (let page=0;page<100;page++) {
        if(signal.aborted) throw new Error("Consulta cancelada");
        const result = await supabaseServices.marketplace.listWallets(projectId,{limit:200,cursor});
        for(const item of result.items) if(!all.has(item.userId)) all.set(item.userId,item);
        if(!result.nextCursor) return [...all.values()];
        const key=JSON.stringify(result.nextCursor);
        if(seen.has(key)) throw new Error("Paginación de billeteras inconsistente");
        seen.add(key);
        cursor=result.nextCursor;
      }
      throw new Error("No se pudo completar el inventario de billeteras");
    },
    enabled: tab === "billeteras" && canPayments,
    staleTime: 30_000,
    refetchInterval: tab === "billeteras" ? 60_000 : false,
  });

  const topups = useInfiniteQuery({
    queryKey: ["marketplace-topups", projectId, topupStatus],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listTopups(projectId, {
        status: topupStatus === "reversed" ? undefined : topupStatus || undefined,
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
    mutationFn: () => topup!.method === "transfer"
      ? supabaseServices.marketplace.confirmTopupWithReference(projectId, topup!.id, topup!.confirmationKey, receivedPaymentReference.trim())
      : supabaseServices.marketplace.confirmTopup(projectId, topup!.id, topup!.confirmationKey),
    onSuccess: () => {
      setError(null);
      setTopup(null);
      setReceivedPaymentReference("");
      setVerifiedPaymentReceived(false);
      toast.success("Recarga confirmada. Pulsa Notificar por WhatsApp para enviar el comprobante.");
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

  const reverse = useMutation({
    mutationFn: async () => {
      if (!canCorrectPayments || !topupReversal || !topupReversalAcknowledged ||
          topupReversalReason.trim().length < 8 || topupReversalReason.trim().length > 1000) {
        throw new Error("Confirma la operación e indica un motivo de 8 a 1000 caracteres.");
      }
      return supabaseServices.marketplace.reverseTopup(
        projectId,
        topupReversal.id,
        topupReversalReason,
        topupReversal.idempotencyKey,
      );
    },
    onSuccess: () => {
      setTopupReversal(null);
      setTopupReversalReason("");
      setTopupReversalAcknowledged(false);
      toast.success("Recarga anulada: crédito compensado y nota de corrección emitida.");
      void invalidate(
        "marketplace-topups",
        "marketplace-wallets",
        "marketplace-overview",
        "marketplace-drivers",
        "marketplace-financial-documents",
        "marketplace-driver-financial-360",
      );
    },
    onError: (mutationError) => {
      toast.error(errorText(mutationError));
      void invalidate("marketplace-topups", "marketplace-wallets", "marketplace-financial-documents");
    },
  });

  const reject = useMutation({
    mutationFn: () => supabaseServices.marketplace.rejectTopup(projectId, topup!.id, reason),
    onSuccess: () => {
      setError(null);
      setTopup(null);
      setReason("");
      setReceivedPaymentReference("");
      setVerifiedPaymentReceived(false);
      toast.success("Solicitud rechazada. No se acreditó saldo.");
      void invalidate("marketplace-topups", "marketplace-overview");
    },
    onError: (mutationError) => {
      setError(errorText(mutationError));
      toast.error("No se pudo rechazar la solicitud: " + errorText(mutationError));
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
  // Fetch verification for the entire loaded directory before applying filters or slicing visible rows.
  const driverVerifications = useDriverVerifications(projectId, driverRows.map((row) => row.userId),
    tab === "conductores" && !drivers.hasNextPage && !drivers.isLoading && !drivers.isError);
  // Fetch pending requests for the filter label even before that filter is selected.
  // The server excludes already verified drivers; results are scoped to the full directory.
  const pendingVerifications = usePendingDriverVerifications(projectId, driverRows.map((row) => row.userId),
    tab === "conductores" && canManageMarketplace &&
    !drivers.hasNextPage && !drivers.isLoading && !drivers.isError);
  const verificationComplete = driverRows.every((row) =>
    typeof driverVerifications.data?.[row.userId]?.verified === "boolean");
  const verificationFilterLoading = driverVerificationFilter === "pending"
    ? pendingVerifications.isLoading || pendingVerifications.isFetching ||
      (driverVerifications.isFetching && !verificationComplete)
    : Boolean(driverVerificationFilter) && driverVerifications.isFetching && !verificationComplete;
  const verificationFilterUnavailable = Boolean(driverVerificationFilter) &&
    !drivers.isLoading && !drivers.hasNextPage && !verificationFilterLoading &&
    (driverVerificationFilter === "pending"
      ? !canManageMarketplace || pendingVerifications.isError || !pendingVerifications.data ||
        driverVerifications.isError || !verificationComplete
      : driverVerifications.isError || !verificationComplete);
  const verifiedDriverCount = verificationComplete && !drivers.isLoading && !drivers.hasNextPage && !drivers.isError && !driverVerifications.isError
    ? driverRows.filter((row) => driverVerifications.data?.[row.userId]?.verified === true).length : null;
  const pendingDriverCount = !drivers.isLoading && !drivers.hasNextPage && !drivers.isError &&
    canManageMarketplace && !pendingVerifications.isError && !driverVerifications.isError
    ? driverRows.length === 0 ? 0 : countPendingDriverVerifications(
        driverRows.map((row) => row.userId),
        pendingVerifications.data,
        driverVerifications.data,
      )
    : null;
  const driverCategories = [...new Set(
    driverRows.map((item) => item.vehicleCategoryCode).filter((code): code is string => Boolean(code)),
  )].sort();
  const filteredDriverRows = driverRows.filter((item) => {
    const query = normalizeDriverText(driverSearch);
    const phoneDigits = driverSearch.replace(/\D/g, "");
    if (query && !normalizeDriverText(item.displayName).includes(query) &&
        !(phoneDigits && (item.phone ?? "").replace(/\D/g, "").includes(phoneDigits))) return false;
    if (driverStatusFilter && item.status !== driverStatusFilter) return false;
    if (driverVerificationFilter === "pending") {
      if (!matchesPendingDriverVerification(
        pendingVerifications.data?.has(item.userId) === true,
        driverVerifications.data?.[item.userId]?.verified,
      )) return false;
    } else if (!matchesDriverVerification(driverVerificationFilter, driverVerifications.data?.[item.userId]?.verified)) return false;
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
    driverCategoryFilter || driverPeriodFilter || driverVerificationFilter);
  useEffect(() => {
    setDriverVisibleCount(25);
  }, [driverSearch, driverStatusFilter, driverAvailabilityFilter, driverCategoryFilter, driverPeriodFilter, driverVerificationFilter, projectId]);
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
    refetchInterval: driver360Id ? 12 * 60_000 : false, // renew 15-min signed portraits
    retry: 1,
  });
  const resolvedDriver360Media = useMemo(() => {
    const userId = driver360Id ?? "";
    const selected = selectedDriverMedia.data?.[userId];
    const directory = driverMedia.data?.[userId];
    if (!selected && !directory) return null;
    return {
      avatarUrl: selected?.avatarUrl ?? directory?.avatarUrl ?? null,
      googleAvatarUrl: selected?.googleAvatarUrl ?? directory?.googleAvatarUrl ?? null,
      vehiclePhotos: { ...directory?.vehiclePhotos, ...selected?.vehiclePhotos },
    } satisfies MarketplaceDirectoryDriverMedia;
  }, [driver360Id, selectedDriverMedia.data, driverMedia.data]);
  const customerRows = rows(customers);
  const walletRows = wallets.data ?? [];
  const topupRows = rows(topups);
  // Filtros sobre el inventario completo; no mostrar resultados parciales como globales.
  // Un saldo disponible de 0 no significa necesariamente saldo total de 0 (puede estar reservado).
  const filteredWalletRows = walletRows.filter((wallet) => {
    if (!recordMatches(walletSearch, wallet.driverDisplayName, wallet.driverPhone)) return false;
    switch (walletFilter) {
      case "deposit_pending": return !wallet.initialDepositConfirmed;
      case "deposit_confirmed": return wallet.initialDepositConfirmed;
      case "has_available": return Number(wallet.availableBalance) > 0;
      case "no_available": return Number(wallet.availableBalance) <= 0;
      case "reserved": return Number(wallet.reservedBalance) > 0;
      default: return true;
    }
  });
  const sortedWalletRows = [...filteredWalletRows].sort((a,b)=>b.availableBalance-a.availableBalance || a.driverDisplayName.localeCompare(b.driverDisplayName,"es"));
  const walletCounts = {all:walletRows.length,has_available:walletRows.filter(w=>w.availableBalance>0).length,no_available:walletRows.filter(w=>w.availableBalance<=0).length,reserved:walletRows.filter(w=>w.reservedBalance>0).length,deposit_pending:walletRows.filter(w=>!w.initialDepositConfirmed).length,deposit_confirmed:walletRows.filter(w=>w.initialDepositConfirmed).length};
  const walletCurrencies = [...new Set(walletRows.map(w=>w.currency))];
  const receiptsByTopup = useMemo(() => {
    const byTopup = new Map<string, NonNullable<typeof financialDocuments.data>[number]>();
    for (const document of financialDocuments.data ?? []) {
      if (document.documentType === "topup_receipt" && document.topupId) byTopup.set(document.topupId, document);
    }
    return byTopup;
  }, [financialDocuments.data]);
  const creditNotesByTopup = useMemo(() => {
    const byTopup = new Map<string, NonNullable<typeof financialDocuments.data>[number]>();
    for (const document of financialDocuments.data ?? []) {
      if (document.documentType === "credit_note" && document.topupId) byTopup.set(document.topupId, document);
    }
    return byTopup;
  }, [financialDocuments.data]);
  const financialDocumentHistoryComplete = financialDocuments.isSuccess && (financialDocuments.data?.length ?? 0) < 200;
  const filteredTopupRows = topupRows.filter((item) => {
    if (!recordMatches(topupSearch, item.driverDisplayName, item.driverPhone, item.reference)) return false;
    const reversed = creditNotesByTopup.has(item.topupId);
    if (topupStatus === "reversed") return reversed;
    if ((topupStatus === "confirmed" || topupStatus === "reconciled") && reversed) return false;
    return true;
  });
  // Reuse the permission-checked directory portraits, only for the visible finance list.
  const financeMediaIds = Array.from(new Set(
    (tab === "billeteras" ? filteredWalletRows : tab === "recargas" ? filteredTopupRows : [])
      .map(row => row.userId).filter(Boolean),
  )).sort();
  const financeMedia = useQuery({
    queryKey: ["marketplace-driver-directory-media", projectId, financeMediaIds],
    queryFn: () => getMarketplaceDirectoryDriverMedia(projectId, financeMediaIds),
    enabled: canPayments && permissions.includes("marketplace.view") &&
      (tab === "billeteras" || tab === "recargas") && financeMediaIds.length > 0,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
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
            className={cn("relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}
          >
            <header className="relative mb-3 flex flex-wrap items-center justify-between gap-2 sm:items-center sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 sm:items-start sm:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border-default bg-surface-2 text-primary">
                  <Eye className="h-5 w-5" />
                </span>
                <div>
                  <p className="hidden text-[10px] font-semibold uppercase tracking-wide text-text-secondary sm:block">Centro de control · Indicadores</p>
                  <h2 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">Pulso operativo</h2>
                  <p className="mt-0.5 hidden text-xs text-text-secondary sm:block">Actividad, equipo y gestión del Marketplace.</p>
                </div>
              </div>
              <span role="status" aria-label={overview.isError ? "Error de actualización" : overview.isFetching ? "Actualizando datos" : "Datos actualizados cada 30 segundos"} className={cn("shrink-0 rounded-[var(--radius-control)] border px-2 py-1.5 text-xs text-text-secondary", premiumControlSurface)}>
                <span className="sm:hidden">{overview.isError ? "Error" : overview.isFetching ? "Actualizando" : "Cada 30 s"}</span>
                <span className="hidden sm:inline">{overview.isError ? "Error de actualización" : overview.isFetching ? "Actualizando..." : "Datos cada 30 s"}</span>
              </span>
            </header>
            <MarketplacePulseDecisions
              projectId={projectId}
              overview={overview.data}
              overviewError={overview.isError}
              canPayments={canPayments}
              canManagePayments={canManagePayments}
              canAnalytics={permissions.includes("analytics.view")}
              canCustomers={canCustomers}
            />
            <details className="group mt-3 border-t border-border-default pt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border-default bg-surface-2/65 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>Indicadores generales del registro y promociones</span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4 mt-3">
              {([
                { label: "Conductores", detail: "Perfiles registrados", eyebrow: "Equipo", value: overview.data?.driversTotal, icon: Users, module: "resumen" },
                { label: "Activos", detail: "Perfiles habilitados", eyebrow: "Operación", value: overview.data?.driversActive, icon: Users, semanticState: "success" },
                { label: "En promoción", detail: "Beneficio vigente", eyebrow: "Beneficio", value: overview.data?.driversTrialActive, icon: BriefcaseBusiness, module: "comercial" },
                { label: "Post-promoción activos", detail: "Activos tras el beneficio", eyebrow: "Comercial", value: overview.data?.driversPostTrialActive, icon: WalletCards, semanticState: "warning" },
                { label: "Trabajos publicados", detail: "Solicitudes publicadas", eyebrow: "Marketplace", value: overview.data?.jobsPublished, icon: BriefcaseBusiness, semanticState: "success" },
                { label: "Trabajos activos", detail: "Operaciones en desarrollo", eyebrow: "Actividad", value: overview.data?.jobsActive, icon: BriefcaseBusiness, module: "resumen" },
                { label: "Incidencias abiertas", detail: "Pendientes de resolver", eyebrow: "Atención", value: overview.data?.jobsIncidentOpen, icon: AlertTriangle, semanticState: "danger" },
              ] as const).map(({ label: metricLabel, detail, eyebrow, value, icon, ...accent }) => (
                <MetricCard
                  key={metricLabel}
                  density="compact"
                  appearance="premium"
                  label={metricLabel}
                  value={overview.isError ? "—" : Number(value ?? 0)}
                  description={detail}
                  comparison={eyebrow}
                  icon={icon}
                  isLoading={overview.isLoading}
                  className={!showAllPulseMetrics && ["En promoción", "Post-promoción activos", "Trabajos publicados"].includes(metricLabel) ? "hidden sm:block" : undefined}
                  {...accent}
                />
              ))}

              {!overview.isLoading && overview.data?.pendingTopups !== null ? (
                <MetricCard
                  density="compact"
                  appearance="premium"
                  label="Recargas pendientes"
                  value={overview.isError ? "—" : (overview.data?.pendingTopups ?? 0)}
                  description="En revisión financiera"
                  comparison="Finanzas"
                  icon={WalletCards}
                  semanticState="warning"
                  className={!showAllPulseMetrics && !(Number(overview.data?.pendingTopups ?? 0) > 0) ? "hidden sm:block" : undefined}
                />
              ) : null}
            </div>
            <button type="button" aria-expanded={showAllPulseMetrics} onClick={() => setShowAllPulseMetrics((open) => !open)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border-default bg-surface-2 px-3 py-2 text-xs font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring sm:hidden">
              {showAllPulseMetrics ? "Mostrar indicadores principales" : "Ver todos los indicadores"}
              <ChevronDown className={`h-4 w-4 transition-transform ${showAllPulseMetrics ? "rotate-180" : ""}`} />
            </button>
            </details>
          </section>
          <MarketplaceFleetPulse projectId={projectId} enabled={tab === "resumen"} onOpenDriver={setDriver360Id} />
        </TabsContent>
        <TabsContent value="trabajos" className="mt-3">
          <div className="space-y-3 sm:space-y-4">
            <MarketplaceRadarReadinessCard projectId={projectId} />
            <section className={cn("relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>

              <div className={cn("relative mb-2 flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border p-3 sm:mb-3 sm:gap-3 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between", premiumHeaderSurface)}>
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
                  <FilterSelect appearance="premium" labelText="Estado" value={status} onChange={setStatus}>
                    <option value="">Todos los estados</option>
                    {statusOptions.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect appearance="premium" labelText="Servicio" value={service} onChange={setService}>
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
                <div className={cn("relative flex min-h-32 min-w-0 overflow-hidden rounded-[var(--radius-card)] border px-3 py-5 sm:px-4", premiumColumnHeaderSurface)}>

                  <div className="relative m-auto flex flex-col items-center text-center">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border bg-surface-1 text-[var(--semantic-success)]", premiumControlSurface)}>
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
                          className="relative flex min-h-11 w-full min-w-0 flex-col gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:flex-row lg:items-center lg:justify-between"
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
                                <div className={cn("rounded-xl border p-3", premiumColumnHeaderSurface)}>
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

                                {canManageMarketplace && !job.isTest && !job.driverUserId && job.status === "published" ? (
                                  <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs font-medium text-foreground">Compartir este servicio con conductores</p>
                                    <div className="w-full sm:w-auto sm:min-w-[200px]">
                                      <MarketplaceServiceShareButton key={job.jobId} projectId={projectId} jobId={job.jobId} />
                                    </div>
                                  </div>
                                ) : null}

                                {canManageMarketplace && permissions.includes("customers.view") && !job.isTest && job.status === "cancelled_by_driver" ? (
                                  <MarketplaceRecoverServiceButton key={job.jobId} projectId={projectId} jobId={job.jobId} onRecovered={setJobId} />
                                ) : null}

                                <JobNotificationReach projectId={projectId} jobId={job.jobId} compact />

                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  <div className={cn("rounded-xl border p-3", premiumColumnHeaderSurface)}>
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

                                  <div className={cn("rounded-xl border p-3", premiumColumnHeaderSurface)}>
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
                                <aside aria-label="Programación y acciones de la carrera" className={cn("mt-2 flex min-w-0 flex-col gap-2.5 rounded-xl border p-2.5 sm:flex-row sm:items-center sm:justify-between", premiumColumnHeaderSurface)}>
                                  <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
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
  
                                  <div className="grid w-full min-w-0 gap-2 sm:w-[220px] sm:shrink-0">
                                    <Button
                                      className="w-full justify-center border-emerald-500/25 bg-emerald-500/[0.07] text-[var(--semantic-success)] hover:bg-emerald-500/[0.12] max-sm:min-h-11"
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
                                        className="h-auto min-h-11 w-full whitespace-normal px-2 py-2 text-center text-xs leading-snug"
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
                                        className="w-full max-sm:min-h-11"
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
                                        className="w-full max-sm:min-h-11"
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

                              <div className="w-full min-w-0 shrink-0 lg:w-[360px] xl:w-[420px]">
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
                isVisible={tab === "mapa"}
                canViewCustomers={canCustomers}
                canManageMarketplace={canManageMarketplace}
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
              drivers.isLoading || drivers.hasNextPage || verificationFilterLoading
                ? "Consultando conductores…"
                : verificationFilterUnavailable ? "No se pudo confirmar la verificación del directorio"
                : `${filteredDriverRows.length} de ${driverRows.length} conductores coinciden con la búsqueda`
            }
            icon={Users}
            tone="cyan"
            backgroundImage="/admin-premium/drivers.svg"
          >
            <div className={cn("mb-3 min-w-0 space-y-2 rounded-[var(--radius-card)] border p-3", premiumHeaderSurface)}>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
                <span className="sr-only">Buscar conductor por nombre o número de celular</span>
                <Input
                  value={driverSearch}
                  onChange={(event) => setDriverSearch(event.target.value)}
                  placeholder="Buscar por nombre o número de celular"
                  autoComplete="off"
                  className={cn("h-11 min-w-0 rounded-[var(--radius-control)] bg-surface-1 pl-9 text-sm sm:h-10", premiumControlSurface)}
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <FilterSelect appearance="premium" labelText="Estado del perfil" value={driverStatusFilter} onChange={setDriverStatusFilter}>
                  <option value="">Todos los estados</option>
                  <option value="active">Activos</option>
                  <option value="incomplete">Incompletos</option>
                  <option value="suspended">Suspendidos</option>
                </FilterSelect>
                <FilterSelect appearance="premium" labelText="Disponibilidad" value={driverAvailabilityFilter} onChange={setDriverAvailabilityFilter}>
                  <option value="">Todos</option>
                  <option value="available">Disponibles</option>
                  <option value="unavailable">No disponibles</option>
                </FilterSelect>
                <FilterSelect appearance="premium" labelText="Vehículo" value={driverCategoryFilter} onChange={setDriverCategoryFilter}>
                  <option value="">Todos los vehículos</option>
                  {driverCategories.map((category) => (
                    <option key={category} value={category}>{label(category)}</option>
                  ))}
                </FilterSelect>
                <FilterSelect appearance="premium" labelText="Verificación" value={driverVerificationFilter} onChange={setDriverVerificationFilter}>
                  <option value="">Todos</option>
                  <option value="verified">Verificados{verifiedDriverCount !== null ? ` (${verifiedDriverCount})` : ""}</option>
                  <option value="pending">Solicitan verificación{pendingDriverCount !== null ? ` (${pendingDriverCount})` : ""}</option>
                  <option value="unverified">No verificados{verifiedDriverCount !== null ? ` (${driverRows.length - verifiedDriverCount})` : ""}</option>
                </FilterSelect>
                <FilterSelect appearance="premium" labelText="Inscripción" value={driverPeriodFilter} onChange={setDriverPeriodFilter}>
                  <option value="">Todas las fechas</option>
                  <option value="today">Hoy (Cuba)</option>
                  <option value="7">Últimos 7 días</option>
                  <option value="30">Últimos 30 días</option>
                </FilterSelect>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span aria-live="polite">
                  {drivers.isLoading || drivers.hasNextPage || verificationFilterLoading ? "Cargando directorio completo…" :
                    verificationFilterUnavailable ? "Verificación no disponible" :
                    `${filteredDriverRows.length} coincidencias de ${driverRows.length} conductores registrados`}
                </span>
                {driverFiltersActive ? (
                  <Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" onClick={() => {
                    setDriverSearch("");
                    setDriverStatusFilter("");
                    setDriverAvailabilityFilter("");
                    setDriverCategoryFilter("");
                    setDriverPeriodFilter("");
                    setDriverVerificationFilter("");
                  }}>Limpiar filtros</Button>
                ) : null}
              </div>
            </div>
            {driverMedia.isError ? (
              <div role="alert" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
                <span>No se pudieron cargar las fotos de los conductores. Los perfiles y sus archivos siguen guardados.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void driverMedia.refetch()}>
                  Reintentar fotos
                </Button>
              </div>
            ) : null}
            {drivers.isError ? (
              <EmptyMarketplaceState appearance="premium" title="No se pudo cargar el directorio"
                description="Reintenta la consulta antes de buscar conductores." icon={Users} />
            ) : drivers.isLoading || drivers.hasNextPage || verificationFilterLoading ? (
              <LoadingState />
            ) : verificationFilterUnavailable ? (
              <div role="alert" className={cn("rounded-xl border p-4 text-sm", premiumSurface)}>
                <p>No se pudo confirmar la verificación de todos los conductores. No se mostrarán resultados incompletos.</p>
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { void driverVerifications.refetch(); if (canManageMarketplace) void pendingVerifications.refetch(); }}>Reintentar verificación</Button>
              </div>
            ) : !driverRows.length ? (
              <EmptyMarketplaceState appearance="premium"
                title="No hay conductores"
                description="Todavía no existen conductores registrados en Marketplace."
                icon={Users}
              />
            ) : !filteredDriverRows.length ? (
              <EmptyMarketplaceState appearance="premium" title="No hay coincidencias"
                description="Prueba otro nombre, número o combinación de filtros." icon={Search} />
            ) : (
              <>
                <div className="space-y-2">
                  {visibleDriverRows.map((item) => (
                    <article
                      key={item.userId}
                      className={cn("group relative min-w-0 overflow-hidden rounded-[var(--radius-compact)] border px-3 py-2 transition-colors hover:border-primary/40", premiumSurface, "shadow-none")}
                      data-driver-row="compact"
                    >
                      <button
                        type="button"
                        className="absolute inset-0 z-10 cursor-pointer rounded-[var(--radius-compact)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        onClick={() => setDriver360Id(item.userId)}
                        aria-label={`Abrir ficha 360 de ${item.displayName}${driverVerifications.data?.[item.userId]?.verified === true ? ", conductor verificado" : ""}`}
                      />

                      <div className="pointer-events-none relative grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_7rem] xl:gap-3">
                        <div className="col-span-2 min-w-0 xl:col-span-1">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <DriverDirectoryPortrait
                              name={item.displayName}
                              url={driverMedia.data?.[item.userId]?.avatarUrl ?? null}
                              googleUrl={driverMedia.data?.[item.userId]?.googleAvatarUrl ?? null}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <h4 className="min-w-0 break-words text-sm font-semibold leading-snug text-foreground">
                                {item.displayName}
                              </h4>
                              {driverVerifications.data?.[item.userId]?.verified === true && <DriverVerifiedBadge compact />}

                              <div className="flex min-w-0 flex-wrap items-center gap-1">
                                <StatusBadge status={item.status} compact />

                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight ${
                                    item.isAvailable
                                      ? "border-emerald-500/25 bg-emerald-500/[0.09] text-emerald-300"
                                      : "border-border/70 bg-muted/35 text-muted-foreground"
                                  }`}
                                >
                                  {item.isAvailable ? "Disponible" : "No disponible"}
                                </span>
                              </div>
                              </div>
                              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-text-secondary">
                                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                                Inscripción: {dateOfRegistration(item.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <p className="text-[11px] font-medium leading-tight text-text-secondary">
                            WhatsApp
                          </p>

                          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground sm:text-sm">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            <span className="min-w-0 break-words">{item.phone ?? "Sin WhatsApp"}</span>
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="text-[11px] font-medium leading-tight text-text-secondary">
                            Vehículo
                          </p>

                          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground sm:text-sm">
                            <span className="relative flex h-7 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-border-default bg-surface-2 text-primary">
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
                            <span className="min-w-0 break-words">{item.vehicleName ?? "Sin vehículo"}</span>
                          </p>
                        </div>

                        <div className="pointer-events-none relative z-20 col-span-2 flex min-w-0 items-center justify-between gap-2 xl:col-span-1 xl:justify-end">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary xl:hidden">Ver ficha 360 <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
                          {driverWhatsAppLinks(item.phone, welcomeDrivers ? driverWelcomeMessage(item.displayName) : undefined) ? (
                            <AdminWhatsAppOpenChooser
                              links={driverWhatsAppLinks(item.phone, welcomeDrivers ? driverWelcomeMessage(item.displayName) : undefined)!}
                              driverName={item.displayName}
                              inviteToGroup={false}
                              onChooseApplication={welcomeDrivers ? () => { void copyDriverWelcome(driverWelcomeMessage(item.displayName)); } : undefined}
                              buttonClassName="pointer-events-auto min-h-11 inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] px-2.5 text-xs font-semibold text-[var(--semantic-success-foreground)] shadow-none xl:min-h-8"
                            />
                          ) : <ChevronRight className="hidden h-4 w-4 shrink-0 text-text-secondary xl:block" aria-hidden="true" />}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {visibleDriverRows.length < filteredDriverRows.length ? (
                  <div className="mt-4 flex justify-center">
                    <Button variant="outline" className="min-h-11 w-full sm:w-auto"
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
            <section aria-label="Clientes" data-nav-tone="usuarios" className="marketplace-record-workspace min-w-0 space-y-2.5">
              <div className={cn("marketplace-record-toolbar rounded-xl border p-2.5", premiumSurface)}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <RecordSearch value={customerSearchInput} onChange={setCustomerSearchInput} placeholder="Buscar nombre o WhatsApp" labelText="Buscar clientes" />
                  <FilterSelect appearance="premium" labelText="Ordenar" value={customerSort} onChange={(value) => setCustomerSort(value === "recent" ? "recent" : "points_desc")}>
                    <option value="points_desc">Más puntos</option>
                    <option value="recent">Más recientes</option>
                  </FilterSelect>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
                  <span aria-live="polite">{customers.isLoading ? "Consultando clientes…" : `${customerRows.length} clientes cargados`}</span>
                  {customerSearchInput || customerSort !== "points_desc" ? <Button variant="ghost" size="sm" onClick={() => { setCustomerSearchInput(""); setCustomerSort("points_desc"); }}>Limpiar filtros</Button> : null}
                </div>
              </div>
              {customers.isError ? <RecordLoadError onRetry={() => void customers.refetch()} /> : null}
              {customers.isLoading ? <LoadingState /> : !customerRows.length ? (
                !customers.isError ? <EmptyMarketplaceState appearance="premium" title={customerSearch ? "No encontramos clientes" : "No hay clientes"} description={customerSearch ? "Prueba con otro nombre o número de WhatsApp." : "Todavía no existen clientes registrados en Marketplace."} icon={UserRound} /> : null
              ) : (
                <div className="space-y-2" aria-label="Directorio de clientes">
                  {customerRows.map((customer) => (
                    <button key={customer.customerId} type="button" onClick={() => setCustomerId(customer.customerId)}
                      aria-label={`Abrir ficha 360 de ${customer.displayName}`}
                      className={cn("marketplace-record marketplace-customer-row w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", premiumSurface, "shadow-none")}
                      data-marketplace-record="customer">
                      <RecordIdentity icon={UserRound} name={customer.displayName}>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="inline-flex min-w-0 items-center gap-1 break-words"><Phone className="h-3.5 w-3.5 shrink-0" />{customer.whatsappPhone || "Sin teléfono registrado"}</span>
                          <span className="inline-flex min-w-0 items-center gap-1" title="Fecha de registro (Cuba)"><CalendarDays className="h-3.5 w-3.5 shrink-0" /><span><span className="sr-only">Registrado: </span><time dateTime={customer.createdAt}>{formatCustomerDateTime(customer.createdAt)}</time></span></span>
                        </div>
                      </RecordIdentity>
                      <div className="marketplace-record-metrics grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                        <RecordMetric labelText="Puntos" value={`${customer.points.toLocaleString("es")} pt`} tone="accent" />
                        <RecordMetric labelText="Km" value={customer.distanceKm.toLocaleString("es", { maximumFractionDigits: 1 })} />
                        <RecordMetric labelText="Trabajos" value={customer.jobsTotal} />
                        <RecordMetric labelText="Activos / liquidados" value={`${customer.jobsActive} / ${customer.jobsSettled}`} />
                      </div>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-text-secondary">Última carrera</p>
                          <p className="break-words text-xs font-medium text-foreground">{customer.lastJobAt ? <time dateTime={customer.lastJobAt}>{formatCustomerDateTime(customer.lastJobAt)}</time> : "Sin actividad"}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <PaginationButton query={customers} />
            </section>
          </TabsContent>
        ) : null}

        {canPayments ? (
          <>
          <TabsContent value="billeteras" className="mt-3">
            <section aria-label="Billeteras" data-nav-tone="finanzas" className="marketplace-record-workspace min-w-0 space-y-2.5">
              <div className={cn("marketplace-record-toolbar marketplace-wallet-toolbar relative isolate overflow-hidden rounded-[var(--radius-card)] border p-3", premiumHeaderSurface)}>
                <WalletCards aria-hidden="true" className="pointer-events-none absolute marketplace-finance-watermark" />
                <div className="marketplace-wallet-toolbar-top relative z-10 grid min-w-0 gap-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border-default bg-surface-3 text-[var(--nav-accent,var(--primary))]">
                      <Wallet className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold leading-snug text-foreground sm:text-lg">Billeteras</h2>
                      <p className="text-xs text-text-secondary">Saldos disponibles, reservas y depósitos</p>
                    </div>
                  </div>
                  <div className="marketplace-wallet-search min-w-0">
                    <RecordSearch value={walletSearch} onChange={setWalletSearch} placeholder="Buscar conductor o teléfono" labelText="Buscar todas las billeteras" />
                  </div>
                </div>
                <div className="relative mt-2.5 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Filtrar billeteras">
                    {([
                      ["has_available", "Con saldo"],
                      ["no_available", "Sin disponible"],
                      ["reserved", "Con reservas"],
                      ["", "Todas"],
                      ["deposit_pending", "Depósito inicial pendiente"],
                      ["deposit_confirmed", "Depósito inicial confirmado"],
                    ] as const).map(([value, name]) => (
                      <Button
                        key={value || "all"}
                        size="sm"
                        className="marketplace-record-filter min-h-11 sm:min-h-8"
                        data-finance-tone={value === "deposit_pending" || value === "no_available" ? "warning" : value === "deposit_confirmed" || value === "has_available" ? "success" : "neutral"}
                        variant={walletFilter === value ? "default" : "ghost"}
                        aria-pressed={walletFilter === value}
                        onClick={() => setWalletFilter(value)}
                      >
                        {name} <span className="ml-1 tabular-nums opacity-80">{wallets.isSuccess&&!wallets.isError ? walletCounts[value || "all"] : "—"}</span>
                      </Button>
                    ))}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span aria-live="polite">{wallets.isSuccess&&!wallets.isError ? filteredWalletRows.length+" de "+walletRows.length+" billeteras" : "Consultando inventario"} · Mayor saldo primero</span>
                    {walletSearch || walletFilter ? <Button variant="ghost" size="sm" onClick={() => { setWalletSearch(""); setWalletFilter("has_available"); }}>Limpiar filtros</Button> : null}
                  </div>
                </div>
              </div>
              {wallets.isSuccess&&!wallets.isError && <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Resumen financiero de todas las billeteras">
                <MetricCard density="compact" appearance="premium" label="Real disponible" value={walletCurrencies.length===1?formatWalletAmount(walletRows.reduce((n,w)=>n+w.realAvailableBalance,0),walletCurrencies[0]):"—"} icon={Wallet}/>
                <MetricCard density="compact" appearance="premium" label="Promocional disponible" value={walletCurrencies.length===1?formatWalletAmount(walletRows.reduce((n,w)=>n+w.promotionalAvailableBalance,0),walletCurrencies[0]):"—"} icon={WalletCards}/>
                <MetricCard density="compact" appearance="premium" label="Con saldo disponible" value={walletCounts.has_available} icon={Users}/>
                <MetricCard density="compact" appearance="premium" label="Reservado" value={walletCurrencies.length===1?formatWalletAmount(walletRows.reduce((n,w)=>n+w.reservedBalance,0),walletCurrencies[0]):"—"} icon={Clock3}/>
              </div>}
              {wallets.isError ? <RecordLoadError onRetry={() => void wallets.refetch()} /> : null}
              {wallets.isLoading ? <LoadingState /> : wallets.isError ? null : !filteredWalletRows.length ? (
                !wallets.isError ? <EmptyMarketplaceState appearance="premium" title={walletSearch || walletFilter ? "No hay billeteras con estos filtros" : "No hay billeteras"} description={walletSearch || walletFilter ? "No hay coincidencias en el inventario completo. Cambia el filtro o la búsqueda." : "No existen billeteras disponibles para mostrar."} icon={Wallet} /> : null
              ) : (
                <div className="space-y-2">
                  {sortedWalletRows.map((wallet) => {
                    const reserved = Number(wallet.realReservedBalance) + Number(wallet.promotionalReservedBalance);
                    return <article key={wallet.userId} className={cn("marketplace-record marketplace-finance-row marketplace-wallet-row", premiumSurface, "shadow-none")} data-marketplace-record="wallet" data-deposit-state={wallet.initialDepositConfirmed ? "confirmed" : "pending"}>
                      <div className="marketplace-wallet-summary">
                        <RecordIdentity icon={Wallet} name={wallet.driverDisplayName} portrait={<DriverDirectoryPortrait name={wallet.driverDisplayName} url={financeMedia.data?.[wallet.userId]?.avatarUrl ?? null} googleUrl={financeMedia.data?.[wallet.userId]?.googleAvatarUrl ?? null}/>}>
                          <p className="break-words">{wallet.driverPhone || "Sin teléfono registrado"}</p>
                          <span className={cn("marketplace-deposit-state", wallet.initialDepositConfirmed ? "marketplace-deposit-ok" : "marketplace-deposit-pending")}>{wallet.initialDepositConfirmed ? "Depósito inicial confirmado" : "Depósito inicial pendiente"}</span>
                        </RecordIdentity>
                        <div className="marketplace-record-metrics marketplace-wallet-metrics grid min-w-0">
                          <RecordMetric labelText="Disponible" value={formatWalletAmount(wallet.availableBalance, wallet.currency)} tone="available" />
                          <RecordMetric labelText="Reservado" value={formatWalletAmount(reserved, wallet.currency)} tone="reserved" />
                          <RecordMetric labelText="Saldo total" value={formatWalletAmount(wallet.totalBalance, wallet.currency)} />
                        </div>
                      </div>
                      <details className="marketplace-record-details group">
                        <summary className="marketplace-record-summary flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                          <span className="sr-only">Ver detalles de la billetera</span>
                          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <div className="marketplace-record-detail-grid grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <RecordMetric labelText="Saldo real" value={formatWalletAmount(wallet.realBalance, wallet.currency)} />
                          <RecordMetric labelText="Saldo promocional" value={formatWalletAmount(wallet.promotionalBalance, wallet.currency)} />
                          <RecordMetric labelText="Promocional disponible" value={formatWalletAmount(wallet.promotionalAvailableBalance, wallet.currency)} />
                          <RecordMetric labelText="Real reservado" value={formatWalletAmount(wallet.realReservedBalance, wallet.currency)} />
                          <RecordMetric labelText="Promocional reservado" value={formatWalletAmount(wallet.promotionalReservedBalance, wallet.currency)} />
                          <RecordMetric labelText="Última actualización" value={formatDate(wallet.updatedAt)} />
                        </div>
                        {canManagePayments && <WalletFinancialHistory projectId={projectId} userId={wallet.userId} currency={wallet.currency}/>}
                      </details>
                    </article>;
                  })}
                </div>
              )}

            </section>
          </TabsContent>
          <TabsContent value="recargas">
            <section aria-label="Recargas" data-nav-tone="recargas" className="marketplace-record-workspace min-w-0 space-y-2.5">
              {canManagePayments ? (
                <MarketplaceTopupPaymentDestination
                  projectId={projectId}
                  destination={paymentDestination.data}
                  isLoading={paymentDestination.isLoading}
                  isError={paymentDestination.isError}
                  onRetry={() => void paymentDestination.refetch()}
                />
              ) : null}
              <div className={cn("marketplace-record-toolbar marketplace-topup-toolbar relative overflow-hidden rounded-[var(--radius-card)] border p-3", premiumHeaderSurface)}>
                <Banknote aria-hidden="true" className="pointer-events-none absolute marketplace-finance-watermark" />
                <div className="marketplace-topup-toolbar-top relative grid min-w-0 gap-2.5">
                  <div className="marketplace-topup-heading flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border-default bg-surface-3 text-[var(--nav-accent,var(--primary))]"><Banknote className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold leading-snug text-foreground sm:text-lg">Recargas</h2>
                      <p className="text-xs text-text-secondary">Solicitudes, verificaciones y comprobantes</p>
                    </div>
                  </div>
                  <div className="marketplace-topup-search min-w-0">
                    <RecordSearch value={topupSearch} onChange={setTopupSearch} placeholder="Buscar conductor, teléfono o referencia" labelText="Buscar recargas cargadas" />
                  </div>
                  {canManagePayments ? <Button className="marketplace-topup-create min-h-11 shrink-0" onClick={() => { setError(null); setNewTopup(true); }}><Plus className="mr-2 h-4 w-4" />Registrar recarga</Button> : null}
                </div>
                <div className="relative mt-2.5 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Filtrar por estado de recarga">
                    {[["", "Todas"], ["requested", "Pendientes"], ["confirmed", "Confirmadas"], ["reconciled", "Conciliadas"], ["reversed", "Anuladas"], ["rejected", "Rechazadas"]].map(([value, name]) => (
                      <Button key={value || "all"} size="sm" className="marketplace-record-filter min-h-11 sm:min-h-8" data-finance-tone={value === "requested" ? "warning" : value === "rejected" ? "danger" : value === "confirmed" || value === "reconciled" ? "success" : "neutral"} variant={topupStatus === value ? "default" : "ghost"} aria-pressed={topupStatus === value} onClick={() => setTopupStatus(value)}>{name}</Button>
                    ))}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span aria-live="polite">{filteredTopupRows.length} de {topupRows.length} recargas cargadas{topups.hasNextPage ? " · Cargar más para ampliar la búsqueda" : ""}</span>
                    {topupSearch || topupStatus ? <Button variant="ghost" size="sm" onClick={() => { setTopupSearch(""); setTopupStatus(""); }}>Limpiar filtros</Button> : null}
                  </div>
                </div>
              </div>
              {topups.isError ? <RecordLoadError onRetry={() => void topups.refetch()} /> : null}
              {topups.isLoading ? <LoadingState /> : !filteredTopupRows.length ? (
                !topups.isError ? <EmptyMarketplaceState appearance="premium" title={topupSearch || topupStatus ? "No hay recargas con estos filtros" : "No hay recargas"} description={topupSearch ? "La búsqueda se aplica a los registros cargados. Puedes cargar más." : "Cuando se registre una recarga aparecerá aquí."} icon={Banknote} /> : null
              ) : (
                <div className="space-y-2" data-topup-record-list>
                  {filteredTopupRows.map((item) => {
                    const receipt = receiptsByTopup.get(item.topupId);
                    const creditNote = creditNotesByTopup.get(item.topupId);
                    const isTopupReversed = Boolean(creditNote);
                    const canNotifyTopup = !isTopupReversed && ["confirmed", "reconciled", "rejected"].includes(item.status);
                    const account = paymentDestination.data;
                    const instructionLink = canManagePayments && item.status === "requested" && item.method === "transfer" &&
                      account?.cardNumber && account.paymentPhone
                      ? driverWhatsAppLinks(
                          item.driverPhone,
                          topupPaymentInstructionsMessage(item.driverDisplayName, formatAmount(item.amount, item.currency), account),
                        )
                      : null;
                    const notificationLink = canNotifyTopup
                      ? driverWhatsAppLinks(
                          item.driverPhone,
                          topupWhatsAppMessage(item, paymentMethodLabel(item.method), receipt?.documentNumber),
                        )
                      : null;
                    return <article key={item.topupId} className={cn("marketplace-record marketplace-finance-row marketplace-topup-row", premiumSurface, "shadow-none")} data-marketplace-record="topup" data-topup-status={isTopupReversed ? "reversed" : item.status}>
                      <div className="marketplace-topup-main">
                        <div className="marketplace-topup-summary">
                          <RecordIdentity icon={Banknote} name={item.driverDisplayName} portrait={<DriverDirectoryPortrait name={item.driverDisplayName} url={financeMedia.data?.[item.userId]?.avatarUrl ?? null} googleUrl={financeMedia.data?.[item.userId]?.googleAvatarUrl ?? null}/>}>
                            <p className="break-words">Solicitada: <time dateTime={item.requestedAt}>{formatDate(item.requestedAt)}</time></p>
                            <p className="break-words">{paymentMethodLabel(item.method)}</p>
                          </RecordIdentity>
                          <div className="marketplace-topup-phone min-w-0">
                            <span className="block text-xs text-text-secondary">Teléfono</span>
                            <p className="marketplace-topup-detail-value font-semibold text-foreground">{item.driverPhone || "Sin registrar"}</p>
                          </div>
                          <div className="marketplace-topup-reference min-w-0">
                            <span className="block text-xs text-text-secondary">Referencia</span>
                            <p className={cn("marketplace-topup-detail-value font-semibold", item.reference ? "text-foreground" : "text-text-secondary")}>
                              {item.reference || (item.method === "transfer" ? "Sin referencia" : "No aplica")}
                            </p>
                          </div>
                          <div className="marketplace-topup-amount">
                            <RecordMetric labelText="Importe" value={formatAmount(item.amount, item.currency)} tone="accent" />
                          </div>
                          <div className="marketplace-topup-status">
                            {isTopupReversed ? (
                              <span className="inline-flex rounded-full border border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--semantic-danger-foreground)]">
                                Anulada
                              </span>
                            ) : <StatusBadge status={item.status} />}
                          </div>
                        </div>
                        {canManagePayments && item.status === "requested" ? (
                          <div className="marketplace-topup-actions">
                            {item.method === "transfer" && (
                              instructionLink ? (
                                <AdminWhatsAppOpenChooser links={instructionLink}
                                  driverName={item.driverDisplayName} inviteToGroup={false}
                                  buttonLabel="Enviar datos de pago"
                                  buttonClassName="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] px-3 text-xs font-semibold text-[var(--semantic-success-foreground)]" />
                              ) : (
                                <p className="max-w-56 text-xs leading-snug text-text-secondary">
                                  {paymentDestination.isLoading ? "Cargando datos de pago…" : "Configura la tarjeta y el teléfono arriba, en Datos para recibir recargas, para enviar instrucciones."}
                                </p>
                              )
                            )}
                            <Button size="sm" className="marketplace-finance-action min-h-11" onClick={() => {
                              setError(null);
                              setTopup({ id: item.topupId, driver: item.driverDisplayName, method: item.method, confirmationKey: crypto.randomUUID() });
                              setReceivedPaymentReference(item.reference ?? "");
                              setVerifiedPaymentReceived(false);
                              setReason("");
                            }}>Gestionar recarga pendiente</Button>
                          </div>
                        ) : null}
                        {notificationLink ? (
                          <div className="marketplace-topup-actions marketplace-topup-actions--notification">
                            <AdminWhatsAppOpenChooser links={notificationLink}
                              driverName={item.driverDisplayName} inviteToGroup={false}
                              buttonLabel="Notificar por WhatsApp"
                              buttonClassName="marketplace-finance-action inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] px-3 text-xs font-semibold text-[var(--semantic-success-foreground)] shadow-none" />
                          </div>
                        ) : null}
                      </div>
                      <details className="marketplace-record-details group">
                        <summary className="marketplace-record-summary flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                          <span className="sr-only">Ver detalles de la recarga de {item.driverDisplayName}</span>
                          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <div className="marketplace-record-detail-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <RecordMetric labelText="Método" value={paymentMethodLabel(item.method)} />
                          {item.notes ? <RecordMetric labelText="Notas" value={item.notes} /> : null}
                          {item.rejectionReason ? <RecordMetric labelText="Motivo de rechazo" value={item.rejectionReason} tone="danger" /> : null}
                          {item.confirmedAt ? <RecordMetric labelText="Confirmada" value={<time dateTime={item.confirmedAt}>{formatDate(item.confirmedAt)}</time>} /> : null}
                          {item.rejectedAt ? <RecordMetric labelText="Rechazada" value={<time dateTime={item.rejectedAt}>{formatDate(item.rejectedAt)}</time>} /> : null}
                          {receipt ? <div className="min-w-0"><RecordMetric labelText="Comprobante original" value={receipt.documentNumber} tone={isTopupReversed ? undefined : "available"} /><p className="mt-0.5 text-xs text-text-secondary">Emitido: {formatDate(receipt.issuedAt)}</p></div> : null}
                          {creditNote ? <div className="min-w-0"><RecordMetric labelText="Nota de corrección" value={creditNote.documentNumber} tone="danger" /><p className="mt-0.5 text-xs text-text-secondary">Anulada: {formatDate(creditNote.issuedAt)}</p><p className="mt-1 text-xs text-text-secondary">El crédito de esta recarga se compensó; el comprobante original permanece por auditoría.</p></div> : null}
                        </div>
                        {canCorrectPayments && canManagePayments && ["confirmed", "reconciled"].includes(item.status) && !isTopupReversed && financialDocumentHistoryComplete ? (
                          <details className="marketplace-topup-correction group/correction mt-4 border-t border-border-default pt-3">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-2 px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                              <span className="inline-flex items-center gap-2">
                                <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
                                Correcciones administrativas
                              </span>
                              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open/correction:rotate-180 motion-reduce:transition-none" />
                            </summary>
                            <div className="relative mt-3 overflow-hidden rounded-xl border border-[var(--semantic-danger-border)] bg-surface-2 p-3 sm:p-4">
                              <AlertTriangle aria-hidden="true" className="pointer-events-none absolute -bottom-3 right-3 h-20 w-20 text-[var(--semantic-danger-foreground)] opacity-[0.05]" />
                              <div className="relative space-y-1">
                                <p className="text-sm font-semibold text-foreground">Anulación excepcional</p>
                                <p className="max-w-2xl text-xs leading-relaxed text-text-secondary">
                                  Solo para recargas confirmadas por error. Compensa el saldo acreditado y genera una nota de corrección sin eliminar el comprobante original. No se utiliza para solicitudes pendientes.
                                </p>
                              </div>
                              <div className="relative mt-3 flex justify-end">
                                <Button type="button" variant="outline" size="sm"
                                  className="min-h-11 w-full border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)] text-[var(--semantic-danger-foreground)] hover:bg-[var(--semantic-danger-surface)] sm:w-auto"
                                  onClick={() => {
                                    setTopupReversal({
                                      id: item.topupId,
                                      driver: item.driverDisplayName,
                                      amount: item.amount,
                                      currency: item.currency,
                                      documentNumber: receipt?.documentNumber ?? null,
                                      idempotencyKey: crypto.randomUUID(),
                                    });
                                    setTopupReversalReason("");
                                    setTopupReversalAcknowledged(false);
                                  }}>
                                  <AlertTriangle aria-hidden="true" className="mr-2 h-4 w-4" />
                                  Anular recarga
                                </Button>
                              </div>
                            </div>
                          </details>
                        ) : null}
                      </details>
                    </article>;
                  })}
                </div>
              )}
              <PaginationButton query={topups} />
            </section>
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
              <div className="flex flex-wrap gap-1 rounded-xl border border-border/70 bg-background/50 p-1 admin-graphite-inset">
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
              <EmptyMarketplaceState appearance="premium"
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
        open={welcomeCopyFallback !== null}
        onOpenChange={(open) => { if (!open) setWelcomeCopyFallback(null); }}
      >
        <DialogContent className={cn("max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto p-4", premiumSurface)}>
          <DialogHeader>
            <DialogTitle>Copiar bienvenida</DialogTitle>
            <DialogDescription>Se ha solicitado abrir la aplicación de WhatsApp. Si el mensaje no aparece y el navegador bloqueó la copia automática, selecciona el texto y cópialo para pegarlo en la conversación.</DialogDescription>
          </DialogHeader>
          <Textarea
            readOnly
            aria-label="Mensaje de bienvenida a la Agencia TukTuk"
            value={welcomeCopyFallback ?? ""}
            onFocus={(event) => event.currentTarget.select()}
            className={cn("min-h-48 min-w-0 resize-y bg-surface-1 text-sm", premiumControlSurface)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setWelcomeCopyFallback(null)}>Cerrar</Button>
            <Button className="min-h-11" onClick={async () => {
              if (welcomeCopyFallback === null) return;
              try {
                await navigator.clipboard.writeText(welcomeCopyFallback);
                setWelcomeCopyFallback(null);
                toast.success("Bienvenida copiada. Pégala en WhatsApp.");
              } catch {
                toast.error("Selecciona el mensaje y cópialo manualmente.");
              }
            }}>Copiar mensaje</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(driver360Id)}
        onOpenChange={(open) => {
          if (!open) {
            setDriver360Id(null);
            if (typeof alertDriverId === "string") dismissAlertDeepLink();
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-y-auto border-cyan-500/20 bg-background/95 p-0 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-w-6xl admin-graphite-dialog">
          <DialogHeader className="sr-only">
            <DialogTitle>Ficha 360 del conductor</DialogTitle>
            <DialogDescription>Expediente completo del conductor</DialogDescription>
          </DialogHeader>

          <div className="min-w-0 p-3 pt-12 sm:p-4 sm:pt-12">
            {selectedDriverMedia.isError ? (
              <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-xs text-amber-200">
                <span>No se pudo recuperar la fotografía del conductor.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void selectedDriverMedia.refetch()}>
                  Reintentar foto
                </Button>
              </div>
            ) : null}
            {driver360.isLoading ? (
              <LoadingState />
            ) : driver360.data ? (
              <MarketplaceDriver360Record
                key={driver360Id!}
                projectId={projectId}
                driverUserId={driver360Id!}
                detail={driver360.data}
                financial={driverFinancial360.data ?? null}
                canSeeFinancial={canManagePayments}
                canManageDriver={canManageMarketplace}
                financialLoading={driverFinancial360.isLoading}
                media={resolvedDriver360Media}
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-y-auto border-border-default bg-background/95 p-0 sm:max-w-6xl admin-graphite-dialog">
          <DialogHeader className="sr-only">
            <DialogTitle>Ficha 360 del cliente</DialogTitle>
            <DialogDescription>Actividad, consumo, modalidades e historial de servicios.</DialogDescription>
          </DialogHeader>
          <div className="min-w-0 p-3 pt-12 sm:p-4 sm:pt-12">
            {customer360.isLoading ? (
              <LoadingState />
            ) : customer360.data ? (
              <Customer360Detail
                detail={customer360.data}
                history={rows(customerHistory)}
                hasMore={Boolean(customerHistory.hasNextPage)}
                loadingMore={customerHistory.isFetchingNextPage}
                onLoadMore={() => customerHistory.fetchNextPage()}
                onOpenJob={permissions.includes("marketplace.view") ? (id) => { setCustomerId(null); setJobDetailInitialTab("overview"); setJobId(id); } : undefined}
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-y-auto border-cyan-500/20 bg-background/95 p-0 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-w-6xl admin-graphite-dialog">
          <DialogHeader className="sr-only">
            <DialogTitle>360 de carrera</DialogTitle>
            <DialogDescription>
              Expediente integral: ruta, participantes, radar, finanzas y trazabilidad.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 p-3 pt-12 sm:p-4 sm:pt-12">
            {detail.isLoading ? (
              <LoadingState />
            ) : detail.data ? (
              <JobDetail key={`${jobId}:${jobDetailInitialTab}`} detail={detail.data} projectId={projectId} jobId={jobId!} initialTab={jobDetailInitialTab} canShare={canManageMarketplace && canCustomers} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/45 p-5 text-sm text-muted-foreground">
                No se encontro el trabajo.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(driver)} onOpenChange={() => setDriver(null)}>
        <DialogContent className="admin-graphite-dialog">
          <DialogHeader>
            <DialogTitle>
              {driver?.suspended ? "Suspender conductor" : "Reactivar conductor"}
            </DialogTitle>
            <DialogDescription>
              {driver?.suspended
                ? "La suspensión bloqueará TukTuk Conductor en APK y WebApp actualizadas, y cerrará su sesión. Se conservan saldos e historial."
                : "El conductor podrá volver a iniciar sesión y recuperar su actividad operativa."}
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
        <DialogContent className="admin-graphite-dialog">
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
        <DialogContent className="admin-graphite-dialog">
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
        <DialogContent className="admin-graphite-dialog">
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
        <DialogContent className="admin-graphite-dialog">
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
        open={Boolean(topupReversal)}
        onOpenChange={(open) => {
          if (!open && !reverse.isPending) {
            setTopupReversal(null);
            setTopupReversalReason("");
            setTopupReversalAcknowledged(false);
          }
        }}
      >
        <DialogContent className="admin-graphite-dialog">
          <DialogHeader>
            <DialogTitle>Anular recarga confirmada</DialogTitle>
            <DialogDescription>
              Esta operación compensa el crédito acreditado y emite una nota de corrección.
              No elimina el historial ni crea una solicitud pendiente.
            </DialogDescription>
          </DialogHeader>
          {topupReversal ? (
            <div className="space-y-3">
              <div className={cn("rounded-xl border border-[var(--semantic-danger-border)] p-3", premiumHeaderSurface)}>
                <p className="text-sm font-semibold text-foreground">{topupReversal.driver}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-[var(--semantic-danger-foreground)]">{formatAmount(topupReversal.amount, topupReversal.currency)}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  {topupReversal.documentNumber ? `Comprobante original: ${topupReversal.documentNumber}` : "El comprobante original se conservará."}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Si el saldo ya fue utilizado o está reservado, el sistema bloqueará la anulación.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="topup-reversal-reason">Motivo de la anulación (obligatorio)</Label>
                <Textarea
                  id="topup-reversal-reason"
                  value={topupReversalReason}
                  onChange={(event) => setTopupReversalReason(event.target.value)}
                  placeholder="Ej.: solicitud creada por error y confirmada sin recibir pago real"
                  maxLength={1000}
                  disabled={reverse.isPending}
                />
                <p className="text-xs text-text-secondary">Entre 8 y 1000 caracteres. Quedará registrado en la nota de corrección.</p>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-primary"
                  checked={topupReversalAcknowledged}
                  disabled={reverse.isPending}
                  onChange={(event) => setTopupReversalAcknowledged(event.target.checked)}
                />
                <span>Confirmo que esta recarga debe anularse y que el saldo acreditado debe retirarse.</span>
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" disabled={reverse.isPending} onClick={() => {
                  setTopupReversal(null);
                  setTopupReversalReason("");
                  setTopupReversalAcknowledged(false);
                }}>Cancelar</Button>
                <Button type="button" variant="destructive"
                  disabled={reverse.isPending || !topupReversalAcknowledged || topupReversalReason.trim().length < 8 || topupReversalReason.trim().length > 1000}
                  onClick={() => reverse.mutate()}>
                  {reverse.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Anular y corregir saldo
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(topup)}
        onOpenChange={(open) => {
          if (!open) {
            setTopup(null);
            setReason("");
            setReceivedPaymentReference("");
            setVerifiedPaymentReceived(false);
            void invalidate("marketplace-topups", "marketplace-financial-documents");
          }
        }}
      >
        <DialogContent className="admin-graphite-dialog">
          <DialogHeader>
            <DialogTitle>Gestionar recarga de {topup?.driver}</DialogTitle>
            <DialogDescription>
              Elige una operación. Rechazar no acredita dinero; confirmar solo corresponde cuando el pago se ha recibido realmente.
            </DialogDescription>
          </DialogHeader>

          <section aria-labelledby="topup-confirm-heading" className="space-y-3 rounded-xl border border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] p-3 sm:p-4">
            <div className="space-y-1">
              <h3 id="topup-confirm-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--semantic-success-foreground)]">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                Confirmar pago recibido
              </h3>
              <p className="text-xs leading-relaxed text-text-secondary">
                Esta operación acredita la billetera y emite el comprobante. Úsala solo si se ha recibido el pago.
              </p>
            </div>
            {topup?.method === "transfer" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="topup-received-reference">Referencia real de la transferencia recibida</Label>
                  <Input
                    id="topup-received-reference"
                    value={receivedPaymentReference}
                    onChange={(event) => setReceivedPaymentReference(event.target.value)}
                    placeholder="Referencia bancaria del ingreso comprobado"
                    maxLength={160}
                    autoComplete="off"
                    disabled={reject.isPending || confirm.isPending}
                  />
                  <p className="text-xs text-text-secondary">
                    Este campo es solo para pagos recibidos; no escribas aquí motivos de rechazo.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary"
                    checked={verifiedPaymentReceived}
                    disabled={reject.isPending || confirm.isPending}
                    onChange={(event) => setVerifiedPaymentReceived(event.target.checked)}
                  />
                  <span>He comprobado que el ingreso se recibió realmente en la cuenta de la agencia.</span>
                </label>
              </>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto"
                disabled={confirm.isPending || reject.isPending || (topup?.method === "transfer" && (!receivedPaymentReference.trim() || !verifiedPaymentReceived))}
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar pago recibido
              </Button>
            </div>
          </section>

          <section aria-labelledby="topup-reject-heading" className="space-y-3 rounded-xl border border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)] p-3 sm:p-4">
            <div className="space-y-1">
              <h3 id="topup-reject-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--semantic-danger-foreground)]">
                <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                Rechazar solicitud
              </h3>
              <p className="text-xs leading-relaxed text-text-secondary">
                Cuando la recarga no procede, no se recibió dinero o se solicitó por error. No se acredita saldo.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topup-rejection-reason">Motivo del rechazo (obligatorio)</Label>
              <Textarea
                id="topup-rejection-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej.: No procede, solicitud por error o pago no recibido"
                aria-describedby="topup-rejection-help"
                maxLength={1000}
                disabled={reject.isPending || confirm.isPending}
                className="min-h-20 border-[var(--semantic-danger-border)] bg-surface-1 text-foreground"
              />
              <p id="topup-rejection-help" className="text-xs text-text-secondary">
                Escribe el motivo aquí (no en «Referencia»). No necesitas marcar la casilla del ingreso.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" size="sm" variant="outline"
                className="min-h-10 border-[var(--semantic-danger-border)] bg-surface-2 text-text-secondary"
                disabled={reject.isPending || confirm.isPending}
                onClick={() => {
                  setReason("No procede");
                  setVerifiedPaymentReceived(false);
                }}
              >
                Usar motivo: No procede
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11 w-full sm:w-auto"
                disabled={reject.isPending || confirm.isPending || !reason.trim()}
                onClick={() => reject.mutate()}
              >
                {reject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Rechazar solicitud
              </Button>
            </div>
          </section>
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
  const impacts = Array.isArray(analysis.data?.impacts) ? analysis.data.impacts : [];
  const total = impacts.length;
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

  // Cada punto representa un registro histórico de conductor impactado en esa etapa.
  // El ángulo es esquemático, NO expresa posición GPS ni candidatos sin aviso.
  const ringRadii = [31, 57, 83];
  const maxVisibleDots = [14, 24, 34];
  const radiusKeys = ["r1", "r2", "r3"] as const;
  const stages = [1, 2, 3].map((stage, index) => {
    const count = impacts.filter((impact) => impact.radius_stage === stage).length;
    const key = radiusKeys[index];
    const configuredKm = key ? analysis.data?.radar_settings?.[key] : null;
    const savedKm = impacts.find((impact) => impact.radius_stage === stage)?.radius_limit_km;
    const radiusKm = typeof savedKm === "number" && savedKm > 0
      ? savedKm : typeof configuredKm === "number" && configuredKm > 0 ? configuredKm : null;
    const visible = Math.min(count, maxVisibleDots[index] ?? 14);
    const ringRadius = ringRadii[index] ?? 31;
    return {
      stage,
      count,
      radiusKm,
      hiddenCount: count - visible,
      dots: Array.from({ length: visible }, (_, dot) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * (dot + 0.5)) / visible + index * 0.4;
        return {
          x: 100 + ringRadius * Math.cos(angle),
          y: 100 + ringRadius * Math.sin(angle),
        };
      }),
    };
  });
  const classified = stages.reduce((sum, stage) => sum + stage.count, 0);
  const withoutStage = total - classified;
  const visibleDots = stages.flatMap(({ stage, dots }) =>
    dots.map(({ x, y }, index) => ({ key: stage + "-" + index, x, y }))
  );
  const summary = stages.map(({ stage, count }) => "Rango " + stage + ": " + count).join("; ");
  const radarLabel = headline + (active
    ? ". " + total + " conductores registrados. " + summary
      + (withoutStage > 0 ? "; " + withoutStage + " sin etapa" : "")
      + ". Abrir recorrido por kilómetros."
    : ". Abrir análisis del radar.");

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={radarLabel}
      title={radarLabel}
      className={"group relative grid min-h-[222px] w-full min-w-0 grid-cols-1 items-center gap-3 overflow-hidden rounded-[18px] border px-3 py-3 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-cyan-300 sm:grid-cols-[minmax(166px,220px)_minmax(0,1fr)] lg:grid-cols-[minmax(148px,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(180px,1fr)_minmax(0,1fr)] " + tone}
    >
      <span aria-hidden="true" className={"pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full blur-3xl " + (active ? "bg-cyan-300/[0.10]" : "bg-slate-300/[0.025]")} />
      <span aria-hidden="true" className="relative mx-auto block aspect-square w-full max-w-[198px] shrink-0">
        {active ? (
          <span
            className="absolute inset-[7%] rounded-full motion-safe:animate-[spin_6s_linear_infinite]"
            style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 302deg, rgba(34,211,238,.24) 342deg, transparent 360deg)" }}
          />
        ) : null}
        <svg viewBox="0 0 200 200" className="relative h-full w-full" focusable="false">
          <circle cx="100" cy="100" r="91" fill={active ? "rgba(8,69,82,0.25)" : "rgba(51,65,85,0.14)"} />
          {[83, 57, 31].map((radius, index) => (
            <circle
              key={radius}
              cx="100" cy="100" r={radius}
              fill="none"
              stroke={active ? (index === 0 ? "rgba(103,232,249,.7)" : "rgba(34,211,238,.53)") : "rgba(100,116,139,.52)"}
              strokeWidth={index === 0 ? 1.6 : 1.3}
            />
          ))}
          <circle cx="100" cy="100" r="15" fill={active ? "rgba(34,211,238,.14)" : "rgba(100,116,139,.12)"} />
          <circle cx="100" cy="100" r="5" fill={active ? "#67e8f9" : "#64748b"} />
          {active && visibleDots.map((dot) => (
            <circle
              key={dot.key} cx={dot.x} cy={dot.y} r="5.2"
              fill="#a7f3d0" stroke="#064e5e" strokeWidth="1.5"
              className="drop-shadow-[0_0_4px_rgba(110,231,183,.9)]"
            />
          ))}
        </svg>
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className={"rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] " + (active ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-100" : "border-slate-500/35 bg-slate-500/10 text-slate-400")}>
          {active ? "Activo" : inactive ? "Inactivo" : "Sin confirmar"}
        </span>
        <span className="text-sm font-bold leading-tight">{headline}</span>
        {active ? (
          <>
            <span className="text-[11px] leading-snug text-cyan-100/75">{total} registros · {queued} avisos encolados</span>
            <span className="mt-1 flex w-full flex-col gap-1.5 border-t border-cyan-300/20 pt-2">
              {stages.map(({ stage, count, radiusKm, hiddenCount }) => (
                <span key={stage} className="flex min-w-0 items-center gap-2 text-[11px] leading-tight">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/[0.08] font-bold text-cyan-200">{stage}</span>
                  <span className="min-w-0 flex-1 text-cyan-100/85">
                    Rango {stage}
                    {radiusKm != null ? <span className="block text-[10px] text-cyan-100/60">Hasta {radiusKm} km</span> : null}
                    {hiddenCount > 0 ? <span className="block text-[9px] text-cyan-100/60">+{hiddenCount} sin dibujar</span> : null}
                  </span>
                  <strong className="shrink-0 text-sm tabular-nums text-emerald-200">{count}</strong>
                </span>
              ))}
              {withoutStage > 0 ? (
                <span className="text-[10px] text-amber-200">{withoutStage} sin rango registrado</span>
              ) : null}
            </span>
            <span className="text-[10px] leading-snug text-cyan-100/60">Puntos por etapa, no ubicación GPS.</span>
          </>
        ) : null}
        <span className={"mt-1 text-[11px] font-semibold leading-tight " + (active ? "text-cyan-200" : "text-slate-400")}>
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
  const [selectedRadarStage, setSelectedRadarStage] = useState<number | "unclassified" | null>(null);
  useEffect(() => setSelectedRadarStage(null), [jobId]);
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
  const opened = actual.filter((item) => item.firstOpenedAt != null).length;
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
        <span className="text-emerald-200">Alertas abiertas: <strong>{opened}</strong></span>
        {simulated > 0 ? <span className="text-violet-300">Prueba: {simulated} seleccionados</span> : null}
        <span className="text-muted-foreground">Más cercano: {nearest == null ? "Sin dato histórico" : kilometers(nearest)}</span>
      </div>
    );
  }

  // Vista operativa breve. El informe anterior queda plegado a demanda.
  // Contamos exclusivamente las primeras etapas registradas, no las posiciones GPS actuales.
  const overviewImpacts = radar.data?.impacts ?? [];
  const overviewStages = [1, 2, 3].map((stage) => {
    const matches = overviewImpacts.filter((impact) => impact.radius_stage === stage);
    const recordedRadius = matches.find((impact) => impact.radius_limit_km != null)?.radius_limit_km;
    return {
      stage,
      count: matches.length,
      radius: recordedRadius ?? configuredRadii[stage - 1] ?? null,
    };
  });
  const overviewUnknown = overviewImpacts.filter(
    (impact) => ![1, 2, 3].includes(impact.radius_stage ?? -1)
  ).length;
  const selectedImpacts = selectedRadarStage == null ? [] : overviewImpacts.filter((impact) =>
    selectedRadarStage === "unclassified"
      ? ![1, 2, 3].includes(impact.radius_stage ?? -1)
      : impact.radius_stage === selectedRadarStage
  );
  const selectedDrivers = selectedImpacts.map((impact) => {
    const recipient = actual.find((item) => item.driverUserId === impact.driver_user_id);
    return {
      id: impact.driver_user_id,
      name: recipient?.driverDisplayName || "Nombre no conservado",
      distanceKm: impact.distance_km_at_selection ?? recipient?.distanceKm ?? null,
      deliveryStatus: recipient?.deliveryStatus ?? null,
      wasAssigned: assignedDriverId === impact.driver_user_id,
    };
  });

  return (
    <section aria-label="Resumen rápido del radar" className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground sm:text-base">
          <Radar className="h-4 w-4 text-cyan-300" aria-hidden="true" />
          Radar de esta carrera
        </h3>
        <span className={"rounded-full border px-2.5 py-1 text-[11px] font-semibold " +
          (radar.data?.status === "yes" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-slate-500/30 bg-slate-500/10 text-text-secondary")}>
          {radarLabel === "Sí" ? "Utilizado" : radarLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className={cn("min-w-0 rounded-xl border px-3 py-2", premiumColumnHeaderSurface)}>
          <span className="block text-[11px] text-text-secondary">Conductores impactados</span>
          <strong className="mt-1 block text-xl font-bold tabular-nums text-foreground">{radar.data?.status === "yes" ? overviewImpacts.length : "—"}</strong>
        </div>
        <div className={cn("min-w-0 rounded-xl border px-3 py-2", premiumColumnHeaderSurface)}>
          <span className="block text-[11px] text-text-secondary">Avisos enviados</span>
          <strong className="mt-1 block text-xl font-bold tabular-nums text-emerald-300">{sent}</strong>
        </div>
        <div className={cn("col-span-2 min-w-0 rounded-xl border px-3 py-2 sm:col-span-1", premiumColumnHeaderSurface)}>
          <span className="block text-[11px] text-text-secondary">Más cercano al aviso</span>
          <strong className="mt-1 block text-xl font-bold tabular-nums text-foreground">{nearest == null ? "Sin registro" : kilometers(nearest)}</strong>
        </div>
      </div>
      {radar.isPending ? (
        <p role="status" className="mt-3 text-xs text-text-secondary">Consultando las etapas del radar…</p>
      ) : radar.isError ? (
        <p role="alert" className="mt-3 text-xs text-amber-300">No fue posible consultar las etapas históricas.</p>
      ) : radar.data?.status === "yes" ? (
        <>
          <div aria-label="Conductores por rango" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {overviewStages.map(({ stage, count, radius }) => (
              <button
                type="button"
                key={stage}
                aria-expanded={selectedRadarStage === stage}
                onClick={() => setSelectedRadarStage((current) => current === stage ? null : stage)}
                className={cn(
                  "group flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300",
                  selectedRadarStage === stage
                    ? "border-cyan-300/70 bg-cyan-400/[0.13] text-cyan-100"
                    : "border-cyan-400/20 bg-cyan-400/[0.05] hover:border-cyan-300/45 hover:bg-cyan-400/[0.10]",
                )}
              >
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-400/10 text-xs font-bold text-cyan-100">{stage}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground">Rango {stage}</span>
                  <span className="block text-[10px] text-text-secondary">{radius == null ? "Sin radio guardado" : "Hasta " + kilometers(radius)}</span>
                </span>
                <strong className="text-lg font-bold tabular-nums text-cyan-100" aria-label={count + " conductores"}>{count}</strong>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-cyan-300 transition-transform", selectedRadarStage === stage && "rotate-180")} aria-hidden="true" />
              </button>
            ))}
          </div>
          {overviewUnknown > 0 ? (
            <button
              type="button"
              aria-expanded={selectedRadarStage === "unclassified"}
              onClick={() => setSelectedRadarStage((current) => current === "unclassified" ? null : "unclassified")}
              className={cn(
                "mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-300",
                selectedRadarStage === "unclassified"
                  ? "border-amber-300/50 bg-amber-400/10 text-amber-100"
                  : "border-amber-400/20 bg-amber-400/[0.04] text-amber-200 hover:bg-amber-400/10",
              )}
            >
              <span>{overviewUnknown} registro(s) sin rango identificado · Ver conductores</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", selectedRadarStage === "unclassified" && "rotate-180")} aria-hidden="true" />
            </button>
          ) : null}
          {selectedRadarStage !== null ? (
            <section aria-label="Conductores del rango seleccionado" className="mt-2 rounded-xl border border-cyan-400/30 bg-background/55 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-cyan-100">
                  {selectedRadarStage === "unclassified"
                    ? "Conductores sin rango identificado"
                    : "Conductores del rango " + selectedRadarStage}
                </h4>
                <span className="text-[11px] tabular-nums text-text-secondary">
                  {selectedImpacts.length} registro(s)
                </span>
              </div>
              {selectedDrivers.length > 0 ? (
                <ul className="divide-y divide-border/40" aria-live="polite">
                  {selectedDrivers.map((driver, index) => (
                    <li key={driver.id + "-" + index} className="flex min-w-0 flex-col gap-1 py-2 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-xs font-semibold text-foreground">
                          {driver.name}
                          {driver.wasAssigned ? <span className="ml-2 text-[11px] text-emerald-300">Asignado</span> : null}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-secondary">
                          {driver.deliveryStatus === "sent"
                            ? "Aviso enviado por push"
                            : driver.deliveryStatus === "failed"
                              ? "Envío fallido"
                              : driver.deliveryStatus == null
                                ? "Sin detalle de aviso conservado"
                                : "Aviso en cola / pendiente"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-cyan-200">
                        {driver.distanceKm == null ? "Distancia no registrada" : kilometers(driver.distanceKm)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-secondary">Sin conductores registrados en este rango para esta carrera.</p>
              )}
              <p className="mt-2 text-[10px] text-text-secondary">
                Distancias históricas aproximadas al aviso. «Enviado» no confirma lectura.
              </p>
            </section>
          ) : null}
          <p className="mt-2 text-[11px] text-text-secondary">Selecciona un rango para ver sus conductores. Los datos son del primer aviso, no de GPS actual.</p>
        </>
      ) : (
        <p className="mt-3 text-xs text-text-secondary">
          {radar.data?.status === "no" ? "El radar no se utilizó en esta carrera." : "Esta carrera no tiene historial radial confirmado."}
        </p>
      )}
      {simulated > 0 ? <p className="mt-2 text-xs text-violet-300">Prueba: {simulated} destinatarios simulados.</p> : null}
      <details className="group mt-3 rounded-xl border border-border/50 bg-background/30">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 [&::-webkit-details-marker]:hidden">
          Ver historial completo de avisos y distancias
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-border/50 p-3">
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
                  {!item.isTestRecipient && item.firstOpenedAt != null
                    ? " · Abrió la alerta: " + new Date(item.firstOpenedAt).toLocaleString("es-CU")
                    : ""}
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
        </div>
      </details>
    </section>
  );
}

function JobDetail({ detail, projectId, jobId, initialTab = "overview", canShare = false }: {
  detail: import("@/lib/services/types").MarketplaceJobDetail;
  projectId: string;
  jobId: string;
  initialTab?: "overview" | "radar";
  canShare?: boolean;
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
  const canShareJob = canShare && state === "published" && !hasDriver && job.is_test !== true;
  const tabs = [
    { id: "overview", label: "Resumen ejecutivo", Icon: Eye },
    { id: "radar", label: "Radar y cobertura", Icon: Radar },
    { id: "finance", label: "Finanzas", Icon: WalletCards },
    { id: "history", label: "Trazabilidad", Icon: Clock3 },
  ] as const;
  const sectionTitle = (eyebrow: string, title: string, description: string) => (
    <div className="mb-3">
      <p className="marketplace-360-kicker">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">{description}</p>
    </div>
  );

  return (
    <div data-nav-tone="trabajos" className="marketplace-360 marketplace-360-job min-w-0 space-y-3">
      <section aria-label="Identidad de la carrera" className={cn("marketplace-360-hero relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <div aria-hidden="true" className="marketplace-360-watermark">360°</div>
        <div className="relative flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-cyan-200">
                <BriefcaseBusiness className="h-3.5 w-3.5" /> Expediente 360 de carrera
              </span>
              <StatusBadge status={state} />
              <ServiceBadge service={text(serviceRequest.service_code)} />
            </div>
            <h2 className="mt-2 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Carrera <span className="text-cyan-200">#{jobId.slice(0,8).toUpperCase()}</span>
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(job.created_at)}</span>
              <span className="inline-flex items-center gap-1.5"><Route className="h-3.5 w-3.5" />{label(text(serviceRequest.service_code))}</span>
              <span className="font-mono text-[10px] text-slate-500" title={jobId}>ID {jobId.slice(0,13)}…</span>
            </div>
          </div>
          <div className={cn("relative w-full min-w-0 rounded-xl border p-3 sm:w-56 sm:shrink-0", premiumColumnHeaderSurface)}>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-200/75">Valor de la carrera</p>
            <p className="mt-1 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">{readablePrice}</p>
            <div className="mt-2 border-t border-border/60 pt-2 text-xs text-text-secondary">
              {closed ? "Servicio con estado cerrado" : "Servicio bajo seguimiento operativo"}
            </div>
          </div>
        </div>
        {canShareJob ? (
          <div className="relative mt-3 flex flex-col gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-foreground">Carrera disponible: compártela con tus conductores.</p>
            <div className="w-full sm:w-56">
              <MarketplaceServiceShareButton projectId={projectId} jobId={jobId} compact />
            </div>
          </div>
        ) : null}
        {activeTab !== "radar" ? <div className="relative mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 md:grid-cols-4">
          {[
            { title: "Estado", value: label(state), icon: CheckCircle2 },
            { title: "Conductor", value: hasDriver ? "Asignado" : "Sin asignar", icon: CarFront },
            { title: "Eventos", value: String(timeline.length), icon: Clock3 },
            { title: "Programación", value: serviceRequest.scheduled_for ? "Programada" : "Sin horario", icon: CalendarDays },
          ].map(({title, value, icon: Icon}) => (
            <div key={title} className={cn("min-w-0 rounded-xl border px-2.5 py-2", premiumColumnHeaderSurface)}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary"><Icon className="h-3.5 w-3.5 text-cyan-200" />{title}</div>
              <div className="mt-1.5 break-words text-[15px] font-bold text-foreground">{value}</div>
            </div>
          ))}
        </div> : null}
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="min-w-0">
        <nav aria-label="Secciones del expediente 360 de carrera" className={cn("marketplace-360-nav rounded-[var(--radius-card)] border p-1.5", premiumSurface)}>
          <TabsList aria-label="Contenido de la carrera" className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0 sm:flex sm:flex-wrap sm:justify-start">
            {tabs.map(({ id, label: tabLabel, Icon }) => (
              <TabsTrigger key={id} value={id} className="marketplace-360-tab min-h-11 min-w-0 gap-1.5 whitespace-normal px-2 sm:px-3">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{tabLabel}
                {id === "history" ? <span className="rounded-full bg-surface-3 px-1.5 text-[10px]">{timeline.length}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </nav>
        <div className="marketplace-360-content min-w-0 space-y-3">
        <TabsContent value="overview" className="min-w-0 space-y-3">
          <>
            <section className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-cyan-400/[0.08] blur-3xl" />
              {sectionTitle("01 / Recorrido", "Ruta del servicio", "Origen, destino y referencias operativas de la solicitud.")}
              <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] lg:items-stretch">
                <div className="rounded-xl border border-emerald-400/20 bg-[#080f13]/65 p-4 admin-graphite-inset">
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-400/10"><MapPin className="h-4 w-4" /></span> 01 · Punto de recogida</p>
                  <p className="break-words text-base font-semibold leading-relaxed text-foreground">{text(serviceRequest.origin_text)}</p>
                </div>
                <div className="hidden items-center justify-center lg:flex"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/10 text-cyan-200"><ArrowRight className="h-5 w-5" /></span></div>
                <div className="rounded-xl border border-cyan-400/20 bg-[#080f13]/65 p-4 admin-graphite-inset">
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-orange-300"><span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-400/10"><MapPin className="h-4 w-4" /></span> 02 · Destino</p>
                  <p className="break-words text-base font-semibold leading-relaxed text-foreground">{text(serviceRequest.destination_text)}</p>
                </div>
              </div>
            </section>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <section className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
                {sectionTitle("02 / Participantes", "Cliente", "Información de contacto relacionada con esta carrera.")}
                <div className="flex gap-3 rounded-2xl border border-cyan-400/15 bg-black/20 p-3.5 admin-graphite-inset">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"><UserRound className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="break-words text-lg font-semibold text-foreground">{customer ? text(customer.display_name) : "Cliente no registrado"}</p>
                    <p className="mt-1 text-sm text-text-secondary">{customerPhone || "Teléfono no disponible"}</p>
                    {customerPhone ? <a href={`tel:${customerPhone}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-200 hover:underline"><Phone className="h-3.5 w-3.5" />Llamar al cliente</a> : null}
                  </div>
                </div>
              </section>
              <section className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
                {sectionTitle("03 / Asignación", "Conductor y vehículo", "Situación de la asignación vinculada al servicio.")}
                <div className="flex gap-3 rounded-2xl border border-amber-400/15 bg-black/20 p-3.5 admin-graphite-inset">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-200"><CarFront className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-foreground">{hasDriver ? "Conductor asignado" : "Sin conductor asignado"}</p>
                    {driverCode ? <p className="mt-1 break-all font-mono text-[11px] text-text-secondary">ID conductor: {driverCode}</p> : <p className="mt-1 text-sm text-text-secondary">No se ha registrado una asignación.</p>}
                    {vehicleCode ? <p className="mt-1 break-all text-xs text-text-secondary">Vehículo: {vehicleCode}</p> : null}
                  </div>
                </div>
              </section>
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_1.1fr]">
              <section className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
                {sectionTitle("04 / Programación", "Datos de servicio", "Agenda y condiciones básicas de la carrera.")}
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-black/20 p-3.5 admin-graphite-inset">
                  <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-violet-300" />
                  <div><p className="text-xs text-text-secondary">Hora programada</p><p className="mt-1 text-sm font-semibold text-foreground">{formatDate(serviceRequest.scheduled_for)}</p></div>
                </div>
              </section>
              <section className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
                {sectionTitle("05 / Inteligencia operativa", "Cobertura del radar", "Consulta impactos por conductor y kilómetros registrados al aviso.")}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/15 bg-black/20 px-3 py-2.5 admin-graphite-inset">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100"><Radar className="h-5 w-5 text-cyan-300" />Análisis de distribución</div>
                  <Button type="button" size="sm" variant="outline" className="border-cyan-400/25 text-cyan-100" onClick={() => setActiveTab("radar")}>Explorar radar <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </section>
            </div>
          </>
        </TabsContent>

        <TabsContent value="radar" className="min-w-0 space-y-2">
          <JobNotificationReach projectId={projectId} jobId={jobId} assignedDriverId={typeof assignment?.driver_user_id === "string" ? assignment.driver_user_id : null} />
        </TabsContent>

        <TabsContent value="finance" className="min-w-0 space-y-3">
          <section className="space-y-4">
            {sectionTitle("Estado económico", "Finanzas de la operación", "Importe contratado, comisión y situación registrada de la reserva.")}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
                <Banknote className="mb-3 h-6 w-6 text-emerald-300" />
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/75">Importe de carrera</p>
                <p className="mt-2 break-words text-3xl font-black tracking-tight text-foreground">{readablePrice}</p>
                <p className="mt-3 text-xs text-text-secondary">Precio registrado del servicio.</p>
              </div>
              <div className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
                <WalletCards className="mb-3 h-6 w-6 text-cyan-200" />
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200/75">Estado de comisión / reserva</p>
                <p className="mt-2 text-xl font-bold text-foreground">{financial ? label(text(financial.reservation_status)) : "Sin información financiera"}</p>
                <p className="mt-3 text-xs text-text-secondary">No equivale a un cargo liquidado si todavía no consta en el sistema.</p>
              </div>
            </div>
            {incidentResolution ? (
              <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-200"><AlertTriangle className="h-4 w-4" />Resolución de incidencia</p>
                <p className="mt-2 font-medium text-foreground">{label(text(incidentResolution.resolution))}</p>
                <p className="mt-1 text-sm text-text-secondary">{text(incidentResolution.resolution_note)}</p>
              </div>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent value="history" className="min-w-0 space-y-3">
          <section className={cn("marketplace-360-panel relative min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
            {sectionTitle("Auditoría del servicio", "Línea de tiempo", "Historial de cambios de estado, responsables y motivos registrados.")}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-black/20 px-3.5 py-3 admin-graphite-inset">
              <p className="text-sm text-text-secondary">Eventos registrados</p><p className="text-2xl font-bold text-cyan-200">{timeline.length}</p>
            </div>
            {timeline.length ? (
              <ol className="relative ml-2 space-y-3 border-l border-cyan-400/30 pl-6">
                {timeline.map((event, index) => (
                  <li key={String(event.event_id ?? index)} className="relative rounded-xl border border-border/50 bg-black/20 p-4 admin-graphite-inset">
                    <span className="absolute -left-[32px] top-5 h-3.5 w-3.5 rounded-full border-[3px] border-[#112128] bg-cyan-300 shadow-[0_0_14px_2px_rgba(34,211,238,0.22)]" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-text-secondary">{formatDate(event.created_at)}</p>
                      {event.actor_kind ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-text-secondary">Actor: {text(event.actor_kind)}</span> : null}
                    </div>
                    <p className="mt-2 break-words text-sm font-bold text-foreground">{text(event.action)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-lg border border-border/50 bg-black/20 px-2.5 py-1.5 text-text-secondary admin-graphite-inset">{label(text(event.from_status))}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-cyan-300" />
                      <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.08] px-2.5 py-1.5 font-semibold text-cyan-100">{label(text(event.to_status))}</span>
                    </div>
                    {event.reason ? <p className="mt-3 rounded-lg border border-amber-400/10 bg-amber-400/[0.035] p-2.5 text-xs leading-relaxed text-text-secondary">Motivo: {text(event.reason)}</p> : null}
                  </li>
                ))}
              </ol>
            ) : <div className="rounded-xl border border-dashed border-border/50 p-5 text-sm text-text-secondary">No constan eventos registrados.</div>}
          </section>
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function WalletFinancialHistory({projectId,userId,currency}:{projectId:string;userId:string;currency:string}){
  const [open,setOpen]=useState(false);
  const history=useQuery({queryKey:["marketplace-driver-financial-360",projectId,userId],queryFn:()=>supabaseServices.marketplace.getDriverFinancial360(projectId,userId),enabled:open,staleTime:30_000});
  const data=history.data;
  return <details className="mt-3 border-t border-border-subtle pt-2" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold text-primary py-2">Actividad financiera y comprobantes</summary>
    {open && (history.isError?<RecordLoadError onRetry={()=>void history.refetch()}/>:history.isLoading?<LoadingState/>:data?<div className="space-y-3">
      <p className="text-xs text-text-secondary">Recargas, comprobantes, premios y total de comisiones. No es el libro completo de movimientos ni un saldo histórico.</p>
      <RecordMetric labelText="Comisiones registradas" value={formatWalletAmount(data.commissionTotal,currency)}/>
      <div><h4 className="text-xs font-semibold mb-1">Recargas</h4>{data.topups.length?data.topups.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle py-2 text-xs"><span>{formatDate(t.confirmedAt??t.requestedAt)} · {label(t.status)}{t.reference?" · "+t.reference:""}</span><strong>{formatWalletAmount(t.amount,t.currency)}</strong></div>):<p className="text-xs text-text-secondary">Sin recargas registradas.</p>}</div>
      <div><h4 className="text-xs font-semibold mb-1">Comprobantes y correcciones</h4>{data.documents.map(d=><div key={d.id} className="flex flex-wrap justify-between gap-2 border-b border-border-subtle py-2 text-xs"><span>{formatDate(d.issuedAt)} · {d.documentNumber} · {d.concept}</span><strong>{formatWalletAmount(d.amount,d.currency)}</strong></div>)}</div>
      <div><h4 className="text-xs font-semibold mb-1">Premios por referidos</h4>{data.referralCredits.map(d=><div key={d.id} className="flex justify-between gap-2 py-2 text-xs"><span>{formatDate(d.qualifiedAt)}</span><strong>{formatWalletAmount(d.amount,d.currency)}</strong></div>)}</div>
    </div>:null)}
  </details>;
}
