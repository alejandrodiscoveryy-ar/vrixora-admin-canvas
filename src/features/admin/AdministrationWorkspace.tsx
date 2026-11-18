import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { ADMINISTRATION_VIEWS, adminSubnavTone } from "@/lib/admin-navigation";
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
      {/* La navegación principal del proyecto ya contiene estos cuatro destinos; no duplicarla. */}
          {selectedMeta && activeSection !== "configuracion" ? (
            <header data-nav-tone={adminSubnavTone("administracion", activeSection)} className="relative isolate overflow-hidden rounded-[20px] border border-cyan-400/15 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/75 px-4 py-3 text-slate-50 shadow-[0_18px_42px_-35px_rgba(14,165,233,0.45)] sm:px-5 admin-graphite-header">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_90%_10%,rgba(34,211,238,0.10),transparent_55%)]" />
              <SelectedIcon aria-hidden="true" className="pointer-events-none absolute -right-5 -top-8 z-0 h-32 w-32 rotate-[-15deg] admin-nav-watermark opacity-[0.07] sm:right-4" />
              <div className="relative z-10 flex items-center gap-3">
                <span className="admin-workspace-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
                  <SelectedIcon aria-hidden="true" className="h-[19px] w-[19px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-200/85">{selectedMeta.number} / {selectedMeta.eyebrow}</p>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <h2 className="text-lg font-semibold tracking-tight text-white">{selected?.label}</h2>
                    <p className="text-xs leading-relaxed text-slate-300">{selectedMeta.description}</p>
                  </div>
                </div>
              </div>
            </header>
          ) : null}

      {children}
    </section>
  );
}