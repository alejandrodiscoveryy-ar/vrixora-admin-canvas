import type { ReactNode } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

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
  projectId,
  activeSection,
  permissions,
  children,
}: {
  projectId: string;
  activeSection: string;
  permissions: readonly ProjectPermission[];
  children: ReactNode;
}) {
  const visibleSections = ADMINISTRATION_VIEWS.filter((section) =>
    permissions.includes(section.permission),
  );
  const selected = ADMINISTRATION_VIEWS.find((section) => section.slug === activeSection);
  const selectedMeta = SECTION_META[activeSection];
  const SelectedIcon = selected?.icon ?? ShieldCheck;

  return (
    <section aria-label="Administración de TukTuk" className="min-w-0 space-y-3">
      <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[252px_minmax(0,1fr)]">
        <nav
          aria-label="Secciones de administración de TukTuk"
          className="relative isolate overflow-hidden rounded-[22px] border border-border/70 bg-gradient-to-br from-card/95 via-card/90 to-cyan-950/[0.09] p-2.5 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.8)] xl:sticky xl:top-4"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 z-0 h-52 w-52 rounded-full bg-cyan-400/[0.045] blur-3xl" />
          <div className="relative z-10 px-2.5 pb-2 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400/85">Administración</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Áreas de gestión de TukTuk</p>
          </div>

          <div className="relative z-10 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {visibleSections.map((section) => {
              const Icon = section.icon;
              const meta = SECTION_META[section.slug];
              const isSelected = section.slug === activeSection;

              return (
                <Link
                  key={section.slug}
                  to="/admin/proyectos/$id/$section"
                  params={{ id: projectId, section: section.slug }}
                  aria-current={isSelected ? "page" : undefined}
                  className={`group relative isolate flex min-w-0 items-center gap-2.5 overflow-hidden rounded-[16px] border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${isSelected ? "border-cyan-400/35 bg-gradient-to-r from-cyan-400/[0.11] via-cyan-400/[0.045] to-background/20 text-foreground shadow-[0_12px_30px_-24px_rgba(34,211,238,0.45)]" : "border-transparent bg-background/20 text-foreground/85 hover:border-border/65 hover:bg-muted/40"}`}
                >
                  <Icon aria-hidden="true" className={`pointer-events-none absolute -right-4 -top-5 z-0 h-28 w-28 rotate-[-14deg] ${isSelected ? "text-cyan-300 opacity-[0.075]" : "text-muted-foreground opacity-[0.045]"}`} />
                  <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-inner ${isSelected ? "border-cyan-400/30 bg-cyan-400/[0.11] text-cyan-300" : "border-border/60 bg-background/60 text-muted-foreground"}`}>
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">{meta.number}</span>
                    <span className="mt-0.5 block text-sm font-semibold leading-tight text-foreground">{section.label}</span>
                    <span className="mt-1 hidden text-[11px] leading-snug text-muted-foreground xl:block">{meta.subtitle}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={`relative z-10 hidden h-4 w-4 shrink-0 xl:block ${isSelected ? "text-cyan-300" : "text-muted-foreground/45"}`} />
                </Link>
              );
            })}
          </div>

          <div className="relative z-10 mt-2 flex items-center gap-1.5 border-t border-border/50 px-2.5 pt-2.5 text-[10px] text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-cyan-400" />
            Acceso según permisos
          </div>
        </nav>

        <div className="min-w-0 space-y-3">
          {selectedMeta ? (
            <header className="relative isolate overflow-hidden rounded-[20px] border border-cyan-400/15 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/75 px-4 py-3 text-slate-50 shadow-[0_18px_42px_-35px_rgba(14,165,233,0.45)] sm:px-5">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_90%_10%,rgba(34,211,238,0.10),transparent_55%)]" />
              <SelectedIcon aria-hidden="true" className="pointer-events-none absolute -right-5 -top-8 z-0 h-32 w-32 rotate-[-15deg] text-cyan-100 opacity-[0.07] sm:right-4" />
              <div className="relative z-10 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
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
        </div>
      </div>
    </section>
  );
}