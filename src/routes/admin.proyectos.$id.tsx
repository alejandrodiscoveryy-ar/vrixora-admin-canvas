import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectAccess } from "@/hooks/useProjects";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const OWNER_ONLY = new Set([
  "clientes",
  "licencias",
  "planes",
  "pagos",
  "empleados",
  "rendimiento",
  "configuracion",
]);

const TABS = [
  { slug: "", label: "Resumen" },
  { slug: "clientes", label: "Clientes" },
  { slug: "licencias", label: "Licencias" },
  { slug: "planes", label: "Planes y precios" },
  { slug: "pagos", label: "Pagos" },
  { slug: "empleados", label: "Empleados" },
  { slug: "rendimiento", label: "Rendimiento" },
  { slug: "configuracion", label: "Configuración" },
];

export const Route = createFileRoute("/admin/proyectos/$id")({
  head: ({ params }) => {
    const title = `Proyecto — Vrixora Admin`;
    return {
      meta: [
        { title },
        { name: "description", content: "Gestión del proyecto." },
        { property: "og:title", content: title },
        { property: "og:description", content: "Gestión del proyecto." },
        { name: "robots", content: "noindex,nofollow" },
      ],
    };
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  const { id } = Route.useParams();
  const { user } = useSupabaseAuth();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: hasAccess, isLoading: accessLoading } = useProjectAccess(user?.id ?? null, id);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user) {
      navigate({ to: "/admin/login" });
    } else if (!accessLoading && !hasAccess) {
      navigate({ to: "/admin/proyectos" });
    }
  }, [user, hasAccess, accessLoading, navigate]);

  if (!user || projectLoading || accessLoading || !project || !hasAccess) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const basePath = `/admin/proyectos/${project.id}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link to="/admin/proyectos" className="hover:text-foreground">
              Proyectos
            </Link>
            <span className="mx-1">/</span>
            {project.name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{project.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={project.status === "active" ? "default" : "secondary"}>
            {project.status}
          </Badge>
        </div>
      </div>

      <Card className="glass-panel p-1 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const to = t.slug ? `${basePath}/${t.slug}` : basePath;
          const active = t.slug
            ? path.startsWith(to)
            : path === basePath || path === `${basePath}/`;
          return (
            <Link
              key={t.slug || "resumen"}
              to={t.slug ? "/admin/proyectos/$id/$section" : "/admin/proyectos/$id"}
              params={t.slug ? { id: project.id, section: t.slug } : { id: project.id }}
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </Card>

      <Outlet />
    </div>
  );
}
