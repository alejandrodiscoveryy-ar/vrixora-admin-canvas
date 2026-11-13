import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/admin/MarketplaceOperationalMap.tsx", import.meta.url),
  "utf8",
);

test("el mapa móvil conserva solo una fila compacta de controles", () => {
  assert.match(source, /Barra compacta móvil: un renglón en lugar de tres/);
  assert.match(source, /sm:hidden/);
  assert.match(source, /sm:flex xl:flex-nowrap/);
  assert.match(source, /Trab\.\s*<strong[^>]*>\{data\.summary\.workingDrivers\}/);
  assert.match(source, /GPS\s*<strong[^>]*>\{data\.summary\.driversWithFreshLocation\}/);
  assert.match(source, /aria-label="Actualizar mapa"/);
  assert.match(source, /aria-label=\{panelOpen \? "Ocultar agenda" : "Mostrar agenda"\}/);
  assert.match(source, /aria-label=\{expanded \? "Salir de pantalla completa" : "Pantalla completa"\}/);
});

test("los filtros se muestran a demanda en móvil y permanecen visibles en escritorio", () => {
  assert.match(source, /const \[mobileFiltersOpen, setMobileFiltersOpen\] = useState\(false\)/);
  assert.match(source, /aria-expanded=\{mobileFiltersOpen\}/);
  assert.match(source, /aria-controls="tuktuk-map-mobile-filters"/);
  assert.match(source, /mobileFiltersOpen \? "flex" : "hidden"/);
  assert.match(source, /sm:flex/);
  assert.equal(source.match(/id="tuktuk-map-mobile-filters"/g)?.length, 2);
  assert.match(source, /"operations", "Operaciones"/);
  assert.match(source, /"coverage", "Cobertura"/);
});

test("acceso directo a toda la flota y acciones de operación", () => {
  assert.match(source, /Toda la flota/);
  assert.match(source, /setShowAllFleetInOperations\(\(current\) => !current\)/);
  assert.doesNotMatch(source, /setMapViewMode\("coverage"\)/);
  assert.match(source, /onClick=\{\(\) => setMapViewMode\(mode\)\}/);
  assert.match(source, /onClick=\{\(\) => setCoverageFilter\(filter\)\}/);
  assert.match(source, /Trabajando · GPS sin actualizar/);
  assert.match(source, /onClick=\{\(\) => void operational\.refetch\(\)\}/);
  assert.match(source, /setAgendaCollapsed/);
  assert.match(source, /setExpanded/);
});

test("el mapa comienza debajo de la cabecera en móvil, sin alterar las otras vistas", () => {
  const layout = readFileSync(
    new URL("../src/routes/admin.tsx", import.meta.url),
    "utf8",
  );
  const marketplace = readFileSync(
    new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layout, /compactMobileMap = compactWorkspace && requestedView === "mapa"/);
  assert.match(layout, /compactMobileMap \? "pt-1 pb-2 sm:py-4" : "py-4"/);
  assert.match(marketplace, /TabsContent value="mapa" forceMount className="mt-0 sm:mt-3/);
  assert.match(layout, /compactWorkspace \? "lg:px-5 lg:py-5"/);
});


test("Operaciones muestra jornadas abiertas con GPS antiguo sin mezclar descansando", () => {
  assert.match(source, /if \(mapViewMode === "operations" && !showAllFleetInOperations && !driver\.acceptingJobs && !driver\.activeJobId\) continue;/);
  assert.doesNotMatch(source, /if \(mapViewMode === "operations" && !driver\.locationFresh && !driver\.activeJobId\) continue;/);
  assert.match(source, /if \(driver\.activeJobId\) return "busy";/);
  assert.match(source, /if \(!driver\.locationFresh\) return "stale";/);
  assert.match(source, /const coordinate = driverCoordinate\(driver\);\s*if \(!coordinate\) continue;/);
  assert.match(source, /Se muestran \{staleWorkingDriversWithLocation\} con última posición antigua, en ámbar/);
});


test("Toda la flota es una capa de Operaciones independiente de Cobertura", () => {
  assert.match(source, /const \[showAllFleetInOperations, setShowAllFleetInOperations\] = useState\(false\)/);
  assert.match(source, /aria-pressed=\{layers\.drivers && showAllFleetInOperations\}/);
  assert.match(source, /setShowAllFleetInOperations\(false\);\s*setLayers\(\(current\) => \(\{ \.\.\.current, drivers: showAllFleetInOperations \|\| !current\.drivers \}\)\)/);
  assert.match(source, /if \(mapViewMode === "coverage" && !coverageDriverIds\.has\(driver\.driverUserId\)\) continue;/);
  assert.match(source, /if \(mapViewMode !== "coverage"\) return;/);
  assert.match(source, /Con posición: \{\(operational\.data\?\.drivers \?\? \[\]\)\.filter\(\(driver\) => driverCoordinate\(driver\) != null\)\.length\}/);
  assert.match(source, /mapViewMode === "operations" && layers\.routes/);
});


test("Agenda de conductores usa filas compactas y detalle desplegable", () => {
  assert.match(source, /const \[expandedDriverId, setExpandedDriverId\] = useState<string \| null>\(null\)/);
  assert.match(source, /aria-expanded=\{rowExpanded\}/);
  assert.match(source, /rowExpanded \? "rotate-180" : ""/);
  assert.match(source, /min-h-10 w-full min-w-0 items-center gap-1\.5/);
  assert.match(source, /min-w-0 flex-1 truncate text-\[12px\]/);
  assert.match(source, /agendaTab === "drivers" \? "min\(342px, calc\(100% - 24px\)\)"/);
  assert.match(source, /sticky top-0 z-20 grid grid-cols-2 gap-1/);
  assert.match(source, /<span className="truncate">Trabajando<\/span>\s*<strong[^>]*>\{data\.summary\.workingDrivers\}/);
  assert.match(source, /<span className="truncate">Descansando<\/span>\s*<strong[^>]*>\{data\.summary\.inactiveDrivers\}/);
  assert.match(source, /rowExpanded \? \(\s*<div id=\{\x60operational-driver-detail-/);
  assert.match(source, /timeZone: "America\/Havana", dateStyle: "short", timeStyle: "medium"/);
  assert.match(source, /setShowAllFleetInOperations\(true\)/);
  assert.match(source, /onOpenDriver\(driver\.driverUserId\)/);
  assert.match(source, /pinState === "busy" \? "bg-emerald-400" : pinState === "available" \? "bg-sky-400" : pinState === "stale" \? "bg-amber-400"/);
});


test("La cabecera de escritorio aprovecha el espacio libre sin duplicar controles del mapa", () => {
  const layout = readFileSync(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");
  assert.match(layout, /id="vrixora-admin-map-toolbar-slot"/);
  assert.match(source, /slot\.clientWidth >= 560 \? slot : null/);
  assert.match(source, /if \(!isVisible \|\| expanded\)/);
  assert.match(source, /desktopToolbarTarget && isVisible && !expanded \? createPortal\(desktopToolbar, desktopToolbarTarget\) : desktopToolbar/);
  assert.match(source, /\[expanded, panelOpen, operationalReady, desktopToolbarTarget\]/);
  assert.match(source, /w-fit max-w-full flex-nowrap gap-2 overflow-x-auto/);
  assert.match(source, /w-fit max-w-full flex-nowrap items-center gap-1\.5 overflow-x-auto/);
  assert.match(layout, /compactMobileMap \? "lg:px-5 lg:py-2"/);
});
