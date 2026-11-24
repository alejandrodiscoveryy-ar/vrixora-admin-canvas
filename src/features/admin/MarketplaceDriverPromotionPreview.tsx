import { useEffect, useState } from "react";
import MarketplaceImpulsaEarnings from "@/features/admin/MarketplaceImpulsaEarnings";
import { Copy, ExternalLink, RefreshCw, ShieldCheck, Share2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { premiumSurface, premiumColumnHeaderSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { suggestDriverPromoAlias, validDriverPromoAlias } from "@/lib/marketplace-promo-alias";
import { driverWhatsAppLinks, impulsaGroupInviteMessage } from "@/lib/driver-whatsapp";
import ImpulsaWhatsAppOpenChooser from "./ImpulsaWhatsAppOpenChooser";

export default function MarketplaceDriverPromotionPreview({ projectId, driverUserId, driverDisplayName, contactPhone, active, canManage, verified, onOpenExpediente }: {
  projectId: string; driverUserId: string; driverDisplayName: string; contactPhone: string | null; active: boolean; canManage: boolean; verified: boolean | null; onOpenExpediente: () => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [alias, setAlias] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState(() => suggestDriverPromoAlias(driverDisplayName, driverUserId));
  const [aliasError, setAliasError] = useState("");
  const [aliasSaving, setAliasSaving] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setCode(null); setAlias(null); setAliasInput(suggestDriverPromoAlias(driverDisplayName, driverUserId)); setAliasError(""); setActivationError("");
    setDeactivateOpen(false); setDeactivateReason(""); setActionMessage("");
    if (!canManage) { setBusy(false); setStatus("La gestión de Impulsa requiere permisos de administración."); return; }
    if (verified !== true) { setBusy(false); setStatus(verified === null ? "Consultando la verificación del conductor…" : "Verifica primero la identidad del conductor."); return; }
    if (!active) { setBusy(false); setStatus("El conductor no está activo."); return; }
    setBusy(true); setStatus("");
    // Estado de solo lectura: al abrir la ficha NO se activa ningún perfil.
    void (async () => {
      try {
        const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_promo_card_state_v2", {
          target_project_id: projectId, target_driver_user_id: driverUserId,
        });
        if (cancelled) return;
        if (!error && data?.enabled === true && typeof data?.code === "string" && /^[0-9a-f]{32}$/.test(data.code)) {
          setCode(data.code);
          const result = await getSupabaseClient().rpc("admin_marketplace_promo_alias_v1", {
            target_project_id: projectId, target_driver_user_id: driverUserId,
          });
          if (cancelled) return;
          if (!result.error && typeof result.data === "string" && /^[a-z0-9][a-z0-9-]{1,31}$/.test(result.data) && !result.data.endsWith("-")) {
            setAlias(result.data); setAliasInput(result.data);
          } else setAliasError("No se pudo consultar el enlace comercial.");
        }
        else if (!error && data?.consent_ready === true) {
          setStatus("authorization");
        } else if (!error) {
          setStatus("El conductor debe autorizar desde su aplicación la publicación de su perfil y fotografía en Impulsa.");
        } else {
          setStatus("No se pudo consultar el perfil promocional. Comprueba permisos y vehículo operativo.");
        }
      } catch { if (!cancelled) setStatus("No se pudo consultar el perfil promocional."); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId, driverUserId, driverDisplayName, active, canManage, verified, revision]);
  async function activate() {
    if (!canManage || verified !== true || !active || !validDriverPromoAlias(aliasInput.trim().toLowerCase()) || busy) return;
    setBusy(true); setActivationError("");
    try {
      const { data, error } = await getSupabaseClient().rpc("admin_activate_marketplace_promo_card_v2", {
        target_project_id: projectId, target_driver_user_id: driverUserId,
      });
      if (error) throw error;
      if (typeof data?.code !== "string" || !/^[0-9a-f]{32}$/.test(data.code)) {
        throw Error("INVALID_PROMO_RESPONSE");
      }
      // An authorized profile now exists. Save the editable suggestion using
      // the existing server-side uniqueness constraint; if it collides, keep
      // the canonical alias automatically assigned by Supabase.
      const proposedAlias = aliasInput.trim().toLowerCase();
      const saved = await getSupabaseClient().rpc("admin_marketplace_promo_alias_v1", {
        target_project_id: projectId, target_driver_user_id: driverUserId, target_alias: proposedAlias,
      });
      if (!saved.error && saved.data === proposedAlias) {
        setAlias(proposedAlias);
        setAliasInput(proposedAlias);
        setAliasError("");
      } else {
        const fallback = await getSupabaseClient().rpc("admin_marketplace_promo_alias_v1", {
          target_project_id: projectId, target_driver_user_id: driverUserId,
        });
        if (!fallback.error && typeof fallback.data === "string" && validDriverPromoAlias(fallback.data)) {
          setAlias(fallback.data);
          setAliasInput(fallback.data);
          setAliasError(saved.error?.message.includes("PROMO_ALIAS_TAKEN")
            ? "La propuesta estaba ocupada. El sistema asignó un nombre disponible. Puedes editarlo."
            : "El perfil está activo, pero no se pudo guardar el nombre elegido. Se conservó el enlace disponible.");
        } else {
          setAliasError("Perfil activado; no se pudo confirmar el nombre comercial. Pulsa Actualizar para reintentar.");
        }
      }
      setCode(data.code);
      setStatus("");
      await queryClient.invalidateQueries({ queryKey: ["driver-identity-review", projectId, driverUserId] });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      // Mantener visible el formulario y explicar el motivo, sin publicar detalles técnicos.
      setActivationError(message.includes("IMPULSA_CONSENT_REQUIRED")
        ? "Falta la aceptación vigente del conductor para publicar su nombre y fotografía en Impulsa. Debe autorizar desde su aplicación."
        : message.includes("PROMO_PHOTO_NOT_AVAILABLE")
          ? "La fotografía autorizada no está disponible. Comprueba el expediente del conductor."
        : message.includes("PROMO_SERVICE_NOT_ACTIVE")
          ? "No se puede activar: comprueba que el conductor tenga un vehículo activo y servicios publicados."
          : message.includes("IDENTITY_NOT_VERIFIED")
            ? "La verificación de identidad no está confirmada. Revisa el expediente."
            : message.includes("PUBLIC_NAME_INVALID")
              ? "El perfil no tiene un nombre público válido. Revisa los datos del conductor."
              : message.includes("42501") || message.includes("permission denied")
                ? "Tu cuenta no tiene autorización para activar Impulsa en este proyecto."
                : "No se pudo activar Impulsa. Revisa la conexión y los requisitos operativos antes de reintentar.");
    } finally { setBusy(false); }
  }
  async function saveAlias() {
    const chosen = aliasInput.trim().toLowerCase();
    if (!canManage || verified !== true || !active || aliasSaving || busy || !code || chosen === alias) return;
    if (!validDriverPromoAlias(chosen)) {
      setAliasError("Usa entre 2 y 32 caracteres: letras sin acentos, números y guiones."); return;
    }
    setAliasSaving(true); setAliasError("");
    try {
      const { data, error } = await getSupabaseClient().rpc("admin_marketplace_promo_alias_v1", {
        target_project_id: projectId, target_driver_user_id: driverUserId, target_alias: chosen,
      });
      if (error) throw error;
      if (data !== chosen) throw Error("PROMO_ALIAS_MISMATCH");
      setRevision(value => value + 1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setAliasError(message.includes("PROMO_ALIAS_TAKEN")
        ? "Este nombre ya está reservado. Prueba otro; nunca se asignará el de otra persona."
        : "No se pudo guardar el nombre. Revisa el formato y vuelve a intentarlo.");
    }
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
  const inviteWhatsApp = renderer ? driverWhatsAppLinks(contactPhone, impulsaGroupInviteMessage(driverDisplayName)) : null;
  return <section aria-label="Gestión de TukTuk Impulsa" className={cn("min-w-0 space-y-3 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-500"><Share2 className="h-5 w-5"/></span><div><p className="marketplace-360-kicker">Gestión comercial del conductor</p><h3 className="text-lg font-semibold">TukTuk Impulsa</h3><p className="text-xs text-muted-foreground">Nombre de usuario · Enlace personal · Tarjetas promocionales</p></div></div>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={busy} aria-label="Actualizar tarjetas" className="rounded-lg border p-2"><RefreshCw className="h-4 w-4"/></button>
    </div>
    {verified === false && canManage && <button type="button" onClick={onOpenExpediente} className="rounded-lg border px-3 py-2 text-sm text-primary">Ir a verificar identidad</button>}
    {busy ? <p role="status" className="text-sm text-muted-foreground">Consultando perfil…</p> : null}
    {status === "authorization" ? <div className="space-y-3 rounded-xl border border-border-default bg-surface-2/50 p-3 sm:p-4">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-emerald-300">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true"/>
        Identidad verificada y consentimiento para publicar nombre y fotografía ya registrado en Impulsa.
      </p>
      <div className="space-y-1.5">
        <label htmlFor="impulsa-suggested-alias" className="block text-sm font-medium">Nombre comercial propuesto</label>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">vrixora.com/tuk/</span>
          <input id="impulsa-suggested-alias" aria-label="Nombre comercial propuesto"
            className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-border-default bg-surface-3/65 px-3 py-2 text-sm text-text-primary"
            value={aliasInput} minLength={2} maxLength={32}
            aria-invalid={!validDriverPromoAlias(aliasInput.trim().toLowerCase())}
            aria-describedby="impulsa-alias-suggestion-help"
            onChange={event => { setAliasInput(event.target.value.toLowerCase()); setAliasError(""); }}
          />
        </div>
        <p id="impulsa-alias-suggestion-help" className="text-xs leading-relaxed text-text-secondary">
          Propuesta basada en el nombre del conductor y un identificador propio para evitar homónimos.
          Puedes editarla. Al activar, el servidor comprobará que el enlace no esté repetido.
        </p>
        {!validDriverPromoAlias(aliasInput.trim().toLowerCase()) && (
          <p role="alert" className="text-xs text-amber-500">
            Usa entre 2 y 32 caracteres: letras sin acentos, números y guiones, sin terminar en guion.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!validDriverPromoAlias(aliasInput.trim().toLowerCase()) || busy}
          onClick={() => void activate()}
          className="min-h-11 rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45">
          {busy ? "Activando…" : "Activar Impulsa y generar tarjetas"}
        </button>
        {!validDriverPromoAlias(aliasInput.trim().toLowerCase()) && (
          <p className="text-xs text-text-secondary" role="status">
            Pendiente: corregir el nombre del enlace.
          </p>
        )}
      </div>
      {activationError && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-500">{activationError}</p>}
    </div> : status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}
    {renderer ? <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-500"><ShieldCheck className="h-4 w-4"/> Perfil promocional activo y verificado</div>
      {inviteWhatsApp ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.045] px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Invitar al grupo de Impulsa</p>
            <p className="mt-1 text-xs text-text-secondary">Abre WhatsApp con un mensaje de bienvenida y el enlace al grupo. Revisa y envía el mensaje manualmente.</p>
          </div>
          <ImpulsaWhatsAppOpenChooser links={inviteWhatsApp} driverName={driverDisplayName} inviteToGroup={true} />
        </div>
      ) : null}
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
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Estado de Impulsa</p><p className="text-xs text-muted-foreground">Suspender Impulsa retira también la verificación de identidad. Para regresar, el conductor debe presentar una nueva solicitud y superar otra revisión.</p></div><button type="button" disabled={busy || aliasSaving} onClick={() => setDeactivateOpen(open => !open)} className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-500">Suspender Impulsa</button></div>
        {deactivateOpen && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void deactivate(); }}>
          <p className="text-xs text-muted-foreground">El enlace y los QR quedarán deshabilitados. También se retirará la insignia de conductor verificado y se invalidará la aprobación anterior. Será obligatorio repetir la solicitud y revisión. Indica el motivo.</p>
          <label className="block text-xs">Motivo<input required minLength={5} maxLength={300} value={deactivateReason} onChange={event => setDeactivateReason(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm"/></label>
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || aliasSaving || deactivateReason.trim().length < 5} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmar suspensión y retirada de verificación</button><button type="button" onClick={() => setDeactivateOpen(false)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button></div>
        </form>}
      </div>
    </> : null}
    {actionMessage && <p role="status" className="text-xs text-muted-foreground">{actionMessage}</p>}
  {canManage && <MarketplaceImpulsaEarnings projectId={projectId} driverUserId={driverUserId} />}
  </section>;
}
