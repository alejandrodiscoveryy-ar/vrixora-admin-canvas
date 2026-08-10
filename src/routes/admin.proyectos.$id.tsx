import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectAccess, useProjectPermissions } from "@/hooks/useProjects";
import { Loader2 } from "lucide-react";

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

  return (
    <div className="space-y-4 md:space-y-6">
      <Outlet />
    </div>
  );
}
