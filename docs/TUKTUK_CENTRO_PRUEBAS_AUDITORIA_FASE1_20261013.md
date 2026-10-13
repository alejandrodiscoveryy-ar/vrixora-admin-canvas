# TukTuk Marketplace — Centro de pruebas V2

**Etapa:** auditoría técnica y diseño del contrato completados; base de datos V2 preparatoria sin aplicar.  
**Fecha:** 13 octubre 2026. **Base Admin:** `f3092631c2b034f6e8c3373e2e044f5fe9e4ce5c`.

## Evidencia obtenida en GitHub y en el esquema activo (solo lectura)

El modo de prueba actual utiliza `marketplace_test_mode.target_driver_user_id` (uno por proyecto); el formulario Admin sólo permite seleccionar una persona. `app_private.mark_marketplace_test_job_on_publish` interviene en el paso `requested → published` y **marca como prueba una solicitud de Cliente si el modo global estaba activado**, sin discriminar su procedencia. No conviene extender este mecanismo a un grupo: se debe dejar de usar para etiquetar carreras reales y pasar a un alta administrativa explícita.

Las carreras tienen `jobs.test_driver_user_id` escalar y `is_test`. Los puntos de control existentes son distintos: `app_private.marketplace_driver_can_receive_job` (elegibilidad), `public.list_my_marketplace_available_jobs` (listado de la app), `public.accept_job` (aceptación transaccional con `FOR UPDATE`), `app_private.marketplace_dispatch_candidate_state` / `marketplace_dispatch_policy_allows` (despacho), `app_private.enqueue_marketplace_job_offer_wave` (outbox y push), y `app_private.marketplace_test_mode_for_driver` (acceso en modo de prueba). **Cambiar sólo un punto permitiría inconsistencias de visibilidad, push o aceptación.**

La cola `notification_outbox` tiene la clave única `(project_id, user_id, kind, dedupe_key)`. Por tanto, el mismo `dedupe_key=marketplace-job:<job_id>` puede usarse para varios destinatarios sin duplicar por usuario; no se necesita una carrera por cada conductor. El código actual de `enqueue_marketplace_job_offer_wave` ya recorre candidatos individualmente, aunque la elegibilidad todavía excluye grupos.

`service_requests.customer_id` es obligatorio; crear una carrera desde Admin exige **una identidad de cliente de prueba aislada**, no usar los datos de un cliente real. No existe aún una RPC que cree íntegramente una carrera de prueba desde Admin. Asimismo, `jobs.final_price`, `recommended_price` y `commission_rate_snapshot` son obligatorios; la comisión configurable debe seguir desactivada por defecto para pruebas y respetar las restricciones existentes.

El historial se puede derivar de `jobs`, `job_events`, el snapshot de destinatarios y `notification_outbox` sin mostrar datos personales a roles no autorizados. La supresión de pruebas es lógica (`jobs.test_deleted_at`) y el récord profesional no debe contabilizarlas.

## Decisión de arquitectura

1. Introducir `marketplace_test_audience`: lista configurada de conductores autorizados **por proyecto**. No altera trabajos ya publicados.
2. Introducir `marketplace_test_job_recipients`: **snapshot inmutable** de destinatarios por carrera; el ganador sigue siendo único en `job_assignments`/`jobs`.
3. Introducir `marketplace_admin_test_jobs`: trazabilidad administrativa de creación, modo, idempotencia y autor.
4. Crear RPCs administrativas con `marketplace.manage + settings.manage` para guardar grupo, y `marketplace.view + settings.view` para consultar. No conceder DML directo a los nuevos registros.
5. Mantener compatibilidad con `jobs.test_driver_user_id`: las pruebas antiguas se atribuyen al conductor legado **sólo cuando no existe snapshot**.
6. Sustituir el etiquetado global por un alta administrativa explícita; añadir identidad de cliente sintética aislada e idempotencia. El resto del flujo se conserva.
7. Adaptar **simultáneamente** elegibilidad, listado de la app, aceptación, prioridad de despacho, outbox, cancelación y cierre antes de activar grupos. Verificar que el primer conductor que acepta obtiene el bloqueo transaccional.
8. Conservar controles de comisiones con valor por defecto «no cargo real» y confirmación extraordinaria para ensayos financieros.
9. La vista Admin presentará tres bloques compactos y responsive: destinatarios, creador de carreras de prueba e historial.

## Condiciones de seguridad para la migración

La migración preparatoria adjunta **no sustituye funciones de dispatch ni enciende la modalidad grupal**; únicamente crea estructuras y RPCs auxiliares. No debe presentarse como una funcionalidad lista para producción. La publicación completa requiere una segunda migración coordinada con la nueva interfaz, pruebas transaccionales en entorno de desarrollo y autorización explícita del propietario.

**En esta etapa:** consulta de GitHub/Supabase terminada; producción sin cambios. Archivo SQL listo para revisión y continuidad; pendiente de prueba dinámica en base aislada y de integración con las RPC críticas.
