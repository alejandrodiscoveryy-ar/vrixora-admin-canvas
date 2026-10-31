import { useState } from "react";
import {
  BellRing,
  ChevronRight,
  FlaskConical,
  MapPinned,
  Radar,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import MarketplaceTerritoryCatalog from "@/features/admin/MarketplaceTerritoryCatalog";
import MarketplaceDispatchSettingsCard from "@/features/admin/MarketplaceDispatchSettingsCard";
import MarketplaceJobReminderSettingsCard from "@/features/admin/MarketplaceJobReminderSettingsCard";
import MarketplaceTestCenterV2 from "@/features/admin/MarketplaceTestCenterV2";

const SECTIONS = [
  {
    id: "territorio",
    number: "01",
    title: "Mapas y provincias",
    subtitle: "Cobertura, catálogo y actualización geográfica",
    eyebrow: "CARTOGRAFÍA Y COBERTURA",
    description:
      "Administra los lugares de La Habana, prepara nuevas provincias y consulta el estado de cada actualización sin modificar las carreras.",
    icon: MapPinned,
  },
  {
    id: "operacion",
    number: "02",
    title: "Operación y avisos",
    subtitle: "Despacho, radios de búsqueda y recordatorios",
    eyebrow: "REGLAS OPERATIVAS",
    description:
      "Controla la asignación de solicitudes, la búsqueda de conductores y los avisos de carreras pendientes.",
    icon: Radar,
  },
  {
    id: "pruebas",
    number: "03",
    title: "Centro de pruebas",
    subtitle: "Simulación y comprobación del servicio",
    eyebrow: "DIAGNÓSTICO CONTROLADO",
    description:
      "Verifica rutas y funcionamiento del servicio desde un entorno de pruebas separado de las operaciones habituales.",
    icon: FlaskConical,
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
  const [active, setActive] = useState<SectionId>("territorio");
  const selected = SECTIONS.find((section) => section.id === active) ?? SECTIONS[0];
  const SelectedIcon = selected.icon;

  return (
    <section aria-label="Configuración de TukTuk" className="space-y-5">
      <header className="relative isolate overflow-hidden rounded-[28px] border border-cyan-300/15 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-6 text-slate-50 shadow-[0_25px_65px_-45px_rgba(14,165,233,0.4)] sm:px-7 sm:py-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 -z-10 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 shadow-inner shadow-cyan-400/10">
              <Settings2 aria-hidden="true" className="h-6 w-6 text-cyan-200" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">TukTuk / Centro de control</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Configuración del servicio</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                Configura la cobertura geográfica, los criterios operativos y las herramientas de verificación desde un solo lugar.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-slate-300">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-cyan-200" />
            Gestión protegida por permisos
          </div>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[285px_minmax(0,1fr)]">
        <nav aria-label="Secciones de configuración de TukTuk" className="rounded-[24px] border border-border/70 bg-card/75 p-2 shadow-[0_20px_50px_-42px_rgba(0,0,0,0.65)] xl:sticky xl:top-4">
          <div className="px-3 pb-2 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Áreas de configuración</p>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-3 xl:grid-cols-1">
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
                  className={`group flex min-w-0 items-center gap-3 rounded-[17px] border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${isSelected ? "border-cyan-400/35 bg-cyan-400/[0.085] text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:border-border/65 hover:bg-muted/45 hover:text-foreground"}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isSelected ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-300" : "border-border/60 bg-background/50 text-muted-foreground"}`}>
                    <Icon aria-hidden="true" className="h-[19px] w-[19px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold tracking-wide text-muted-foreground">{section.number}</span>
                    <span className="mt-0.5 block text-sm font-semibold leading-tight">{section.title}</span>
                    <span className="mt-1 hidden text-xs leading-snug text-muted-foreground xl:block">{section.subtitle}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={`hidden h-4 w-4 shrink-0 xl:block ${isSelected ? "text-cyan-300" : "text-muted-foreground/40"}`} />
                </button>
              );
            })}
          </div>
        </nav>

        <div id="tuktuk-config-detail" className="min-w-0 space-y-4">
          <div className="rounded-[24px] border border-border/70 bg-card/65 px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300">
                <SelectedIcon aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-400">{selected.number} / {selected.eyebrow}</p>
                <h3 className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">{selected.title}</h3>
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{selected.description}</p>
          </div>

          {active === "territorio" ? (
            <MarketplaceTerritoryCatalog projectId={projectId} canManage={canManageTerritory} />
          ) : null}

          {active === "operacion" ? (
            <div className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="Despacho y recordatorios">
              <MarketplaceDispatchSettingsCard projectId={projectId} canManage={canManageSettings} />
              <MarketplaceJobReminderSettingsCard projectId={projectId} canManage={canManageSettings} />
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/50 px-4 py-3 text-xs text-muted-foreground xl:col-span-2">
                <BellRing aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-400" />
                Los ajustes de despacho y avisos conservan sus permisos y validaciones actuales.
              </div>
            </div>
          ) : null}

          {active === "pruebas" ? (
            <MarketplaceTestCenterV2
              projectId={projectId}
              canManage={canManageSettings && canManageMarketplace}
              canManagePayments={canManagePayments}
              onOpenJob={onOpenJob}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
