import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const section = read("../src/features/admin/MarketplaceSection.tsx");
const map = read("../src/features/admin/MarketplaceOperationalMap.tsx");

test("El mapa sigue montado al cambiar de vista pero recibe visibilidad real", () => {
  assert.match(section, /mapVisited \? \(/);
  assert.match(section, /<TabsContent value="mapa" forceMount/);
  assert.match(section, /<MarketplaceOperationalMap[\s\S]*?isVisible=\{tab === "mapa"\}/);
});

test("El sondeo de posiciones se pausa al ocultar Mapa y se reactiva al volver", () => {
  assert.match(map, /isVisible: boolean;/);
  assert.match(map, /queryKey: \["marketplace-operational-map-live", projectId\],[\s\S]*?enabled: isVisible,[\s\S]*?refetchInterval: \(query\) =>/);
  assert.match(map, /activeJobs \?\? 0\) > 0 \? 5_000 : 15_000/);
  assert.match(map, /refetchIntervalInBackground: false/);
});

test("Los sondeos auxiliares no continuan mientras Mapa esta oculto", () => {
  assert.match(map, /queryKey: \["marketplace-operational-driver-avatars", projectId\],[\s\S]*?enabled: isVisible/);
  assert.match(map, /enabled: isVisible && Boolean\(routeKey\) && mapLoaded/);
  assert.match(map, /enabled: isVisible && Boolean\(panelOpen && agendaTab === "services"/);
});

test("Se conserva la sincronizacion operativa y el acceso a las fichas 360", () => {
  for (const fn of ["getMarketplaceOperationalMap", "getMarketplaceOperationalRoutes", "getMarketplaceJobNotificationRecipients"]) {
    assert.ok(map.includes(fn), "Falta la consulta existente " + fn);
  }
  for (const fn of ["onOpenDriver", "onOpenCustomer", "onOpenJob"]) {
    assert.ok(section.includes(fn), "Falta acceso existente " + fn);
  }
});
