# TukTuk — Centro de Campañas y Ofertas Comerciales (base V1)

## Objetivo

Crear un centro comercial **distinto de `commercial_campaigns`** (CRM/captación) que permita definir ofertas para conductores, sin crear excepciones ocultas en la comisión del 10 %.

## Alcance de este PR (preparación segura)

- Nueva subpestaña **Ofertas TukTuk** dentro de la sección principal **Comercial** de Vrixora Admin, junto a **Captación y campañas**. La sección **Trabajos** queda exclusivamente operativa, sin cambios de interfaz.
- Catálogo tipado: exención completa de comisión, comisión reducida, N carreras exentas, crédito de billetera, incentivos por referidos, reactivación y oferta personalizada.
- Por campaña: ventana de captación; inicio del beneficio desde incorporación o primera carrera; duración; segmento; reglas de segmentación; código de campaña; cupo; presupuesto CUP; usos por conductor; prioridad; política de no acumulación; condiciones comerciales.
- API `admin_list_marketplace_offer_campaigns`, `admin_save_marketplace_offer_campaign`, `admin_archive_marketplace_offer_campaign`, con validación y autorización **solo del propietario** para cambios, auditoría inmutable por evento administrativo, RLS y acceso directo a tablas revocado.
- Estados deliberadamente limitados a borrador / pausada / archivada. **No existe botón de activar todavía**: así no se promete un beneficio que el motor financiero no conoce.

## Fuera de alcance / no tocar

- Comisión general actual 10 %, carreras, billetera, saldo promocional, liquidaciones, referidos, aplicación de conductores, tarifas, licencias, precios de clientes, fechas y beneficios de 5 promociones vigentes.
- El flujo heredado de incorporación que hoy concede 10 días libres **sigue funcionando**; no se desactiva hasta una migración posterior con pruebas de equivalencia.
- Nada de deploy automático, ni aplicación automática de SQL a producción.

## Próxima fase — aplicación efectiva

Se requiere un motor de ofertas en Supabase que, para cada aceptación de carrera, decida una única promoción autorizada, verifique todas las restricciones en transacción, reserve el uso/cupo, guarde tasa e importe **inmutables** de comisión y la promoción aplicada al servicio, y garantice liquidación exacta y reversión idempotente. Durante las ofertas a 0 % debe evitarse la reserva en billetera; para descuentos parciales debe guardarse la tasa negociada en todos los puntos de persistencia y liquidación. Las promociones antiguas ya concedidas conservan sus fechas intactas. Un interruptor de operación administrado por el propietario habilitará la emisión real una vez que la fase esté validada.

### Política comercial predeterminada propuesta

- Base normal: 10 %.
- Fuera de una campaña expresamente aprobada: sin nuevas exenciones automáticas, **cuando se complete el cambio de motor**.
- Activación solo propietario; campaña de captación con fechas; beneficio individual conservado tras cerrar captación.
- No combinables: aplica solo la oferta válida más favorable, con prioridad como desempate.
- Nunca modificar comisiones de servicios ya aceptados.
- Los descuentos son cargo de TukTuk, no reducción de tarifa al cliente salvo una campaña distinta aprobada explícitamente.
- Inicio desde primera carrera: debe fijar un plazo máximo de activación (recomendación: 7 días desde validación de incorporación) para evitar beneficios indefinidos.
- Mantener pruebas de registros previos, promociones vigentes, nuevos usuarios con/sin campaña, bolsillo insuficiente y concurrencia.

## Secuencia de despliegue segura

1. Integrar PR de este catálogo una vez que `npm run build`, `eslint` y verificaciones SQL pasen; instalar su migración **antes de publicar la interfaz**. Ningún beneficio cambia.
2. Desarrollar y verificar motor de aplicación en un PR distinto, en base de pruebas desechable, con migración reversible y feature flag inicialmente apagado.
3. Verificar en entorno de prueba antes de activar el interruptor comercial y lanzar la primera campaña real.

## Seguridad y datos

- RPC de lectura requiere `commercial.view`; RPC de escritura requiere `commercial.manage` **y** `projects.owner_id = auth.uid()`.
- Tablas `public.marketplace_offer_campaigns` y `public.marketplace_offer_campaign_events` con RLS y sin grants a `anon` / `authenticated`. Solo RPCs específicos a rol autenticado.
- Registro de cada cambio con `before_snapshot`, `after_snapshot`, actor y fecha. Archivar no elimina los registros.
- El frontend valida, pero la base impone la validación definitiva. Datos de segmentación en `jsonb` con tamaño limitado y nombres internos reservados bloqueados.

## Observación de estado histórico al preparar esta implementación

El proyecto Supabase TukTuk informó `commission_rate = 0.10`, `promotion_duration_days = 10`, `promotion_rule_version = 2`, 5 promociones de incorporación registradas y 5 aún vigentes; también existe `commercial_campaigns`, destinado a captación comercial y no a este motor de beneficios. La nueva implementación no modifica ninguno de esos datos.
