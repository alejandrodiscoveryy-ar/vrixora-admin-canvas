import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Smartphone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/SectionCard";

const PLAY_URL = "";

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
  download_url: PLAY_URL,
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
  const [url, setUrl] = useState(PLAY_URL);
  const [notes, setNotes] = useState("");

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
    setUrl(query.data.download_url || PLAY_URL);
    setNotes(query.data.release_notes);
  }, [query.data, projectSettings.data]);

  const parsedBuild = Number(build);
  const validVersion = /^\d+(?:\.\d+){1,3}$/.test(version.trim());
  let validUrl = false;
  try {
    const parsed = new URL(url.trim());
    validUrl = parsed.protocol === "https:" && Boolean(parsed.hostname) &&
      !parsed.username && !parsed.password;
  } catch { /* Invalid download URL. */ }
  const valid = !enabled || (
    validVersion && Number.isSafeInteger(parsedBuild) && parsedBuild > 0 && validUrl
  );

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
        target_download_url: url.trim(),
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
      description="Configura el aviso automático, el tipo de actualización y el enlace oficial desde una sola ficha."
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
          <div className="space-y-1.5">
            <Label htmlFor="app-release-download">Enlace oficial HTTPS de descarga</Label>
            <Input className="h-10 rounded-xl border-cyan-400/20 bg-[#08141a]/80" id="app-release-download" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="Enlace oficial HTTPS de la nueva APK" maxLength={1500} disabled={!canManage || save.isPending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-release-notes">Novedades de la versión</Label>
            <Textarea className="min-h-24 rounded-xl border-cyan-400/20 bg-[#08141a]/80" id="app-release-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Mejoras de estabilidad, avisos y experiencia del conductor."
              maxLength={1800} disabled={!canManage || save.isPending} />
          </div>
          <p className="text-xs text-text-secondary">
            <Download className="mr-1 inline h-3.5 w-3.5" />
            Publica primero la APK/AAB y verifica el enlace. No establezcas una versión mínima superior a la versión publicada.
          </p>
          {!valid ? <p role="alert" className="text-sm text-destructive">La versión, la compilación y el enlace HTTPS deben ser válidos.</p> : null}
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
          </div>
        </div>
      )}
    </SectionCard>
  );
}
