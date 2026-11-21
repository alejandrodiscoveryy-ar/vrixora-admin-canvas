import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity, AlertTriangle, ArrowUpRight, Banknote, CarFront,
  CheckCircle2, Clock3, MapPin, MapPinOff, ShieldAlert, Users, WalletCards,
} from "lucide-react";
import { premiumSurface, premiumHeaderSurface } from "@/components/admin/density";
import { parseAgencyVitality } from "@/lib/agency-vitality";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices, type MarketplaceOverview, type MarketplaceTopup } from "@/lib/services";
import { cn } from "@/lib/utils";

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
  children: React.ReactNode;
}) {
  return (
    <Link to="/admin/proyectos/$id/$section" params={{ id: projectId, section: "trabajos" }}
      search={{ vista }}
      className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children} <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  );
}

function Stat({ label, value, context, icon: Icon, tone = "neutral" }: {
  label: string; value: string | number; context: string;
  icon: typeof Users; tone?: "neutral" | "cyan" | "amber" | "red" | "green";
}) {
  const colors = {
    neutral: "border-border-default text-text-primary",
    cyan: "border-cyan-500/30 text-cyan-300",
    amber: "border-amber-500/30 text-amber-300",
    red: "border-rose-500/30 text-rose-300",
    green: "border-emerald-500/30 text-emerald-300",
  };
  return (
    <div className={cn("relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border bg-surface-2/80 p-3", colors[tone])}>
      <Icon aria-hidden="true" strokeWidth={1.25} className="pointer-events-none absolute -bottom-2 right-1 h-16 w-16 opacity-[0.07]" />
      <div className="relative flex items-center gap-2 text-xs font-medium text-text-secondary">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{label}
      </div>
      <p className="relative mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="relative mt-1 text-[11px] leading-snug text-text-secondary">{context}</p>
    </div>
  );
}

export default function MarketplacePulseDecisions({
  projectId, overview, overviewError, canPayments, canManagePayments, canAnalytics,
}: {
  projectId: string;
  overview: MarketplaceOverview | undefined;
  overviewError: boolean;
  canPayments: boolean;
  canManagePayments: boolean;
  canAnalytics: boolean;
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
  return (
    <section aria-label="Pulso para decisiones operativas" className={cn("relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300">
            <Activity aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300">TukTuk · Dirección operativa</p>
            <h2 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">Qué requiere atención</h2>
            <p className="text-xs text-text-secondary">Conductores trabajando, demanda, cancelaciones y recargas; con fuentes verificables.</p>
          </div>
        </div>
        <span role="status" className="rounded-lg border border-border-default bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary">
          {incomplete ? "Datos parciales" : loading ? "Consultando…" : "Actualización automática · 30–60 s"}
        </span>
      </header>
      {incomplete ? (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-xs text-amber-200">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" /> Una fuente no respondió. Las cifras faltantes se muestran como «—», no como cero.
        </p>
      ) : null}
      <div className="grid gap-2 lg:grid-cols-2" aria-label="Prioridades y acciones">
        {alerts.map((alert) => (
          <div key={alert.id} className={cn(
            "relative flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3",
            alert.tone === "red" ? "border-rose-500/25 bg-rose-500/[0.06]" : "border-amber-500/20 bg-amber-500/[0.05]",
          )}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                {alert.tone === "red" ? <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-rose-300" /> :
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-300" />}
                {alert.title}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{alert.note}</p>
            </div>
            <OpenView projectId={projectId} vista={alert.target}>{alert.action}</OpenView>
          </div>
        ))}
        {alerts.length === 0 && loading ? (
          <p role="status" className="rounded-xl border border-border-default bg-surface-2 p-3 text-sm text-text-secondary">Analizando prioridades actuales…</p>
        ) : alerts.length === 0 && !incomplete ? (
          <p className="rounded-xl border border-border-default bg-surface-2 p-3 text-sm text-text-secondary">No hay alertas en los indicadores disponibles. Comprueba la actividad de las carreras antes de tomar decisiones.</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3">
        <h3 className="text-sm font-semibold text-text-primary">Flota disponible para la operación</h3>
        <OpenView projectId={projectId} vista="conductores">Ver conductores</OpenView>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Stat label="Perfiles habilitados" value={overviewError ? "—" : number(overview?.driversActive)} context="No equivale a trabajando" icon={Users} />
        <Stat label="Trabajando" value={number(live?.working)} context="Jornada/aceptación activa" icon={CarFront} tone="green" />
        <Stat label="GPS reciente" value={number(live?.gps_recent)} context="Señal registrada en los últimos 5 min" icon={MapPin} tone="cyan" />
        <Stat label="GPS sin actualizar" value={number(live?.gps_missing)} context="Siguen marcados como trabajando" icon={MapPinOff} tone="amber" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3">
        <h3 className="text-sm font-semibold text-text-primary">Demanda y resultados · 7 fechas hasta hoy</h3>
        <OpenView projectId={projectId} vista="trabajos">Ver operaciones</OpenView>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Carreras solicitadas" value={number(rides?.requested)} context="Excluye pruebas y eliminadas" icon={CarFront} tone="cyan" />
        <Stat label="Completadas" value={number(rides?.completed)} context="Completadas o liquidadas" icon={CheckCircle2} tone="green" />
        <Stat label="Canceladas" value={number(rides?.cancelled)} context={cancellationRate === null ? "Sin base de tasa" : Math.round(cancellationRate * 100) + " % de las solicitadas"} icon={ShieldAlert} tone={rides?.cancelled ? "red" : "neutral"} />
        <Stat label="Clientes nuevos" value={number(clients?.new)} context="Registrados en el período" icon={Users} />
        <Stat label="Sin conductor" value={overviewError ? "—" : number(overview?.jobsPublished)} context="Publicadas y no vencidas, ahora" icon={Clock3} tone="amber" />
      </div>
      {!canAnalytics ? <p className="mt-2 text-xs text-text-secondary">La actividad histórica requiere permiso de Analítica; se conserva la vista operativa actual.</p> : null}

      {canPayments ? (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3">
            <h3 className="text-sm font-semibold text-text-primary">Dinero registrado y por comprobar</h3>
            <OpenView projectId={projectId} vista="recargas">Revisar recargas</OpenView>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Pendiente de verificar" value={finance ? amount(finance.pendingAmount) : "—"}
              context={finance ? number(finance.pendingCount) + " solicitudes · no ingresado" : "Solicitudes sin verificar"}
              icon={WalletCards} tone="amber" />
            <Stat label="Recargas confirmadas vigentes" value={finance?.confirmedNet == null ? "—" : amount(finance.confirmedNet)}
              context={finance?.confirmedCount == null ? "Sin conciliación completa disponible" : number(finance.confirmedCount) + " confirmaciones, anulaciones descontadas"}
              icon={Banknote} tone="green" />
            <Stat label="Importe de carreras liquidadas" value={vitality.data?.finance ? amount(vitality.data.finance.cup) : "—"}
              context="Últimas 7 fechas · valor de carreras, no ingreso neto"
              icon={Banknote} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
            Las recargas confirmadas vigentes excluyen las que tienen nota de corrección; no son ingresos bancarios conciliados ni saldo disponible.
            {finance?.corrections != null ? " Notas de corrección registradas: " + number(finance.corrections) + "." : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
