import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FlaskConical, Send, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices } from "@/lib/services";

interface AudienceDriver {
  driver_user_id: string;
  display_name: string;
  status: string;
}
interface TestHistoryEntry {
  job_id: string;
  created_at: string;
  status: string;
  service_code: string;
  origin_text: string;
  destination_text: string;
  final_price: number;
  recipient_count: number;
  destination_mode: string;
  accepted_driver_user_id: string | null;
  recipients: Array<{ driver_user_id: string; display_name: string }>;
  notification_status: Array<{ driver_user_id: string; delivery_status: string; attempt_count: number }>;
  deleted: boolean;
}
const names: Record<string, string> = {
  passenger: "Pasajeros", cargo: "Carga", courier: "Mensajería", tourism: "Turismo",
  light_car: "Auto ligero", bicitaxi: "Bicitaxi", tricycle: "Triciclo", bicycle: "Bicicleta",
  motorcycle: "Motocicleta", van: "Furgoneta", truck: "Camión", other: "Otro",
  published: "Publicada", accepted: "Aceptada", en_route: "En camino",
  pickup: "Recogida", in_progress: "En curso", completed: "Completada",
  settled: "Liquidada", expired: "Expirada", incident: "Incidencia",
};
function labelFor(value: string) { return names[value] ?? value; }
function errorMessage(value: unknown) { return value instanceof Error ? value.message : "No se pudo completar la operación."; }

async function rpcJson<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export default function MarketplaceTestCenterV2({
  projectId,
  canManage,
  canManagePayments,
  onOpenJob,
}: {
  projectId: string;
  canManage: boolean;
  canManagePayments: boolean;
  onOpenJob: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forceRealCommission, setForceRealCommission] = useState(false);
  const [recipientMode, setRecipientMode] = useState<"individual" | "group">("individual");
  const [individualId, setIndividualId] = useState("");
  const [serviceCode, setServiceCode] = useState("passenger");
  const [vehicleCategory, setVehicleCategory] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [price, setPrice] = useState("200");
  const [notes, setNotes] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [successJobId, setSuccessJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ["marketplace-test-mode", projectId],
    queryFn: () => supabaseServices.marketplace.testMode(projectId),
  });
  const drivers = useQuery({
    queryKey: ["marketplace-test-mode-drivers", projectId],
    queryFn: () => supabaseServices.marketplace.listDrivers(projectId, { limit: 200 }),
  });
  const audience = useQuery({
    queryKey: ["marketplace-test-audience", projectId],
    queryFn: () => rpcJson<AudienceDriver[]>("admin_get_marketplace_test_audience", { target_project_id: projectId }),
  });
  const history = useQuery({
    queryKey: ["marketplace-test-history", projectId],
    queryFn: () => rpcJson<TestHistoryEntry[]>("admin_list_marketplace_test_jobs", { target_project_id: projectId, target_limit: 40 }),
  });
  useEffect(() => {
    if (!current.data || !audience.data) return;
    setEnabled(current.data.enabled);
    const ids = audience.data.map((item) => item.driver_user_id);
    if (ids.length === 0 && current.data.targetDriverUserId) ids.push(current.data.targetDriverUserId);
    setSelectedIds(ids);
  }, [current.data, audience.data]);
  useEffect(() => {
    if (!selectedIds.includes(individualId)) setIndividualId(selectedIds[0] ?? "");
  }, [selectedIds, individualId]);
  const eligible = useMemo(() => (drivers.data?.items ?? []).filter((driver) =>
    driver.status === "active" && Boolean(driver.activatedAt) && !driver.suspendedAt
  ), [drivers.data]);
  const selected = eligible.filter((driver) => selectedIds.includes(driver.userId));
  const allowed = recipientMode === "group" ? selectedIds : (individualId ? [individualId] : []);
  const configured = current.data?.enabled && audience.data != null;
  const dirty = enabled !== Boolean(current.data?.enabled) ||
    [...selectedIds].sort().join() !== [...(audience.data?.map((d) => d.driver_user_id) ??
      (current.data?.targetDriverUserId ? [current.data.targetDriverUserId] : []))].sort().join();

  const save = useMutation({
    mutationFn: async () => {
      if (enabled && selectedIds.length === 0) throw new Error("Selecciona al menos un conductor.");
      if (selectedIds.length > 30) throw new Error("El máximo es de 30 conductores.");
      if (selectedIds.length > 0) {
        await rpcJson("admin_set_marketplace_test_audience", {
          target_project_id: projectId,
          target_driver_user_ids: selectedIds,
        });
      }
      return supabaseServices.marketplace.setTestMode(projectId, {
        enabled,
        targetDriverUserId: enabled ? selectedIds[0] ?? null : null,
        forceWalletCommission: false,
      });
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["marketplace-test-audience", projectId] });
      void qc.invalidateQueries({ queryKey: ["marketplace-test-mode", projectId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!configured || dirty) throw new Error("Guarda primero el grupo de conductores y el modo de prueba.");
      if (allowed.length < 1) throw new Error("Selecciona el destinatario de esta carrera.");
      if (!origin.trim() || !destination.trim()) throw new Error("Indica origen y destino.");
      if (!Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) > 100000)
        throw new Error("El importe debe ser mayor que cero y no superar 100.000 CUP.");
      if (forceRealCommission && !canManagePayments)
        throw new Error("No tienes permiso financiero para probar una comisión real.");
      if (!window.confirm(`Crear UNA carrera de PRUEBA para ${allowed.length} conductor(es), por ${price} CUP. ${forceRealCommission ? "ATENCIÓN: se aplicará una comisión REAL al conductor que acepte." : "Sin cobrar comisión real."} ¿Enviar?`))
        return null;
      if (forceRealCommission && !window.confirm("CONFIRMACIÓN FINANCIERA: este ensayo puede reservar y cobrar saldo real del conductor. ¿Confirmas expresamente?"))
        return null;
      return rpcJson<{ job_id: string; replayed: boolean }>("admin_create_marketplace_test_job", {
        target_project_id: projectId,
        target_idempotency_key: requestKey,
        target_driver_user_ids: allowed,
        target_service_code: serviceCode,
        target_vehicle_category_code: vehicleCategory || null,
        target_origin_text: origin.trim(),
        target_destination_text: destination.trim(),
        target_final_price: Number(price),
        target_notes: notes.trim() || null,
        target_force_wallet_commission: forceRealCommission,
      });
    },
    onSuccess: (result) => {
      if (!result) return;
      setError(null);
      setSuccessJobId(result.job_id);
      setRequestKey(crypto.randomUUID());
      void qc.invalidateQueries({ queryKey: ["marketplace-test-history", projectId] });
      void qc.invalidateQueries({ queryKey: ["marketplace-jobs", projectId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const clean = useMutation({
    mutationFn: async () => {
      const why = window.prompt("Motivo para eliminar todas las carreras de prueba:", "Limpieza de pruebas");
      if (!why?.trim()) return false;
      if (!window.confirm("Se ocultarán TODAS las carreras de PRUEBA. Las carreras reales se conservarán. ¿Continuar?")) return false;
      await supabaseServices.marketplace.deleteAllTestJobs(projectId, why.trim());
      return true;
    },
    onSuccess: (yes) => {
      if (yes) {
        void qc.invalidateQueries({ queryKey: ["marketplace-test-history", projectId] });
        void qc.invalidateQueries({ queryKey: ["marketplace-jobs", projectId] });
      }
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  const loading = current.isPending || drivers.isPending || audience.isPending;
  return (
    <section className="min-w-0 space-y-4 xl:col-span-2" aria-label="Centro de pruebas">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/25 bg-violet-400/[0.055] p-4">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 shrink-0 text-violet-300" />
          <div><h3 className="text-base font-semibold text-foreground">Centro de pruebas</h3>
            <p className="text-xs text-muted-foreground">Carreras simuladas, sin cargos reales por defecto.</p></div>
        </div>
        <label className="flex items-center gap-3 text-sm text-foreground">
          {enabled ? "Activado" : "Desactivado"}
          <Switch checked={enabled} disabled={!canManage || loading || save.isPending}
            onCheckedChange={setEnabled} aria-label="Activar modo de prueba" />
        </label>
      </div>
      {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : null}
      {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Cargando configuración…</p> : null}
      {current.isError || drivers.isError || audience.isError ? <p role="alert" className="text-sm text-rose-200">No se pudo consultar el centro de pruebas. {errorMessage(current.error ?? drivers.error ?? audience.error)}</p> : null}
      {!loading && !current.isError && !drivers.isError && !audience.isError ? (
        <>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
            <section className="min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="h-4 w-4 text-cyan-300" />Conductores autorizados</h4>
                <span className="rounded-lg border border-cyan-400/20 px-2.5 py-1 text-xs text-cyan-200">{selectedIds.length} seleccionados</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">El grupo sólo afecta a nuevas carreras que prepares desde Admin.</p>
              <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {eligible.map((driver) => (
                  <label key={driver.userId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm hover:bg-muted/20">
                    <input type="checkbox" className="h-4 w-4 accent-cyan-400"
                      disabled={!canManage}
                      checked={selectedIds.includes(driver.userId)}
                      onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, driver.userId] : ids.filter((id) => id !== driver.userId))} />
                    <span className="min-w-0 flex-1 break-words text-foreground">{driver.displayName}</span>
                    <span className="text-[11px] text-muted-foreground">{driver.isAvailable ? "Disponible" : "No disponible"}</span>
                  </label>
                ))}
                {!eligible.length ? <p className="text-xs text-muted-foreground">No hay conductores activos elegibles.</p> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-amber-200">Los cargos reales sólo se habilitan por carrera y con doble confirmación.</p>
                <Button size="sm" disabled={!canManage || save.isPending || (enabled && selectedIds.length === 0)} onClick={() => save.mutate()}>
                  <ShieldCheck className="mr-1.5 h-4 w-4" />{save.isPending ? "Guardando…" : "Guardar grupo y modo"}
                </Button>
              </div>
            </section>
            <section className="min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4">
              <h4 className="text-sm font-semibold text-foreground">Crear carrera de prueba</h4>
              <p className="mt-1 text-xs text-muted-foreground">Un único servicio. El primero en aceptarlo queda asignado.</p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">Destinatarios
                  <select value={recipientMode} onChange={(e) => setRecipientMode(e.target.value as "individual" | "group")}
                    className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground">
                    <option value="individual">Un conductor</option><option value="group">Todo el grupo</option>
                  </select>
                </label>
                {recipientMode === "individual" ? (
                  <label className="space-y-1 text-xs text-muted-foreground">Conductor
                    <select value={individualId} onChange={(e) => setIndividualId(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground">
                      <option value="">Seleccionar…</option>
                      {selected.map((d) => <option key={d.userId} value={d.userId}>{d.displayName}</option>)}
                    </select>
                  </label>
                ) : <div className="self-end rounded-lg border border-cyan-400/20 px-3 py-3 text-xs text-cyan-200">{allowed.length} conductores del grupo</div>}
                <label className="space-y-1 text-xs text-muted-foreground">Servicio
                  <select value={serviceCode} onChange={(e) => setServiceCode(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground">
                    {["passenger","cargo","courier","tourism"].map(s => <option key={s} value={s}>{labelFor(s)}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">Tipo de vehículo (opcional)
                  <select value={vehicleCategory} onChange={(e) => setVehicleCategory(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground">
                    <option value="">Cualquier compatible</option>
                    {["motorcycle","tricycle","light_car","bicitaxi","bicycle","van","truck","other"].map(s => <option key={s} value={s}>{labelFor(s)}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">Origen
                  <input value={origin} onChange={(e) => setOrigin(e.target.value)} maxLength={180} placeholder="Lugar de recogida" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">Destino
                  <input value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={180} placeholder="Lugar de llegada" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">Importe simulado (CUP)
                  <input type="number" min="1" max="100000" step="1" value={price} onChange={(e) => setPrice(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">Observaciones
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Opcional" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </label>
              </div>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-400/15 px-3 py-2 text-xs text-amber-200">
                <span>Probar comisión real (puede afectar el saldo del conductor)</span>
                <Switch checked={forceRealCommission} disabled={!canManage || !canManagePayments}
                  onCheckedChange={setForceRealCommission} aria-label="Probar comisión real" />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{dirty ? "Guarda los cambios del grupo antes del envío." : forceRealCommission ? "Ensayo financiero con doble confirmación." : "Prueba identificada · sin comisión real."}</p>
                <Button disabled={!canManage || !configured || dirty || send.isPending || allowed.length===0} onClick={() => send.mutate()}>
                  <Send className="mr-1.5 h-4 w-4" />{send.isPending ? "Enviando…" : "Enviar carrera de prueba"}
                </Button>
              </div>
              {successJobId ? <button type="button" onClick={() => onOpenJob(successJobId)} className="mt-3 flex items-center gap-2 text-xs text-emerald-300 underline"><CheckCircle2 className="h-4 w-4" />Carrera creada. Ver detalle.</button> : null}
            </section>
          </div>
          <section className="min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Clock3 className="h-4 w-4 text-violet-300" />Historial de pruebas</h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void history.refetch()} disabled={history.isFetching}>Actualizar</Button>
                {canManage ? <Button variant="destructive" size="sm" disabled={clean.isPending} onClick={() => clean.mutate()}><Trash2 className="mr-1 h-4 w-4" />Limpiar pruebas</Button> : null}
              </div>
            </div>
            {history.isLoading ? <p className="mt-3 text-xs text-muted-foreground">Consultando historial…</p> : null}
            {history.isError ? <p className="mt-3 text-xs text-rose-200">No se pudo consultar el historial: {errorMessage(history.error)}</p> : null}
            {history.data && history.data.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Todavía no hay carreras creadas desde este centro.</p> : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(history.data ?? []).map((job) => (
                <article key={job.job_id} className="min-w-0 rounded-xl border border-border/55 bg-background/50 p-3">
                  <div className="flex flex-wrap justify-between gap-2"><span className="text-sm font-semibold text-foreground">{labelFor(job.service_code)}</span>
                    <span className="text-xs text-cyan-200">{job.deleted ? "Eliminada" : labelFor(job.status)}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString("es")}</p>
                  <p className="mt-2 break-words text-xs text-foreground/85">{job.origin_text} → {job.destination_text}</p>
                  <p className="mt-2 text-xs font-semibold text-foreground">{Number(job.final_price).toLocaleString("es")} CUP · {job.recipient_count} destinatarios</p>
                  <p className="mt-1 text-xs text-muted-foreground">{job.recipients.map(r => r.display_name).join(", ") || "Sin nombres"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Notificaciones registradas: {job.notification_status.length} (no implica entrega al dispositivo).</p>
                  <Button type="button" variant="ghost" size="sm" className="mt-2 h-8" onClick={() => onOpenJob(job.job_id)}>Ver carrera</Button>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
