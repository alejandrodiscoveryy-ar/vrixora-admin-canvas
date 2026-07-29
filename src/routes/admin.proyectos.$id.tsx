import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectAccess } from "@/hooks/useProjects";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  BarChart3,
  CreditCard,
  FileKey2,
  Gauge,
  Loader2,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

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
  { slug: "", label: "Resumen", icon: Gauge },
  { slug: "clientes", label: "Clientes", icon: Users },
  { slug: "licencias", label: "Licencias", icon: FileKey2 },
  { slug: "planes", label: "Planes y precios", icon: Tags },
  { slug: "pagos", label: "Pagos", icon: CreditCard },
  { slug: "empleados", label: "Empleados", icon: ShieldCheck },
  { slug: "rendimiento", label: "Rendimiento", icon: BarChart3 },
  { slug: "configuracion", label: "Configuración", icon: Settings2 },
] satisfies Array<{ slug: string; label: string; icon: LucideIcon }>;

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
    <div className="space-y-7">
      <div className="flex items-end justify-between flex-wrap gap-4">
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
        <div className="flex items-center gap-2">
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
      </div>

      <Card className="glass-panel flex gap-1 overflow-x-auto rounded-2xl p-1.5 shadow-[0_16px_60px_-42px_rgba(0,229,255,0.55)]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const to = t.slug ? `${basePath}/${t.slug}` : basePath;
          const active = t.slug
            ? path.startsWith(to)
            : path === basePath || path === `${basePath}/`;
          return (
            <Link
              key={t.slug || "resumen"}
              to={t.slug ? "/admin/proyectos/$id/$section" : "/admin/proyectos/$id"}
              params={t.slug ? { id: project.id, section: t.slug } : { id: project.id }}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all ${
                active
                  ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)]"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          );
        })}
      </Card>

      <Outlet />
    </div>
  );
}
