import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, CheckCircle2, FileText, Pencil, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { premiumSurface, premiumColumnHeaderSurface, premiumControlSurface } from "@/components/admin/density";
import { getSupabaseClient } from "@/lib/supabase";

type ChecklistItem = { key: string; label: string; ok: boolean; applicable?: boolean };
type DocumentItem = { id: string; kind: string; label: string };
type Opportunity = {
  job_id: string;
  service_code: string;
  first_sent: string;
  last_sent: string;
  deliveries: number;
  reminders: number;
  outcome: string;
  job_status: string;
};
type Management360 = {
  driver: {
    display_name: string | null;
    phone: string | null;
    status: string;
    identity_type: string | null;
    vehicle_id: string | null;
    vehicle_brand: string | null;
    vehicle_model: string | null;
    registration: string | null;
  };
  checklist: ChecklistItem[];
  audit_events: Array<{
    action: string;
    at: string;
    reason: string | null;
    actor_id: string | null;
  }>;
  onboarding_complete: boolean;
  document_assets: DocumentItem[];
  notifications: {
    total: number;
    accepted: number;
    not_accepted: number;
    pending: number;
    cancelled: number;
    reminders: number;
    first_recorded: string | null;
    events: Opportunity[];
  };
};

function formatDate(input: string | null) {
  if (!input) return "—";
  const parsed = new Date(input);
  return Number.isNaN(parsed.valueOf())
    ? "—"
    : new Intl.DateTimeFormat("es-CU", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(parsed);
}
const outcomeLabels: Record<string, string> = {
  accepted: "Aceptada",
  pending: "Todavía disponible",
  accepted_other: "Aceptada por otro conductor",
  expired: "Venció sin aceptar",
  cancelled: "Cancelada",
  other: "Resultado no determinado",
};
const serviceLabels: Record<string, string> = {
  passenger: "Pasajeros",
  courier: "Mensajería",
  cargo: "Carga",
  tourism: "Turismo",
};

export default function MarketplaceDriverManagementPanel({
  projectId,
  driverUserId,
  onOpenJob,
}: {
  projectId: string;
  driverUserId: string;
  onOpenJob: (jobId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewDocumentType, setReviewDocumentType] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [authorizationReference, setAuthorizationReference] = useState("");
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);

  const data = useQuery({
    queryKey: ["driver-management-360", projectId, driverUserId],
    queryFn: async () => {
      const { data: payload, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_driver_management_v1",
        {
          target_project_id: projectId,
          target_driver_user_id: driverUserId,
        },
      );
      if (error) throw error;
      return payload as Management360;
    },
    retry: 1,
    staleTime: 20_000,
  });

  const review = useQuery({
    queryKey: ["driver-identity-review", projectId, driverUserId],
    queryFn: async () => {
      const { data: payload, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_driver_identity_review_v1",
        { target_project_id: projectId, target_driver_user_id: driverUserId },
      );
      if (error) throw error;
      return payload as { verified: boolean; verified_at: string | null; promo_active: boolean };
    },
    retry: 1,
    staleTime: 0,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ verified, front, back, documentType }: {
      verified: boolean; front: string | null; back: string | null; documentType: string | null;
    }) => {
      const { error } = await getSupabaseClient().rpc(
        "admin_set_marketplace_driver_identity_review_v2",
        {
          target_project_id: projectId,
          target_driver_user_id: driverUserId,
          target_verified: verified,
          target_reason: reviewReason.trim(),
          target_front_asset_id: front,
          target_back_asset_id: back,
          target_document_type: documentType,
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["driver-identity-review", projectId, driverUserId] }),
        queryClient.invalidateQueries({ queryKey: ["driver-management-360", projectId, driverUserId] }),
      ]);
      setReviewOpen(false);
      setReviewReason("");
      setReviewDocumentType("");
    },
  });

  const activatePromo = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc(
        "admin_activate_marketplace_promo_card_v1", {
          target_project_id: projectId,
          target_driver_user_id: driverUserId,
          target_authorization_confirmed: authorizationConfirmed,
          target_authorization_reference: authorizationReference.trim(),
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["driver-identity-review", projectId, driverUserId] });
      setPromoOpen(false);
      setAuthorizationConfirmed(false);
      setAuthorizationReference("");
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc(
        "admin_update_marketplace_driver_contact_v1",
        {
          target_project_id: projectId,
          target_driver_user_id: driverUserId,
          target_display_name: name.trim(),
          target_phone: phone.trim(),
          target_reason: reason.trim(),
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["driver-management-360", projectId, driverUserId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["marketplace-driver-360", projectId, driverUserId],
        }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-drivers", projectId] }),
      ]);
      setEditOpen(false);
      setReason("");
    },
  });

  async function viewDocument(asset: DocumentItem) {
    // Open synchronously on the user gesture, before the asynchronous security check.
    const tab = window.open("", "_blank");
    if (!tab) {
      setDocumentError(
        "El navegador bloqueó la pestaña. Habilita las ventanas emergentes para Vrixora.",
      );
      return;
    }
    tab.opener = null;
    setOpeningDocument(asset.id);
    setDocumentError(null);
    try {
      const { data: root, error } = await getSupabaseClient().functions.invoke(
        "marketplace-map-admin-gateway",
        {
          body: {
            operation: "driver_document_signed_url",
            project_id: projectId,
            driver_user_id: driverUserId,
            asset_id: asset.id,
          },
        },
      );
      if (error || !root?.ok || typeof root?.data?.signed_url !== "string") {
        throw new Error(error?.message || "No se pudo autorizar la visualización.");
      }
      tab.location.replace(root.data.signed_url);
    } catch (error) {
      tab.close();
      setDocumentError(
        error instanceof Error ? error.message : "No se pudo consultar el documento.",
      );
    } finally {
      setOpeningDocument(null);
    }
  }

  if (data.isLoading)
    return (
      <p className="text-sm text-muted-foreground">Consultando requisitos y notificaciones…</p>
    );
  if (data.isError || !data.data)
    return (
      <section
        className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm text-amber-200"
        role="alert"
      >
        El expediente ampliado aún no está disponible. Comprueba que las funciones administrativas
        V1 estén publicadas.
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-3"
          onClick={() => void data.refetch()}
        >
          Reintentar
        </Button>
      </section>
    );

  const m = data.data;
  const applicable = m.checklist.filter((item) => item.applicable !== false);
  const pending = applicable.filter((item) => !item.ok);
  const completed = applicable.length - pending.length;
  const stats = m.notifications;
  const resolved = stats.accepted + stats.not_accepted;
  const acceptanceRate = resolved ? Math.round((stats.accepted / resolved) * 100) : null;
  const front = m.document_assets.find((asset) => asset.kind === "identity_front")?.id ?? null;
  const back = m.document_assets.find((asset) => asset.kind === "identity_back")?.id ?? null;
  const canVerify = Boolean(front && back && m.driver.status !== "suspended");
  const documentTypeKnown = m.driver.identity_type === "national_id" || m.driver.identity_type === "driver_license";

  return (
    <div className="min-w-0 space-y-3 max-sm:[&_button]:min-h-11" aria-label="Gestión administrativa del conductor">
      <section className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-primary">
              Gestión e inscripción
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              Expediente administrativo
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Completados {completed} de {applicable.length} requisitos; la activación la determina
              el servidor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${m.onboarding_complete ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`}
            >
              {m.onboarding_complete
                ? "Inscripción completa"
                : `${pending.length} requisitos pendientes`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setName(m.driver.display_name ?? "");
                setPhone(m.driver.phone ?? "");
                setReason("");
                setEditOpen((prev) => !prev);
              }}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Editar contacto
            </Button>
          </div>
        </div>
        {editOpen ? (
          <form
            className={cn("mt-3 grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-2", premiumColumnHeaderSurface)}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <label className="text-xs text-muted-foreground">
              Nombre completo
              <input
                required
                maxLength={120}
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn("mt-1 h-11 w-full min-w-0 rounded-lg border bg-surface-1 px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring", premiumControlSurface)}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              WhatsApp internacional
              <input
                required
                pattern="\+[1-9][0-9]{7,14}"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={cn("mt-1 h-11 w-full min-w-0 rounded-lg border bg-surface-1 px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring", premiumControlSurface)}
              />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Motivo administrativo de la corrección
              <input
                required
                minLength={5}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={cn("mt-1 h-11 w-full min-w-0 rounded-lg border bg-surface-1 px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring", premiumControlSurface)}
              />
            </label>
            {save.isError ? (
              <p role="alert" className="text-sm text-rose-200 sm:col-span-2">
                No se pudo guardar. Verifica el formato y tus permisos.
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Guardando…" : "Guardar con auditoría"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
        <details className={cn("mt-3 rounded-lg border p-2.5", premiumColumnHeaderSurface)}>
          <summary className="min-h-11 cursor-pointer text-sm font-medium text-foreground">
            Ver requisitos de inscripción ({completed}/{applicable.length})
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {m.checklist.map((item) => (
            <div
              key={item.key}
              className={cn("flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2.5 text-xs", premiumColumnHeaderSurface)}
            >
              {item.applicable === false ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : item.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              )}
              <span
                className={
                  item.applicable === false || item.ok
                    ? "text-muted-foreground"
                    : "font-semibold text-amber-100"
                }
              >
                {item.label}
                {item.applicable === false ? " - No aplica" : ""}
              </span>
            </div>
          ))}
          </div>
        </details>
      </section>

      <section className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Documentos y fotografías del conductor</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Documentos privados; acceso temporal autorizado. Tipo registrado:{" "}
          {m.driver.identity_type === "national_id"
            ? "Carnet de identidad"
            : m.driver.identity_type === "driver_license"
              ? "Licencia"
              : "Pendiente"}
          .
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {m.document_assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              disabled={openingDocument === asset.id}
              onClick={() => void viewDocument(asset)}
              className={cn("flex min-w-0 min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm text-primary hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", premiumColumnHeaderSurface)}
            >
              <span className="inline-flex min-w-0 items-center gap-2 break-words">
                <FileText className="h-4 w-4" />
                {asset.label}
              </span>
              <span className="text-xs">{openingDocument === asset.id ? "Abriendo…" : "Ver"}</span>
            </button>
          ))}
        </div>
        {m.document_assets.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No hay documentos disponibles vinculados al expediente.
          </p>
        ) : null}
        {documentError ? (
          <p className="mt-2 flex gap-2 text-xs text-rose-200" role="alert">
            <AlertTriangle className="h-4 w-4" />
            {documentError}
          </p>
        ) : null}
        <div className={cn("mt-4 rounded-xl border p-3", premiumColumnHeaderSurface)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <BadgeCheck className={cn("h-5 w-5 shrink-0", review.data?.verified ? "fill-blue-500 text-white" : "text-muted-foreground")} />
                {review.data?.verified ? "Conductor verificado" : "Verificación de identidad"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {review.data?.verified
                  ? `Identidad revisada el ${formatDate(review.data.verified_at)}. La insignia se muestra en Mi TukTuk.`
                  : "Revisa el carnet o licencia y confirma la identidad. La inscripción activa no equivale a una identidad verificada."}
              </p>
            </div>
            {review.data && (
              <Button type="button" size="sm" variant="outline"
                disabled={reviewMutation.isPending || (!review.data.verified && !canVerify)}
                onClick={() => { setReviewReason(""); setReviewDocumentType(documentTypeKnown ? m.driver.identity_type! : ""); setReviewOpen((open) => !open); }}>
                {review.data.verified ? "Retirar verificación" : "Verificar identidad"}
              </Button>
            )}
          </div>
          {review.isError && <p className="mt-2 text-xs text-muted-foreground">La verificación administrativa aún no está disponible.</p>}
          {review.data && !review.data.verified && !canVerify && (
            <p className="mt-2 text-xs text-muted-foreground">Para conceder la insignia se necesitan ambas caras del documento y un conductor no suspendido.</p>
          )}
          {review.data && (
            <div className="mt-3 border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">Mi TukTuk</p>
                  <p className="text-xs text-muted-foreground">
                    {review.data.promo_active ? "Perfil promocional activado. Las dos tarjetas están disponibles para el conductor."
                      : review.data.verified ? "Identidad aprobada. Activa la ficha para entregar automáticamente sus tarjetas."
                      : "Pendiente de verificar la identidad."}
                  </p>
                </div>
                {!review.data.promo_active && (
                  <Button type="button" size="sm" disabled={!review.data.verified || m.driver.status !== "active" || activatePromo.isPending}
                    onClick={() => { setPromoOpen((open) => !open); setAuthorizationConfirmed(false); setAuthorizationReference(""); }}>
                    Activar Mi TukTuk
                  </Button>
                )}
              </div>
              {promoOpen && review.data.verified && !review.data.promo_active && (
                <form className="mt-3 space-y-3" onSubmit={(event) => {
                  event.preventDefault();
                  activatePromo.mutate();
                }}>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={authorizationConfirmed} onChange={(event) => setAuthorizationConfirmed(event.target.checked)} />
                    <span>He comprobado que el conductor autorizó el uso promocional de su nombre y fotografía.</span>
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    Referencia de la autorización documentada (inscripción o expediente)
                    <input required minLength={5} maxLength={300} value={authorizationReference}
                      onChange={(event) => setAuthorizationReference(event.target.value)}
                      className={cn("mt-1 h-11 w-full rounded-lg border bg-surface-1 px-3 text-sm text-foreground", premiumControlSurface)} />
                  </label>
                  {activatePromo.isError && <p role="alert" className="text-xs text-rose-200">No se pudo activar. Comprueba la verificación, el servicio operativo y los permisos.</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={activatePromo.isPending || !authorizationConfirmed || authorizationReference.trim().length < 5}>
                      {activatePromo.isPending ? "Activando…" : "Activar y entregar ficha"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setPromoOpen(false)}>Cancelar</Button>
                  </div>
                </form>
              )}
            </div>
          )}
          {reviewOpen && review.data && (
            <form className="mt-3 space-y-2" onSubmit={(event) => {
              event.preventDefault();
              reviewMutation.mutate({ verified: !review.data!.verified, front, back, documentType: review.data!.verified ? null : reviewDocumentType });
            }}>
              {!review.data.verified && (
                <label className="block text-xs text-muted-foreground">
                  Tipo de documento revisado
                  <select required value={reviewDocumentType} disabled={documentTypeKnown}
                    onChange={(event) => setReviewDocumentType(event.target.value)}
                    className={cn("mt-1 h-11 w-full rounded-lg border bg-surface-1 px-3 text-sm text-foreground", premiumControlSurface)}>
                    <option value="">Selecciona el tipo de documento</option>
                    <option value="national_id">Carnet de identidad</option>
                    <option value="driver_license">Licencia de conducción</option>
                  </select>
                  {!documentTypeKnown && <span className="mt-1 block">El expediente antiguo no indica el tipo. Selecciónalo después de revisar ambas imágenes; se guardará junto a la aprobación.</span>}
                </label>
              )}
              <label className="block text-xs text-muted-foreground">
                Motivo de la revisión administrativa
                <input required minLength={5} maxLength={300} value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  className={cn("mt-1 h-11 w-full rounded-lg border bg-surface-1 px-3 text-sm text-foreground", premiumControlSurface)} />
              </label>
              {!review.data.verified && (
                <p className="text-xs text-muted-foreground">Confirma solo después de comprobar que el documento corresponde a este conductor.</p>
              )}
              {reviewMutation.isError && <p role="alert" className="text-xs text-rose-200">No se pudo guardar la revisión. Comprueba los permisos y que los documentos sigan vigentes.</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={reviewMutation.isPending || reviewReason.trim().length < 5 || (!review.data.verified && (!canVerify || !reviewDocumentType))}>
                  {reviewMutation.isPending ? "Guardando…" : review.data.verified ? "Confirmar retirada" : "Confirmar identidad"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      </section>

      <section className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <h3 className="font-semibold text-foreground">Trabajos notificados y respuesta</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Datos registrados desde {formatDate(stats.first_recorded)}. Enviado no significa leído; la
          cobertura histórica puede ser parcial. Solo carreras reales.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {(
            [
              ["Oportunidades notificadas", stats.total],
              ["Aceptadas", stats.accepted],
              ["No aceptadas", stats.not_accepted],
              ["Pendientes", stats.pending],
              ["Recordatorios", stats.reminders],
              ["Canceladas", stats.cancelled],
              ["Tasa de aceptación", acceptanceRate == null ? "—" : `${acceptanceRate} %`],
            ] as Array<[string, string | number]>
          ).map(([label, value]) => (
            <div
              key={label}
              className={cn("min-w-0 rounded-xl border p-3", premiumColumnHeaderSurface)}
            >
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-bold text-primary">{value}</p>
            </div>
          ))}
        </div>
        {stats.events.length ? (
          <details className={cn("mt-3 rounded-xl border p-3", premiumColumnHeaderSurface)}>
            <summary className="min-h-11 cursor-pointer text-sm font-medium text-foreground">
              Últimas 30 oportunidades registradas
            </summary>
            <div className="mt-3 space-y-2">
              {stats.events.map((event) => (
                <div
                  key={event.job_id}
                  className={cn("flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3", premiumSurface)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      {serviceLabels[event.service_code] ?? event.service_code} ·{" "}
                      {outcomeLabels[event.outcome] ?? event.outcome}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(event.first_sent)} · {event.reminders} recordatorios
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenJob(event.job_id)}
                  >
                    Ver carrera
                  </Button>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Aún no hay notificaciones reales verificables para este conductor.
          </p>
        )}
      </section>
      <section className={cn("min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
        <h3 className="font-semibold text-foreground">Auditoría de gestión</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Últimas actuaciones administrativas registradas para este expediente.
        </p>
        {m.audit_events?.length ? (
          <div className="mt-3 space-y-2">
            {m.audit_events.map((event, index) => (
              <div
                key={`${event.at}-${index}`}
                className={cn("flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-xs", premiumColumnHeaderSurface)}
              >
                <span className="text-foreground">
                  {event.action === "admin_verify_driver_identity"
                    ? "Identidad verificada"
                    : event.action === "admin_revoke_driver_identity"
                      ? "Verificación retirada"
                    : event.action === "admin_edit_driver_contact"
                    ? "Contacto modificado"
                    : event.action === "admin_edit_driver_vehicle"
                      ? "Datos del vehículo modificados"
                      : event.action === "admin_view_driver_document"
                        ? "Documento consultado"
                        : "Actuación administrativa"}
                </span>
                <span className="text-muted-foreground">{formatDate(event.at)}</span>
                {event.reason ? (
                  <span className="w-full text-muted-foreground">Motivo: {event.reason}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Sin actuaciones registradas en este historial.
          </p>
        )}
      </section>
    </div>
  );
}
