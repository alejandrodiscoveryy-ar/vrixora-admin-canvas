import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, Plus, RefreshCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
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
      setName(""); setSlug(""); setRate("3");
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

  return <section className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-3 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">TukTuk Aliados</h2>
      <p className="text-xs text-muted-foreground">Dos enlaces por colaborador: difusión pública y resultados privados. No requiere cuenta Google.</p></div>
      <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={q.isFetching}><RefreshCcw className="mr-2 size-4"/>Actualizar</Button>
    </header>

    {issued && <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4" role="status">
      <div className="flex items-start justify-between gap-3"><div>
        <p className="font-semibold text-emerald-300">Enlaces listos para compartir</p>
        <p className="text-xs text-muted-foreground">El enlace privado solo se muestra ahora. Si lo pierdes, podrás regenerarlo.</p>
      </div><Button size="sm" variant="ghost" onClick={() => setIssued(null)}>Cerrar</Button></div>
      <div className="space-y-1"><Label>Enlace público para captar clientes</Label>
        <div className="flex gap-2"><Input readOnly aria-label="Enlace público" value={promo(issued.slug)}/><Button variant="outline" size="icon" onClick={() => void copy(promo(issued.slug))} aria-label="Copiar enlace público"><Copy className="size-4"/></Button></div>
      </div>
      <div className="space-y-1"><Label>Enlace privado para resultados</Label>
        <div className="flex gap-2"><Input readOnly aria-label="Enlace privado" value={privateLink(issued.report_key)}/><Button variant="outline" size="icon" onClick={() => void copy(privateLink(issued.report_key))} aria-label="Copiar enlace privado"><Copy className="size-4"/></Button></div>
        <p className="text-xs text-muted-foreground">Trátalo como una contraseña: cualquiera con ese enlace puede consultar las métricas del Aliado.</p>
      </div>
    </div>}

    {canManage && <div className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4">
      <h3 className="mb-3 text-sm font-semibold">Crear nuevo Aliado</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
        <div className="space-y-1"><Label htmlFor="ally-name">Responsable del Aliado</Label>
          <Input id="ally-name" maxLength={80} placeholder="Ej. Juan Pérez" value={name} onChange={e => setName(e.target.value)}/></div>
        <div className="space-y-1"><Label htmlFor="ally-slug">Nick comercial para compartir</Label>
          <Input id="ally-slug" maxLength={24} placeholder="Ej. conuco" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))}/></div>
        <div className="space-y-1"><Label htmlFor="ally-pct">Comisión (%)</Label>
          <Input id="ally-pct" type="number" min="0" max="5" step=".1" value={rate} onChange={e => setRate(e.target.value)}/></div>
        <Button onClick={() => void create()} disabled={saving}><Plus className="mr-1 size-4"/>Crear</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Enlace público: <strong>{promo(slug || "nick")}</strong>. El nick es único entre Aliados y conductores; no se puede cambiar después de compartirlo. Las ganancias se calculan solo para carreras reales liquidadas; no se mueve dinero automáticamente.</p>
    </div>}

    {q.isLoading ? <p className="text-sm text-muted-foreground">Cargando Aliados…</p> :
      q.isError ? <p role="alert" className="text-sm text-red-400">No se pudo consultar el programa. {errorMessage(q.error)}</p> :
      !q.data?.length ? <p className="text-sm text-muted-foreground">Todavía no hay Aliados. Crea el primero para obtener los dos enlaces.</p> :
      <div className="space-y-3">
        {q.data.map(ally => <article key={ally.id} className="rounded-xl border border-border/70 bg-card/50 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{ally.name}</h3>
              <p className="text-xs text-muted-foreground">{ally.slug} · {(Number(ally.rate)*100).toLocaleString("es-CU")}% · {ally.status==="active"?"Activo":"Pausado"}</p></div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void copy(promo(ally.slug))}><Link2 className="mr-1 size-3"/>Enlace público</Button>
              {canManage && <Button size="sm" variant="outline" onClick={() => void rotate(ally)} disabled={saving}><ExternalLink className="mr-1 size-3"/>Renovar acceso privado</Button>}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Visitas",ally.clicks],["Viajes atribuidos",ally.attributed],
              ["Completados",ally.completed],["Generado",cup(ally.earned)],["Pagado",cup(ally.paid)],
            ].map(([label,value])=><div key={label} className="rounded-lg bg-background/70 p-2">
              <p className="text-[11px] text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>Por pagar (calculado): <strong>{cup(Math.max(0,Number(ally.earned)-Number(ally.paid)))}</strong></span>
            {canManage && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => {setEditing(ally.id);setEditedName(ally.name);setEditedRate(String(Number(ally.rate)*100));}}>Editar</Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => void update(ally,ally.status==="active"?"paused":"active")}>{ally.status==="active"?"Pausar":"Reactivar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingPayment(ally.id)}><Wallet className="mr-1 size-3"/>Registrar pago</Button>
            </div>}
          </div>
          {editing===ally.id && <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
            <div className="space-y-1"><Label>Nombre</Label><Input value={editedName} onChange={e=>setEditedName(e.target.value)}/></div>
            <div className="space-y-1"><Label>Porcentaje futuro</Label><Input type="number" min="0" max="5" step=".1" value={editedRate} onChange={e=>setEditedRate(e.target.value)}/></div>
            <Button size="sm" disabled={saving} onClick={()=>void update(ally,ally.status,editedName,Number(editedRate))}>Guardar</Button>
            <Button size="sm" variant="ghost" onClick={()=>setEditing(null)}>Cancelar</Button>
          </div>}
          {editingPayment===ally.id && <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
            <p className="w-full text-xs text-muted-foreground">Registra únicamente un pago ya realizado. Esto no transfiere dinero.</p>
            <div className="space-y-1"><Label>Importe CUP</Label><Input type="number" min="0" step=".01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></div>
            <div className="space-y-1"><Label>Comprobante o referencia</Label><Input value={paymentRef} onChange={e=>setPaymentRef(e.target.value)} placeholder="Transferencia / recibo"/></div>
            <Button size="sm" disabled={saving} onClick={()=>void logPayment(ally)}>Registrar</Button>
            <Button size="sm" variant="ghost" onClick={()=>setEditingPayment(null)}>Cancelar</Button>
          </div>}
        </article>)}
      </div>}
  </section>;
}
