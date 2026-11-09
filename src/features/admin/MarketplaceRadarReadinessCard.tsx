import { useQuery } from "@tanstack/react-query";
import { Radar, MapPinOff, ChevronDown, RadioTower, AlertTriangle, UserRoundCheck } from "lucide-react";
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

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div
      title={note}
      className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2"
    >
      <span className="min-w-0 text-[11px] font-semibold leading-tight text-slate-300">{label}</span>
      <strong className="shrink-0 text-lg font-extrabold tabular-nums leading-none text-white">{value}</strong>
    </div>
  );
}

export default function MarketplaceRadarReadinessCard({ projectId }: { projectId: string }) {
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
      aria-label="Diagnóstico de disponibilidad del radar"
      className="relative isolate overflow-hidden rounded-[16px] border border-cyan-400/20 bg-gradient-to-br from-[#10282e] to-[#0b171e] p-3 sm:rounded-[18px] sm:p-3.5"
    >
      <Radar aria-hidden="true" className="pointer-events-none absolute -right-4 -top-5 -z-10 h-28 w-28 text-cyan-200/[0.03]" />
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-cyan-100">
          <Radar className="h-4 w-4 shrink-0" aria-hidden="true" />
          Radar operativo
        </h3>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-300" title="Actualización automática cada 30 segundos">
          {readiness.isFetching ? "Actualizando…" : "Cada 30 s"}
        </span>
      </div>
      {readiness.isPending ? <p className="mt-2 text-xs text-slate-300">Consultando disponibilidad…</p> : null}
      {readiness.isError ? <p role="alert" className="mt-2 text-xs text-amber-200">No se pudo consultar el radar. No se muestran valores estimados.</p> : null}
      {d ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <Metric label="Trabajando" value={d.working} />
            <Metric label="GPS reciente" value={d.gps_recent} note="Posición validada" />
            <Metric label="Aptos" value={d.profile_ready} note="Perfil y vehículo aptos" />
            <Metric label="Candidatos con GPS" value={d.radar_reachable} note="Preselección técnica" />
            <Metric label="Alertas Android" value={d.android_channel_v2} note="Canal Android V2" />
          </div>

          {problem ? (
            <p role="status" className="mt-2 flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-2 text-xs font-semibold text-amber-100">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              Sin candidatos aptos con GPS reciente.
            </p>
          ) : d.working === 0 ? (
            <p role="status" className="mt-2 flex items-center gap-2 text-xs text-amber-200">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              No hay conductores trabajando.
            </p>
          ) : null}

          <details className="group mt-2 rounded-lg border border-white/10 bg-black/10">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[11px] font-semibold text-cyan-100 [&::-webkit-details-marker]:hidden">
              Ver diagnóstico y criterios
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-white/10 px-3 py-2.5 text-[11px] text-slate-300">
              <p>GPS reciente: últimos 5 minutos · Actualización cada 30 s</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <MapPinOff aria-hidden="true" className="h-3.5 w-3.5" />
                  Sin GPS reciente: <strong className="text-white">{d.gps_missing}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UserRoundCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Perfil o vehículo no apto: <strong className="text-white">{d.profile_blocked}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <RadioTower aria-hidden="true" className="h-3.5 w-3.5" />
                  Alertas Android V2: {d.android_channel_v2} de {d.android_push_enabled} con token
                </span>
              </div>
              <p>La selección definitiva depende de radio, expansión, prioridad, servicio y compatibilidad.</p>
              <p>Los indicadores pueden solaparse. El diagnóstico no cambia el estado de los conductores.</p>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
