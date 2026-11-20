import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const panel=readFileSync("src/features/admin/ComercialSourceOverview.tsx","utf8");
const nav=readFileSync("src/features/admin/ComercialSection.tsx","utf8");
test("resumen separa fuentes y declara período histórico de Aliados",()=>{
  for(const rpc of ["admin_get_marketplace_tuktuk_communications_v1","admin_get_marketplace_impulsa_communications_v1","admin_list_marketplace_allies_v1"])assert.ok(panel.includes(rpc),rpc);
  for(const s of ["TukTuk oficial","Impulsa · Conductores","Aliados · Externos","Histórico completo","sesiones identificadas".toLowerCase(),"deduplicar"])assert.ok(panel.toLowerCase().includes(s.toLowerCase()),s);
  assert.match(nav,/<ComercialSourceOverview projectId=\{projectId\} \/>/);
});
test("no inventa total de clientes únicos ni altera cobros",()=>{
  assert.doesNotMatch(panel,/wallet_transactions|record_marketplace_ally_payment|\.rpc\("admin_save_/);
  assert.match(panel,/No se muestra un total único/);
  assert.match(panel,/card\.error/);
  assert.match(panel,/card\.loading/);
  assert.match(panel,/organic_totals/);
  assert.match(panel,/Orgánico · Sin atribución/);
  assert.match(panel,/Aperturas de app/);
  assert.match(panel,/Cotizaciones/);
  assert.match(panel,/appOpens:impulsa\.data\?\.organic_totals\?\.app_opens/);
  assert.match(panel,/requests:impulsa\.data\?\.organic_totals\?\.requests_created/);
  assert.match(panel,/atribución verificada|«—» significa dato no disponible/);
});
