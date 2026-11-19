import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, ChevronDown, ChevronUp, CircleHelp, ExternalLink, Loader2, Megaphone, RefreshCw, ShieldCheck, Smartphone, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/SectionCard";
import { premiumSurface, premiumHeaderSurface, premiumMetricSurface, premiumColumnHeaderSurface } from "@/components/admin/density";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TUKTUK_CONDUCTOR_PLAY_URL, suggestNextAndroidRelease } from "@/lib/androidRelease";

type ReleaseSettings = {
  enabled: boolean;
  latest_version: string;
  latest_build: number;
  download_url: string;
  release_notes: string;
};

const defaultSettings: ReleaseSettings = {
  enabled: false,
  latest_version: "",
  latest_build: 0,
  download_url: TUKTUK_CONDUCTOR_PLAY_URL,
  release_notes: "",
};

export default function AppReleaseSettingsCard({ projectId, canManage, hasUnsavedProjectChanges = false }: {
  projectId: string;
  canManage: boolean;
  hasUnsavedProjectChanges?: boolean;
}) {
  const queryClient = useQueryClient();
  const projectSettings = useQuery({
    queryKey: ["project-settings", projectId],
    queryFn: () => supabaseServices.projects.settings(projectId),
  });
  const [mode, setMode] = useState<"optional" | "mandatory">("optional");
  const [enabled, setEnabled] = useState(false);
  const [version, setVersion] = useState("");
  const [build, setBuild] = useState("");
  const [notes, setNotes] = useState("");
  const [pushConfirmationOpen, setPushConfirmationOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const query = useQuery({
    queryKey: ["app-release-settings", projectId],
    queryFn: async (): Promise<ReleaseSettings> => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_app_release", {
        target_project_id: projectId, target_platform: "android",
      });
      if (error) throw error;
      return { ...defaultSettings, ...((data as Partial<ReleaseSettings> | null) ?? {}) };
    },
  });

  useEffect(() => {
    if (!query.data || !projectSettings.data) return;
    setMode(projectSettings.data.forceUpdate && /^\d+(?:\.\d+){1,3}$/.test(projectSettings.data.minimumVersion)
      ? "mandatory" : "optional");
    setEnabled(query.data.enabled);
    setVersion(query.data.latest_version);
    setBuild(query.data.latest_build > 0 ? String(query.data.latest_build) : "");
    setNotes(query.data.release_notes);
  }, [query.data, projectSettings.data]);

  const versionAdoption = useQuery({
    queryKey: ["driver-android-adoption", projectId],
    queryFn: async (): Promise<{
      target_version: string;
      target_build: number;
      active_drivers: number;
      current_drivers: number;
      outdated_drivers: number;
      unknown_drivers: number;
      stale_reports: number;
      last_reported_at: string | null;
    }> => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_driver_android_adoption", {
        target_project_id: projectId,
      });
      if (error) throw error;
      return data as {
        target_version: string;
        target_build: number;
        active_drivers: number;
        current_drivers: number;
        outdated_drivers: number;
        unknown_drivers: number;
        stale_reports: number;
        last_reported_at: string | null;
      };
    },
    enabled: canManage,
    refetchInterval: 60_000,
  });

  const driverAudience = useQuery({
    queryKey: ["driver-app-update-audience", projectId],
    queryFn: async (): Promise<{ eligible_android_users: number; enabled_android_tokens: number }> => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_driver_app_update_audience", {
        target_project_id: projectId,
      });
      if (error) throw error;
      return data as { eligible_android_users: number; enabled_android_tokens: number };
    },
    enabled: canManage,
  });

  const deliveryQuery = useQuery({
    queryKey: ["driver-android-release-delivery", projectId],
    queryFn: async (): Promise<{
      release_version: string;
      release_build: number;
      eligible_drivers: number;
      sent_drivers: number;
      pending_drivers: number;
      failed_drivers: number;
      last_sent_at: string | null;
    }> => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_driver_android_release_delivery", {
        target_project_id: projectId,
      });
      if (error) throw error;
      return data as {
        release_version: string;
        release_build: number;
        eligible_drivers: number;
        sent_drivers: number;
        pending_drivers: number;
        failed_drivers: number;
        last_sent_at: string | null;
      };
    },
    enabled: canManage,
    refetchInterval: 60_000,
  });

  const parsedBuild = Number(build);
  const validVersion = /^\d+(?:\.\d+){1,3}$/.test(version.trim());
  const proposedRelease = query.data
    ? suggestNextAndroidRelease(query.data.latest_version, query.data.latest_build)
    : null;
  const valid = !enabled || (
    validVersion && Number.isSafeInteger(parsedBuild) && parsedBuild > 0 && parsedBuild <= 2147483647
  );

  const isNewVersion = Boolean(query.data &&
    (version.trim() !== query.data.latest_version || parsedBuild !== query.data.latest_build));
  const hasDraftChanges = Boolean(query.data && projectSettings.data && (
    enabled !== query.data.enabled ||
    isNewVersion ||
    notes.trim() !== query.data.release_notes.trim() ||
    (enabled && mode === "mandatory") !== Boolean(projectSettings.data.forceUpdate)
  ));
  const hasSavedActiveRelease = Boolean(
    query.data?.enabled &&
    enabled &&
    validVersion &&
    query.data.latest_version === version.trim() &&
    query.data.latest_build === parsedBuild &&
    (query.data.release_notes ?? "").trim() === notes.trim() &&
    query.data.download_url === TUKTUK_CONDUCTOR_PLAY_URL &&
    (projectSettings.data?.forceUpdate === true) === (mode === "mandatory") &&
    !hasUnsavedProjectChanges
  );

  // El envío es una acción independiente: guardar versiones nunca lanza push.
  const sendPush = useMutation({
    mutationFn: async (): Promise<{ queued_users: number }> => {
      if (!canManage || !hasSavedActiveRelease || driverAudience.isError) {
        throw new Error("Guarda primero una versión activa y comprueba la audiencia de conductores.");
      }
      const { data, error } = await getSupabaseClient().rpc("admin_send_driver_app_update", {
        target_project_id: projectId,
        target_release_version: version.trim(),
        target_release_build: parsedBuild,
      });
      if (error) throw error;
      return data as { queued_users: number };
    },
    onSuccess: async (result) => {
      setPushConfirmationOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["driver-android-release-delivery", projectId] });
      toast.success(result.queued_users > 0
        ? `Aviso de actualización puesto en cola para ${result.queued_users} conductores.`
        : "No se añadieron avisos: esta compilación ya pudo notificarse o no hay conductores elegibles.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!canManage || hasUnsavedProjectChanges || !valid || projectSettings.isError) {
        throw new Error("Comprueba tus permisos, los campos y otros cambios pendientes.");
      }
      // Un unico RPC: proyecto y version se guardan en una transaccion.
      const { error } = await getSupabaseClient().rpc("admin_save_app_release_policy", {
        target_project_id: projectId,
        target_platform: "android",
        target_enabled: enabled,
        target_latest_version: version.trim(),
        target_latest_build: Number.isSafeInteger(parsedBuild) ? parsedBuild : 0,
        target_download_url: TUKTUK_CONDUCTOR_PLAY_URL,
        target_release_notes: notes.trim(),
        target_mandatory: enabled && mode === "mandatory",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setEditorOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-release-settings", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-settings", projectId] }),
      ]);
      toast.success("Configuracion de actualizacion guardada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const canSaveDraft = canManage && hasDraftChanges && valid &&
    !hasUnsavedProjectChanges && !save.isPending && !projectSettings.isError;

  return (
    <SectionCard
      title="Centro de actualizaciones"
      description="TukTuk Conductor · control y seguimiento Android"
      density="compact"
      appearance="premium"
      module="configuracion"
      className={premiumSurface}
      headerClassName={`px-3 py-3 sm:px-4 ${premiumHeaderSurface}`}
      contentClassName="p-3 sm:p-4"
    >
      {query.isLoading || projectSettings.isLoading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando la versión publicada...
        </div>
      ) : query.isError || projectSettings.isError || !query.data ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudo consultar la versión publicada. Vuelve a cargar esta sección.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Siempre se muestra el estado persistido, nunca el borrador. */}
          <section aria-label="Versión actual de TukTuk Conductor"
            className={`min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4 ${premiumColumnHeaderSurface}`}>

            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-primary">
                  Versión Android publicada
                </p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong className="text-2xl font-semibold tracking-tight tabular-nums text-text-primary sm:text-3xl">
                    {query.data.latest_version || "Sin publicar"}
                  </strong>
                  <span className="rounded-md border border-border-strong bg-surface-1/70 px-2 py-1 text-xs font-semibold text-text-secondary">
                    Build {query.data.latest_build || "—"}
                  </span>
                </div>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-text-secondary">
                  Esta es la versión que la aplicación indica a los conductores.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span role="status" className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold " +
                  (!query.data.enabled
                    ? "border-border-strong bg-surface-2 text-text-secondary"
                    : projectSettings.data?.forceUpdate
                      ? "border-amber-400/35 bg-amber-400/10 text-amber-200"
                      : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200")
                }>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {!query.data.enabled ? "Aviso desactivado" :
                    projectSettings.data?.forceUpdate ? "Actualización obligatoria" : "Actualización opcional"}
                </span>
                <a href={TUKTUK_CONDUCTOR_PLAY_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.08] px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  Abrir Google Play <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
            {query.data.release_notes.trim() ? (
              <details className="group relative mt-3 border-t border-border-default pt-2.5">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-xs font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    <CircleHelp className="h-4 w-4 text-primary" aria-hidden="true" />
                    Ver novedades de esta versión
                  </span>
                  <ChevronDown className="h-4 w-4 text-text-secondary transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                  {query.data.release_notes.replace(/\*{2}/g, "").trim()}
                </p>
              </details>
            ) : null}
          </section>

          <section aria-label="Seguimiento de la actualización" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">1. Seguimiento de la actualización</h3>
                <p className="text-xs text-text-secondary">Avisos enviados e instalaciones conocidas son datos distintos. Enviado no significa instalado.</p>
              </div>
              <Button size="sm" variant="outline"
                onClick={() => void Promise.all([versionAdoption.refetch(), deliveryQuery.refetch(), driverAudience.refetch()])}
                disabled={!canManage || versionAdoption.isFetching || deliveryQuery.isFetching}
                aria-label="Actualizar el seguimiento de la versión">
                <RefreshCw className={"mr-1.5 h-3.5 w-3.5" +
                  (versionAdoption.isFetching || deliveryQuery.isFetching ? " animate-spin" : "")} />
                Actualizar
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className={`min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4 ${premiumMetricSurface}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                    <BellRing className="h-4 w-4" aria-hidden="true" />
                  </span>
                  Notificaciones enviadas
                </div>
                {deliveryQuery.isError ? (
                  <p role="alert" className="mt-3 text-xs text-destructive">No se pudo comprobar el envío.</p>
                ) : deliveryQuery.data ? (
                  <>
                    <div className="mt-3 flex items-baseline gap-2">
                      <strong className="text-3xl font-bold tabular-nums text-emerald-200">
                        {deliveryQuery.data.sent_drivers}
                      </strong>
                      <span className="text-sm text-text-secondary">
                        de {deliveryQuery.data.eligible_drivers} conductores elegibles
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
                      role="progressbar" aria-label="Notificaciones enviadas"
                      aria-valuemin={0} aria-valuemax={Math.max(1, deliveryQuery.data.eligible_drivers)}
                      aria-valuenow={Math.min(deliveryQuery.data.sent_drivers, deliveryQuery.data.eligible_drivers)}>
                      <div className="h-full rounded-full bg-emerald-400 transition-[width]"
                        style={{ width: (deliveryQuery.data.eligible_drivers > 0
                          ? Math.min(100, 100 * deliveryQuery.data.sent_drivers / deliveryQuery.data.eligible_drivers)
                          : 0) + "%" }} />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                      {deliveryQuery.data.pending_drivers === 0 && deliveryQuery.data.failed_drivers === 0
                        ? "Sin envíos pendientes ni errores registrados."
                        : deliveryQuery.data.pending_drivers + " pendientes · " + deliveryQuery.data.failed_drivers + " con error."}
                    </p>
                  </>
                ) : <p className="mt-3 text-xs text-text-secondary">Consultando envíos...</p>}
              </div>
              <div className={`min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4 ${premiumMetricSurface}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </span>
                  Instalaciones verificadas
                </div>
                {versionAdoption.isError ? (
                  <p role="alert" className="mt-3 text-xs text-destructive">No se pudieron consultar las instalaciones.</p>
                ) : versionAdoption.data ? (
                  <>
                    <div className="mt-3 flex items-baseline gap-2" role="status">
                      {!versionAdoption.data.last_reported_at ? (
                        <span className="text-base font-semibold text-text-primary">
                          Sin información de instalación
                        </span>
                      ) : (
                        <>
                          <strong className="text-3xl font-bold tabular-nums text-text-primary">
                            {versionAdoption.data.current_drivers}
                          </strong>
                          <span className="text-sm text-text-secondary">en versión actual confirmada</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-text-secondary">
                        {versionAdoption.data.active_drivers} conductores activos
                      </span>
                      {versionAdoption.data.last_reported_at ? (
                        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-text-secondary">
                          {versionAdoption.data.outdated_drivers} con versión anterior confirmada
                        </span>
                      ) : null}
                      <span className="rounded-md border border-amber-400/15 bg-amber-400/[0.07] px-2 py-1 text-xs text-amber-200">
                        {versionAdoption.data.unknown_drivers} sin datos
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                      {!versionAdoption.data.last_reported_at
                        ? "Las APK anteriores no informaban la versión instalada. Sin datos no significa sin actualizar."
                        : "Datos obtenidos de la APK; si el informe supera 30 días se considera desconocido."}
                    </p>
                  </>
                ) : <p className="mt-3 text-xs text-text-secondary">Consultando instalaciones...</p>}
              </div>
            </div>
          </section>

          <section aria-label="Preparar la siguiente actualización" className={`rounded-[var(--radius-card)] border p-3 sm:p-4 ${premiumColumnHeaderSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary">2. Preparar versión</h3>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {proposedRelease
                      ? "Próxima sugerida: " + proposedRelease.version + " · compilación " + proposedRelease.build
                      : "Edita la versión actual o prepara la siguiente."}
                  </p>
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" aria-expanded={editorOpen}
                aria-controls="android-release-editor" disabled={!canManage || save.isPending}
                onClick={() => {
                  if (editorOpen && hasDraftChanges && !window.confirm("¿Descartar los cambios que no has guardado?")) return;
                  if (editorOpen) {
                    setMode(projectSettings.data?.forceUpdate ? "mandatory" : "optional");
                    setEnabled(query.data.enabled);
                    setVersion(query.data.latest_version);
                    setBuild(query.data.latest_build > 0 ? String(query.data.latest_build) : "");
                    setNotes(query.data.release_notes);
                  }
                  setEditorOpen(!editorOpen);
                }}>
                {editorOpen ? "Cerrar editor" : "Preparar / editar"}
                {editorOpen
                  ? <ChevronUp className="ml-1.5 h-3.5 w-3.5" />
                  : <ChevronDown className="ml-1.5 h-3.5 w-3.5" />}
              </Button>
            </div>

            {editorOpen ? (
              <div id="android-release-editor" className="mt-3 space-y-3 border-t border-border-default pt-3">
                {proposedRelease ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2">
                    <p className="text-xs text-text-secondary">
                      Número sugerido: <strong className="text-text-primary">{proposedRelease.version} · compilación {proposedRelease.build}</strong>
                    </p>
                    <Button type="button" size="sm" variant="outline"
                      disabled={!canManage || save.isPending}
                      onClick={() => {
                        setVersion(proposedRelease.version);
                        setBuild(String(proposedRelease.build));
                        setNotes("");
                      }}>
                      Usar sugerencia
                    </Button>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="app-release-version">Versión</Label>
                    <Input id="app-release-version" value={version}
                      onChange={e => setVersion(e.target.value)} placeholder="1.0.23" maxLength={24}
                      disabled={!canManage || save.isPending} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="app-release-build">Compilación Android</Label>
                    <Input id="app-release-build" type="number" min={1} step={1} value={build}
                      onChange={e => setBuild(e.target.value)} placeholder="25"
                      disabled={!canManage || save.isPending} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="app-release-notes">Novedades que leerá el conductor</Label>
                  <Textarea id="app-release-notes" value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="min-h-[76px]" rows={3} maxLength={1800}
                    placeholder="Describe las novedades de esta versión."
                    disabled={!canManage || save.isPending} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-2">
                  <div className="flex items-center gap-2">
                    <Switch id="app-release-enabled" checked={enabled} onCheckedChange={setEnabled}
                      disabled={!canManage || save.isPending} />
                    <Label htmlFor="app-release-enabled">Aviso en la aplicación</Label>
                  </div>
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border-default p-1"
                    role="group" aria-label="Tipo de aviso">
                    <Button type="button" size="sm"
                      variant={mode === "optional" ? "secondary" : "ghost"}
                      aria-pressed={mode === "optional"}
                      onClick={() => setMode("optional")}
                      disabled={!canManage || save.isPending || !enabled}>Opcional</Button>
                    <Button type="button" size="sm"
                      variant={mode === "mandatory" ? "secondary" : "ghost"}
                      aria-pressed={mode === "mandatory"}
                      onClick={() => setMode("mandatory")}
                      disabled={!canManage || save.isPending || !enabled}>Obligatoria</Button>
                  </div>
                </div>
                <p className="text-xs text-text-secondary">
                  El enlace de Google Play es fijo. Guardar no envía notificaciones.
                  {isNewVersion ? " Verifica primero que esta compilación ya esté publicada en Google Play." : ""}
                  {enabled && mode === "mandatory" ? " La actualización bloqueará versiones anteriores." : ""}
                </p>
                {!valid ? (
                  <p role="alert" className="text-xs text-destructive">Indica versión y compilación Android válidas.</p>
                ) : null}
                {isNewVersion && notes.trim().length === 0 ? (
                  <p role="alert" className="text-xs text-amber-300">
                    Escribe las novedades de esta compilación antes de guardarla.
                  </p>
                ) : null}
                {hasUnsavedProjectChanges ? (
                  <p className="text-xs text-amber-300">Guarda primero los otros cambios de configuración.</p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-text-secondary">
                    {hasDraftChanges ? "Cambios sin guardar" : "Sin cambios pendientes"}
                  </span>
                  <Button type="button"
                    onClick={() => {
                      if (enabled && mode === "mandatory" &&
                          (isNewVersion || !projectSettings.data?.forceUpdate) &&
                          !window.confirm("¿Confirmas que Google Play ya ofrece esta compilación y deseas exigir la actualización?")) return;
                      save.mutate();
                    }}
                    disabled={!canSaveDraft || (isNewVersion && !notes.trim())}>
                    {save.isPending ? "Guardando..." : "Guardar versión Android"}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section aria-label="Notificar la versión publicada"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-1 p-3.5 sm:p-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.10] text-primary">
                <Megaphone className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">3. Avisar a los conductores</h3>
                <p className="text-xs leading-relaxed text-text-secondary">
                  Solo después de publicar y guardar. Cada compilación se envía una vez.
                </p>
              </div>
            </div>
            {deliveryQuery.data && deliveryQuery.data.eligible_drivers > 0 &&
              deliveryQuery.data.sent_drivers >= deliveryQuery.data.eligible_drivers &&
              deliveryQuery.data.pending_drivers === 0 && deliveryQuery.data.failed_drivers === 0 ? (
              <span role="status"
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.09] px-3 text-xs font-semibold text-emerald-200">
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                Ya notificados
              </span>
            ) : (
              <Button type="button" size="sm" variant="outline"
                onClick={() => setPushConfirmationOpen(true)}
                disabled={!canManage || !hasSavedActiveRelease || !driverAudience.data ||
                  driverAudience.data.eligible_android_users === 0 || driverAudience.isError ||
                  sendPush.isPending || save.isPending}>
                <Megaphone className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Notificar versión
              </Button>
            )}
          </section>

          <AlertDialog open={pushConfirmationOpen} onOpenChange={setPushConfirmationOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Notificar esta versión?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se notificará la versión {query.data.latest_version} (compilación {query.data.latest_build})
                  a los conductores activos con Android habilitado. Guardar una versión no envía
                  notificaciones; esta acción es independiente y evita duplicados por compilación.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={sendPush.isPending}>Cancelar</AlertDialogCancel>
                <AlertDialogAction disabled={sendPush.isPending || !hasSavedActiveRelease}
                  onClick={() => sendPush.mutate()}>
                  {sendPush.isPending ? "Enviando..." : "Confirmar envío"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </SectionCard>
  );
}
