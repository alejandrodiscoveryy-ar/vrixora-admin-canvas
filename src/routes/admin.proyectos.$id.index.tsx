import { createFileRoute } from "@tanstack/react-router";
import { useDemoAuth } from "@/lib/demo-auth";
import { CLIENTS, LICENSES, PROJECTS } from "@/lib/mock-data";
import { useDemoStore } from "@/lib/demo-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, KeyRound, TrendingUp, Users, Wallet } from "lucide-react";

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

function ResumenPage() {
  const { id } = Route.useParams();
  const { user } = useDemoAuth();
  const { payments, licenses, history } = useDemoStore();
  const project = PROJECTS.find((p) => p.id === id);
  if (!user || !project) return null;

  const clients = CLIENTS.filter((c) => c.projectId === id);
  const projLicenses = licenses.filter((l) => l.projectId === id);
  const activeLicenses = projLicenses.filter((l) => l.status === "active").length;
  const expiringSoon = projLicenses.filter((l) => {
    const days = Math.round((new Date(l.expiresAt).getTime() - Date.now()) / 86400000);
    return days > 0 && days < 30;
  }).length;
  const revenue = payments
    .filter((p) => p.projectId === id && (user.role === "owner" || p.employeeId === user.id))
    .reduce((s, p) => s + p.amount, 0);

  const projHistory = history.filter((h) => h.projectId === id).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Clientes" value={clients.length} tone="primary" />
        <Kpi icon={KeyRound} label="Licencias activas" value={activeLicenses} tone="accent" />
        <Kpi icon={Activity} label="Vencen < 30 días" value={expiringSoon} tone="destructive" />
        {user.role === "owner" ? (
          <Kpi icon={Wallet} label="Ingresos" value={`${revenue.toLocaleString()} €`} tone="primary" />
        ) : (
          <Kpi icon={Wallet} label="Tus cobros" value={`${revenue.toLocaleString()} €`} tone="accent" />
        )}
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
            {projHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
            ) : (
              projHistory.map((h) => (
                <div key={h.id} className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{h.action}</div>
                    <div className="text-xs text-muted-foreground">{h.detail}</div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <div>{h.actor}</div>
                    <div>{h.createdAt}</div>
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
            <p className="text-muted-foreground">{project.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Creado</span>
              <span>{project.createdAt}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estado</span>
              <Badge variant={project.status === "active" ? "default" : "secondary"}>
                {project.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string | number; tone: "primary" | "accent" | "destructive" }) {
  const toneMap = {
    primary: "text-primary bg-primary/10",
    accent: "text-accent bg-accent/10",
    destructive: "text-destructive bg-destructive/10",
  };
  return (
    <Card className="glass-panel">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold mt-0.5">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
