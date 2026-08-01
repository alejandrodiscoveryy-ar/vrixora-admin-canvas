import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import type { ProjectPermission } from "@/lib/services";
import ClientesSection from "@/features/admin/ClientesSection";
import LicenciasSection from "@/features/admin/LicenciasSection";
import PagosSection from "@/features/admin/PagosSection";
import EmpleadosSection from "@/features/admin/EmpleadosSection";
import RendimientoSection from "@/features/admin/RendimientoSection";
import ConfiguracionSection from "@/features/admin/ConfiguracionSection";
import PlanesPreciosSection from "@/features/admin/PlanesPreciosSection";
import AuditoriaSection from "@/features/admin/AuditoriaSection";

const SECTION_PERMISSION: Record<string, ProjectPermission> = {
  clientes: "customers.view",
  licencias: "licenses.view",
  planes: "plans.view",
  pagos: "payments.view",
  empleados: "members.view",
  rendimiento: "analytics.view",
  configuracion: "settings.view",
  auditoria: "audit.view",
};

export const Route = createFileRoute("/admin/proyectos/$id/$section")({
  component: SectionPage,
});

function SectionPage() {
  const { id, section } = Route.useParams();
  const { user, loading } = useSupabaseAuth();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: permissions = [], isLoading: permissionsLoading } = useProjectPermissions(id);
  const requiredPermission = SECTION_PERMISSION[section];

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/admin/login" });
    else if (
      !permissionsLoading
      && user
      && requiredPermission
      && !permissions.includes(requiredPermission)
    ) {
      navigate({ to: "/admin/proyectos/$id", params: { id } });
    }
  }, [user, loading, id, requiredPermission, permissions, permissionsLoading, navigate]);

  if (loading || projectLoading || permissionsLoading || !user || !project) return null;

  switch (section) {
    case "clientes": return <ClientesSection projectId={id} />;
    case "licencias": return <LicenciasSection projectId={id} />;
    case "pagos": return <PagosSection projectId={id} />;
    case "planes": return <PlanesPreciosSection projectId={id} />;
    case "empleados": return <EmpleadosSection projectId={id} />;
    case "rendimiento": return <RendimientoSection projectId={id} />;
    case "configuracion": return <ConfiguracionSection projectId={id} />;
    case "auditoria": return <AuditoriaSection projectId={id} />;
    default: return <div className="text-sm text-muted-foreground">Sección no encontrada.</div>;
  }
}
