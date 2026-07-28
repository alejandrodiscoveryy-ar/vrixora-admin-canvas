import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectMembers } from "@/hooks/useProjects";
import ClientesSection from "@/features/admin/ClientesSection";
import LicenciasSection from "@/features/admin/LicenciasSection";
import PagosSection from "@/features/admin/PagosSection";
import EmpleadosSection from "@/features/admin/EmpleadosSection";
import RendimientoSection from "@/features/admin/RendimientoSection";
import ConfiguracionSection from "@/features/admin/ConfiguracionSection";
import PlanesPreciosSection from "@/features/admin/PlanesPreciosSection";

const OWNER_ONLY = new Set([
  "clientes",
  "licencias",
  "planes",
  "pagos",
  "empleados",
  "rendimiento",
  "configuracion",
]);

export const Route = createFileRoute("/admin/proyectos/$id/$section")({
  component: SectionPage,
});

function SectionPage() {
  const { id, section } = Route.useParams();
  const { user, loading } = useSupabaseAuth();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: members = [], isLoading: membersLoading } = useProjectMembers(id);
  const currentMember = members.find((member) => member.id === user?.id);
  const isOwner = currentMember?.role === "owner";

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/admin/login" });
    else if (!membersLoading && user && !isOwner && OWNER_ONLY.has(section)) {
      navigate({ to: "/admin/proyectos/$id", params: { id } });
    }
  }, [user, loading, section, id, isOwner, membersLoading, navigate]);

  if (loading || projectLoading || membersLoading || !user || !project) return null;

  switch (section) {
    case "clientes":
      return <ClientesSection projectId={id} />;
    case "licencias":
      return <LicenciasSection projectId={id} />;
    case "pagos":
      return <PagosSection projectId={id} />;
    case "planes":
      return <PlanesPreciosSection projectId={id} />;
    case "empleados":
      return <EmpleadosSection projectId={id} />;
    case "rendimiento":
      return <RendimientoSection projectId={id} />;
    case "configuracion":
      return <ConfiguracionSection projectId={id} />;
    default:
      return <div className="text-sm text-muted-foreground">Sección no encontrada.</div>;
  }
}
