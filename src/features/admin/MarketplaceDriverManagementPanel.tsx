import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, Pencil, ShieldCheck, XCircle } from "lucide-react";
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
                  {event.action === "admin_edit_driver_contact"
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
