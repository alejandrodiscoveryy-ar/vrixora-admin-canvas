import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ExternalLink, Loader2, Megaphone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/SectionCard";
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
      title="Aplicación y versiones"
      description="TukTuk Conductor · Android"
      density="compact"
      appearance="premium"
      module="configuracion"
      headerClassName="px-3 py-2.5 sm:px-4"
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
          {/* La cabecera siempre muestra el estado guardado, nunca el borrador. */}
          <section aria-label="Estado de la versión publicada" className="space-y-2 rounded-xl border border-border-default bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-medium text-text-secondary">Publicada</span>
                <strong className="text-lg font-semibold tabular-nums text-text-primary">
                  {query.data.latest_version || "Sin versión"}
                </strong>
                <span className="text-xs text-text-secondary">
                  Compilación {query.data.latest_build || "—"}
                </span>
              </div>
              <span className={
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold " +
                (query.data.enabled
                  ? (projectSettings.data?.forceUpdate
                      ? "border-amber-400/35 bg-amber-400/10 text-amber-300"
                      : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300")
                  : "border-border-default bg-surface-1 text-text-secondary")
              }>
                {query.data.enabled
                  ? (projectSettings.data?.forceUpdate ? "Actualización obligatoria" : "Aviso opcional")
                  : "Aviso desactivado"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
              <span className="min-w-0 truncate">
                {query.data.release_notes.trim()
                  ? query.data.release_notes.trim().replace(/\s+/g, " ").slice(0, 110)
                  : "Sin novedades registradas"}
                {query.data.release_notes.trim().length > 110 ? "…" : ""}
              </span>
              <a href={TUKTUK_CONDUCTOR_PLAY_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
                Google Play <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </section>

          <section aria-label="Monitoreo de la actualización" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">1. Seguimiento</h3>
              <Button size="sm" variant="ghost"
                onClick={() => void Promise.all([versionAdoption.refetch(), deliveryQuery.refetch(), driverAudience.refetch()])}
                disabled={!canManage || versionAdoption.isFetching || deliveryQuery.isFetching}
                aria-label="Actualizar el seguimiento de la versión">
                <RefreshCw className={"mr-1.5 h-3.5 w-3.5" + (versionAdoption.isFetching || deliveryQuery.isFetching ? " animate-spin" : "")} />
                Actualizar datos
              </Button>
            </div>
            {versionAdoption.isError ? (
              <p role="alert" className="text-xs text-destructive">No se pudieron consultar las instalaciones.</p>
            ) : versionAdoption.data ? (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {([
                    ["Conductores activos", versionAdoption.data.active_drivers],
                    ["Versión confirmada", versionAdoption.data.current_drivers],
                    ["Versión anterior", versionAdoption.data.outdated_drivers],
                    ["Sin información", versionAdoption.data.unknown_drivers],
                  ] as const).map(([name, count]) => (
                    <div key={name} className="min-w-0 rounded-lg border border-border-default bg-surface-2 px-3 py-2">
                      <p className="text-[12px] leading-4 text-text-secondary">{name}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{count}</p>
                    </div>
                  ))}
                </div>
                {!versionAdoption.data.last_reported_at ? (
                  <p className="text-xs text-text-secondary">
                    Aún no hay instalaciones verificadas. La APK publicada anteriormente no informaba la compilación instalada.
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary">
                    Último registro: {new Date(versionAdoption.data.last_reported_at).toLocaleString("es-ES")}.
                    {versionAdoption.data.stale_reports > 0
                      ? " Informes antiguos: " + versionAdoption.data.stale_reports + "." : ""}
                    {" "}Los registros de más de 30 días cuentan como desconocidos.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-text-secondary">
                {canManage ? "Consultando instalaciones..." : "Se requiere permiso de configuración para consultar el seguimiento."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                <Megaphone className="h-3.5 w-3.5 text-primary" /> Notificaciones
              </span>
              {deliveryQuery.isError ? (
                <span role="alert">No disponibles</span>
              ) : deliveryQuery.data ? (
                <>
                  <span><strong className="text-text-primary tabular-nums">{deliveryQuery.data.sent_drivers}</strong> enviadas</span>
                  <span>{deliveryQuery.data.pending_drivers} pendientes</span>
                  {deliveryQuery.data.failed_drivers > 0 ? (
                    <span className="text-destructive">{deliveryQuery.data.failed_drivers} con error</span>
                  ) : null}
                  <span>· {deliveryQuery.data.eligible_drivers} conductores habilitados</span>
                </>
              ) : (
                <span>Consultando envíos...</span>
              )}
              <span className="text-text-tertiary">Enviado no significa instalado</span>
            </div>
          </section>

          <section aria-label="Preparar la siguiente actualización" className="border-t border-border-subtle pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">2. Preparar versión</h3>
                <p className="text-xs text-text-secondary">
                  {proposedRelease
                    ? "Sugerida: " + proposedRelease.version + " · compilación " + proposedRelease.build
                    : "La versión y el aviso actuales no cambian al preparar un borrador"}
                </p>
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
                {editorOpen ? "Cerrar" : "Preparar / editar"}
                {editorOpen
                  ? <ChevronUp className="ml-1.5 h-3.5 w-3.5" />
                  : <ChevronDown className="ml-1.5 h-3.5 w-3.5" />}
              </Button>
            </div>

            {editorOpen ? (
              <div id="android-release-editor" className="mt-3 space-y-3 rounded-xl border border-border-default bg-surface-2 p-3">
                {proposedRelease ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2">
                    <p className="text-xs text-text-secondary">
                      Propuesta: <strong className="text-text-primary">{proposedRelease.version} ({proposedRelease.build})</strong>
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
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">3. Avisar a los conductores</h3>
              <p className="text-xs text-text-secondary">Después de guardar. Un envío por conductor y compilación.</p>
            </div>
            <Button type="button" size="sm" variant="outline"
              onClick={() => setPushConfirmationOpen(true)}
              disabled={!canManage || !hasSavedActiveRelease || !driverAudience.data ||
                driverAudience.data.eligible_android_users === 0 || driverAudience.isError ||
                sendPush.isPending || save.isPending ||
                (deliveryQuery.data != null &&
                  deliveryQuery.data.sent_drivers >= deliveryQuery.data.eligible_drivers &&
                  deliveryQuery.data.pending_drivers === 0 && deliveryQuery.data.failed_drivers === 0)}>
              <Megaphone className="mr-1.5 h-3.5 w-3.5" />
              {deliveryQuery.data && deliveryQuery.data.eligible_drivers > 0 &&
                deliveryQuery.data.sent_drivers >= deliveryQuery.data.eligible_drivers &&
                deliveryQuery.data.pending_drivers === 0 && deliveryQuery.data.failed_drivers === 0
                ? "Ya notificados" : "Notificar versión"}
            </Button>
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
