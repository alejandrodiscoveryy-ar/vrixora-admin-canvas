import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

export default function MarketplaceDriverPromotionPreview({ projectId, driverUserId, active }: {
  projectId: string; driverUserId: string; active: boolean;
}) {
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
  useEffect(() => {
    let cancelled = false;
    setCode(null); setAlias(null); setAliasInput(""); setAliasError(""); setReference(""); setConfirmed(false);
    if (!active) { setStatus("El conductor no está activo."); return; }
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
  }, [projectId, driverUserId, active, revision]);
  async function activate() {
    if (!confirmed || reference.trim().length < 5 || busy) return;
    setBusy(true);
    try {
      const { data, error } = await getSupabaseClient().rpc("admin_activate_marketplace_promo_card_v1", {
        target_project_id: projectId, target_driver_user_id: driverUserId,
        target_authorization_confirmed: true, target_authorization_reference: reference.trim(),
      });
      if (error || typeof data?.code !== "string" || !/^[0-9a-f]{32}$/.test(data.code)) throw Error("activation");
      setRevision(value => value + 1);
    } catch { setStatus("No se pudo activar. Revisa la autorización, identidad y vehículo."); }
    finally { setBusy(false); }
  }
  async function saveAlias() {
    const chosen = aliasInput.trim().toLowerCase();
    if (aliasSaving || busy || !code || chosen === alias) return;
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
  const renderer = code ? "https://www.vrixora.com/tuktuk/app/?promo_card=" + code : null;
  const customer = alias ? "https://www.vrixora.com/tuk/" + alias : null;
  return <section className="min-w-0 space-y-3 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">Mi TukTuk</h3><p className="text-xs text-muted-foreground">TukTuk Impulsa · Tarjetas promocionales</p></div>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={busy} aria-label="Actualizar tarjetas" className="rounded-lg border p-2"><RefreshCw className="h-4 w-4"/></button>
    </div>
    {busy ? <p role="status" className="text-sm text-muted-foreground">Consultando perfil…</p> : null}
    {status === "authorization" ? <div className="space-y-3 rounded-xl border p-3">
      <p className="text-sm">Identidad verificada. Para activar el perfil público, registra la autorización del conductor para publicar su nombre y fotografía.</p>
      <label className="block text-sm">Referencia de autorización<input className="mt-1 w-full rounded-md border bg-background p-2" value={reference} maxLength={300} onChange={event => setReference(event.target.value)}/></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Confirmo que cuento con autorización documentada.</label>
      <button type="button" disabled={!confirmed || reference.trim().length < 5 || busy} onClick={() => void activate()} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">Activar Mi TukTuk</button>
    </div> : status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}
    {renderer ? <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-500"><ShieldCheck className="h-4 w-4"/> Perfil promocional activo y verificado</div>
      <form className="space-y-2 rounded-xl border p-3" onSubmit={event => { event.preventDefault(); void saveAlias(); }}>
        <label className="block text-sm font-medium">Enlace comercial de Impulsa</label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">vrixora.com/tuk/</span>
          <input aria-label="Nombre del enlace comercial" value={aliasInput} onChange={event => setAliasInput(event.target.value)} maxLength={32} disabled={busy || aliasSaving} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm"/>
          <button type="submit" disabled={busy || aliasSaving || !aliasInput.trim() || aliasInput.trim().toLowerCase() === alias} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Guardar</button>
        </div>
        {aliasError && <p role="alert" className="text-xs text-rose-500">{aliasError}</p>}
        <p className="text-xs text-muted-foreground">Al cambiar el enlace, descarga y comparte las tarjetas actualizadas.</p>
      </form>
      <iframe key={renderer + ":" + revision} title="Tarjetas reales de Mi TukTuk" src={renderer} className="h-[530px] w-full rounded-xl border bg-slate-950" allow="web-share; clipboard-write" referrerPolicy="no-referrer"/>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={renderer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-4 w-4"/> Abrir tarjetas</a>
        {customer && <a href={customer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-4 w-4"/> Ver entrada del cliente</a>}
      </div>
    </> : null}
  </section>;
}
