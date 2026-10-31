import { useQuery } from "@tanstack/react-query";
import { Radar, MapPinOff, CircleCheck, RadioTower, AlertTriangle, UserRoundCheck } from "lucide-react";
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
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <p className="text-[11px] text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{value}</p>
      {note ? <p className="mt-1 text-[11px] text-slate-400">{note}</p> : null}
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
    <section aria-label="Diagnóstico de disponibilidad del radar"
      className="relative isolate overflow-hidden rounded-[22px] border border-cyan-400/20 bg-gradient-to-br from-[#10282e] to-[#0b171e] p-4 sm:p-5">
      <Radar aria-hidden="true" className="pointer-events-none absolute -right-5 -top-9 -z-10 h-48 w-48 text-cyan-200/[0.035]" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-cyan-100">
          <Radar className="h-5 w-5" aria-hidden="true" />
          <h3 className="text-base font-bold">Disponibilidad operativa del radar</h3>
        </div>
        <span className="text-xs text-slate-300">GPS reciente: últimos 5 minutos · Actualiza cada 30 s</span>
      </div>
      {readiness.isPending ? <p className="mt-3 text-xs text-slate-300">Consultando disponibilidad real…</p> : null}
      {readiness.isError ? <p role="alert" className="mt-3 text-xs text-amber-200">No se pudo consultar la disponibilidad. Los datos no se sustituyen por estimaciones.</p> : null}
      {d ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Metric label="En Trabajar" value={d.working} />
            <Metric label="GPS reciente" value={d.gps_recent} note="Posición validada" />
            <Metric label="Perfil y vehículo aptos" value={d.profile_ready} note="Requisitos operativos" />
            <Metric label="Candidatos con GPS" value={d.radar_reachable} note="Preselección técnica" />
            <Metric label="Alertas Android V2" value={d.android_channel_v2} note={"De " + d.android_push_enabled + " con token Android"} />
          </div>
          {problem ? (
            <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Hay conductores en Trabajar, pero ninguno reúne perfil, vehículo y GPS reciente. Revisa la ubicación antes de evaluar la selección por radio.</span>
            </div>
          ) : d.working === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-200"><AlertTriangle className="h-4 w-4" /> No hay conductores en Trabajar.</p>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-xs text-emerald-200">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Hay candidatos técnicos. La selección definitiva de cada carrera depende del radio, expansión, prioridad, servicio y compatibilidad configurados.
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <MapPinOff className="h-3.5 w-3.5" /> Sin GPS reciente: {d.gps_missing}.
            <UserRoundCheck className="h-3.5 w-3.5" /> Perfil o vehículo no apto: {d.profile_blocked}.
            <RadioTower className="h-3.5 w-3.5" /> Los indicadores pueden superponerse. El diagnóstico no cambia el estado de los conductores.
          </p>
        </>
      ) : null}
    </section>
  );
}
