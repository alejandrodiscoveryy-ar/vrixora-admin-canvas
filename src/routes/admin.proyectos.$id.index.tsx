import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, KeyRound, TrendingUp, Users, Wallet } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { useProject } from "@/hooks/useProjects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

function ResumenPage() {
  const { id } = Route.useParams();
  const { data: project } = useProject(id);
  const licenses = useQuery({
    queryKey: ["admin-licenses", id],
    queryFn: () => supabaseServices.licenses.list(id),
  });
  const payments = useQuery({
    queryKey: ["project-payments", id],
    queryFn: () => supabaseServices.payments.list(id),
  });
  const history = useQuery({
    queryKey: ["license-audit", id],
    queryFn: () => supabaseServices.licenseAuditLog.list(id),
  });

  const rows = licenses.data ?? [];
  const clients = new Set(rows.map((license) => license.userId)).size;
  const active = rows.filter((license) => license.status === "active").length;
  const expiring = rows.filter((license) => {
    if (!license.expiresAt || license.status !== "active") return false;
    const days = (new Date(license.expiresAt).getTime() - Date.now()) / 86400000;
    return days >= 0 && days < 30;
  }).length;
  const revenue = (payments.data ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const recent = (history.data ?? []).slice(0, 6);

  if (licenses.isError || payments.isError || history.isError) {
    const error = licenses.error ?? payments.error ?? history.error;
    return (
      <Card>
        <CardContent className="py-10 text-center text-destructive">
          No se pudo cargar el resumen: {error?.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Clientes" value={clients} tone="primary" />
        <Kpi icon={KeyRound} label="Licencias activas" value={active} tone="accent" />
        <Kpi icon={Activity} label="Vencen < 30 días" value={expiring} tone="destructive" />
        <Kpi
          icon={Wallet}
          label="Ingresos visibles"
          value={revenue.toLocaleString()}
          tone="primary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="glass-panel lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
            ) : (
              recent.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">{entry.action}</div>
                    <div className="text-xs text-muted-foreground">{entry.detail}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>{entry.actor}</div>
                    <div>{entry.createdAt}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base">Sobre el proyecto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{project?.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Creado</span>
              <span>{project?.createdAt}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estado</span>
              <Badge variant={project?.status === "active" ? "default" : "secondary"}>
                {project?.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  tone: "primary" | "accent" | "destructive";
}) {
  const colors = {
    primary: "text-primary bg-primary/10",
    accent: "text-accent bg-accent/10",
    destructive: "text-destructive bg-destructive/10",
  };
  return (
    <Card className="glass-panel">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
