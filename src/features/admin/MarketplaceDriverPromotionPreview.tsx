import { useEffect, useState } from "react";
import { Copy, ExternalLink, RefreshCw, ShieldCheck, Share2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { premiumSurface, premiumColumnHeaderSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";

export default function MarketplaceDriverPromotionPreview({ projectId, driverUserId, active, canManage, verified, onOpenExpediente }: {
  projectId: string; driverUserId: string; active: boolean; canManage: boolean; verified: boolean | null; onOpenExpediente: () => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [alias, setAlias] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [aliasSaving, setAliasSaving] = useState(false);
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setCode(null); setAlias(null); setAliasInput(""); setAliasError(""); setReference(""); setConfirmed(false);
    setDeactivateOpen(false); setDeactivateReason(""); setActionMessage("");
    if (!canManage) { setBusy(false); setStatus("La gestión de Impulsa requiere permisos de administración."); return; }
    if (verified !== true) { setBusy(false); setStatus(verified === null ? "Consultando la verificación del conductor…" : "Verifica primero la identidad del conductor."); return; }
    if (!active) { setBusy(false); setStatus("El conductor no está activo."); return; }
    setBusy(true); setStatus("");
    // Existing RPC returns the existing code without mutation. With false
    // authorization it cannot create or reactivate a profile.
    void (async () => {
      try {
        const { data, error } = await getSupabaseClient().rpc("admin_activate_marketplace_promo_card_v1", {
          target_project_id: projectId, target_driver_user_id: driverUserId,
          target_authorization_confirmed: false, target_authorization_reference: "",
        });
        if (cancelled) return;
        if (!error && typeof data?.code === "string" && /^[0-9a-f]{32}$/.test(data.code)) {
          setCode(data.code);
          const result = await getSupabaseClient().rpc("admin_marketplace_promo_alias_v1", {
            target_project_id: projectId, target_driver_user_id: driverUserId,
          });
          if (cancelled) return;
          if (!result.error && typeof result.data === "string" && /^[a-z0-9][a-z0-9-]{1,31}$/.test(result.data) && !result.data.endsWith("-")) {
            setAlias(result.data); setAliasInput(result.data);
          } else setAliasError("No se pudo consultar el enlace comercial.");
        }
        else setStatus(error?.message.includes("IDENTITY_NOT_VERIFIED") ? "Verifica primero la identidad del conductor."
          : error?.message.includes("DOCUMENTED_AUTHORIZATION_REQUIRED") ? "authorization"
          : "No se pudo consultar el perfil promocional. Comprueba permisos y vehículo operativo.");
      } catch { if (!cancelled) setStatus("No se pudo consultar el perfil promocional."); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId, driverUserId, active, canManage, verified, revision]);
  async function activate() {
    if (!canManage || verified !== true || !active || !confirmed || reference.trim().length < 5 || busy) return;
    setBusy(true);
    try {
      const { data, error } = await getSupabaseClient().rpc("admin_activate_marketplace_promo_card_v1", {
        target_project_id: projectId, target_driver_user_id: driverUserId,
        target_authorization_confirmed: true, target_authorization_reference: reference.trim(),
      });
      if (error || typeof data?.code !== "string" || !/^[0-9a-f]{32}$/.test(data.code)) throw Error("activation");
      await queryClient.invalidateQueries({ queryKey: ["driver-identity-review", projectId, driverUserId] });
      setRevision(value => value + 1);
    } catch { setStatus("No se pudo activar. Revisa la autorización, identidad y vehículo."); }
    finally { setBusy(false); }
  }
  async function saveAlias() {
    const chosen = aliasInput.trim().toLowerCase();
    if (!canManage || verified !== true || !active || aliasSaving || busy || !code || chosen === alias) return;
    if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(chosen) || chosen.endsWith("-")) {
      setAliasError("Usa entre 2 y 32 caracteres: letras sin acentos, números y guiones."); return;
    }
    setAliasSaving(true); setAliasError("");
    try {
      const { data, error } = await getSupabaseClient().rpc("admin_marketplace_promo_alias_v1", {
        target_project_id: projectId, target_driver_user_id: driverUserId, target_alias: chosen,
      });
      if (error || data !== chosen) throw Error("alias");
      setRevision(value => value + 1);
    } catch { setAliasError("No se pudo guardar el nombre. Puede estar ocupado o reservado."); }
    finally { setAliasSaving(false); }
  }
  async function deactivate() {
    if (!canManage || !code || busy || aliasSaving || deactivateReason.trim().length < 5) return;
    setBusy(true); setActionMessage("");
    try {
      const { error } = await getSupabaseClient().rpc("admin_deactivate_marketplace_promo_card_v1", {
        target_project_id: projectId, target_driver_user_id: driverUserId, target_reason: deactivateReason.trim(),
      });
      if (error) throw error;
      setCode(null); setAlias(null); setDeactivateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["driver-identity-review", projectId, driverUserId] });
      setRevision(value => value + 1);
    } catch { setActionMessage("No se pudo desactivar Impulsa. Revisa los permisos e inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  const renderer = code && verified === true && active && canManage ? "https://www.vrixora.com/tuktuk/app/?promo_card=" + code : null;
  const customer = alias && renderer ? "https://www.vrixora.com/tuk/" + alias : null;
  return <section aria-label="Gestión de TukTuk Impulsa" className={cn("min-w-0 space-y-3 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-500"><Share2 className="h-5 w-5"/></span><div><p className="marketplace-360-kicker">Gestión comercial del conductor</p><h3 className="text-lg font-semibold">TukTuk Impulsa</h3><p className="text-xs text-muted-foreground">Nombre de usuario · Enlace personal · Tarjetas promocionales</p></div></div>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={busy} aria-label="Actualizar tarjetas" className="rounded-lg border p-2"><RefreshCw className="h-4 w-4"/></button>
    </div>
    {verified === false && canManage && <button type="button" onClick={onOpenExpediente} className="rounded-lg border px-3 py-2 text-sm text-primary">Ir a verificar identidad</button>}
    {busy ? <p role="status" className="text-sm text-muted-foreground">Consultando perfil…</p> : null}
    {status === "authorization" ? <div className="space-y-3 rounded-xl border p-3">
      <p className="text-sm">Identidad verificada. Para activar el perfil público, registra la autorización del conductor para publicar su nombre y fotografía.</p>
      <label className="block text-sm">Referencia de autorización<input className="mt-1 w-full rounded-md border bg-background p-2" value={reference} maxLength={300} onChange={event => setReference(event.target.value)}/></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Confirmo que cuento con autorización documentada.</label>
      <button type="button" disabled={!confirmed || reference.trim().length < 5 || busy} onClick={() => void activate()} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">Activar Impulsa y generar tarjetas</button>
    </div> : status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}
    {renderer ? <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-500"><ShieldCheck className="h-4 w-4"/> Perfil promocional activo y verificado</div>
      <form className={cn("space-y-2 rounded-xl border p-3", premiumColumnHeaderSurface)} onSubmit={event => { event.preventDefault(); void saveAlias(); }}>
        <label className="block text-sm font-medium">Nombre de usuario comercial</label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">vrixora.com/tuk/</span>
          <input aria-label="Nombre del enlace comercial" value={aliasInput} onChange={event => setAliasInput(event.target.value)} maxLength={32} disabled={busy || aliasSaving} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm"/>
          <button type="submit" disabled={busy || aliasSaving || !aliasInput.trim() || aliasInput.trim().toLowerCase() === alias} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Guardar</button>
        </div>
        {aliasError && <p role="alert" className="text-xs text-rose-500">{aliasError}</p>}
        {customer && <div className="flex flex-wrap items-center gap-2"><a href={customer} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-sm font-semibold text-primary">{customer.replace("https://www.", "")}</a><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(customer); setActionMessage("Enlace copiado."); } catch { setActionMessage("Selecciona el enlace para copiarlo manualmente."); } }} className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs"><Copy className="h-3.5 w-3.5"/> Copiar enlace</button></div>}
        <p className="text-xs text-muted-foreground">Al cambiar el enlace, descarga y comparte las tarjetas actualizadas.</p>
      </form>
      <div><p className="marketplace-360-kicker">Material promocional</p><h4 className="text-sm font-semibold">Tarjetas cuadrada e historia</h4><p className="text-xs text-muted-foreground">Previsualiza, descarga y comparte ambas tarjetas con su QR y mensaje.</p></div>
      <iframe key={renderer + ":" + revision} title="Tarjetas reales de Mi TukTuk" src={renderer} className="h-[530px] w-full rounded-xl border bg-slate-950" allow="web-share; clipboard-write" referrerPolicy="no-referrer"/>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={renderer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-4 w-4"/> Abrir tarjetas</a>
        {customer && <a href={customer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-4 w-4"/> Ver entrada del cliente</a>}
      </div>
      <div className="space-y-2 rounded-xl border border-rose-500/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Estado de Impulsa</p><p className="text-xs text-muted-foreground">Desactivar la promoción no retira la verificación de identidad.</p></div><button type="button" disabled={busy || aliasSaving} onClick={() => setDeactivateOpen(open => !open)} className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-500">Desactivar Impulsa</button></div>
        {deactivateOpen && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void deactivate(); }}>
          <p className="text-xs text-muted-foreground">El enlace y los QR dejarán de abrir el perfil promocional. Indica el motivo para registrar la acción.</p>
          <label className="block text-xs">Motivo<input required minLength={5} maxLength={300} value={deactivateReason} onChange={event => setDeactivateReason(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm"/></label>
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || aliasSaving || deactivateReason.trim().length < 5} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmar desactivación</button><button type="button" onClick={() => setDeactivateOpen(false)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button></div>
        </form>}
      </div>
    </> : null}
    {actionMessage && <p role="status" className="text-xs text-muted-foreground">{actionMessage}</p>}
  </section>;
}
