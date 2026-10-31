import { useState } from "react";
import {
  BellRing,
  ChevronRight,
  FlaskConical,
  Globe2,
  Radar,
  ShieldCheck,
} from "lucide-react";

import MarketplaceTerritoryCatalog from "@/features/admin/MarketplaceTerritoryCatalog";
import MarketplaceDispatchSettingsCard from "@/features/admin/MarketplaceDispatchSettingsCard";
import MarketplaceJobReminderSettingsCard from "@/features/admin/MarketplaceJobReminderSettingsCard";
import MarketplaceTestCenterV2 from "@/features/admin/MarketplaceTestCenterV2";

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
    <section aria-label="Configuración de TukTuk" className="min-w-0 space-y-3">
      <div className="grid min-w-0 items-start gap-3.5 xl:grid-cols-[252px_minmax(0,1fr)]">
        <nav
          aria-label="Secciones de configuración de TukTuk"
          className="relative isolate overflow-hidden rounded-[22px] border border-border/70 bg-gradient-to-br from-card/95 via-card/90 to-cyan-950/[0.09] p-2.5 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.8)] xl:sticky xl:top-4"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 z-0 h-52 w-52 rounded-full bg-cyan-400/[0.045] blur-3xl" />
          <div className="relative z-10 px-2.5 pb-2 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400/85">Configuración</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Áreas de control de TukTuk</p>
          </div>
          <div className="relative z-10 grid gap-1.5 sm:grid-cols-3 xl:grid-cols-1">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isSelected = section.id === active;
              return (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => setActive(section.id)}
                  aria-pressed={isSelected}
                  aria-controls="tuktuk-config-detail"
                  className={`group relative isolate flex min-w-0 items-center gap-2.5 overflow-hidden rounded-[16px] border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${isSelected ? "border-cyan-400/35 bg-gradient-to-r from-cyan-400/[0.11] via-cyan-400/[0.045] to-background/20 text-foreground shadow-[0_12px_30px_-24px_rgba(34,211,238,0.45)]" : "border-transparent bg-background/20 text-foreground/85 hover:border-border/65 hover:bg-muted/40"}`}
                >
                  <Icon aria-hidden="true" className={`pointer-events-none absolute -right-4 -top-5 z-0 h-28 w-28 rotate-[-14deg] ${isSelected ? "text-cyan-300 opacity-[0.075]" : "text-muted-foreground opacity-[0.045]"}`} />
                  <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-inner ${isSelected ? "border-cyan-400/30 bg-cyan-400/[0.11] text-cyan-300" : "border-border/60 bg-background/60 text-muted-foreground"}`}>
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">{section.number}</span>
                    <span className="mt-0.5 block text-sm font-semibold leading-tight text-foreground">{section.title}</span>
                    <span className="mt-1 hidden text-[11px] leading-snug text-muted-foreground xl:block">{section.subtitle}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={`relative z-10 hidden h-4 w-4 shrink-0 xl:block ${isSelected ? "text-cyan-300" : "text-muted-foreground/45"}`} />
                </button>
              );
            })}
          </div>
          <div className="relative z-10 mt-2 flex items-center gap-1.5 border-t border-border/50 px-2.5 pt-2.5 text-[10px] text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-cyan-400" />
            Acceso según permisos
          </div>
        </nav>

        <div id="tuktuk-config-detail" className="min-w-0 space-y-3">
          {active !== "pruebas" ? (
            <header className="relative isolate overflow-hidden rounded-[20px] border border-cyan-400/15 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/75 px-4 py-3 text-slate-50 shadow-[0_18px_42px_-35px_rgba(14,165,233,0.45)] sm:px-5">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_90%_10%,rgba(34,211,238,0.10),transparent_55%)]" />
              <SelectedIcon aria-hidden="true" className="pointer-events-none absolute -right-5 -top-8 z-0 h-32 w-32 rotate-[-15deg] text-cyan-100 opacity-[0.07] sm:right-4" />
              <div className="relative z-10 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
                  <SelectedIcon aria-hidden="true" className="h-[19px] w-[19px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-200/85">{selected.number} / {selected.eyebrow}</p>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <h2 className="text-lg font-semibold tracking-tight text-white">{selected.title}</h2>
                    <p className="text-xs leading-relaxed text-slate-300">{selected.description}</p>
                  </div>
                </div>
              </div>
            </header>
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
              <div className="relative isolate flex items-center gap-2 overflow-hidden rounded-2xl border border-border/60 bg-card/65 px-3.5 py-2.5 text-xs text-muted-foreground xl:col-span-2">
                <BellRing aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-400" />
                <span>Los permisos y validaciones de despacho y avisos se mantienen.</span>
              </div>
            </div>
          ) : null}

          {active === "territorio" ? (
            <MarketplaceTerritoryCatalog projectId={projectId} canManage={canManageTerritory} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
