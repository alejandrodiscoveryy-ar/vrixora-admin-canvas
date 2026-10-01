import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  CarFront,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Eye,
  Filter,
  Loader2,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  TestTube2,
  Trash2,
  UserRound,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { useProjectPermissions } from "@/hooks/useProjects";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { KpiGrid } from "@/components/admin/KpiGrid";
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
    rejected: "Rechazada",
    active: "Activo",
    suspended: "Suspendido",
    incomplete: "Perfil incompleto",
    passenger: "Pasajeros",
    cargo: "Carga",
    courier: "Mensajería",
    tourism: "Turismo",
    wallet_commission: "Billetera",
  })[value ?? ""] ??
  value ??
  "—";

const text = (value: unknown) => (value == null || value === "" ? "—" : String(value));

const errorText = (error: unknown) =>
  error instanceof Error
    ? ({
        INITIAL_MINIMUM_DEPOSIT_REQUIRED: "El primer depósito debe alcanzar el mínimo configurado.",
        RESOLUTION_NOTE_REQUIRED: "La nota de resolución es obligatoria.",
        SUSPENSION_REASON_REQUIRED: "El motivo es obligatorio.",
        JOB_NOT_IN_INCIDENT: "El trabajo ya no está en incidencia.",
        TEST_DRIVER_REQUIRED: "Selecciona el conductor de prueba.",
        TEST_FORCE_COMMISSION_REQUIRES_ENABLED_MODE: "Activa primero el modo de prueba.",
        TEST_DRIVER_NOT_FOUND: "No se encontró el conductor seleccionado.",
        JOB_IS_NOT_TEST: "Esta acción solo está disponible para carreras de prueba.",
        TEST_DELETE_REASON_REQUIRED: "Debes indicar el motivo de la eliminación.",
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
  children,
}: {
  title: string;
  description?: string;
  icon: typeof BriefcaseBusiness;
  tone?: PanelTone;
  action?: ReactNode;
  children: ReactNode;
}) {
  const visual = panelVisuals[tone];

  return (
    <section className={`relative overflow-hidden rounded-2xl border shadow-sm ${visual.card}`}>
      <div className={`h-1 bg-gradient-to-r ${visual.strip}`} />

      <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="p-5">{children}</div>
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

export default function MarketplaceSection({ projectId }: { projectId: string }) {
  const { data: permissions = [] } = useProjectPermissions(projectId);

  const [tab, setTab] = useState("resumen");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [incidentState, setIncidentState] = useState("open");

  const [jobId, setJobId] = useState<string | null>(null);
  const [driver, setDriver] = useState<{
    id: string;
    suspended: boolean;
  } | null>(null);
  const [incident, setIncident] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<"completed" | "cancelled">("completed");
  const [error, setError] = useState<string | null>(null);

  const [topup, setTopup] = useState<{
    id: string;
    driver: string;
  } | null>(null);
  const [newTopup, setNewTopup] = useState(false);
  const [topupDriver, setTopupDriver] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [minimum, setMinimum] = useState("");
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
    queryKey: ["marketplace-customers", projectId],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listCustomers(projectId, {
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
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
    queryKey: ["marketplace-topups", projectId],
    queryFn: ({ pageParam }) =>
      supabaseServices.marketplace.listTopups(projectId, {
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as null | { at: string; id: string },
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "recargas" && canPayments,
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
    queryKey: ["marketplace-financial-settings", projectId],
    queryFn: () => supabaseServices.marketplace.financialSettings(projectId),
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

  useEffect(() => {
    if (settings.data) {
      setMinimum(String(settings.data.initialMinimumDeposit));
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
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setNewTopup(false);
      setTopupDriver("");
      setAmount("");
      setMethod("");
      setReference("");
      setNotes("");
      void invalidate("marketplace-topups", "marketplace-overview");
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const confirm = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.confirmTopup(projectId, topup!.id, crypto.randomUUID()),
    onSuccess: () => {
      setTopup(null);
      void invalidate(
        "marketplace-topups",
        "marketplace-wallets",
        "marketplace-overview",
        "marketplace-drivers",
      );
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const reject = useMutation({
    mutationFn: () => supabaseServices.marketplace.rejectTopup(projectId, topup!.id, reason),
    onSuccess: () => {
      setTopup(null);
      setReason("");
      void invalidate("marketplace-topups", "marketplace-overview");
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  const save = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.updateFinancialSettings(projectId, {
        initialMinimumDeposit: Number(minimum),
        commissionRate: Number(commission) / 100,
      }),
    onSuccess: () => void invalidate("marketplace-financial-settings"),
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
      <ModuleHeader
        title="Trabajos"
        description="Operación de TukTuk Marketplace."
        icon={BriefcaseBusiness}
        module="pagos"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="trabajos">Trabajos</TabsTrigger>
          <TabsTrigger value="conductores">Conductores</TabsTrigger>
          {canCustomers ? <TabsTrigger value="clientes">Clientes</TabsTrigger> : null}
          {canPayments ? (
            <>
              <TabsTrigger value="billeteras">Billeteras</TabsTrigger>
              <TabsTrigger value="recargas">Recargas</TabsTrigger>
            </>
          ) : null}
          <TabsTrigger value="incidencias">Incidencias</TabsTrigger>
          {canSettings ? <TabsTrigger value="configuracion">Configuración</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="resumen">
          <KpiGrid columns={4} density="compact">
            {[
              ["Conductores", overview.data?.driversTotal, Users],
              ["Activos", overview.data?.driversActive, Users],
              ["En prueba", overview.data?.driversTrialActive, BriefcaseBusiness],
              ["Post-prueba activos", overview.data?.driversPostTrialActive, WalletCards],
              ["Trabajos publicados", overview.data?.jobsPublished, BriefcaseBusiness],
              ["Trabajos activos", overview.data?.jobsActive, BriefcaseBusiness],
              ["Incidencias abiertas", overview.data?.jobsIncidentOpen, AlertTriangle],
            ].map(([name, value, Icon]) => (
              <MetricCard
                key={String(name)}
                label={String(name)}
                value={Number(value ?? 0)}
                icon={Icon as typeof Users}
                module="pagos"
                isLoading={overview.isLoading}
              />
            ))}

            {!overview.isLoading && overview.data?.pendingTopups !== null ? (
              <MetricCard
                label="Recargas pendientes"
                value={overview.data?.pendingTopups ?? 0}
                icon={WalletCards}
                module="pagos"
              />
            ) : null}
          </KpiGrid>
        </TabsContent>

        <TabsContent value="trabajos">
          <div className="mb-4 flex flex-wrap gap-3">
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

          <PremiumPanel
            title="Trabajos"
            description={
              jobs.isLoading
                ? "Consultando operaciones…"
                : `${jobRows.length} ${
                    jobRows.length === 1 ? "trabajo cargado" : "trabajos cargados"
                  }`
            }
            icon={BriefcaseBusiness}
            tone="emerald"
          >
            {jobs.isLoading ? (
              <LoadingState />
            ) : !jobRows.length ? (
              <EmptyMarketplaceState
                title="No hay trabajos"
                description="No existen operaciones que coincidan con los filtros seleccionados."
              />
            ) : (
              <>
                <div className="space-y-3">
                  {jobRows.map((job) => (
                    <article
                      key={job.jobId}
                      className="rounded-2xl border border-border/65 bg-background/45 p-4 transition hover:border-emerald-500/25 hover:bg-background/60"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={job.status} />
                            <ServiceBadge service={job.serviceCode} />

                            {job.isTest ? (
                              <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
                                PRUEBA
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 grid gap-3">
                            <div className="flex gap-3">
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300">
                                <MapPin className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                  Origen
                                </p>
                                <p className="mt-0.5 font-medium leading-snug text-foreground">
                                  {text(job.originText)}
                                </p>
                              </div>
                            </div>

                            <div className="ml-4 h-3 border-l border-dashed border-border/70" />

                            <div className="flex gap-3">
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-300">
                                <ArrowRight className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                  Destino
                                </p>
                                <p className="mt-0.5 font-medium leading-snug text-foreground">
                                  {text(job.destinationText)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <UserRound className="h-4 w-4" />
                            <span>{job.driverDisplayName || "Sin conductor asignado"}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t border-border/60 pt-4 lg:min-w-44 lg:flex-col lg:items-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                          <div className="lg:text-right">
                            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              Precio
                            </p>
                            <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                              {formatAmount(job.finalPrice, job.currency)}
                            </p>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            {job.isTest && canManageMarketplace ? (
                              <Button
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

                            <Button size="sm" variant="outline" onClick={() => setJobId(job.jobId)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver detalle
                            </Button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <PaginationButton query={jobs} />
              </>
            )}
          </PremiumPanel>
        </TabsContent>

        <TabsContent value="conductores">
          <PremiumPanel
            title="Conductores"
            description={
              drivers.isLoading
                ? "Consultando conductores…"
                : `${driverRows.length} ${
                    driverRows.length === 1 ? "conductor cargado" : "conductores cargados"
                  }`
            }
            icon={Users}
            tone="cyan"
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
                <div className="space-y-3">
                  {driverRows.map((item) => (
                    <article
                      key={item.userId}
                      className="rounded-2xl border border-border/65 bg-background/45 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-foreground">{item.displayName}</h4>
                            <StatusBadge status={item.status} />
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                item.isAvailable
                                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                  : "border-border/70 bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              {item.isAvailable ? "Disponible" : "No disponible"}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <MiniMetric
                              labelText="WhatsApp"
                              value={
                                <span className="flex items-center gap-2">
                                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                  {item.phone ?? "Sin WhatsApp"}
                                </span>
                              }
                            />
                            <MiniMetric
                              labelText="Vehículo"
                              value={
                                <span className="flex items-center gap-2">
                                  <CarFront className="h-3.5 w-3.5 text-muted-foreground" />
                                  {item.vehicleName ?? "Sin vehículo"}
                                </span>
                              }
                            />
                          </div>
                        </div>

                        {canManageMarketplace ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setDriver({
                                id: item.userId,
                                suspended: item.status !== "suspended",
                              })
                            }
                          >
                            {item.status === "suspended" ? "Reactivar" : "Suspender"}
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
                      customerRows.length === 1 ? "cliente cargado" : "clientes cargados"
                    }`
              }
              icon={UserRound}
              tone="violet"
            >
              {customers.isLoading ? (
                <LoadingState />
              ) : !customerRows.length ? (
                <EmptyMarketplaceState
                  title="No hay clientes"
                  description="Todavía no existen clientes registrados en Marketplace."
                  icon={UserRound}
                />
              ) : (
                <>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {customerRows.map((customer) => (
                      <article
                        key={customer.customerId}
                        className="rounded-2xl border border-border/65 bg-background/45 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.08] text-violet-300">
                            <UserRound className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <h4 className="font-semibold text-foreground">
                              {customer.displayName}
                            </h4>
                            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              {customer.whatsappPhone}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <MiniMetric labelText="Trabajos" value={customer.jobsTotal} />
                          <MiniMetric labelText="Activos" value={customer.jobsActive} />
                          <MiniMetric labelText="Liquidados" value={customer.jobsSettled} />
                        </div>
                      </article>
                    ))}
                  </div>

                  <PaginationButton query={customers} />
                </>
              )}
            </PremiumPanel>
          </TabsContent>
        ) : null}

        {canPayments ? (
          <>
            <TabsContent value="billeteras">
              <PremiumPanel
                title="Billeteras"
                description={
                  wallets.isLoading
                    ? "Consultando saldos…"
                    : `${walletRows.length} ${
                        walletRows.length === 1 ? "billetera cargada" : "billeteras cargadas"
                      }`
                }
                icon={Wallet}
                tone="amber"
              >
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
                    <div className="space-y-3">
                      {walletRows.map((wallet) => (
                        <article
                          key={wallet.userId}
                          className="rounded-2xl border border-border/65 bg-background/45 p-4"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Conductor
                              </p>
                              <h4 className="mt-1 font-semibold text-foreground">
                                {wallet.driverDisplayName}
                              </h4>
                            </div>

                            <div className="lg:text-right">
                              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Saldo total
                              </p>
                              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                                {formatAmount(wallet.totalBalance, wallet.currency)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-2 md:grid-cols-3">
                            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
                              <p className="text-xs text-muted-foreground">Saldo real</p>
                              <p className="mt-1 font-semibold text-foreground">
                                {formatAmount(wallet.realBalance, wallet.currency)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Disponible:{" "}
                                {formatAmount(wallet.realAvailableBalance, wallet.currency)}
                              </p>
                            </div>

                            <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3">
                              <p className="text-xs text-muted-foreground">Promocional</p>
                              <p className="mt-1 font-semibold text-foreground">
                                {formatAmount(wallet.promotionalBalance, wallet.currency)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Disponible:{" "}
                                {formatAmount(wallet.promotionalAvailableBalance, wallet.currency)}
                              </p>
                            </div>

                            <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3">
                              <p className="text-xs text-muted-foreground">Reservado</p>
                              <p className="mt-1 font-semibold text-foreground">
                                {formatAmount(
                                  Number(wallet.realReservedBalance) +
                                    Number(wallet.promotionalReservedBalance),
                                  wallet.currency,
                                )}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Real: {formatAmount(wallet.realReservedBalance, wallet.currency)} ·
                                Promo:{" "}
                                {formatAmount(wallet.promotionalReservedBalance, wallet.currency)}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>

                    <PaginationButton query={wallets} />
                  </>
                )}
              </PremiumPanel>
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
                action={
                  canManagePayments ? (
                    <Button
                      onClick={() => {
                        setError(null);
                        setNewTopup(true);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Registrar recarga
                    </Button>
                  ) : null
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
                      {topupRows.map((item) => (
                        <article
                          key={item.topupId}
                          className="rounded-2xl border border-border/65 bg-background/45 p-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-semibold text-foreground">
                                  {item.driverDisplayName}
                                </h4>
                                <StatusBadge status={item.status} />
                              </div>
                              <p className="mt-2 text-sm text-muted-foreground">
                                Método: <span className="text-foreground">{text(item.method)}</span>
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                              <p className="text-xl font-semibold text-foreground">
                                {formatAmount(item.amount, item.currency)}
                              </p>

                              {canManagePayments && item.status === "requested" ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setTopup({
                                      id: item.topupId,
                                      driver: item.driverDisplayName,
                                    });
                                    setReason("");
                                  }}
                                >
                                  Gestionar
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ))}
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
          <TabsContent value="configuracion">
            <PremiumPanel
              title="Configuración financiera"
              description="Parámetros económicos generales de Marketplace."
              icon={CircleDollarSign}
              tone="amber"
            >
              {settings.isLoading ? (
                <LoadingState />
              ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Moneda
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">
                        {settings.data?.walletCurrency ?? "CUP"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Moneda operativa de las billeteras.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          Estos parámetros afectan la operación financiera de Marketplace. Revisa
                          los valores antes de guardar cambios.
                        </p>
                      </div>
                    </div>
                  </div>

                  {canManageSettings ? (
                    <div className="space-y-4 rounded-2xl border border-border/65 bg-background/45 p-4">
                      <div>
                        <Label htmlFor="marketplace-minimum">Depósito mínimo inicial</Label>
                        <div className="relative mt-1.5">
                          <Input
                            id="marketplace-minimum"
                            type="number"
                            min="0"
                            step="0.01"
                            className="pr-16"
                            value={minimum}
                            onChange={(event) => setMinimum(event.target.value)}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                            {settings.data?.walletCurrency ?? "CUP"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Importe mínimo requerido para la activación financiera inicial.
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="marketplace-commission">Comisión Marketplace</Label>
                        <div className="relative mt-1.5">
                          <Input
                            id="marketplace-commission"
                            type="number"
                            min="0"
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
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Porcentaje aplicado según la configuración financiera vigente.
                        </p>
                      </div>

                      <Button
                        className="w-full"
                        disabled={save.isPending || !minimum || !commission}
                        onClick={() => save.mutate()}
                      >
                        {save.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="mr-2 h-4 w-4" />
                        )}
                        Guardar cambios
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <MiniMetric
                        labelText="Depósito mínimo"
                        value={formatAmount(
                          settings.data?.initialMinimumDeposit,
                          settings.data?.walletCurrency ?? "CUP",
                        )}
                      />
                      <MiniMetric
                        labelText="Comisión"
                        value={settings.data ? `${settings.data.commissionRate * 100} %` : "—"}
                      />
                    </div>
                  )}
                </div>
              )}
            </PremiumPanel>

            <div className="mt-5">
              <PremiumPanel
                title="Modo de prueba Marketplace"
                description="Prueba carreras y comisiones sin afectar a los demás conductores."
                icon={TestTube2}
                tone="violet"
              >
                {testMode.isLoading || testModeDrivers.isLoading ? (
                  <LoadingState />
                ) : (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-foreground">Modo de prueba</p>

                            <p className="mt-1 text-sm text-muted-foreground">
                              Las nuevas carreras se marcarán como PRUEBA y solo podrán ser tomadas
                              por el conductor seleccionado.
                            </p>
                          </div>

                          <Switch
                            checked={testModeEnabled}
                            disabled={!canManageSettings || !canManageMarketplace}
                            onCheckedChange={(checked) => {
                              setTestModeEnabled(checked);

                              if (!checked) {
                                setTestForceCommission(false);
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
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

                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Solo este conductor recibirá las carreras de prueba.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-foreground">Probar comisión real</p>

                            <p className="mt-1 text-sm text-muted-foreground">
                              Aplica la comisión real aunque el conductor todavía esté dentro de su
                              período gratuito.
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
                    </div>

                    <div className="space-y-3">
                      <MiniMetric
                        labelText="Estado"
                        value={testModeEnabled ? "ACTIVO · SOLO PRUEBAS" : "Desactivado"}
                      />

                      <MiniMetric
                        labelText="Conductor"
                        value={
                          testDriver?.displayName ?? testMode.data?.targetDriverDisplayName ?? "—"
                        }
                      />

                      <MiniMetric
                        labelText="Comisión actual"
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

                      {canManageSettings && canManageMarketplace ? (
                        <>
                          <Button
                            className="w-full"
                            disabled={
                              saveTestMode.isPending || (testModeEnabled && !testDriverUserId)
                            }
                            onClick={() => saveTestMode.mutate()}
                          >
                            {saveTestMode.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-2 h-4 w-4" />
                            )}
                            Guardar configuración de prueba
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
                            Eliminar todas las carreras de prueba
                          </Button>
                        </>
                      ) : null}

                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs text-muted-foreground">
                        Estos controles nunca pueden eliminar una carrera real.
                      </div>
                    </div>
                  </div>
                )}
              </PremiumPanel>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Dialog open={Boolean(jobId)} onOpenChange={() => setJobId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del trabajo</DialogTitle>
            <DialogDescription>
              Información operativa y trazabilidad de la solicitud.
            </DialogDescription>
          </DialogHeader>

          {detail.isLoading ? (
            <LoadingState />
          ) : detail.data ? (
            <JobDetail detail={detail.data} />
          ) : (
            <p className="text-sm text-muted-foreground">No se encontró el trabajo.</p>
          )}
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

      <Dialog open={newTopup} onOpenChange={setNewTopup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar recarga</DialogTitle>
            <DialogDescription>
              Registra una nueva solicitud de recarga para un conductor.
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
            <Label htmlFor="topup-method">Método</Label>
            <Input
              id="topup-method"
              className="mt-1.5"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              placeholder="Método"
            />
          </div>

          <div>
            <Label htmlFor="topup-reference">Referencia</Label>
            <Input
              id="topup-reference"
              className="mt-1.5"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Opcional"
            />
          </div>

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
            disabled={create.isPending || !topupDriver || Number(amount) <= 0 || !method.trim()}
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

      <Dialog open={Boolean(topup)} onOpenChange={() => setTopup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gestionar recarga de {topup?.driver}</DialogTitle>
            <DialogDescription>
              Puedes confirmar la operación o rechazarla indicando el motivo.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo obligatorio solo para rechazar"
          />

          <div className="grid grid-cols-2 gap-2">
            <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>
              {confirm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar
            </Button>

            <Button
              variant="destructive"
              disabled={reject.isPending || !reason.trim()}
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
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={text(job.status)} />
        <ServiceBadge service={text(serviceRequest.service_code)} />
      </div>

      <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Ruta
        </p>
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <span className="text-foreground">{text(serviceRequest.origin_text)}</span>
          </div>
          <div className="flex items-start gap-3">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <span className="text-foreground">{text(serviceRequest.destination_text)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MiniMetric labelText="Programado" value={formatDate(serviceRequest.scheduled_for)} />

        {financial ? (
          <MiniMetric
            labelText="Importe"
            value={formatAmount(financial.amount, text(financial.currency))}
          />
        ) : null}

        {customer ? (
          <MiniMetric
            labelText="Cliente"
            value={`${text(customer.display_name)} · ${text(customer.whatsapp_phone)}`}
          />
        ) : null}

        {assignment ? (
          <MiniMetric
            labelText="Conductor / vehículo"
            value={`${text(assignment.driver_user_id)} · ${text(assignment.vehicle_id)}`}
          />
        ) : null}
      </div>

      {financial ? (
        <div className="rounded-xl border border-border/65 bg-background/45 p-3 text-muted-foreground">
          Estado financiero:{" "}
          <span className="font-medium text-foreground">
            {label(text(financial.reservation_status))}
          </span>
        </div>
      ) : null}

      {incidentResolution ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3">
          <p className="font-medium text-foreground">Resolución de incidencia</p>
          <p className="mt-1 text-muted-foreground">
            {label(text(incidentResolution.resolution))} ·{" "}
            {text(incidentResolution.resolution_note)}
          </p>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
          <p className="font-semibold text-foreground">Historial</p>
        </div>

        {timeline.length ? (
          <div className="space-y-2">
            {timeline.map((event, index) => (
              <div
                key={String(event.event_id ?? index)}
                className="rounded-xl border border-border/60 bg-background/40 p-3"
              >
                <p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>
                <p className="mt-1 text-foreground">
                  {text(event.action)} · {label(text(event.from_status))} →{" "}
                  {label(text(event.to_status))}
                </p>
                {event.reason ? (
                  <p className="mt-1 text-xs text-muted-foreground">{text(event.reason)}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Sin eventos.</p>
        )}
      </div>
    </div>
  );
}
