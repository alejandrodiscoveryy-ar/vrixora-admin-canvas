import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/hooks/useProjects";
import { supabaseServices } from "@/lib/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracionSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: project } = useProject(projectId);
  const { data: settings, isLoading } = useQuery({
    queryKey: ["project-settings", projectId],
    queryFn: () => supabaseServices.projects.settings(projectId),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notify, setNotify] = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);

  useEffect(() => {
    if (!project || !settings) return;
    setName(project.name);
    setDescription(project.description);
    setNotify(settings.notifyLicenseExpiry);
    setAutoRenew(settings.autoRenewVerifiedPayments);
  }, [project, settings]);

  const save = useMutation({
    mutationFn: () =>
      supabaseServices.projects.update(projectId, {
        name: name.trim(),
        description: description.trim(),
        notifyLicenseExpiry: notify,
        autoRenewVerifiedPayments: autoRenew,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-settings", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["user-projects"] }),
      ]);
      toast.success("Configuración guardada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !project || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4 text-primary" />
          Configuración del proyecto
        </CardTitle>
        <CardDescription>Los cambios se guardan directamente en Supabase.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="desc">Descripción</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Notificaciones de vencimiento</div>
            <div className="text-xs text-muted-foreground">
              Avisar antes del vencimiento de una licencia.
            </div>
          </div>
          <Switch checked={notify} onCheckedChange={setNotify} />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Renovación automática</div>
            <div className="text-xs text-muted-foreground">
              Renovar cuando exista un pago verificado.
            </div>
          </div>
          <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
        </div>
        <div className="flex justify-end">
          <Button disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
