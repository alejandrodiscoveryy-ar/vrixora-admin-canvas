import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BellRing,
  ChevronDown,
  MapPin,
  MapPinOff,
  Navigation,
  RadioTower,
  ShieldCheck,
  UsersRound,
  UserRoundCheck,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type RadarReadiness = {
  checked_at: string;
  gps_ttl_seconds: number;
  working: number;
  gps_recent: number;
  gps_missing: number;
  profile_ready: number;
  profile_blocked: number;
  radar_reachable: number;
  android_push_enabled: number;
  android_channel_v2: number;
};

type MetricTone = "neutral" | "signal" | "eligible";

function Metric({
  label,
  value,
  note,
  tone = "neutral",
  icon: Icon,
  fullOnMobile = false,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: MetricTone;
  icon: typeof MapPin;
  fullOnMobile?: boolean;
}) {
  const surface =
    tone === "signal"
      ? "border-cyan-400/25 bg-gradient-to-br from-cyan-400/[0.12] to-cyan-950/[0.10]"
      : tone === "eligible"
        ? "border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.12] to-emerald-950/[0.10]"
        : "border-white/[0.09] bg-white/[0.035]";
  const emphasis =
    tone === "signal"
      ? "text-cyan-200"
      : tone === "eligible"
        ? "text-emerald-200"
        : "text-white";
  const iconTone =
    tone === "signal"
      ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
      : tone === "eligible"
        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-slate-300";

  return (
    <div
      title={note}
      className={
        "relative min-w-0 rounded-[14px] border px-3 py-2.5 shadow-[0_10px_22px_-18px_rgba(0,0,0,0.8)] transition-colors sm:px-3.5 " +
        surface +
        (fullOnMobile ? " col-span-2 sm:col-span-1" : "")
      }
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border " + iconTone}>
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 text-[11px] font-medium leading-tight text-slate-300">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <strong className={"text-[25px] font-bold leading-none tracking-tight tabular-nums sm:text-[27px] " + emphasis}>
          {value}
        </strong>
        {tone !== "neutral" ? (
          <span aria-hidden="true" className={"mb-0.5 h-1.5 w-1.5 shrink-0 rounded-full " + (tone === "signal" ? "bg-cyan-400/70" : "bg-emerald-400/70")} />
        ) : null}
      </div>
    </div>
  );
}

export default function MarketplaceRadarReadinessCard({ projectId }: { projectId: string }) {
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const diagnosisId = useId();
  const readiness = useQuery({
    queryKey: ["marketplace-radar-readiness", projectId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_radar_readiness",
        { target_project_id: projectId },
      );
      if (error) throw error;
      return data as RadarReadiness;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  });
  const d = readiness.data;
  const problem = d != null && d.working > 0 && d.radar_reachable === 0;

  return (
    <section
      aria-label="Diagnóstico de disponibilidad del GPS"
      className="relative isolate min-w-0 overflow-hidden rounded-[18px] border border-cyan-300/[0.13] bg-gradient-to-br from-[#11252c] via-[#101e27] to-[#0b1720] p-3 shadow-[0_20px_48px_-38px_rgba(8,145,178,0.55)] sm:p-3.5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-cyan-400/[0.035] blur-3xl" />
      <div className="relative flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-200">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-white sm:text-[15px]">GPS operativo</h3>
            <p className="hidden text-[11px] text-slate-400 sm:block">Disponibilidad técnica en tiempo real</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {d ? (
            <button
              type="button"
              aria-expanded={diagnosisOpen}
              aria-controls={diagnosisId}
              aria-label={diagnosisOpen ? "Ocultar diagnóstico GPS" : "Ver diagnóstico GPS"}
              onClick={() => setDiagnosisOpen((open) => !open)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.055] px-2.5 text-[11px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/40 hover:bg-cyan-400/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 sm:px-3"
            >
              <span className="sm:hidden">Detalles</span>
              <span className="hidden sm:inline">Ver diagnóstico</span>
              <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${diagnosisOpen ? "rotate-180" : ""}`} />
            </button>
          ) : null}
          <span
            role="status"
            aria-label={readiness.isFetching ? "Actualizando disponibilidad GPS" : "Actualización automática cada 30 segundos"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] font-medium text-slate-300 sm:px-2.5"
          >
            <Activity aria-hidden="true" className="h-3 w-3 text-cyan-300" />
            <span className="sm:hidden">{readiness.isFetching ? "…" : "30 s"}</span>
            <span className="hidden sm:inline">{readiness.isFetching ? "Actualizando…" : "Cada 30 s"}</span>
          </span>
        </div>
      </div>

      {readiness.isPending ? <p className="mt-2 text-xs text-slate-300">Consultando disponibilidad…</p> : null}
      {readiness.isError ? <p role="alert" className="mt-2 text-xs text-amber-200">No se pudo consultar la disponibilidad GPS. No se muestran valores estimados.</p> : null}

      {d ? (
        <>
          <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <Metric label="Trabajando" value={d.working} icon={UsersRound} />
            <Metric label="GPS reciente" value={d.gps_recent} tone="signal" icon={MapPin} note="Posición validada" />
            <Metric label="Aptos" value={d.profile_ready} icon={ShieldCheck} note="Perfil y vehículo aptos" />
            <Metric label="Candidatos con GPS" value={d.radar_reachable} tone="eligible" icon={Navigation} note="Preselección técnica" />
            <Metric label="Alertas Android" value={d.android_channel_v2} icon={BellRing} fullOnMobile note="Canal Android V2" />
          </div>

          {problem ? (
            <p role="status" className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-2.5 py-2 text-[11px] font-medium text-amber-100">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              Sin candidatos aptos con GPS reciente.
            </p>
          ) : d.working === 0 ? (
            <p role="status" className="mt-2.5 flex items-center gap-2 text-[11px] font-medium text-amber-200">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              No hay conductores trabajando.
            </p>
          ) : null}

          <div id={diagnosisId} hidden={!diagnosisOpen} className="relative mt-2 border-t border-white/[0.09] pt-2">
            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/[0.12] px-3 py-3 text-[11px] leading-relaxed text-slate-300">
              <p>GPS reciente: últimos 5 minutos · Actualización cada 30 s</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPinOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Sin GPS reciente: <strong className="text-white">{d.gps_missing}</strong>
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <UserRoundCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Perfil o vehículo no apto: <strong className="text-white">{d.profile_blocked}</strong>
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <RadioTower aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Alertas Android V2: {d.android_channel_v2} de {d.android_push_enabled} con token
                </span>
              </div>
              <p>La selección definitiva depende de radio, expansión, prioridad, servicio y compatibilidad.</p>
              <p>Los indicadores pueden solaparse. El diagnóstico no cambia el estado de los conductores.</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
