import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectAccess, useProjectPermissions } from "@/hooks/useProjects";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { ADMIN_PROJECT_TABS } from "@/lib/admin-navigation";

export const Route = createFileRoute("/admin/proyectos/$id")({
  head: () => ({
    meta: [
      { title: "Proyecto — VRIXORA Centro de Control" },
      { name: "description", content: "Gestión del proyecto." },
      { property: "og:title", content: "Proyecto — VRIXORA Centro de Control" },
      { property: "og:description", content: "Gestión del proyecto." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProjectLayout,
});

function ProjectLayout() {
  const { id } = Route.useParams();
  const { user } = useSupabaseAuth();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: hasAccess, isLoading: accessLoading } = useProjectAccess(user?.id ?? null, id);
  const { data: permissions = [], isLoading: permissionsLoading } = useProjectPermissions(id);
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (!user) navigate({ to: "/admin/login" });
    else if (!accessLoading && !hasAccess) navigate({ to: "/admin/proyectos" });
  }, [user, hasAccess, accessLoading, navigate]);

  if (!user || projectLoading || accessLoading || permissionsLoading || !project || !hasAccess) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const basePath = `/admin/proyectos/${project.id}`;
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Link to="/admin/proyectos" className="hover:text-foreground">
              Proyectos
            </Link>
            <span className="text-border">/</span>
            {project.name}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Gestiona clientes, licencias, pagos y operaciones desde un único espacio.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            project.status === "active"
              ? "border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-300"
              : "px-3 py-1"
          }
        >
          <span
            className={`mr-2 h-1.5 w-1.5 rounded-full ${
              project.status === "active" ? "bg-emerald-400" : "bg-muted-foreground"
            }`}
          />
          {project.status === "active" ? "Proyecto activo" : project.status}
        </Badge>
      </div>

      <Card className="glass-panel hidden grid-cols-2 gap-1 rounded-2xl p-1.5 shadow-[0_16px_60px_-42px_rgba(0,229,255,0.55)] sm:grid-cols-3 md:flex md:overflow-x-auto">
        {ADMIN_PROJECT_TABS.filter((tab) => permissions.includes(tab.permission)).map((tab) => {
          const Icon = tab.icon;
          const to = tab.slug ? `${basePath}/${tab.slug}` : basePath;
          const active = tab.slug
            ? path.startsWith(to)
            : path === basePath || path === `${basePath}/`;
          return (
            <Link
              key={tab.slug || "resumen"}
              to={tab.slug ? "/admin/proyectos/$id/$section" : "/admin/proyectos/$id"}
              params={tab.slug ? { id: project.id, section: tab.slug } : { id: project.id }}
              className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-2 py-2 text-center text-xs font-medium transition-all sm:text-sm md:justify-start md:whitespace-nowrap md:px-3 ${
                active
                  ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)]"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </Card>
      <div className="grid gap-2 md:hidden">
        {ADMIN_PROJECT_TABS.filter((tab) => permissions.includes(tab.permission)).map((tab) => {
          const Icon = tab.icon;
          const to = tab.slug ? `${basePath}/${tab.slug}` : basePath;
          const active = tab.slug
            ? path.startsWith(to)
            : path === basePath || path === `${basePath}/`;
          return (
            <Link
              key={tab.slug || "resumen"}
              to={tab.slug ? "/admin/proyectos/$id/$section" : "/admin/proyectos/$id"}
              params={tab.slug ? { id: project.id, section: tab.slug } : { id: project.id }}
              className={`flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-border/60 bg-card/70 text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
