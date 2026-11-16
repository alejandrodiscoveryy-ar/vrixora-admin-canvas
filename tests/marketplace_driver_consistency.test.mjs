import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const map = readFileSync("src/features/admin/MarketplaceOperationalMap.tsx", "utf8");
const panel = readFileSync("src/features/admin/MarketplaceDriverConsistencyPanel.tsx", "utf8");
const sql = readFileSync("supabase/migrations/20261116222332_marketplace_driver_consistency_readonly.sql", "utf8");

test("mapa incorpora una pestaña Constantes sin reemplazar conductores, servicios o clientes", () => {
  for (const marker of ['id: "drivers" as const','id: "consistency" as const','id: "services" as const','id: "clients" as const'])
    assert.ok(map.includes(marker), marker);
  assert.match(map, /agendaTab === "consistency"/);
  assert.match(map, /<MarketplaceDriverConsistencyPanel/);
  assert.match(map, /setShowAllFleetInOperations\(true\)/);
  assert.match(map, /onOpenDriver\(driverUserId\)/);
});

test("panel muestra recurrencia y horas por 7 y 30 dias, con avisos honestos", () => {
  for (const marker of ["7 días", "30 días", "Frecuencia", "Horas", "Ficha 360", "Días de inicio",
    "Jornada estimada", "Jornadas cerradas", "GPS", "máx. 12 h", "no equivalen"]) {
    // Periodos appear in number interpolation rather than static strings.
    if (marker.endsWith(" días") && marker.startsWith("7")) continue;
    if (marker.endsWith(" días") && marker.startsWith("30")) continue;
    assert.ok(panel.includes(marker), marker);
  }
  assert.match(panel, /type PeriodDays = 7 \| 30/);
  assert.match(panel, /enabled,/);
  assert.match(panel, /onFocusDriver/);
  assert.match(panel, /getSupabaseClient\(\)\.rpc\("admin_get_marketplace_driver_consistency"/);
});

test("RPC administrativo solo lectura con permiso y sin alcance anon", () => {
  assert.match(sql, /require_project_permission\(target_project_id, 'marketplace\.view'\)/);
  assert.match(sql, /target_days NOT IN \(7, 30\)/);
  assert.match(sql, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_get_marketplace_driver_consistency\(uuid, integer\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /TO authenticated/);
  assert.match(sql, /audit_events/);
  assert.match(sql, /interval '12 hours'/);
  assert.match(sql, /interval '5 minutes'/);
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE\s+public\.|DELETE FROM|TRUNCATE|net\.http_post|pg_cron|ALTER TABLE)\b/i);
});


test("Constantes presenta lista compacta y despliega datos únicamente al seleccionar una fila", () => {
  // Un único registro desplegado; tocar el mismo vuelve a contraerlo.
  assert.match(panel, /useState<string \| null>\(null\)/);
  assert.match(panel, /expandedDriverId === driver\.driverUserId/);
  assert.match(panel, /setExpandedDriverId\(\(current\) => current === driver\.driverUserId \? null : driver\.driverUserId\)/);
  assert.match(panel, /aria-expanded=\{rowExpanded\}/);
  assert.match(panel, /aria-controls=\{detailsId\}/);
  assert.match(panel, /id=\{detailsId\} hidden=\{!rowExpanded\}/);
  assert.match(panel, /rowExpanded \? \(/);
  assert.match(panel, /min-h-12/); // Zona táctil >= 48 px, con contenido resumido.
  assert.match(panel, /rotate-180/);
  assert.match(panel, /const mainMetric = ranking === "days"/);
  assert.match(panel, /const secondaryMetric = ranking === "days"/);
  // Cambiar periodo o ranking debe cerrar detalles para mostrar más filas.
  assert.match(panel, /setDays\(period\); setExpandedDriverId\(null\)/);
  assert.match(panel, /setRanking\("days"\); setExpandedDriverId\(null\)/);
  assert.match(panel, /setRanking\("hours"\); setExpandedDriverId\(null\)/);
  // Datos y acciones de la antigua tarjeta no se pierden.
  for (const marker of ["Días de inicio", "Jornada estimada", "Jornadas cerradas", "Ficha 360", "Mapa", "DriverVerifiedBadge"]) {
    assert.ok(panel.includes(marker), marker);
  }
  assert.doesNotMatch(panel, /\.rpc\("accept_job"|\.rpc\("admin_republish_marketplace_job"/);
});
