# Auditoría estática — Bloque 11 Marketplace

Fecha: 16 de septiembre de 2026.

## Infraestructura reutilizada

`push_device_tokens` ya registra tokens Android y Web por usuario/proyecto, con
RLS de propietario y desregistro desde Flutter. `notification_outbox` ya es la
cola durable. El worker `send-push-notifications` reclama filas con `SKIP
LOCKED`, mantiene una concesión, reintenta de forma exponencial y deshabilita
tokens FCM `UNREGISTERED`. La WebApp ya incluye Firebase Messaging y su service
worker; Android declara el permiso y el canal local.

El cron existente ejecuta el worker cada cinco minutos. Por tanto la latencia
normal esperada es de hasta cinco minutos más el tiempo de procesamiento; no se
declara entrega instantánea. El disparo HTTP oportunista no es parte de este
bloque porque la publicación customer es anónima y no debe portar el secreto
del despachador.

## Cambios del bloque

La migración `20260916100000_tuktuk_marketplace_notifications.sql` conserva la
cola existente y añade deduplicación por evento. El trigger de publicación
calcula conductores elegibles usando servicio habilitado, compatibilidad,
capacidades, disponibilidad, perfil activo/no suspendido, onboarding y acceso
vigente. Inserta un único evento por conductor y trabajo dentro de la misma
transacción de publicación. El payload contiene exclusivamente el tipo de
evento y `job_id`.

La migración incremental `20260916110000_notification_outbox_legacy_compatibility.sql`
restaura el productor de tasa diaria sobre el nuevo contrato: usa
`daily-rate:<fecha-local>` como `dedupe_key` y el conflicto por
`(project_id, user_id, kind, dedupe_key)`. Conserva la deduplicación diaria sin
competir con `marketplace-job:<job-id>`.

El worker existente admite `marketplace_job_available` y entrega a todos los
tokens habilitados del conductor sin duplicar el evento de negocio. Antes de
entregar, el worker no altera el trabajo; un envío fallido no puede revertir la
publicación. Una oferta entregada tarde sigue siendo inocua porque `accept_job`
mantiene el bloqueo y la aceptación atómica como autoridad final.

No se crean tokens push para el customer anónimo. Sus cambios de estado se
mantienen en el seguimiento autenticado por sesión del Bloque 10; las alertas
push al customer quedan fuera de alcance hasta que exista un mecanismo de
consentimiento y dispositivos autorizado.
