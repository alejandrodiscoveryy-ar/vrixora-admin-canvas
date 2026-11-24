import { useEffect, useState } from "react";
import { BellRing, Loader2, Radar, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";
import MarketplaceTestRouteMap, { type TestPoint } from "./MarketplaceTestRouteMap";

type Driver = { driverUserId: string; displayName: string; category: string; lat: number; lon: number; distanceKm: number; stage: number; gpsRecent: boolean };
type Preview = { checkedAt: string; radiiKm: number[]; count: number; drivers: Driver[] };
type Delivery = { count: number; sent: number; partial: number; failed: number; skipped: number; pending: number; recipients: Array<{ driverUserId: string; status: string; partial: boolean; sentAt: string | null }> };

export default function MarketplaceRadarPointProbe({ projectId, canManage }: {
  projectId: string; canManage: boolean;
}) {
  const [point, setPoint] = useState<TestPoint | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);

  useEffect(() => {
    if (!point) { setPreview(null); return; }
    let alive = true;
    setLoading(true);
    setPreview(null);
    setError(null);
    void getSupabaseClient().rpc("admin_preview_marketplace_radar_point_probe_v1", {
      target_project_id: projectId, target_lat: point.lat, target_lon: point.lon,
    }).then(({ data, error: fault }) => {
      if (!alive) return;
      if (fault) throw fault;
      setPreview(data as Preview);
    }).catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : "No se pudo consultar el radar");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [point, projectId]);

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    let busy = false;
    const refresh = async () => {
      if (!alive || busy) return;
      busy = true;
      try {
        const { data, error: fault } = await getSupabaseClient().rpc(
          "admin_get_marketplace_radar_point_probe_status_v1",
          { target_project_id: projectId, target_run_id: runId },
        );
        if (fault) throw fault;
        if (alive) setDelivery(data as Delivery);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error al consultar notificaciones");
      } finally { busy = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 8000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [projectId, runId]);

  const selectPoint = (_: "origin" | "destination", lat: number, lon: number) => {
    setPoint({ lat, lon, label: "Punto seleccionado" });
    setRunId(null); setDelivery(null); setError(null);
  };

  const notify = async () => {
    if (!canManage || !point || !preview || !preview.count || sending || runId) return;
    if (!window.confirm("¿Notificar a los " + preview.count +
      " conductores encontrados? Es un simulacro sin carreras ni cobros.")) return;
    setSending(true); setError(null);
    try {
      const { data, error: fault } = await getSupabaseClient().rpc(
        "admin_send_marketplace_radar_point_probe_v1", {
          target_project_id: projectId, target_lat: point.lat, target_lon: point.lon,
          target_run_id: crypto.randomUUID(),
        });
      if (fault) throw fault;
      if (!data || typeof data.runId !== "string") throw Error("Respuesta inválida");
      setRunId(data.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se enviaron los avisos");
    } finally { setSending(false); }
  };

  return (
    <section aria-label="Simulador de radar por punto"
      className="min-w-0 rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/[0.08] via-background to-background p-3.5 sm:p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
          <Radar className="size-5"/>
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground sm:text-base">Prueba del radar: toca un punto</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            El radar busca automáticamente a todos los conductores Trabajando y disponibles
            dentro de sus radios. Confirma después el envío de un aviso de prueba.
          </p>
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.95fr)]">
        <MarketplaceTestRouteMap projectId={projectId} origin={point}
          destination={null} route={[]} picking="origin" onPick={selectPoint}
          ariaLabel="Toca un punto para buscar conductores en el radar"
          pickLabel="punto de prueba"
          heightClassName="h-[310px] w-full sm:h-[360px] lg:h-[380px]"
          radarRadiiKm={preview?.radiiKm ?? [1,2,6]}
          radarDrivers={preview?.drivers ?? []}/>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-xl border border-border/50 bg-background/55 p-3">
            <p className="text-xs text-text-secondary">Conductores encontrados</p>
            {loading ? <p role="status" className="mt-2 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin"/> Buscando…</p>
              : !point ? <p className="mt-2 text-sm text-text-secondary">Selecciona un punto del mapa.</p>
              : preview ? <>
                <p className="mt-1 text-3xl font-bold tabular-nums">{preview.count}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {preview.radiiKm.map((km, index) => (
                    <div key={index} className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.05] px-2 py-2 text-center">
                      <span className="block text-[10px] text-text-secondary">{km} km</span>
                      <strong className="text-lg tabular-nums text-cyan-100">
                        {preview.drivers.filter((d) => d.stage === index+1).length}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-amber-200">
                  Naranja: última posición conocida, no ubicación en vivo.
                </p>
              </> : <p className="mt-2 text-sm text-text-secondary">Sin resultados.</p>}
          </div>
          {preview && preview.drivers.length>0 ? (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border/50 px-3 py-1">
              {preview.drivers.map((driver) => (
                <div key={driver.driverUserId} className="flex items-center justify-between gap-2 border-b border-border/40 py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{driver.displayName}</p>
                    <p className="text-[11px] text-text-secondary">{driver.category} · {Number(driver.distanceKm).toFixed(2)} km</p>
                    {delivery?.recipients?.find((recipient) => recipient.driverUserId === driver.driverUserId)?.partial ? (
                      <p className="text-[11px] font-medium text-amber-300">Aviso parcial: algún dispositivo falló</p>
                    ) : null}
                  </div>
                  <span className={driver.gpsRecent
                    ? "shrink-0 rounded-md bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-200"
                    : "shrink-0 rounded-md bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200"}>
                    {driver.gpsRecent ? "GPS reciente" : "GPS antiguo"} · R{driver.stage}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {error ? <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-400/10 p-2 text-xs text-rose-200">{error}</p> : null}
          {!point ? (
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.045] p-3 text-xs leading-relaxed text-text-secondary">
              <p className="font-semibold text-foreground">Cómo funciona</p>
              <p className="mt-1">1. Toca un punto del mapa para buscar conductores.</p>
              <p className="mt-1">2. Revisa los resultados en los anillos de 1, 2 y 6 km.</p>
              <p className="mt-1">3. Confirma el aviso únicamente cuando haya destinatarios.</p>
            </div>
          ) : null}
          {point && preview?.count === 0 ? (
            <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-200">
              No hay conductores disponibles en este punto. Toca otra ubicación.
            </p>
          ) : null}
          {(preview?.count ?? 0) > 0 || runId ? (
            <Button className="min-h-11 w-full"
              disabled={!canManage || !preview || !preview.count || loading || sending || Boolean(runId)}
              onClick={() => { void notify(); }}>
              {sending ? <Loader2 className="mr-2 size-4 animate-spin"/> : <BellRing className="mr-2 size-4"/>}
              {runId ? "Prueba enviada" : "Notificar a los encontrados"}
            </Button>
          ) : null}
          {runId ? (
            <div role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3 text-xs">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-emerald-300"/> Avisos registrados</p>
              <p className="mt-2">Enviados: {delivery?.sent ?? "…"} · Pendientes: {delivery?.pending ?? "…"} · Fallidos: {delivery?.failed ?? "…"} · Omitidos: {delivery?.skipped ?? "…"}</p>
              {delivery?.partial ? <p className="mt-1 font-medium text-amber-300">Entrega parcial: {delivery.partial} conductor(es) con fallo en alguno de sus dispositivos.</p> : null}
              <p className="mt-1 text-text-secondary">Enviado no significa recibido o abierto. Se actualiza cada 8 segundos.</p>
              <button type="button" className="mt-2 flex items-center gap-1.5 text-cyan-200 underline"
                onClick={() => { setPoint(null); setPreview(null); setRunId(null); setDelivery(null); setError(null); }}>
                <RefreshCw className="size-3.5"/> Nueva prueba
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-text-secondary">
        Aviso de prueba, sin carrera ni comisión. Solo dentro del radio máximo:
        no se aplica la expansión fuera del radar. Un GPS antiguo puede corresponder a otra ubicación actual.
      </p>
    </section>
  );
}
