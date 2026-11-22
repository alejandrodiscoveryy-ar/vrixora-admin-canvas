import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectAccess, useProjectPermissions } from "@/hooks/useProjects";
import { Loader2 } from "lucide-react";
import { AdminOperationalAlerts } from "@/features/admin/AdminOperationalAlerts";

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
  const { data: project, isLoading: projectLoading, isError: projectError, refetch: retryProject } = useProject(id);
  const { data: hasAccess, isLoading: accessLoading, isError: accessError, refetch: retryAccess } = useProjectAccess(user?.id ?? null, id);
  const { data: permissions = [], isLoading: permissionsLoading } = useProjectPermissions(id);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate({ to: "/admin/login" });
    else if (!accessLoading && !accessError && hasAccess === false) {
      // No volver a abrir automáticamente un proyecto sin acceso.
      // El selector de recuperación sigue disponible aunque exista solo uno.
      void navigate({
        to: "/admin/proyectos",
        search: { seleccionar: "1" },
        replace: true,
      });
    }
  }, [user, hasAccess, accessLoading, accessError, navigate]);

  if (projectError || accessError) {
    return (
      <div role="alert" className="mx-auto max-w-lg space-y-3 rounded-xl border border-border/70 bg-card p-4">
        <p className="text-sm font-semibold text-foreground">No se pudo comprobar el acceso al proyecto.</p>
        <p className="text-xs text-muted-foreground">Comprueba la conexión y vuelve a intentar. La sesión no se ha eliminado.</p>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
          onClick={() => { void retryProject(); void retryAccess(); }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!user || projectLoading || accessLoading || permissionsLoading || !project || !hasAccess) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {permissions.includes("marketplace.view") && (
        <AdminOperationalAlerts projectId={id} userId={user.id} />
      )}
      <Outlet />
    </div>
  );
}
