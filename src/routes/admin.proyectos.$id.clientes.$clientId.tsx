import { createFileRoute } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { useProjectPermissions } from "@/hooks/useProjects";
import Cliente360Section from "@/features/admin/Cliente360Section";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/admin/proyectos/$id/clientes/$clientId")({
  head: () => ({
    meta: [
      { title: "Cliente 360 — VRIXORA Centro de Control" },
      { name: "description", content: "Ficha integral del cliente dentro del proyecto." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Client360Page,
});

function Client360Page() {
  const { id, clientId } = Route.useParams();
  const { data: permissions = [], isLoading } = useProjectPermissions(id);

  if (isLoading) return null;
  if (!permissions.includes("customers.view")) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldX className="h-10 w-10 text-destructive" />
          <div>
            <h2 className="font-semibold">Acceso denegado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tu rol no tiene permiso para consultar clientes.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return <Cliente360Section projectId={id} clientId={clientId} />;
}
