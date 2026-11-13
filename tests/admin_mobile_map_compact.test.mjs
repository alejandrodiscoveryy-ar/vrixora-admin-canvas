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
  assert.match(source, /setCoverageFilter\("all"\)/);
  assert.match(source, /setMapViewMode\("coverage"\)/);
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
