
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/features/admin/MarketplaceSection.tsx', 'utf8');

test('tarjeta en el lateral de la carrera expandida', () => {
  assert.match(s, /<JobRadarShortcut[\s\S]*?jobId=\{job\.jobId\}/);
  assert.match(s, /lg:w-\[360px\] xl:w-\[420px\]/);
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
  assert.match(s, /w-full min-w-0 shrink-0 lg:w-\[360px\] xl:w-\[420px\]/);
  // The route, client and driver now use the same compact graphite inset.
  const operations = s.slice(s.indexOf('<TabsContent value="trabajos"'), s.indexOf('<TabsContent value="atencion"'));
  assert.equal((operations.match(/cn\("rounded-xl border p-3", premiumColumnHeaderSurface\)/g) ?? []).length, 3);
  assert.match(operations, /mt-2 grid gap-2 sm:grid-cols-2/);
  assert.match(operations, /aria-label="Programación y acciones de la carrera"/);
  assert.match(operations, /className="grid w-full min-w-0 gap-2 sm:w-\[220px\] sm:shrink-0"/);
  assert.match(s, /mt-2 flex flex-wrap items-center gap-x-3 gap-y-1/);
});

test('tarjeta radar ampliada conserva estados e historial con puntos por etapa', () => {
  assert.match(s, /min-h-\[222px\] w-full min-w-0 grid-cols-1 items-center gap-3/);
  assert.match(s, /max-w-\[198px\]/);
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


test('radar muestra un punto por impacto documentado en cada uno de los tres rangos', () => {
  assert.match(s, /const stages = \[1, 2, 3\]\.map/);
  assert.match(s, /impacts\.filter\(\(impact\) => impact\.radius_stage === stage\)\.length/);
  assert.match(s, /dots: Array\.from\(\{ length: visible \}/);
  assert.match(s, /active && visibleDots\.map/);
  assert.match(s, /Rango \{stage\}/);
  assert.match(s, /tabular-nums text-emerald-200">\{count\}/);
  assert.match(s, /withoutStage > 0/);
  assert.match(s, /hiddenCount > 0/);
  assert.match(s, /no ubicación GPS/);
  assert.doesNotMatch(s, /Puntos simulados:/);
});

test('radar respeta configuracion historica y estados de carga, error e inactividad', () => {
  assert.match(s, /radius_limit_km/);
  assert.match(s, /radar_settings\?\.\[key\]/);
  assert.match(s, /analysis\.isPending \? "Consultando radar"/);
  assert.match(s, /analysis\.isError \? "Radar no disponible"/);
  assert.match(s, /state === "no" \? "Radar no utilizado"/);
  assert.match(s, /aria-label=\{radarLabel\}/);
  assert.match(s, /motion-safe:animate-\[spin_6s_linear_infinite\]/);
});


test('clic en radar muestra un resumen corto y deja el historial plegado', () => {
  assert.match(s, /aria-label="Resumen rápido del radar"/);
  assert.match(s, /Conductores impactados/);
  assert.match(s, /Más cercano al aviso/);
  assert.match(s, /const overviewStages = \[1, 2, 3\]\.map/);
  assert.match(s, /overviewImpacts\.filter\(\(impact\) => impact\.radius_stage === stage\)/);
  assert.match(s, /overviewStages\.map/);
  assert.match(s, /Ver historial completo de avisos y distancias/);
  assert.match(s, /<details className="group mt-3 rounded-xl/);
  assert.match(s, /<summary className="flex min-h-11 cursor-pointer/);
  assert.match(s, /activeTab !== "radar"/);
  assert.doesNotMatch(s, /<summary[^>]+open=/);
});

test('historial completo conserva etapas, avisos y detalle de destinatarios', () => {
  assert.match(s, /notificationRoute\.map/);
  assert.match(s, /Ver avisos de esta etapa/);
  assert.match(s, /order\.map\(\(item\) =>/);
  assert.match(s, /El radar no se utilizó en esta carrera/);
  assert.match(s, /Sin avisos conservados para este radio/);
  assert.match(s, /no una ruta GPS/);
});


test('cada rango es pulsable y despliega exclusivamente sus conductores', () => {
  const component = s.slice(s.indexOf('function JobNotificationReach('), s.indexOf('function JobDetail('));
  assert.match(component, /const \[selectedRadarStage, setSelectedRadarStage\] = useState/);
  assert.match(component, /onClick=\{\(\) => setSelectedRadarStage\(\(current\) => current === stage \? null : stage\)\}/);
  assert.match(component, /aria-expanded=\{selectedRadarStage === stage\}/);
  assert.match(component, /selectedRadarStage === "unclassified"/);
  assert.match(component, /selectedImpacts = selectedRadarStage == null \? \[\] : overviewImpacts\.filter/);
  assert.match(component, /impact\.radius_stage === selectedRadarStage/);
  assert.match(component, /const recipient = actual\.find\(\(item\) => item\.driverUserId === impact\.driver_user_id\)/);
  assert.match(component, /selectedDrivers\.map/);
  assert.match(component, /driver\.name/);
  assert.match(component, /driver\.distanceKm/);
  assert.match(component, /driver\.deliveryStatus/);
  assert.match(component, /Sin conductores registrados en este rango/);
});

test('avisos sin rango no quedan ocultos y el historial sigue separado', () => {
  const component = s.slice(s.indexOf('function JobNotificationReach('), s.indexOf('function JobDetail('));
  assert.match(component, /!\[1, 2, 3\]\.includes\(impact\.radius_stage \?\? -1\)/);
  assert.match(component, /registro\(s\) sin rango identificado · Ver conductores/);
  assert.match(component, /Ver historial completo de avisos y distancias/);
  assert.match(component, /<details className="group mt-3 rounded-xl/);
  assert.match(component, /selectedRadarStage !== null/);
  assert.match(component, /Aviso enviado por push/);
  assert.match(component, /«Enviado» no confirma lectura/);
});


test('operaciones: programacion y acciones pasan bajo cliente y conductor; radar queda libre', () => {
  const operations = s.slice(s.indexOf('<TabsContent value="trabajos"'), s.indexOf('<TabsContent value="atencion"'));
  const clients = operations.indexOf('job.customerDisplayName || "Sin nombre registrado"');
  const actions = operations.indexOf('aria-label="Programación y acciones de la carrera"');
  const asideRail = operations.indexOf('lg:w-[360px] xl:w-[420px]');
  const radar = operations.indexOf('<JobRadarShortcut', asideRail);
  assert.ok(clients >= 0 && actions > clients && asideRail > actions && radar > asideRail);
  assert.doesNotMatch(operations.slice(asideRail, radar), /<aside/);
  assert.match(operations, /sm:flex-row sm:items-center sm:justify-between/);
  assert.match(operations, /grid w-full min-w-0 gap-2 sm:w-\[220px\] sm:shrink-0/);
  assert.match(operations, /onClick=\{\(\) => setJobId\(job\.jobId\)\}/);
  assert.match(operations, /formatDate\(job\.scheduledFor\)/);
  assert.match(operations, /adminFinishMutation\.isPending/);
  assert.match(operations, /deleteTestJob\.isPending/);
});
