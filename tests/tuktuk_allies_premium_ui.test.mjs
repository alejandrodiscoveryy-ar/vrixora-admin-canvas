import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/features/admin/MarketplaceAlliesPanel.tsx", import.meta.url), "utf8");

test("Aliados muestra jerarquía premium con resumen de adquisición y pagos", () => {
  assert.match(source, /data-admin-module="comercial"/);
  assert.match(source, /aria-labelledby="tuktuk-allies-heading"/);
  assert.match(source, /Red comercial · TukTuk/);
  assert.match(source, /Aliados activos/);
  assert.match(source, /Visitas a enlaces/);
  assert.match(source, /Viajes atribuidos/);
  assert.match(source, /Pendiente de pago/);
  assert.match(source, /Resultados acumulados/);
  assert.match(source, /q\.data\.map\(\(ally\) =>/);
  assert.match(source, /rounded-2xl border border-border\/65 bg-card\/75/);
  assert.match(source, /grid grid-cols-2 gap-px overflow-hidden rounded-xl/);
  assert.match(source, /text-emerald-300/);
  assert.match(source, /text-violet-300/);
});

test("Alta plegada para evitar formulario persistente y crear links visibles una sola vez", () => {
  assert.match(source, /const \[createExpanded, setCreateExpanded\] = useState\(false\)/);
  assert.match(source, /aria-expanded=\{createExpanded\} aria-controls="ally-create-form"/);
  assert.match(source, /canManage && createExpanded && \(/);
  assert.match(source, /id="ally-create-form"/);
  assert.match(source, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); void create\(\); \}\}/);
  assert.match(source, /setCreateExpanded\(false\)/);
  assert.match(source, /Nick comercial para compartir/);
  assert.match(source, /Enlace público para captar clientes/);
  assert.match(source, /Enlace privado para resultados/);
  assert.match(source, /Trátalo como una contraseña/);
  assert.match(source, /value=\{privateLink\(issued\.report_key\)\}/);
  assert.match(source, /max="5"/);
});

test("Las acciones originales siguen completas, autorizadas y sin cambiar reglas financieras", () => {
  for (const rpc of [
    "admin_list_marketplace_allies_v1",
    "admin_create_marketplace_ally_v1",
    "admin_update_marketplace_ally_v1",
    "admin_rotate_marketplace_ally_key_v1",
    "admin_record_marketplace_ally_payment_v1",
  ]) assert.ok(source.includes(rpc), rpc);
  assert.match(source, /const promo = \(slug: string\) => shortBase \+ encodeURIComponent\(slug\)/);
  assert.match(source, /if \(!canManage\) return;/);
  assert.match(source, /pct > 5/);
  assert.match(source, /newRate > 5/);
  assert.match(source, /void copy\(promo\(ally\.slug\)\)/);
  assert.match(source, /void rotate\(ally\)/);
  assert.match(source, /void update\(ally, ally\.status === "active" \? "paused" : "active"\)/);
  assert.match(source, /void logPayment\(ally\)/);
  assert.match(source, /Registra únicamente un pago ya realizado\. Esto no transfiere dinero/);
  assert.match(source, /window\.confirm\("¿Regenerar el acceso privado/);
  assert.doesNotMatch(source, /insert into public\.wallet_transactions/i);
});

test("Compacto y accesible en móvil sin mostrar datos privados automáticamente", () => {
  assert.match(source, /grid grid-cols-2 gap-2 lg:grid-cols-4/);
  assert.match(source, /sm:grid-cols-3 xl:grid-cols-6/);
  assert.match(source, /min-h-11 px-2\.5 text-xs sm:min-h-9/);
  assert.match(source, /aria-label=\{"Copiar enlace público de " \+ ally\.name\}/);
  assert.match(source, /aria-label=\{"Renovar acceso privado de " \+ ally\.name\}/);
  assert.match(source, /role="status"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /!q\.data\?\.length/);
  assert.doesNotMatch(source, /<Input[^>]*value=\{privateLink\(ally/);
});
