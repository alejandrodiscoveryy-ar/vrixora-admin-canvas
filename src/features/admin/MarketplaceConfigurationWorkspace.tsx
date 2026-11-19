import { adminSubnavTone } from "@/lib/admin-navigation";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { premiumColumnHeaderSurface } from "@/components/admin/density";
import { premiumSurface } from "@/components/admin/density";
import { useState } from "react";
import { BellRing, CalendarX2, FlaskConical, Globe2, Radar } from "lucide-react";

import MarketplaceTerritoryCatalog from "@/features/admin/MarketplaceTerritoryCatalog";
import MarketplaceDispatchSettingsCard from "@/features/admin/MarketplaceDispatchSettingsCard";
import MarketplaceJobReminderSettingsCard from "@/features/admin/MarketplaceJobReminderSettingsCard";
import MarketplaceTestCenterV2 from "@/features/admin/MarketplaceTestCenterV2";
import MarketplaceCancellationPolicyCard from "@/features/admin/MarketplaceCancellationPolicyCard";

const SECTIONS = [
  {
    id: "pruebas",
    number: "01",
    title: "Centro de pruebas",
    subtitle: "Simulación de carreras y rutas",
    eyebrow: "VERIFICACIÓN CONTROLADA",
    description: "Comprueba rutas, conductores y solicitudes de prueba sin alterar la operación habitual.",
    icon: FlaskConical,
  },
  {
    id: "operacion",
    number: "02",
    title: "Radar",
    subtitle: "Asignación, búsqueda y recordatorios",
    eyebrow: "DESPACHO Y AVISOS",
    description: "Define el alcance de las solicitudes, la prioridad de conductores y los avisos de carreras.",
    icon: Radar,
  },
  {
    id: "territorio",
    number: "03",
    title: "Provincia",
    subtitle: "Cobertura y catálogo de lugares",
    eyebrow: "DATOS TERRITORIALES",
    description: "Actualiza La Habana, prepara otras provincias y consulta el historial de las importaciones.",
    icon: Globe2,
  },
  {
    id: "cancelaciones",
    number: "04",
    title: "Cancelaciones",
    subtitle: "Políticas de servicio",
    eyebrow: "CONFIANZA Y CONTINUIDAD",
    description: "Controla la espera, los reemplazos y la supervisión de cancelaciones.",
    icon: CalendarX2,
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function MarketplaceConfigurationWorkspace({
  projectId,
  canManageSettings,
  canManageMarketplace,
  canManagePayments,
  canManageTerritory,
  onOpenJob,
}: {
  projectId: string;
  canManageSettings: boolean;
  canManageMarketplace: boolean;
  canManagePayments: boolean;
  canManageTerritory: boolean;
  onOpenJob: (jobId: string) => void;
}) {
  const [active, setActive] = useState<SectionId>("pruebas");
  const selected = SECTIONS.find((section) => section.id === active) ?? SECTIONS[0];
  const SelectedIcon = selected.icon;

  return (
    <section data-admin-module="configuracion" aria-label="Configuración de TukTuk" className="min-w-0 space-y-3">
      <div className="min-w-0 space-y-3">
        <nav data-nav-tone="administracion"
          aria-label="Secciones de configuración de TukTuk"
          className={`min-w-0 rounded-[var(--radius-card)] border p-2 shadow-[var(--shadow-xs)] ${premiumColumnHeaderSurface}`}
        >

          <div className="relative z-10 hidden px-2.5 pb-2 pt-2 sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">Configuración</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Áreas de control de TukTuk</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isSelected = section.id === active;
              return (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => setActive(section.id)}
                  aria-pressed={isSelected}
                  data-nav-tone={adminSubnavTone("configuracion", section.id)}
                  aria-controls="tuktuk-config-detail"
                  className={"flex min-h-11 min-w-0 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
                    (isSelected ? "border-[var(--module-border)] bg-[var(--module-surface)] text-text-primary shadow-[inset_0_-2px_var(--module-accent)]" :
                      "border-transparent bg-transparent text-text-secondary hover:border-border-default hover:bg-surface-3/70 hover:text-text-primary")}
                >

                  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-accent)]" aria-hidden="true">
                    <Icon aria-hidden="true" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{section.number}</span>
                    <span className="block text-xs font-semibold leading-snug text-text-primary sm:text-sm">{section.title}</span>
                    <span className="sr-only">{section.subtitle}</span>
                  </span>

                </button>
              );
            })}
          </div>

        </nav>

        <div id="tuktuk-config-detail" className="min-w-0 space-y-3">
          {active !== "pruebas" ? (
            <ModuleHeader
              module="configuracion"
              density="compact"
              appearance="premium"
              title={selected.title}
              description={selected.description}
              icon={SelectedIcon}
            />
          ) : null}

          {active === "pruebas" ? (
            <MarketplaceTestCenterV2
              projectId={projectId}
              canManage={canManageSettings && canManageMarketplace}
              canManagePayments={canManagePayments}
              onOpenJob={onOpenJob}
            />
          ) : null}

          {active === "operacion" ? (
            <div className="grid min-w-0 gap-3.5 xl:grid-cols-2" aria-label="Radar: despacho y avisos">
              <MarketplaceDispatchSettingsCard projectId={projectId} canManage={canManageSettings} />
              <MarketplaceJobReminderSettingsCard projectId={projectId} canManage={canManageSettings} />
              <div className={`flex min-w-0 items-center gap-2 rounded-[var(--radius-compact)] border px-3 py-2.5 text-xs text-text-secondary xl:col-span-2 ${premiumSurface}`}>
                <BellRing aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-400" />
                <span>Los permisos y validaciones de despacho y avisos se mantienen.</span>
              </div>
            </div>
          ) : null}

          {active === "cancelaciones" ? (
            <MarketplaceCancellationPolicyCard projectId={projectId} canManage={canManageSettings && canManageMarketplace} />
          ) : null}

          {active === "territorio" ? (
            <MarketplaceTerritoryCatalog projectId={projectId} canManage={canManageTerritory} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
