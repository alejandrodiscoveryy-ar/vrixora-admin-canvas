import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDemoAuth } from "@/lib/demo-auth";
import { CLIENTS, LICENSES, PAYMENTS, visibleProjects } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, KeyRound, Wallet } from "lucide-react";

export const Route = createFileRoute("/admin/proyectos/")({
  head: () => ({
    meta: [
      { title: "Proyectos — Vrixora Admin" },
      { name: "description", content: "Listado de proyectos gestionados en Vrixora." },
      { property: "og:title", content: "Proyectos — Vrixora Admin" },
      { property: "og:description", content: "Selecciona un proyecto para gestionarlo." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProjectsList,
});

function ProjectsList() {
  const { user } = useDemoAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate({ to: "/admin/login" });
  }, [user, navigate]);

  if (!user) return null;
  const projects = visibleProjects(user);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user.role === "owner"
              ? "Vista global de todos los proyectos de Vrixora."
              : "Proyectos que tienes asignados."}
          </p>
        </div>
        <Badge variant="outline">{projects.length} proyecto(s)</Badge>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const clients = CLIENTS.filter((c) => c.projectId === p.id).length;
            const licenses = LICENSES.filter((l) => l.projectId === p.id).length;
            const revenue = PAYMENTS.filter((py) => py.projectId === p.id).reduce(
              (s, py) => s + py.amount,
              0,
            );
            return (
              <Card key={p.id} className="glass-panel overflow-hidden group hover:border-primary/50 transition-colors">
                <div
                  className="h-1"
                  style={{ background: `linear-gradient(90deg, oklch(0.78 0.16 ${p.color}), oklch(0.55 0.22 285))` }}
                />
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat icon={Users} label="Clientes" value={clients} />
                    <Stat icon={KeyRound} label="Licencias" value={licenses} />
                    {user.role === "owner" ? (
                      <Stat icon={Wallet} label="Ingresos" value={`${revenue}€`} />
                    ) : (
                      <Stat icon={Wallet} label="—" value="privado" />
                    )}
                  </div>
                  <Button asChild variant="secondary" className="w-full">
                    <Link to="/admin/proyectos/$id" params={{ id: p.id }}>
                      Entrar
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <Icon className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
      <div className="text-sm font-semibold mt-1">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="glass-panel p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Users className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">Sin proyectos asignados</h3>
      <p className="text-sm text-muted-foreground mt-2">
        Pide a un owner que te asigne un proyecto para empezar.
      </p>
    </Card>
  );
}
