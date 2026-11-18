import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Smartphone, ShieldAlert, Send } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/SectionCard";
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
  const [pushSending, setPushSending] = useState(false);

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

  const parsedBuild = Number(build);
  const validVersion = /^\d+(?:\.\d+){1,3}$/.test(version.trim());
  const proposedRelease = query.data
    ? suggestNextAndroidRelease(query.data.latest_version, query.data.latest_build)
    : null;
  const valid = !enabled || (
    validVersion && Number.isSafeInteger(parsedBuild) && parsedBuild > 0 && parsedBuild <= 2147483647
  );
  const savedRelease = query.data;
  const configuredForPush = Boolean(savedRelease?.enabled &&
    /^\\d+(?:\\.\\d+){1,3}$/.test(savedRelease.latest_version) &&
    savedRelease.latest_build > 0);
  const hasDraftChanges = Boolean(savedRelease && (
    enabled !== savedRelease.enabled ||
    version.trim() !== savedRelease.latest_version ||
    parsedBuild !== savedRelease.latest_build ||
    notes.trim() !== savedRelease.release_notes ||
    (mode === "mandatory") !== Boolean(projectSettings.data?.forceUpdate)
  ));
  const canAnnounceRelease = canManage && !save.isPending && !pushSending &&
    !hasUnsavedProjectChanges && !hasDraftChanges && configuredForPush;
  const pushAudience = useQuery({
    queryKey: ["mobile-push-audience", projectId],
    queryFn: () => supabaseServices.communications.audience(projectId),
    enabled: canManage,
  });
  const sendReleaseAnnouncement = async () => {
    if (!canAnnounceRelease || !savedRelease) return;
    const title = `Nueva versión de TukTuk Conductor ${savedRelease.latest_version}`;
    const message = savedRelease.release_notes.replace(/\\*\\*/g, "").trim() ||
      "Nueva versión disponible. Actualiza TukTuk Conductor desde Google Play.";
    if (!window.confirm(`¿Enviar una notificación push sobre la versión ${savedRelease.latest_version} a ${pushAudience.data?.eligibleAndroidUsers ?? "los"} conductores elegibles? El aviso dentro de la aplicación ya funciona por separado.`)) return;
    setPushSending(true);
    try {
      const result = await supabaseServices.communications.send(projectId, {
        category: "app_update",
        title,
        body: message.slice(0, 500),
        releaseVersion: savedRelease.latest_version,
        actionUrl: TUKTUK_CONDUCTOR_PLAY_URL,
      });
      toast.success(`Notificación encolada para ${result.queuedUsers} usuario(s) elegible(s).`);
      await queryClient.invalidateQueries({ queryKey: ["mobile-push-audience", projectId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el aviso.");
    } finally {
      setPushSending(false);
    }
  };

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-release-settings", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-settings", projectId] }),
      ]);
      toast.success("Configuracion de actualizacion guardada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <SectionCard
      title="Actualizaciones de TukTuk Conductor"
      description="Configura el aviso, la versión Android y el enlace oficial permanente desde una sola ficha."
      module="configuracion"
      className="relative overflow-hidden rounded-[25px] border border-cyan-400/20 bg-gradient-to-br from-[#0b171c] via-[#081116] to-[#061a20]/90 shadow-[0_26px_70px_-42px_rgba(0,0,0,0.94)]"
      headerClassName="border-b border-cyan-400/[0.12] bg-cyan-300/[0.025] px-4 py-4 sm:px-6"
      contentClassName="p-0"
    >
      {query.isLoading || projectSettings.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : query.isError || projectSettings.isError ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cargar la configuración de versiones. Verifica que la migración de Supabase esté aplicada.
        </p>
      ) : (
        <div className="relative isolate overflow-hidden p-4 sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
            <span className="absolute -right-6 top-0 rotate-[-14deg] text-[clamp(5rem,14vw,11rem)] font-black tracking-tighter text-primary/[0.045]">TUKTUK</span>
            <Smartphone className="absolute -bottom-12 -right-8 h-60 w-60 rotate-[-16deg] text-primary/[0.065]" strokeWidth={0.8} />
          </div>
          <div className="relative z-10 space-y-2.5">
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
            <div>
              <p className="text-sm font-medium">Activar aviso automático</p>
              <p className="text-xs text-text-secondary">Desactivado por defecto. No envía notificaciones push.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage || save.isPending} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" aria-pressed={mode === "optional"} disabled={!canManage || save.isPending}
              className={`min-h-20 rounded-2xl border p-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${mode === "optional" ? "border-cyan-300/50 bg-cyan-300/[0.09]" : "border-cyan-400/15 bg-[#08151b]/70 hover:border-cyan-400/35"}`}
              onClick={() => setMode("optional")}>
              <span className="font-semibold">Opcional</span>
              <span className="block text-xs text-text-secondary">Actualizar ahora o más tarde</span>
            </button>
            <button type="button" aria-pressed={mode === "mandatory"} disabled={!canManage || save.isPending}
              className={`min-h-20 rounded-2xl border p-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${mode === "mandatory" ? "border-amber-400/50 bg-amber-400/[0.09]" : "border-cyan-400/15 bg-[#08151b]/70 hover:border-cyan-400/35"}`}
              onClick={() => setMode("mandatory")}>
              <span className="font-semibold">Obligatoria</span>
              <span className="block text-xs text-text-secondary">Requiere instalar la nueva versión</span>
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="app-release-version">Versión publicada</Label>
              <Input className="h-10 rounded-xl border-cyan-400/20 bg-[#08141a]/80" id="app-release-version" value={version} onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.21" maxLength={24} disabled={!canManage || save.isPending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="app-release-build">Número de compilación Android</Label>
              <Input className="h-10 rounded-xl border-cyan-400/20 bg-[#08141a]/80" id="app-release-build" type="number" min={1} step={1} value={build}
                onChange={(e) => setBuild(e.target.value)} placeholder="23" disabled={!canManage || save.isPending} />
            </div>
          </div>
          {proposedRelease ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.035] px-3 py-2.5">
              <p className="text-xs text-text-secondary">
                Siguiente sugerida: <strong className="text-text-primary">{proposedRelease.version}</strong>
                {" · compilación "}
                <strong className="text-text-primary">{proposedRelease.build}</strong>
              </p>
              <Button type="button" variant="outline" size="sm"
                disabled={!canManage || save.isPending}
                onClick={() => {
                  setVersion(proposedRelease.version);
                  setBuild(String(proposedRelease.build));
                }}>
                Usar sugerencia
              </Button>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="app-release-download">Enlace oficial de descarga (fijo)</Label>
            <Input className="h-10 rounded-xl border-cyan-400/20 bg-[#08141a]/80 text-text-secondary" id="app-release-download"
              type="url" value={TUKTUK_CONDUCTOR_PLAY_URL} readOnly aria-readonly="true"
              title={TUKTUK_CONDUCTOR_PLAY_URL} />
            <p className="text-xs text-text-secondary">Enlace permanente de Google Play. No se modifica al publicar una nueva versión.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-release-notes">Novedades de la versión</Label>
            <Textarea className="min-h-24 rounded-xl border-cyan-400/20 bg-[#08141a]/80" id="app-release-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Mejoras de estabilidad, avisos y experiencia del conductor."
              maxLength={1800} disabled={!canManage || save.isPending} />
          </div>
          <p className="text-xs text-text-secondary">
            <Download className="mr-1 inline h-3.5 w-3.5" />
            Publica primero la APK/AAB y verifica que esté disponible en Google Play. La sugerencia no se activa hasta guardar.
          </p>
          {!valid ? <p role="alert" className="text-sm text-destructive">La versión y la compilación Android deben ser válidas.</p> : null}
          {enabled && mode === "mandatory" ? (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-xs text-amber-200">
              <ShieldAlert className="h-4 w-4 shrink-0" /> El conductor no podrá continuar sin instalar la versión publicada. Verifica antes la descarga.
            </div>
          ) : null}
          {hasUnsavedProjectChanges ? <p className="text-xs text-amber-300">Guarda primero los demás cambios de configuración.</p> : null}
          <div className="flex justify-end">
            <Button type="button"               onClick={() => {
                if (enabled && mode === "mandatory" && !window.confirm("¿Confirmas la actualización obligatoria? Verifica que la nueva APK y su enlace funcionan correctamente.")) return;
                save.mutate();
              }}
              disabled={!canManage || hasUnsavedProjectChanges || !valid || save.isPending || projectSettings.isLoading || projectSettings.isError}>
              {save.isPending ? "Guardando..." : "Guardar versión Android"}
            </Button>
          </div>
          <div className="border-t border-cyan-400/15 pt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Notificación a los conductores</p>
                <p className="text-xs text-text-secondary">
                  El aviso automático en la app y la notificación push son distintos; aquí los gestionas juntos.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => void sendReleaseAnnouncement()}
                disabled={!canAnnounceRelease || pushAudience.isLoading || pushAudience.isError}>
                {pushSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar notificación
              </Button>
            </div>
            <p className="text-xs text-text-secondary">
              {pushAudience.isError
                ? "No se pudo consultar la audiencia de notificaciones."
                : pushAudience.isLoading
                  ? "Consultando audiencia Android..."
                  : `Dispositivos con notificaciones activas: ${pushAudience.data?.enabledAndroidTokens ?? 0}. El envío requiere confirmación.`}
            </p>
            {!configuredForPush
              ? <p className="text-xs text-amber-300">Primero guarda una versión válida con el aviso activado. Comprueba que la actualización esté disponible en Google Play.</p>
              : hasDraftChanges || hasUnsavedProjectChanges
                ? <p className="text-xs text-amber-300">Guarda los cambios de versión antes de enviar la notificación.</p>
                : null}
          </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
