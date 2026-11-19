import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";

import { ADMINISTRATION_VIEWS } from "@/lib/admin-navigation";
import type { ProjectPermission } from "@/lib/services";

const SECTION_META: Record<string, { number: string; subtitle: string; eyebrow: string; description: string }> = {
  configuracion: {
    number: "01",
    subtitle: "Identidad, moneda, referidos y aplicación",
    eyebrow: "CONTROL DEL PROYECTO",
    description: "Gestiona la identidad del proyecto, sus parámetros generales y la configuración de la aplicación.",
  },
  empleados: {
    number: "02",
    subtitle: "Equipo, responsabilidades y accesos",
    eyebrow: "PERSONAS Y PERMISOS",
    description: "Administra los miembros del equipo y sus funciones, sin alterar las reglas de acceso existentes.",
  },
  comunicados: {
    number: "03",
    subtitle: "Mensajes y avisos para dispositivos",
    eyebrow: "COMUNICACIÓN OFICIAL",
    description: "Prepara comunicados y avisos de actualización para los destinatarios autorizados.",
  },
  integraciones: {
    number: "04",
    subtitle: "Servicios externos y conexiones",
    eyebrow: "SERVICIOS CONECTADOS",
    description: "Consulta y administra los servicios integrados con el proyecto.",
  },
};

export default function AdministrationWorkspace({
  activeSection,
  children,
}: {
  projectId: string;
  activeSection: string;
  permissions: readonly ProjectPermission[];
  children: ReactNode;
}) {
  const selected = ADMINISTRATION_VIEWS.find((section) => section.slug === activeSection);
  const selectedMeta = SECTION_META[activeSection];
  const SelectedIcon = selected?.icon ?? ShieldCheck;

  return (
    <section data-nav-tone="administracion" aria-label="Configuración del proyecto TukTuk" className="min-w-0 space-y-3">
      {/* El sidebar ya contiene los cuatro destinos: una cabecera oficial por pantalla. */}
      {selectedMeta && activeSection !== "configuracion" ? (
        <ModuleHeader
          density="compact"
          appearance="premium"
          module="configuracion"
          title={selected?.label ?? "Configuración"}
          description={selectedMeta.description}
          icon={SelectedIcon}
        />
      ) : null}

      {children}
    </section>
  );
}