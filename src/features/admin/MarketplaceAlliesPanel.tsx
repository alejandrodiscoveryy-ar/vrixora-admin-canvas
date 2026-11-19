import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, Plus, RefreshCcw, Wallet, Handshake, MousePointerClick, Route, Pencil, PauseCircle, PlayCircle, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { CommercialPageHeader } from "@/features/admin/CommercialPageHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Ally = {
  id: string; name: string; slug: string; rate: number; status: "active" | "paused";
  clicks: number; attributed: number; completed: number; earned: number; paid: number;
  report_expires_at: string;
};
type Issue = { slug: string; report_key: string; expires_at: string };
const shortBase = "https://www.vrixora.com/tuk/";
const reportBase = "https://admin.vrixora.com/aliados";
const cup = (value: unknown) => Number(value ?? 0).toLocaleString("es-CU", { maximumFractionDigits: 2 }) + " CUP";
const promo = (slug: string) => shortBase + encodeURIComponent(slug);
const privateLink = (secret: string) => reportBase + "#k=" + secret;
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "No se pudo completar la operación"; }
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); toast.success("Enlace copiado"); }
  catch { toast.error("No se pudo copiar. Selecciona el enlace manualmente."); }
}
export default function MarketplaceAlliesPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [rate, setRate] = useState("3");
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<Issue | null>(null);
  const [createExpanded, setCreateExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedRate, setEditedRate] = useState("");
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [period, setPeriod] = useState<"all">("all");
  const q = useQuery({
    queryKey: ["marketplace-allies-v1", projectId, period],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_list_marketplace_allies_v1", { target_project_id: projectId });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Ally[];
    },
    enabled: Boolean(projectId),
    refetchInterval: 120000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["marketplace-allies-v1", projectId] });
  async function create() {
    if (!canManage) return;
    const s = slug.trim().toLowerCase();
    const pct = Number(rate);
    if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(s) || s.endsWith("-") || name.trim().length < 2 ||
      !Number.isFinite(pct) || pct < 0 || pct > 5) {
      toast.error("Revisa el nombre, el alias y el porcentaje (0 a 5%)."); return;
    }
    setSaving(true);
    try {
      const { data, error } = await getSupabaseClient().rpc("admin_create_marketplace_ally_v1", {
        target_project_id: projectId, target_name: name.trim(), target_slug: s, target_rate: pct / 100,
      });
      if (error) throw error;
      setIssued(data as Issue);
      setName(""); setSlug(""); setRate("3"); setCreateExpanded(false);
      await refresh();
      toast.success("Aliado creado. Copia sus dos enlaces antes de cerrar esta tarjeta.");
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }
  async function update(ally: Ally, status: "active" | "paused", newName = ally.name, newRate = ally.rate * 100) {
    if (!canManage) return;
    if (!Number.isFinite(newRate) || newRate < 0 || newRate > 5) {
      toast.error("La comisión del Aliado debe estar entre 0 y 5 %."); return;
    }
    setSaving(true);
    try {
      const { error } = await getSupabaseClient().rpc("admin_update_marketplace_ally_v1", {
        target_project_id: projectId, target_ally_id: ally.id,
        target_name: newName, target_rate: newRate / 100, target_status: status,
      });
      if (error) throw error;
      setEditing(null); await refresh();
      toast.success("Actualizado. Las carreras anteriores conservan su porcentaje.");
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }
  async function rotate(ally: Ally) {
    if (!canManage || !window.confirm("¿Regenerar el acceso privado? El enlace anterior dejará de funcionar inmediatamente.")) return;
    setSaving(true);
    try {
      const { data, error } = await getSupabaseClient().rpc("admin_rotate_marketplace_ally_key_v1", {
        target_project_id: projectId, target_ally_id: ally.id,
      });
      if (error) throw error;
      setIssued(data as Issue);
      toast.success("Acceso privado renovado. Comparte el nuevo enlace con el Aliado.");
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }
  async function logPayment(ally: Ally) {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > (ally.earned - ally.paid) ||
      paymentRef.trim().length < 3) {
      toast.error("Introduce el importe pagado y una referencia válida."); return;
    }
    if (!window.confirm("¿Confirmas que este pago ya fue realizado fuera de Vrixora? Esta acción solo registra el comprobante.")) return;
    setSaving(true);
    try {
      const { error } = await getSupabaseClient().rpc("admin_record_marketplace_ally_payment_v1", {
        target_project_id: projectId, target_ally_id: ally.id,
        target_amount: amount, target_reference: paymentRef.trim(),
      });
      if (error) throw error;
      setEditingPayment(null); setPaymentAmount(""); setPaymentRef("");
      await refresh(); toast.success("Pago externo registrado.");
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }


  const totals = (q.data ?? []).reduce((all, ally) => ({
    active: all.active + (ally.status === "active" ? 1 : 0),
    clicks: all.clicks + Number(ally.clicks ?? 0),
    attributed: all.attributed + Number(ally.attributed ?? 0),
    completed: all.completed + Number(ally.completed ?? 0),
    pending: all.pending + Math.max(0, Number(ally.earned ?? 0) - Number(ally.paid ?? 0)),
  }), { active: 0, clicks: 0, attributed: 0, completed: 0, pending: 0 });

  return (
    <section data-admin-module="comercial" className="space-y-4" aria-labelledby="tuktuk-allies-heading">
      <CommercialPageHeader
        title="Aliados"
        description="Colaboradores externos, enlaces personalizados, pasajeros atraídos y liquidaciones."
        icon={Handshake}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => void refresh()} disabled={q.isFetching} aria-label="Actualizar resultados de aliados">
              <RefreshCcw className="mr-1.5 size-4" aria-hidden="true" /> Actualizar
            </Button>
            {canManage && (
              <Button size="sm" className="max-sm:min-h-11" onClick={() => setCreateExpanded(value => !value)}
                aria-expanded={createExpanded} aria-controls="ally-create-form">
                {createExpanded ? <X className="mr-1 size-4" aria-hidden="true" /> : <Plus className="mr-1 size-4" aria-hidden="true" />}
                {createExpanded ? "Cerrar formulario" : "Nuevo aliado"}
              </Button>
            )}
          </div>
        }
      />

      {q.data && q.data.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen del programa de aliados">
          <MetricCard density="compact" appearance="premium" module="comercial" icon={Handshake} label="Aliados activos"
            value={totals.active.toLocaleString("es-CU")} description={`de ${q.data.length} registrados`} />
          <MetricCard density="compact" appearance="premium" module="comercial" icon={MousePointerClick} label="Visitas a enlaces"
            value={totals.clicks.toLocaleString("es-CU")} description="Difusión comercial" />
          <MetricCard density="compact" appearance="premium" module="comercial" icon={Route} label="Viajes atribuidos"
            value={totals.attributed.toLocaleString("es-CU")} description={`${totals.completed} completados`} />
          <MetricCard density="compact" appearance="premium" module="comercial" icon={Wallet} label="Pendiente de pago"
            value={cup(totals.pending)} description="Comisiones calculadas" />
        </div>
      )}

      {issued && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 sm:p-4" role="status">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-foreground">Enlaces listos para compartir</p>
                <p className="text-xs text-muted-foreground">Guarda el acceso privado ahora: solo se muestra una vez y regenerarlo invalida el anterior.</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}><X className="mr-1 size-3.5" />Cerrar</Button>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label>Enlace público para captar clientes</Label>
              <div className="flex min-w-0 gap-2">
                <Input readOnly aria-label="Enlace público" value={promo(issued.slug)} className="min-w-0" />
                <Button variant="outline" size="icon" onClick={() => void copy(promo(issued.slug))} aria-label="Copiar enlace público"><Copy className="size-4" /></Button>
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <Label>Enlace privado para resultados</Label>
              <div className="flex min-w-0 gap-2">
                <Input readOnly aria-label="Enlace privado" value={privateLink(issued.report_key)} className="min-w-0" />
                <Button variant="outline" size="icon" onClick={() => void copy(privateLink(issued.report_key))} aria-label="Copiar enlace privado"><Copy className="size-4" /></Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Trátalo como una contraseña: cualquiera con este enlace puede consultar sus resultados.</p>
            </div>
          </div>
        </div>
      )}

      {canManage && createExpanded && (
        <form id="ally-create-form" className="rounded-xl border border-violet-400/25 bg-card/80 p-3 shadow-sm sm:p-4" onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Crear aliado comercial</h3>
              <p className="text-xs text-muted-foreground">Un nick público único y una comisión de hasta el 5 %.</p>
            </div>
            <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold text-violet-300">Enlace personalizado</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_140px_auto] xl:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="ally-name">Responsable del Aliado</Label>
              <Input id="ally-name" maxLength={80} placeholder="Ej. Juan Pérez" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ally-slug">Nick comercial para compartir</Label>
              <Input id="ally-slug" maxLength={24} placeholder="Ej. conuco" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ally-pct">Comisión (%)</Label>
              <Input id="ally-pct" type="number" min="0" max="5" step=".1" value={rate} onChange={(event) => setRate(event.target.value)} />
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto xl:mb-px">
              <Plus className="mr-1.5 size-4" aria-hidden="true" />Crear aliado
            </Button>
          </div>
          <p className="mt-3 break-all text-[11px] text-muted-foreground">
            Enlace público: <span className="font-medium text-foreground">{promo(slug || "nick")}</span>. El nick es único entre Aliados y conductores y no puede cambiarse después de compartirlo. Las ganancias se calculan solo para carreras reales liquidadas; no se transfiere dinero automáticamente.
          </p>
        </form>
      )}

      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">Colaboradores</h3>
          {q.data && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{q.data.length}</span>}
        </div>
        <span className="text-[11px] text-muted-foreground">Resultados acumulados</span>
      </div>

      {q.isLoading ? (
        <p className="rounded-xl border border-border/50 bg-card/50 px-4 py-6 text-sm text-muted-foreground" role="status">Cargando Aliados…</p>
      ) : q.isError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive">No se pudo consultar el programa. {errorMessage(q.error)}</p>
      ) : !q.data?.length ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/30 px-4 py-8 text-center">
          <Handshake className="mx-auto mb-2 size-7 text-violet-300/70" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">Todavía no hay Aliados</p>
          <p className="mt-1 text-xs text-muted-foreground">Crea el primer colaborador para generar sus enlaces y medir resultados.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {q.data.map((ally) => {
            const due = Math.max(0, Number(ally.earned) - Number(ally.paid));
            const indicators = [
              { label: "Visitas", value: Number(ally.clicks).toLocaleString("es-CU"), tone: "text-foreground" },
              { label: "Viajes atribuidos", value: Number(ally.attributed).toLocaleString("es-CU"), tone: "text-foreground" },
              { label: "Completados", value: Number(ally.completed).toLocaleString("es-CU"), tone: "text-foreground" },
              { label: "Generado", value: cup(ally.earned), tone: "text-sky-300" },
              { label: "Pagado", value: cup(ally.paid), tone: "text-emerald-300" },
              { label: "Por pagar", value: cup(due), tone: due > 0 ? "text-amber-300" : "text-foreground" },
            ];
            const initials = ally.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "A";
            return (
              <article key={ally.id} className="group relative overflow-hidden rounded-2xl border border-border/65 bg-card/75 shadow-sm transition-colors hover:border-violet-400/35">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-violet-500/60" aria-hidden="true" />
                <div className="flex flex-col gap-3 px-4 pb-3 pt-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-sm font-bold text-violet-200">{initials}</span>
                    <div className="min-w-0">
                      <h4 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground" title={ally.name}>{ally.name}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        <span className="font-medium text-violet-300">@{ally.slug}</span>
                        <span aria-hidden="true" className="text-muted-foreground/60">·</span>
                        <span className="text-muted-foreground">{(Number(ally.rate) * 100).toLocaleString("es-CU")}% de comisión</span>
                        <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium " + (ally.status === "active" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" : "border-border/60 bg-muted/40 text-muted-foreground")}>
                          <span className={"size-1.5 rounded-full " + (ally.status === "active" ? "bg-emerald-400" : "bg-slate-400")} aria-hidden="true" />
                          {ally.status === "active" ? "Activo" : "Pausado"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="h-9 border-violet-400/25 bg-violet-500/5" onClick={() => void copy(promo(ally.slug))} aria-label={"Copiar enlace público de " + ally.name}>
                      <Link2 className="mr-1.5 size-3.5" aria-hidden="true" />Enlace público
                    </Button>
                    {canManage && (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => void rotate(ally)} disabled={saving} aria-label={"Renovar acceso privado de " + ally.name}>
                        <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />Renovar acceso
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mx-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/50 bg-border/50 sm:mx-5 sm:grid-cols-3 xl:grid-cols-6">
                  {indicators.map((metric) => (
                    <div key={metric.label} className="min-w-0 bg-card px-3 py-2.5">
                      <p className="text-[10px] font-medium leading-tight text-muted-foreground">{metric.label}</p>
                      <p className={"mt-1 break-words text-[14px] font-semibold leading-tight tabular-nums " + metric.tone}>{metric.value}</p>
                    </div>
                  ))}
                </div>

                {canManage && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                    <p className="text-[11px] text-muted-foreground">Enlaces personalizados · pago registrado manualmente</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button size="sm" variant="ghost" className="min-h-11 px-2.5 text-xs sm:min-h-9" onClick={() => { setEditing(ally.id); setEditingPayment(null); setEditedName(ally.name); setEditedRate(String(Number(ally.rate) * 100)); }} aria-label={"Editar " + ally.name}>
                        <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="min-h-11 px-2.5 text-xs sm:min-h-9" disabled={saving} onClick={() => void update(ally, ally.status === "active" ? "paused" : "active")}>
                        {ally.status === "active" ? <PauseCircle className="mr-1.5 size-3.5" aria-hidden="true" /> : <PlayCircle className="mr-1.5 size-3.5" aria-hidden="true" />}
                        {ally.status === "active" ? "Pausar" : "Reactivar"}
                      </Button>
                      <Button size="sm" variant="ghost" className="min-h-11 px-2.5 text-xs sm:min-h-9" onClick={() => { setEditing(null); setEditingPayment(ally.id); }} aria-label={"Registrar pago a " + ally.name}>
                        <Wallet className="mr-1.5 size-3.5" aria-hidden="true" />Registrar pago
                      </Button>
                    </div>
                  </div>
                )}

                {editing === ally.id && canManage && (
                  <div className="mx-4 mb-3 rounded-xl border border-border/65 bg-background/60 p-3 sm:mx-5">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[170px] flex-1 space-y-1">
                        <Label>Nombre del aliado</Label>
                        <Input maxLength={80} value={editedName} onChange={(event) => setEditedName(event.target.value)} />
                      </div>
                      <div className="min-w-[140px] space-y-1">
                        <Label>Porcentaje futuro</Label>
                        <Input type="number" min="0" max="5" step=".1" value={editedRate} onChange={(event) => setEditedRate(event.target.value)} />
                      </div>
                      <Button size="sm" disabled={saving} onClick={() => void update(ally, ally.status, editedName, Number(editedRate))}>Guardar cambios</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}

                {editingPayment === ally.id && canManage && (
                  <div className="mx-4 mb-3 rounded-xl border border-border/65 bg-background/60 p-3 sm:mx-5">
                    <p className="mb-2 text-xs text-muted-foreground">Registra únicamente un pago ya realizado. Esto no transfiere dinero.</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[140px] space-y-1">
                        <Label>Importe CUP</Label>
                        <Input type="number" min="0" step=".01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                      </div>
                      <div className="min-w-[180px] flex-1 space-y-1">
                        <Label>Comprobante o referencia</Label>
                        <Input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} placeholder="Transferencia / recibo" />
                      </div>
                      <Button size="sm" disabled={saving} onClick={() => void logPayment(ally)}>Registrar pago</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPayment(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
