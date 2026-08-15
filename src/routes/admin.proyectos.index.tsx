import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useUserProjects } from "@/hooks/useProjects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Loader2 } from "lucide-react";

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
  const { user } = useSupabaseAuth();
  const { data: projects = [], isLoading, error } = useUserProjects(user?.id ?? null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && !isLoading) {
      navigate({ to: "/admin/login" });
    }
  }, [user, isLoading, navigate]);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
        Error al cargar proyectos: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Proyectos donde eres owner o miembro.
          </p>
        </div>
        <Badge variant="outline">{projects.length} proyecto(s)</Badge>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="glass-panel overflow-hidden group hover:border-primary/50 transition-colors"
            >
              <div
                className="h-1"
                style={{
                  background: `linear-gradient(90deg, oklch(0.78 0.16 ${p.color}), oklch(0.55 0.22 285))`,
                }}
              />
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {p.iconUrl ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 p-1.5">
                        <img
                          src={p.iconUrl}
                          alt=""
                          className="h-full w-full rounded-lg object-contain"
                        />
                      </div>
                    ) : null}
                    <CardTitle className="truncate text-lg">{p.name}</CardTitle>
                  </div>
                  <Badge variant={p.status === "active" ? "default" : "secondary"}>
                    {p.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Badge variant="outline">Datos en vivo</Badge>
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/admin/proyectos/$id" params={{ id: p.id }}>
                    Entrar
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
