import { useState } from "react";
import { PROJECTS } from "@/lib/mock-data";
import { resetDemoStore } from "@/lib/demo-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Settings, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracionSection({ projectId }: { projectId: string }) {
  const project = PROJECTS.find((p) => p.id === projectId);
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [notify, setNotify] = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);

  if (!project) return null;

  return (
    <div className="space-y-6">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-primary" />
            Configuración del proyecto
          </CardTitle>
          <CardDescription>
            Cambios locales al prototipo — no se persistirán en producción.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="desc">Descripción</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">Notificaciones de vencimiento</div>
              <div className="text-xs text-muted-foreground">Aviso 15 días antes.</div>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">Renovación automática</div>
              <div className="text-xs text-muted-foreground">Renovar al recibir pago verificado.</div>
            </div>
            <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost">Cancelar</Button>
            <Button onClick={() => toast.success("Configuración guardada (demo)")}>Guardar</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona de demostración</CardTitle>
          <CardDescription>Reinicia los datos simulados a su estado original.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Badge variant="outline">Solo prototipo</Badge>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reiniciar datos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reiniciar datos de demostración</AlertDialogTitle>
                <AlertDialogDescription>
                  Se descartarán todas las activaciones y pagos añadidos durante la sesión.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    resetDemoStore();
                    toast.success("Datos reiniciados");
                  }}
                >
                  Reiniciar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
