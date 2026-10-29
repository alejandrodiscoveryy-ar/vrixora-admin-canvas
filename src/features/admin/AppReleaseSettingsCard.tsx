import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/SectionCard";

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.alejandrocruz.tuktukcontrol";

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

export default function AppReleaseSettingsCard({ projectId, canManage }: {
  projectId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
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
    if (!query.data) return;
    setEnabled(query.data.enabled);
    setVersion(query.data.latest_version);
    setBuild(query.data.latest_build > 0 ? String(query.data.latest_build) : "");
    setUrl(query.data.download_url || PLAY_URL);
    setNotes(query.data.release_notes);
  }, [query.data]);

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
      if (!canManage) throw new Error("Necesitas el permiso de configuración.");
      if (!valid) throw new Error("Revisa versión, código de compilación y enlace HTTPS.");
      const { error } = await getSupabaseClient().rpc("admin_set_app_release", {
        target_project_id: projectId,
        target_platform: "android",
        target_enabled: enabled,
        target_latest_version: version.trim(),
        target_latest_build: Number.isSafeInteger(parsedBuild) ? parsedBuild : 0,
        target_download_url: url.trim(),
        target_release_notes: notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["app-release-settings", projectId] });
      toast.success("Versión Android guardada correctamente.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SectionCard
      title="Actualizaciones de TukTuk Conductor"
      description="Configura el aviso automático al abrir la APK. La exigencia de actualizar se controla con Versión mínima y Forzar actualización de la sección anterior."
      module="configuracion"
      className="border-border-default bg-surface-1 shadow-[var(--shadow-card)]"
      headerClassName="px-4 py-2.5"
      contentClassName="p-3"
    >
      {query.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cargar la configuración de versiones. Verifica que la migración de Supabase esté aplicada.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Activar aviso automático</p>
              <p className="text-xs text-text-secondary">Desactivado por defecto. No envía notificaciones push.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage || save.isPending} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="app-release-version">Versión publicada</Label>
              <Input id="app-release-version" value={version} onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.21" maxLength={24} disabled={!canManage || save.isPending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="app-release-build">Número de compilación Android</Label>
              <Input id="app-release-build" type="number" min={1} step={1} value={build}
                onChange={(e) => setBuild(e.target.value)} placeholder="23" disabled={!canManage || save.isPending} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-release-download">Enlace oficial HTTPS de descarga</Label>
            <Input id="app-release-download" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={PLAY_URL} maxLength={1500} disabled={!canManage || save.isPending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-release-notes">Novedades de la versión</Label>
            <Textarea id="app-release-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Mejoras de estabilidad, avisos y experiencia del conductor."
              maxLength={1800} disabled={!canManage || save.isPending} />
          </div>
          <p className="text-xs text-text-secondary">
            <Download className="mr-1 inline h-3.5 w-3.5" />
            Publica primero la APK/AAB y verifica el enlace. No establezcas una versión mínima superior a la versión publicada.
          </p>
          {!valid ? <p role="alert" className="text-sm text-destructive">La versión, la compilación y el enlace HTTPS deben ser válidos.</p> : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => save.mutate()}
              disabled={!canManage || !valid || save.isPending}>
              {save.isPending ? "Guardando..." : "Guardar versión Android"}
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
