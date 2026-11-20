import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity, AlertTriangle, ArrowUpRight, Banknote, CarFront,
  CheckCircle2, CircleHelp, ClipboardList, Clock3, ShieldAlert,
  TrendingDown, UserRound, Users, Wallet,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  agencyVitalitySignals,
  parseAgencyVitality,
  vitalityToneName,
  type AgencyVitality, type VitalitySignal, type VitalityTone,
} from "@/lib/agency-vitality";
import { SectionCard } from "@/components/admin/SectionCard";
import { premiumSurface } from "@/components/admin/density";

const toneClasses: Record<VitalityTone, string> = {
  green: "border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] text-[var(--semantic-success-foreground)]",
  yellow: "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  red: "border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)] text-[var(--semantic-danger-foreground)]",
  gray: "border-[var(--semantic-inactive-border)] bg-[var(--semantic-inactive-surface)] text-[var(--semantic-inactive-foreground)]",
};
const tones: VitalityTone[] = ["green", "yellow", "orange", "red", "gray"];
const signalIcons = {
  control: Users, clients: UserRound, rides: CarFront,
  cancelled: TrendingDown, incidents: AlertTriangle, topups: Wallet,
};
const statusIcons = {
  green: CheckCircle2, yellow: Clock3, orange: TrendingDown,
  red: ShieldAlert, gray: CircleHelp,
};

const number = (value: number | null | undefined) =>
  value == null ? "—" : new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
const money = (value: number | null | undefined, currency: string) =>
  value == null ? "—" : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value)} ${currency}`;

async function fetchVitality(projectId: string, from: string, to: string): Promise<AgencyVitality> {
  const { data, error } = await getSupabaseClient().rpc("admin_get_agency_vitality_v1", {
    target_project_id: projectId, target_from: from, target_to: to,
  });
  if (error) throw error;
  return parseAgencyVitality(data);
}

function StatusPill({ tone }: { tone: VitalityTone }) {
  const Icon = statusIcons[tone];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClasses[tone]}`}>
      <Icon className="size-3.5" aria-hidden="true" />{vitalityToneName[tone]}
    </span>
  );
}
function SignalCard({ signal }: { signal: VitalitySignal }) {
  const Icon = signalIcons[signal.id as keyof typeof signalIcons] ?? Activity;
  return (
    <details className={`group min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border-default ${premiumSurface}`}>
      <summary className="flex min-h-[132px] cursor-pointer list-none flex-col justify-between gap-2 p-3 marker:hidden [&::-webkit-details-marker]:hidden sm:p-4">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-secondary">
            <Icon className="size-4 shrink-0 text-[var(--module-accent)]" aria-hidden="true"/>{signal.label}
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-text-tertiary group-open:rotate-90" aria-hidden="true"/>
        </span>
        <strong className="text-2xl font-semibold tabular-nums text-text-primary">
          {signal.id === "cancelled" && signal.value != null
            ? `${signal.value.toFixed(1)} %`
            : number(signal.value)}
        </strong>
        <StatusPill tone={signal.tone}/>
      </summary>
      <div className="space-y-2 border-t border-border-subtle px-3 pb-3 pt-2.5 text-xs sm:px-4" aria-label={`Detalle de ${signal.label}`}>
        <p className="leading-relaxed text-text-primary">{signal.explanation}</p>
        <p className="text-text-secondary">Fuente: {signal.basis}.</p>
      </div>
    </details>
  );
}

function InlineStat({ label, value, note }: { label: string; value: string | number | null | undefined; note?: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-border-subtle py-2 last:border-b-0">
      <span className="min-w-0 text-xs text-text-secondary">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary" title={note}>
        {typeof value === "number" ? number(value) : value ?? "—"}
      </span>
    </div>
  );
}

export default function AgencyVitalityOverview({
  projectId, from, to,
}: { projectId: string; from: string; to: string }) {
  const vitality = useQuery({
    queryKey: ["agency-vitality-v1", projectId, from, to],
    queryFn: () => fetchVitality(projectId, from, to),
    staleTime: 30_000, refetchInterval: 60_000, retry: 1,
  });
  const signals = useMemo(() => vitality.data ? agencyVitalitySignals(vitality.data) : [], [vitality.data]);
  const priorities = signals.filter(s => s.priority >= 2).sort((a,b) => b.priority - a.priority);
  const d = vitality.data;

  return (
    <section aria-label="Vitalidad de la Agencia TukTuk" data-admin-module="rendimiento" className="space-y-3">
      <SectionCard density="compact" appearance="premium" module="rendimiento"
        title="Vitalidad de la Agencia"
        description="Semáforo de crecimiento, demanda, calidad y pendientes. Los grises indican que falta base suficiente."
        contentClassName="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1.5"><Activity className="size-4 text-[var(--module-accent)]" aria-hidden="true"/>
            Período: {from} a {to}
          </span>
          <span aria-hidden="true" className="text-text-tertiary">·</span>
          <span>Comparaciones contra período anterior de igual duración</span>
          {d?.computed_at && <span title="Momento de consulta">· Actualizado {new Intl.DateTimeFormat("es-ES", {dateStyle:"short",timeStyle:"short",timeZone:"America/Havana"}).format(new Date(d.computed_at))} (Cuba)</span>}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Leyenda del semáforo">
          {tones.map(tone => <StatusPill key={tone} tone={tone} />)}
        </div>
        {vitality.isLoading ? (
          <div role="status" className="min-h-32 rounded-[var(--radius-compact)] border border-border-default bg-surface-2/65 p-4 text-sm text-text-secondary">
            Consultando datos verificados de la agencia…
          </div>
        ) : vitality.isError || !d ? (
          <div role="alert" className="rounded-[var(--radius-compact)] border border-[var(--semantic-inactive-border)] bg-[var(--semantic-inactive-surface)] p-4">
            <p className="text-sm font-semibold text-text-primary">Vitalidad no disponible todavía</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              No se muestran números sustitutos. Verifica que esté aplicada la función de lectura de Vitalidad en la base de datos y que tu rol tenga permiso de Analítica.
              Las estadísticas existentes siguen disponibles en «Análisis detallado».
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {signals.map(signal => <SignalCard key={signal.id} signal={signal}/>)}
            </div>
            <section aria-label="Prioridades de intervención" className="rounded-[var(--radius-compact)] border border-border-default bg-surface-2/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--semantic-warning)]" aria-hidden="true"/>
                <h3 className="text-sm font-semibold text-text-primary">Prioridades de intervención</h3>
              </div>
              {priorities.length ? (
                <ol className="space-y-2">
                  {priorities.slice(0,4).map(item => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-1/50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary">{item.label}</p>
                        <p className="text-xs text-text-secondary">{item.explanation}</p>
                      </div>
                      <StatusPill tone={item.tone}/>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-text-secondary">No hay alertas con las reglas y los datos disponibles. Los indicadores grises aún no permiten evaluar su estado.</p>
              )}
              <details className="group mt-3 text-xs text-text-secondary">
                <summary className="min-h-9 cursor-pointer py-2 font-medium text-text-primary">Cómo se asignan los colores</summary>
                <p>Caídas de clientes/carreras con al menos 5 casos en el período anterior: amarillo desde 10 %, naranja desde 25 %, rojo desde 40 %. Cancelaciones con al menos 10 solicitudes: 10 %, 20 % y 35 %. Incidencias abiertas: 1 / 2 / 4. Recargas pendientes: 1 / 4 / 11. Sin base, permisos u objetivo: gris. Reglas iniciales de seguimiento, no decisiones automáticas.</p>
              </details>
            </section>
          </>
        )}
      </SectionCard>
      {d && (
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SectionCard density="compact" appearance="premium" module="rendimiento"
            title="Control → Conductor" description="Cohorte observada de usuarios que se registraron en Control"
            contentClassName="p-3 sm:p-4">
            <InlineStat label="Registros instrumentados" value={d.control.registered}/>
            <InlineStat label="Solo Control" value={d.control.only_control}/>
            <InlineStat label="Iniciaron alta" value={d.control.started}/>
            <InlineStat label="Conductor habilitado" value={d.control.activated}/>
            <InlineStat label="Con primera carrera liquidada" value={d.control.first_ride}/>
            <p className="mt-2 text-xs text-text-secondary">Solo usuarios con evento de registro vinculable. No contabiliza instalaciones sin identificación.</p>
            <Link className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              to="/admin/proyectos/$id/$section" params={{id:projectId,section:"trabajos"}} search={{vista:"conductores"}}>
              Consultar conductores <ArrowUpRight className="size-3.5" aria-hidden="true"/>
            </Link>
          </SectionCard>
          <SectionCard density="compact" appearance="premium" module="rendimiento"
            title="Clientes" description="Pasajeros registrados y atendidos"
            contentClassName="p-3 sm:p-4">
            <InlineStat label="Total al cierre del período" value={d.clients?.total}/>
            <InlineStat label="Nuevos en el período" value={d.clients?.new}/>
            <InlineStat label="Atendidos con carrera completada" value={d.clients?.served}/>
            <InlineStat label="Recurrentes históricos (2+)" value={d.clients?.recurrent}/>
            <p className="mt-2 text-xs text-text-secondary">{d.clients ? "Recurrentes = clientes con al menos dos carreras liquidadas." : "No disponible por permisos de Clientes."}</p>
            <Link className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              to="/admin/proyectos/$id/$section" params={{id:projectId,section:"trabajos"}} search={{vista:"clientes"}}>
              Consultar clientes <ArrowUpRight className="size-3.5" aria-hidden="true"/>
            </Link>
          </SectionCard>
          <SectionCard density="compact" appearance="premium" module="rendimiento"
            title="Carreras" description="Creadas en el período, según su estado actual"
            contentClassName="p-3 sm:p-4">
            <InlineStat label="Solicitadas" value={d.rides?.requested}/>
            <InlineStat label="Completadas" value={d.rides?.completed}/>
            <InlineStat label="Liquidadas" value={d.rides?.settled}/>
            <InlineStat label="Canceladas" value={d.rides?.cancelled}/>
            <InlineStat label="Sin asignar" value={d.rides?.unassigned}/>
            <p className="mt-2 text-xs text-text-secondary">Se excluyen carreras de prueba. El estado refleja la consulta actual.</p>
            <Link className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              to="/admin/proyectos/$id/$section" params={{id:projectId,section:"trabajos"}} search={{vista:"trabajos"}}>
              Consultar operaciones <ArrowUpRight className="size-3.5" aria-hidden="true"/>
            </Link>
          </SectionCard>
          <SectionCard density="compact" appearance="premium" module="rendimiento"
            title="Economía y flota" description="Volumen liquidado y capacidad registrada"
            contentClassName="p-3 sm:p-4">
            <InlineStat label="Valor de carreras liquidadas" value={d.finance ? money(d.finance.cup,"CUP") : null}/>
            <InlineStat label="Volumen USD" value={d.finance ? money(d.finance.usd,"USD") : null}/>
            <InlineStat label="Volumen EUR" value={d.finance ? money(d.finance.eur,"EUR") : null}/>
            <InlineStat label="Perfiles de conductor habilitados" value={d.operation?.profiles_active}/>
            <InlineStat label="Total perfiles de conductor" value={d.operation?.profiles_total}/>
            <p className="mt-2 text-xs text-text-secondary">Valores de carreras, no ingresos netos ni comisiones. «Habilitado» no significa conectado o trabajando. La flota es una fotografía actual.</p>
          </SectionCard>
        </div>
      )}
    </section>
  );
}
