import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectAccess, useProjectPermissions } from "@/hooks/useProjects";
import type { ProjectPermission } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  BarChart3,
  CreditCard,
  FileKey2,
  Gauge,
  Loader2,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

const TABS = [
  { slug: "", label: "Resumen", icon: Gauge, permission: "project.view" },
  { slug: "clientes", label: "Clientes", icon: Users, permission: "customers.view" },
  { slug: "licencias", label: "Licencias", icon: FileKey2, permission: "licenses.view" },
  { slug: "planes", label: "Planes y precios", icon: Tags, permission: "plans.view" },
  { slug: "pagos", label: "Pagos", icon: CreditCard, permission: "payments.view" },
  { slug: "empleados", label: "Empleados", icon: ShieldCheck, permission: "members.view" },
  { slug: "rendimiento", label: "Rendimiento", icon: BarChart3, permission: "analytics.view" },
  { slug: "configuracion", label: "Configuración", icon: Settings2, permission: "settings.view" },
  { slug: "auditoria", label: "Auditoría", icon: ScrollText, permission: "audit.view" },
] satisfies Array<{ slug: string; label: string; icon: LucideIcon; permission: ProjectPermission }>;

export const Route = createFileRoute("/admin/proyectos/$id")({
  head: () => ({
    meta: [
      { title: "Proyecto — Vrixora Admin" },
      { name: "description", content: "Gestión del proyecto." },
      { property: "og:title", content: "Proyecto — Vrixora Admin" },
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
            <Link to="/admin/proyectos" className="hover:text-foreground">Proyectos</Link>
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
          className={project.status === "active"
            ? "border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-300"
            : "px-3 py-1"}
        >
          <span className={`mr-2 h-1.5 w-1.5 rounded-full ${
            project.status === "active" ? "bg-emerald-400" : "bg-muted-foreground"
          }`} />
          {project.status === "active" ? "Proyecto activo" : project.status}
        </Badge>
      </div>

      <Card className="glass-panel grid grid-cols-2 gap-1 rounded-2xl p-1.5 shadow-[0_16px_60px_-42px_rgba(0,229,255,0.55)] sm:grid-cols-3 md:flex md:overflow-x-auto">
        {TABS.filter((tab) => permissions.includes(tab.permission)).map((tab) => {
          const Icon = tab.icon;
          const to = tab.slug ? `${basePath}/${tab.slug}` : basePath;
          const active = tab.slug ? path.startsWith(to) : path === basePath || path === `${basePath}/`;
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
      <Outlet />
    </div>
  );
}
