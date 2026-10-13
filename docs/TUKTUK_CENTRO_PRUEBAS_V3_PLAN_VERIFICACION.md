# TUKTUK — Centro de Pruebas Premium V3

Estado de esta entrega: **preparada para rama**, sin cambios remotos de producción.

## Funcionalidad

- Conserva la identidad sintética, la audiencia de 1 a 30 conductores, la idempotencia,
  `marketplace_job_available` y la aceptación atómica de V2.
- Despliega mapa vectorial Mapbox con estilo y token público administrados por Vrixora Admin.
  Origen/destino por sugerencias geocodificadas o pulsando y arrastrando pines.
- Ruta con distancia y duración calculadas mediante el gateway Mapbox existente de Cliente.
  Un gateway ADMIN autenticado recalcula de nuevo la ruta justo antes de crear el servicio.
- El RPC V3 determina el importe **en servidor** con el mismo motor de cotización de Cliente,
  utiliza la tasa vigente y rechaza cambios entre cotización y envío. El precio manual queda
  diferenciado y auditado. Los puntos y datos de ruta se conservan en `service_requests.details`.
- Historial plegado inicialmente, filtro por estado, 10 filas por página y cursor estable.
  El contenido de cada fila se amplía con clic.
- La comisión real permanece apagada por defecto y requiere permisos + doble confirmación.

## Archivos

1. `src/features/admin/MarketplaceTestCenterV2.tsx` (interfaz V3 manteniendo importación existente).
2. `src/features/admin/MarketplaceTestRouteMap.tsx` (mapa integrado).
3. `supabase/migrations/20261013235500_marketplace_test_lab_premium_v3.sql`
4. `supabase/functions/marketplace-map-admin-gateway/index.ts` (nueva operación `test_lab_create_v3`).
5. `tests/marketplace_test_lab_premium_v3.test.mjs`.

## Publicación aprobable — **no ejecutar durante desarrollo**

1. Auditar rama/commit y resultados de `bun run build:production-safe` y `node --test`.
2. Aprobación expresa antes de aplicar SQL en Supabase de producción.
3. Aplicar migración SQL V3 mediante `apply_migration`; verificar RPC y privilegios, sin
   alterar V2. Mantener modo prueba apagado durante transición.
4. Desplegar versión autorizada del Edge `marketplace-map-admin-gateway`, comprobar
   autorización, lectura de Maps y recalculo de ruta, sin invocar la creación de trabajos.
5. Integrar el commit autorizado en main y desplegar Vrixora Admin.
6. Probar un pedido individual controlado sin comisión real: sugerencias, ruta, tarifa,
   push con app cerrada y apertura a Trabajos, aceptación, liquidación y billetera sin cargo.
7. Probar una carrera de grupo con dos conductores elegibles, verificar un solo ganador,
   destinatarios congelados y notificación a cada uno. Verificar el historial paginado.

## Reversión

- Si falla la fase 3: la UI V2 sigue usando sus RPC intactos. La migración solo añade RPC V3.
- Si falla Edge: volver a la versión anterior de `marketplace-map-admin-gateway`; las RPC V2
  y los trabajos anteriores siguen inalterados.
- Si falla Admin: revertir su despliegue al Worker previo; no borrar las funciones ni registros.
- Nunca revertir carreras ni comisiones con un SQL masivo; toda corrección de dinero exige
  conciliación individual y autorización.

## Alcance real de validación

Las pruebas estáticas no garantizan llamadas reales a Mapbox, la cotización de cada categoría,
la entrega push a un móvil cerrado ni la concurrencia de múltiples conductores. Todo ello requiere
verificación funcional tras publicación aprobada.
