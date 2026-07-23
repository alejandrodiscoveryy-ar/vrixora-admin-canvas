import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDemoAuth } from "@/lib/demo-auth";
import { PROJECTS, canSeeProject } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const OWNER_ONLY = new Set(["empleados", "rendimiento", "configuracion"]);

const TABS = [
  { slug: "", label: "Resumen" },
  { slug: "clientes", label: "Clientes" },
  { slug: "licencias", label: "Licencias" },
  { slug: "pagos", label: "Pagos" },
  { slug: "empleados", label: "Empleados" },
  { slug: "rendimiento", label: "Rendimiento" },
  { slug: "configuracion", label: "Configuración" },
];

export const Route = createFileRoute("/admin/proyectos/$id")({
  head: ({ params }) => {
    const p = PROJECTS.find((pr) => pr.id === params.id);
    const title = p ? `${p.name} — Vrixora Admin` : "Proyecto — Vrixora Admin";
    return {
      meta: [
        { title },
        { name: "description", content: p?.description ?? "Gestión del proyecto." },
        { property: "og:title", content: title },
        { property: "og:description", content: p?.description ?? "Gestión del proyecto." },
        { name: "robots", content: "noindex,nofollow" },
      ],
    };
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  const { id } = Route.useParams();
  const { user } = useDemoAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const project = PROJECTS.find((p) => p.id === id);

  useEffect(() => {
    if (!user) navigate({ to: "/admin/login" });
    else if (project && !canSeeProject(user, project.id)) navigate({ to: "/admin/proyectos" });
  }, [user, project, navigate]);

  if (!user || !project) return null;
  const tabs = TABS.filter((t) => (user.role === "owner" ? true : !OWNER_ONLY.has(t.slug)));
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
          <Badge variant={project.status === "active" ? "default" : "secondary"}>{project.status}</Badge>
          <Badge variant="outline">Demostración</Badge>
        </div>
      </div>

      <Card className="glass-panel p-1 flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
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
