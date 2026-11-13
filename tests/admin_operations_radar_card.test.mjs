
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/features/admin/MarketplaceSection.tsx', 'utf8');

test('tarjeta en el lateral de la carrera expandida', () => {
  assert.match(s, /<JobRadarShortcut[\s\S]*?jobId=\{job\.jobId\}/);
  assert.match(s, /lg:w-\[200px\]/);
  assert.match(s, /Ver recorrido por km/);
});
test('estados historicos separados de configuracion actual', () => {
  assert.match(s, /analysis\.data\?\.status === "yes"/);
  assert.match(s, /analysis\.data\?\.status === "no"/);
  assert.match(s, /Sin registro histórico/);
  assert.match(s, /Radar utilizado/);
  assert.match(s, /Radar no utilizado/);
});
test('clic en la tarjeta abre directamente la pestaña Radar', () => {
  assert.match(s, /setJobDetailInitialTab\("radar"\)/);
  assert.match(s, /initialTab=\{jobDetailInitialTab\}/);
  assert.match(s, /setActiveTab.*initialTab/);
  assert.match(s, /onClick=\{onOpen\}/);
});
test('conserva el expediente premium y las acciones existentes', () => {
  assert.match(s, /admin_cancel_assisted_marketplace_job/);
  assert.match(s, /admin_get_marketplace_job_radar_analysis/);
  assert.match(s, /Finalizar carrera/);
  assert.match(s, /Expediente 360 de carrera/);
});


test('radar visual activo, inactivo gris y estado histórico desconocido separado', () => {
  assert.match(s, /motion-safe:animate-\[spin_6s_linear_infinite\]/);
  assert.match(s, /conic-gradient\(from 0deg/);
  assert.match(s, /border-slate-600\/45/);
  assert.match(s, /Activo/);
  assert.match(s, /Inactivo/);
  assert.match(s, /Sin confirmar/);
  assert.match(s, /onClick=\{onOpen\}/);
  assert.match(s, /\{total\} registros · \{queued\} avisos encolados/);
});

test('ficha 360 de carrera sin cabecera visible repetida', () => {
  assert.match(s, /<DialogHeader className="sr-only">[\s\S]*?<DialogTitle>360 de carrera<\/DialogTitle>/);
  assert.match(s, /Expediente 360 de carrera/);
  assert.doesNotMatch(s, /TUKTUK \/ OPERACIONES/);
});

test('clic muestra recorrido por radios reales de cada carrera sin inventar etapas', () => {
  assert.match(s, /Recorrido de notificación por km/);
  assert.match(s, /notificationStageNumbers = \[\.\.\.new Set/);
  assert.match(s, /radar\.data\.status === "yes"/);
  assert.match(s, /El radar no se utilizó en esta carrera/);
  assert.match(s, /notificationRoute\.map/);
  assert.match(s, /Ver avisos de esta etapa/);
  assert.match(s, /kilometers\(radius\)/);
  assert.match(s, /stepRecipients|stageRecipients/);
  assert.match(s, /sin avisos conservados para este radio|Sin avisos conservados para este radio/);
  assert.match(s, /no confirma que se haya ejecutado la etapa/);
  assert.match(s, /no una ruta GPS/);
  assert.match(s, /primera selección por conductor/);
  assert.match(s, /setJobDetailInitialTab\("radar"\)/);
});


test('detalle expandido utiliza el alto necesario sin espacios artificiales', () => {
  assert.match(s, /className="relative mt-2 border-t border-border\/50 pt-3"/);
  assert.match(s, /flex flex-col gap-2\.5 lg:flex-row lg:items-start lg:justify-between lg:gap-3/);
  assert.match(s, /w-full min-w-0 shrink-0 space-y-2 lg:w-\[200px\]/);
  // The route, client and driver now use the same compact graphite inset.
  const operations = s.slice(s.indexOf('<TabsContent value="trabajos"'), s.indexOf('<TabsContent value="atencion"'));
  assert.equal((operations.match(/cn\("rounded-xl border p-3", premiumColumnHeaderSurface\)/g) ?? []).length, 3);
  assert.match(operations, /mt-2 grid gap-2 sm:grid-cols-2/);
  assert.match(operations, /cn\("rounded-xl border p-2\.5", premiumColumnHeaderSurface\)/);
  assert.match(operations, /className="mt-2 grid min-w-0 gap-2"/);
  assert.match(s, /mt-2 flex flex-wrap items-center gap-x-3 gap-y-1/);
});

test('tarjeta radar conserva su estado e historial pero sin imponer altura al detalle', () => {
  assert.match(s, /min-h-\[104px\] w-full min-w-0 items-center gap-2\.5/);
  assert.match(s, /h-\[62px\] w-\[62px\]/);
  assert.doesNotMatch(s, /min-h-\[176px\]/);
  assert.match(s, /motion-safe:animate-\[spin_6s_linear_infinite\]/);
  assert.match(s, /border-slate-600\/45/);
  assert.match(s, /Sin confirmar/);
  assert.match(s, /Ver recorrido por km/);
  assert.match(s, /onClick=\{onOpen\}/);
});

test('no se pierden controles, rutas ni información de la operación', () => {
  assert.match(s, /<JobNotificationReach projectId=\{projectId\} jobId=\{job\.jobId\} compact \/>/);
  assert.match(s, /text\(job\.originText\)/);
  assert.match(s, /text\(job\.destinationText\)/);
  assert.match(s, /job\.customerWhatsappPhone/);
  assert.match(s, /job\.driverDisplayName/);
  assert.match(s, /formatDate\(job\.scheduledFor\)/);
  assert.match(s, /job\.commissionAmountSnapshot != null/);
  assert.match(s, /Abrir detalle/);
  assert.match(s, /Cancelar por solicitud del cliente/);
  assert.match(s, /Finalizar carrera/);
  assert.match(s, /Eliminar prueba/);
});

test('Cliente 360 y Carrera 360 comparten identidad premium y pestañas accesibles', () => {
  const customer = s.slice(s.indexOf('function Customer360Detail('), s.indexOf('function normalizeDriverText'));
  const job = s.slice(s.indexOf('function JobDetail('));
  for (const block of [customer, job]) {
    assert.match(block, /marketplace-360-hero/);
    assert.match(block, /marketplace-360-watermark/);
    assert.match(block, /<TabsList aria-label=/);
    assert.match(block, /<TabsTrigger key=\{id\} value=\{id\}/);
    assert.match(block, /marketplace-360-tab min-h-11/);
    assert.match(block, /grid-cols-2 gap-1 bg-transparent p-0 sm:flex sm:flex-wrap/);
    assert.match(block, /<TabsContent value="overview"/);
    assert.match(block, /<TabsContent value="history"/);
  }
  assert.match(customer, /<TabsContent value="activity"/);
  assert.match(customer, /<TabsContent value="modalities"/);
  assert.match(customer, /formatCustomerDateTime\(detail.customer.createdAt\)/);
  assert.match(customer, /href=\{whatsapp.web\}/);
  assert.match(customer, /onOpenJob\(item.jobId\)/);
  assert.match(s, /onOpenJob=\{permissions.includes\("marketplace.view"\) \?/);
  assert.match(job, /<TabsContent value="radar"/);
  assert.match(job, /<TabsContent value="finance"/);
  assert.match(job, /<JobNotificationReach projectId=\{projectId\} jobId=\{jobId\}/);
  assert.match(job, /timeline.map/);
  assert.match(job, /financial.reservation_status/);
});
