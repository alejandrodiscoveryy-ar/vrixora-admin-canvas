import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MetricCard } from "@/components/admin/MetricCard";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle, ArrowUpRight, Banknote, CarFront,
  CheckCircle2, Clock3, MapPin, MapPinOff, ShieldAlert, Users, WalletCards,
} from "lucide-react";
import { parseAgencyVitality } from "@/lib/agency-vitality";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices, type MarketplaceOverview, type MarketplaceTopup } from "@/lib/services";

type Radar = {
  checked_at: string;
  working: number;
  gps_recent: number;
  gps_missing: number;
  profile_ready: number;
  profile_blocked: number;
  radar_reachable: number;
};
type MoneyPulse = {
  currency: "CUP";
  pendingCount: number;
  pendingAmount: number;
  confirmedCount: number | null;
  confirmedNet: number | null;
  corrections: number | null;
};

const amount = (n: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n) + " CUP";
const number = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("es-ES").format(n);

function dateInCuba(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Havana", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (kind: string) => parts.find((value) => value.type === kind)?.value;
  return [part("year"), part("month"), part("day")].join("-");
}

async function readRadar(projectId: string): Promise<Radar> {
  const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_radar_readiness", {
    target_project_id: projectId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("RADAR_UNAVAILABLE");
  const source = data as Record<string, unknown>;
  const fields = ["working", "gps_recent", "gps_missing", "profile_ready", "profile_blocked", "radar_reachable"];
  for (const field of fields) {
    if (typeof source[field] !== "number" || !Number.isFinite(source[field]) || Number(source[field]) < 0) {
      throw new Error("RADAR_INVALID");
    }
  }
  return data as Radar;
}

async function readFinance(projectId: string, canManage: boolean): Promise<MoneyPulse> {
  const records: MarketplaceTopup[] = [];
  let cursor: { at: string; id: string } | null = null;
  const seen = new Set<string>();
  let complete = false;
  for (let page = 0; page < 30; page++) {
    const batch = await supabaseServices.marketplace.listTopups(projectId, { limit: 200, cursor });
    records.push(...batch.items);
    if (!batch.nextCursor) { complete = true; break; }
    const key = batch.nextCursor.at + "/" + batch.nextCursor.id;
    if (seen.has(key)) throw new Error("TOPUPS_PAGINATION_INVALID");
    seen.add(key);
    cursor = batch.nextCursor;
  }
  if (!complete) throw new Error("TOPUPS_PAGINATION_INCOMPLETE");
  if (records.some((r) => r.currency !== "CUP" || !Number.isFinite(r.amount) || r.amount < 0)) {
    throw new Error("TOPUPS_CURRENCY_OR_AMOUNT_INVALID");
  }

  const pending = records.filter((r) => r.status === "requested");
  const result: MoneyPulse = {
    currency: "CUP",
    pendingCount: pending.length,
    pendingAmount: pending.reduce((total, r) => total + r.amount, 0),
    confirmedCount: null,
    confirmedNet: null,
    corrections: null,
  };
  if (!canManage) return result;

  // La RPC de documentos solo devuelve 200 registros. Al alcanzar ese límite
  // no se publican totales netos sin certeza de tener todas las anulaciones.
  const documents = await supabaseServices.marketplace.listFinancialDocuments(projectId, { limit: 200 });
  if (documents.length >= 200) return result;
  const reversed = new Set(documents.filter((d) => d.documentType === "credit_note").map((d) => d.topupId));
  const valid = records.filter((r) => ["confirmed", "reconciled"].includes(r.status) && !reversed.has(r.topupId));
  result.confirmedCount = valid.length;
  result.confirmedNet = valid.reduce((total, r) => total + r.amount, 0);
  result.corrections = reversed.size;
  return result;
}

function OpenView({ projectId, vista, children }: {
  projectId: string;
  vista: "trabajos" | "recargas" | "mapa" | "clientes" | "incidencias" | "conductores";
  children: ReactNode;
}) {
  return (
    <Link to="/admin/proyectos/$id/$section" params={{ id: projectId, section: "trabajos" }}
      search={{ vista }}
      className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children} <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  );
}

type PulseDestination = "trabajos" | "recargas" | "mapa" | "clientes" | "incidencias" | "conductores";

// El enlace envuelve la tarjeta aprobada: mismo diseño premium, sin panel adicional.
function PulseMetricLink({
  projectId, vista, label, children, enabled = true, estadoRecarga,
}: {
  projectId: string;
  vista: PulseDestination;
  label: string;
  children: ReactNode;
  enabled?: boolean;
  estadoRecarga?: "requested" | "confirmed";
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Link
      to="/admin/proyectos/$id/$section"
      params={{ id: projectId, section: "trabajos" }}
      search={estadoRecarga ? { vista, estadoRecarga } : { vista }}
      aria-label={`Abrir ${label} en ${vista}`}
      title={`Abrir ${label}`}
      className="group block h-full min-w-0 cursor-pointer rounded-[var(--radius-card)] transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </Link>
  );
}

export default function MarketplacePulseDecisions({
  projectId, overview, overviewError, canPayments, canManagePayments, canAnalytics, canCustomers,
}: {
  projectId: string;
  overview: MarketplaceOverview | undefined;
  overviewError: boolean;
  canPayments: boolean;
  canManagePayments: boolean;
  canAnalytics: boolean;
  canCustomers: boolean;
}) {
  const today = dateInCuba(new Date());
  const weekStart = dateInCuba(new Date(Date.now() - 6 * 86_400_000));
  const radar = useQuery({
    queryKey: ["marketplace-radar-readiness", projectId],
    queryFn: () => readRadar(projectId),
    refetchInterval: 30_000, staleTime: 10_000, retry: 1,
  });
  const vitality = useQuery({
    queryKey: ["agency-vitality-v1", projectId, weekStart, today],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_agency_vitality_v1", {
        target_project_id: projectId, target_from: weekStart, target_to: today,
      });
      if (error) throw error;
      return parseAgencyVitality(data);
    },
    enabled: canAnalytics, refetchInterval: 60_000, staleTime: 30_000, retry: 1,
  });
  const finances = useQuery({
    queryKey: ["marketplace-topups", projectId, "pulse-decision", canManagePayments],
    queryFn: () => readFinance(projectId, canManagePayments),
    enabled: canPayments, refetchInterval: 60_000, staleTime: 30_000, retry: 1,
  });

  const live = radar.isError ? null : radar.data;
  const rides = vitality.isError ? null : vitality.data?.rides;
  const clients = vitality.isError ? null : vitality.data?.clients;
  const finance = finances.isError ? null : finances.data;
  const cancellationRate = rides && rides.requested > 0 ? rides.cancelled / rides.requested : null;
  const alerts = [
    ...(cancellationRate !== null && rides && rides.cancelled > 0 && cancellationRate >= 0.3 ? [{
      id: "cancelaciones", tone: "red" as const,
      title: String(rides.cancelled) + " de " + String(rides.requested) + " carreras canceladas",
      note: "Últimas 7 fechas: revisar motivos y abandonos antes de ampliar campañas.",
      target: "trabajos" as const, action: "Revisar carreras",
    }] : []),
    ...(overview && !overviewError && overview.jobsIncidentOpen > 0 ? [{
      id: "incidencias", tone: "red" as const,
      title: String(overview.jobsIncidentOpen) + " incidencias abiertas",
      note: "Necesitan seguimiento operativo.", target: "incidencias" as const, action: "Resolver",
    }] : []),
    ...(overview && !overviewError && overview.jobsPublished > 0 ? [{
      id: "sin-asignar", tone: "amber" as const,
      title: String(overview.jobsPublished) + " carreras esperando conductor",
      note: "Revisar asignación y cobertura.", target: "trabajos" as const, action: "Abrir operaciones",
    }] : []),
    ...(finance && finance.pendingCount > 0 ? [{
      id: "recargas", tone: "amber" as const,
      title: amount(finance.pendingAmount) + " pendientes de verificar",
      note: String(finance.pendingCount) + " solicitudes; no son ingresos confirmados.",
      target: "recargas" as const, action: "Revisar recargas",
    }] : []),
    ...(live && live.working > 0 && live.gps_missing > 0 ? [{
      id: "gps", tone: "amber" as const,
      title: String(live.gps_missing) + " trabajando sin GPS reciente",
      note: "Ubicación sin actualizar en 5 minutos; no significa conductor inactivo ni lo excluye automáticamente de ofertas.",
      target: "mapa" as const, action: "Ver mapa",
    }] : []),
  ];

  const incomplete = radar.isError || (canPayments && finances.isError) || (canAnalytics && vitality.isError) || overviewError;
  const loading = radar.isPending || (canPayments && finances.isPending) || (canAnalytics && vitality.isPending);

  // Se integra dentro del Pulso aprobado. No crea un segundo panel, cabecera ni tarjetas de otro estilo.
  const cardBase = {
    density: "compact" as const,
    appearance: "premium" as const,
  };
  return (
    <>
      {incomplete ? (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] px-3 py-2 text-xs text-[var(--semantic-warning-foreground)]">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          Datos parciales: las cifras que faltan se muestran como «—», no como cero.
        </p>
      ) : null}
      <div className="relative mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-secondary">Jornada real, demanda, cancelaciones y dinero comprobable</p>
        <span className="text-[11px] text-text-tertiary">{loading ? "Consultando…" : "Datos operativos cada 30–60 s"}</span>
      </div>
      <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4" aria-label="Indicadores para tomar decisiones">
        <PulseMetricLink projectId={projectId} vista="conductores" label="Conductores trabajando">
          <MetricCard {...cardBase} label="Conductores trabajando" value={live ? number(live.working) : "—"}
          description="Jornada y aceptación activas" comparison="Operación"
          icon={CarFront} semanticState="success" isLoading={radar.isPending} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="mapa" label="GPS reciente">
          <MetricCard {...cardBase} label="GPS reciente" value={live ? number(live.gps_recent) : "—"}
          description="Posición de últimos 5 min" comparison="Cobertura"
          icon={MapPin} module="resumen" isLoading={radar.isPending} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="mapa" label="GPS sin actualizar">
          <MetricCard {...cardBase} label="GPS sin actualizar" value={live ? number(live.gps_missing) : "—"}
          description="Siguen marcados trabajando" comparison="Revisar señal"
          icon={MapPinOff} semanticState="warning" isLoading={radar.isPending} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="conductores" label="Perfiles habilitados">
          <MetricCard {...cardBase} label="Perfiles habilitados" value={overviewError || !overview ? "—" : number(overview.driversActive)}
          description="No equivale a trabajando" comparison="Equipo" icon={Users}
          isLoading={!overview && !overviewError} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="trabajos" label="Solicitudes · 7 fechas">
          <MetricCard {...cardBase} label="Solicitudes · 7 fechas" value={rides ? number(rides.requested) : "—"}
          description="Carreras reales registradas" comparison="Demanda" icon={CarFront}
          module="resumen" isLoading={canAnalytics && vitality.isPending} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="trabajos" label="Completadas · 7 fechas">
          <MetricCard {...cardBase} label="Completadas · 7 fechas" value={rides ? number(rides.completed) : "—"}
          description="Incluye las liquidadas" comparison="Resultado" icon={CheckCircle2}
          semanticState="success" isLoading={canAnalytics && vitality.isPending} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="trabajos" label="Canceladas · 7 fechas">
          <MetricCard {...cardBase} label="Canceladas · 7 fechas" value={rides ? number(rides.cancelled) : "—"}
          description={cancellationRate == null ? "Sin base para tasa" : Math.round(cancellationRate * 100) + " % de las solicitadas"}
          comparison="Calidad" icon={ShieldAlert} semanticState={rides && rides.cancelled > 0 ? "danger" : undefined}
          isLoading={canAnalytics && vitality.isPending} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="clientes" label="Clientes nuevos · 7 fechas" enabled={canCustomers}>
          <MetricCard {...cardBase} label="Clientes nuevos · 7 fechas" value={clients ? number(clients.new) : "—"}
          description="Registrados en el período" comparison="Captación" icon={Users}
          module="comercial" isLoading={canAnalytics && vitality.isPending} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="trabajos" label="Esperando conductor">
          <MetricCard {...cardBase} label="Esperando conductor" value={overviewError || !overview ? "—" : number(overview.jobsPublished)}
          description="Publicadas y vigentes" comparison="Asignación" icon={Clock3}
          semanticState="warning" isLoading={!overview && !overviewError} />
        </PulseMetricLink>
        <PulseMetricLink projectId={projectId} vista="incidencias" label="Incidencias abiertas">
          <MetricCard {...cardBase} label="Incidencias abiertas" value={overviewError || !overview ? "—" : number(overview.jobsIncidentOpen)}
          description="Requieren seguimiento" comparison="Atención" icon={AlertTriangle}
          semanticState="danger" isLoading={!overview && !overviewError} />
        </PulseMetricLink>
        {canPayments ? (
          <>
            <PulseMetricLink projectId={projectId} vista="recargas" label="Recargas por verificar" estadoRecarga="requested">
          <MetricCard {...cardBase} label="Recargas por verificar" value={finance ? amount(finance.pendingAmount) : "—"}
              description={finance ? number(finance.pendingCount) + " solicitudes · no ingresado" : "Pendientes de comprobar"}
              comparison="Finanzas" icon={WalletCards} semanticState="warning" isLoading={finances.isPending} />
        </PulseMetricLink>
            <PulseMetricLink projectId={projectId} vista="recargas" label="Recargas vigentes" estadoRecarga="confirmed">
          <MetricCard {...cardBase} label="Recargas vigentes" value={finance?.confirmedNet == null ? "—" : amount(finance.confirmedNet)}
              description={finance?.confirmedCount == null ? "Sin desglose completo" : number(finance.confirmedCount) + " confirmaciones netas de anulaciones"}
              comparison="No conciliado" icon={Banknote} semanticState="success" isLoading={finances.isPending} />
        </PulseMetricLink>
            <PulseMetricLink projectId={projectId} vista="trabajos" label="Valor de carreras liquidadas">
          <MetricCard {...cardBase} label="Valor de carreras liquidadas" value={vitality.data?.finance ? amount(vitality.data.finance.cup) : "—"}
              description="7 fechas · no es ingreso neto" comparison="CUP"
              icon={Banknote} isLoading={canAnalytics && vitality.isPending} />
        </PulseMetricLink>
          </>
        ) : null}
      </div>
      <div className="relative mt-3 border-t border-border-default pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Atención operativa</h3>
          <OpenView projectId={projectId} vista="trabajos">Ver operaciones</OpenView>
        </div>
        <div className="grid gap-2 lg:grid-cols-2" aria-label="Prioridades y acciones">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border-default bg-surface-2/60 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                  {alert.tone === "red" ? <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--semantic-danger)]" /> :
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" />}
                  {alert.title}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-text-secondary">{alert.note}</p>
              </div>
              <OpenView projectId={projectId} vista={alert.target}>{alert.action}</OpenView>
            </div>
          ))}
          {alerts.length === 0 && loading ? (
            <p role="status" className="text-xs text-text-secondary">Consultando las prioridades de la operación…</p>
          ) : alerts.length === 0 && !incomplete ? (
            <p className="text-xs text-text-secondary">No hay alertas en los indicadores disponibles.</p>
          ) : null}
        </div>
      </div>
      {canPayments ? (
        <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
          Recargas pendientes no son ingresos. Las confirmadas vigentes excluyen las notas de corrección, pero no equivalen a ingresos bancarios conciliados ni a saldo disponible.
          {finance?.corrections != null ? " Correcciones registradas: " + number(finance.corrections) + "." : ""}
        </p>
      ) : null}
      {!canAnalytics ? (
        <p className="mt-2 text-xs text-text-secondary">Para ver el histórico de clientes y carreras se requiere permiso de Analítica.</p>
      ) : null}
    </>
  );
}
