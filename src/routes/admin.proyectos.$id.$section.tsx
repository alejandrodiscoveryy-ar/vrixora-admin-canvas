import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDemoAuth } from "@/lib/demo-auth";
import { PROJECTS } from "@/lib/mock-data";
import ClientesSection from "@/features/admin/ClientesSection";
import LicenciasSection from "@/features/admin/LicenciasSection";
import PagosSection from "@/features/admin/PagosSection";
import EmpleadosSection from "@/features/admin/EmpleadosSection";
import RendimientoSection from "@/features/admin/RendimientoSection";
import ConfiguracionSection from "@/features/admin/ConfiguracionSection";

const OWNER_ONLY = new Set(["empleados", "rendimiento", "configuracion"]);

export const Route = createFileRoute("/admin/proyectos/$id/$section")({
  component: SectionPage,
});

function SectionPage() {
  const { id, section } = Route.useParams();
  const { user } = useDemoAuth();
  const navigate = useNavigate();
  const project = PROJECTS.find((p) => p.id === id);

  useEffect(() => {
    if (!user) navigate({ to: "/admin/login" });
    else if (user.role !== "owner" && OWNER_ONLY.has(section)) {
      navigate({ to: "/admin/proyectos/$id", params: { id } });
    }
  }, [user, section, id, navigate]);

  if (!user || !project) return null;

  switch (section) {
    case "clientes":
      return <ClientesSection projectId={id} />;
    case "licencias":
      return <LicenciasSection projectId={id} />;
    case "pagos":
      return <PagosSection projectId={id} />;
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
