import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const operational = readFileSync(new URL("../src/features/admin/AdminOperationalAlerts.tsx", import.meta.url), "utf8");
const push = readFileSync(new URL("../src/lib/admin-push.ts", import.meta.url), "utf8");
const operations = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
const share = readFileSync(new URL("../src/features/admin/MarketplaceServiceShareButton.tsx", import.meta.url), "utf8");

test("Avisos administrativos sirven en Android sin lenguaje exclusivo de Windows", () => {
  assert.match(operational, /Activar notificaciones/);
  assert.match(operational, /avisos del dispositivo opcionales/);
  assert.match(push, /notificaciones para recibir avisos en este dispositivo/);
  assert.match(push, /admin_marketplace_new_job/);
  assert.match(push, /register_my_admin_push_token/);
});

test("La notificación abre la carrera 360, donde está disponible el mensaje para los conductores", () => {
  assert.match(push, /carrera=\$\{encodeURIComponent\(data.job_id\)\}/);
  assert.match(operations, /alertJobId/);
  assert.match(operations, /setJobId\(alertJobId\)/);
  assert.match(operations, /canShare=\{canManageMarketplace && canCustomers\}/);
  assert.match(operations, /canShareJob = canShare && state === "published" && !hasDriver && job.is_test !== true/);
  assert.match(operations, /<MarketplaceServiceShareButton projectId=\{projectId\} jobId=\{jobId\} compact \/>/);
});

test("Se revisa el mensaje, se puede copiar o compartir manualmente sin envío automático", () => {
  assert.match(share, /admin_get_marketplace_job_whatsapp_payload/);
  assert.match(share, /navigator\.clipboard\.writeText\(preview\)/);
  assert.match(share, /navigator\.share\(\{ title: .*text: preview \}\)/);
  assert.match(share, /Compartir por WhatsApp/);
  assert.match(share, /!reviewed/);
});
