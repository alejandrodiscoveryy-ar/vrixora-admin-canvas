# Integración elTOQUE compartida — paquete para auditoría

Desarrollo autorizado el 11/10/2026 después del preflight. El README de esta
carpeta conserva el estado de la primera detención; este documento registra la
continuación autorizada. No se repararon, borraron ni restauraron metadatos de
worktrees ajenos. Los tres worktrees nuevos parten de las bases remotas verificadas.

## Control y propiedad

Admin gobierna contratos, política de tasa, integridad y SQL. Supabase ejecuta
servicios compartidos. Cliente y Conductor son consumidores. El único emisor es
send-push-notifications; el único cron de push es tuktuk-push-dispatch cada cinco
minutos. No se introdujo otro panel o interruptor administrativo.
La configuración de tasa se reutiliza: automática, elTOQUE, USD/CUP, habilitada
y con sincronización reciente correcta. Falta decidir una política adicional
de capacidad/abuso antes de activar producción; no se inventó un panel para ello.

La divergencia del PRD sobre Marketplace/Cliente queda documentada en el
preflight; el propietario autorizó expresamente esta integración de desarrollo.
No se modificaron reglas de licencias, pagos ni permisos administrativos.

## Conciliación del esquema

Supabase reconoce la versión 20261011141714 y el nombre
tuktuk_cliente_eltoque_schema_preactivation_20261011 como aplicados.
applied-schema.sql.txt conserva los statements recuperados del historial;
schema-evidence.json conserva registro, RLS, grants y contadores.
No se añadió una migración ejecutable con ese esquema: los tres proyectos no
comparten todavía un historial de despliegue conciliado, por lo que colocarlo
en supabase/migrations podría inducir una aplicación errónea en otro entorno.
Debe integrarse su historial formalmente en una fase posterior revisada.

Admin prepara, sin aplicar, docs/sql/PENDIENTE_customer_eltoque_shared_activation.sql:
solo función privada y trigger, sin recrear tablas/RPC, sin cron ni backfill.
Comprueba proyecto, USD/CUP, modo automático, fuente, fecha nueva, configuración
vigente y un valor previo distinto. Primera observación e inserciones históricas
no producen avisos. La restricción existente (subscription_id,rate_history_id)
impide duplicar la misma entrega. docs/sql/VERIFY_customer_eltoque_shared.sql
contiene consultas sin tokens ni comandos cron. El rollback solo retira el
trigger: conserva tablas, datos y función privada.

## Emisor Conductor: baseline v16 y ampliación mínima

Antes de editar se recuperó otra vez el servicio vivo: v16 y mismo hash.
Se concilió el archivo GitHub con v16 preservando new_subscription, target_audience,
app_scope y sus mensajes de ausencia de tokens. core.ts permanece igual.
Las rutas, límites, reintentos y payloads Conductor conservan la referencia
funcional. verify_shared_push.mjs elimina únicamente el adaptador Cliente del
texto final y comprueba igualdad con el snapshot v16 de la lógica existente.

El nuevo customer.ts se invoca al terminar Conductor y comparte sendFcm,
buildFcmMessage, Google OAuth y Firebase. Reclama un solo lote de hasta 100 filas,
con hasta seis envíos concurrentes y tiempo restante; no reserva tiempo antes
de Conductor. Si queda menos de una ventana segura, no reclama Cliente.
Una cola llena nunca adelanta a Conductor; una caída Cliente se reporta en
summary.customer sin convertir sus éxitos en fallos.

Antes de enviar: comprobar claim_uuid, lease con margen, habilitación, expiración
y token intacto. Al finalizar: mismo claim y estado sending; un worker antiguo
no completa otro lease. Invalidación de token usa comparación del token para
no deshabilitar uno rotado. Reintentos comparten política de cinco intentos;
si no se llegó a enviar por falta de tiempo, se devuelve el intento consumido
por claim. Errores Cliente persistidos son categorías, sin respuesta FCM cruda.

No se crea ninguna identidad auth.users ni se escribe Cliente en
notification_outbox/push_device_tokens. El mantenimiento del emisor permanece
en Conductor; trasladarlo a Admin se propone como fase separada, con propiedad
y despliegue coordinados, nunca con dos copias operativas concurrentes.

## Cliente: registro independiente y consentimiento

marketplace-customer-push-registration solo subscribe/unsubscribe; no tiene
dispatch, OAuth Google, cuenta de servicio Firebase ni acceso a la cola.
Alta nueva requiere Turnstile verificado en el servidor: hostname www.vrixora.com
y action customer-rate-subscribe. Renovar/rotar/deshabilitar requiere el secreto
aleatorio de 32 bytes. Origin e IP reenviada no autorizan acciones.
RLS y grants mantienen las tablas accesibles solo a service_role.

El registro valida tamaño del cuerpo en streaming, estructura/token/secreto,
propiedad del token y conflictos. Rotación conserva el id. Actualizaciones
comparan token y estado previo y comprueban filas afectadas; índices únicos
resuelven carreras de nuevas altas. La baja deshabilita sin borrar historial;
es idempotente con prueba de posesión.

renew_only protege las renovaciones en segundo plano: no reactivan un opt-out
ni ganan una carrera con revocación. Rehabilitar exige subscribe explícito.
Flutter conserva el secreto ante respuesta perdida y después de la baja;
el token cacheado solo existe mientras la suscripción esté confirmada.
Si el registro remoto desapareció, el opt-in puede solicitar un nuevo desafío.
La cabecera, Firebase/VAPID y service worker /cliente/tuk/ se conservan.
No se cambiaron reservas, tarifas, mapas ni UI/negocio de Conductor.
Se retiraron el segundo emisor propuesto y su cron, y el SQL duplicado Cliente.

## Verificación comprobada por Codex

Resultados finales y commits se registran en RESULTS.md al cerrar las pruebas.
Pruebas locales con tokens/secretos sintéticos y fetch simulado; sin push real.
La validación SQL usa PostgreSQL en memoria mediante PGlite 0.3.14 bloqueado;
no se conecta a Supabase. También se comprueban los entrypoints reales contra
@supabase/server@1.5.2 y lockfiles; el mock del wrapper solo se usa en tests.

## Límites y verificación independiente pendiente

- Concurrencia SQL con varias sesiones PostgreSQL reales y carga sostenida:
  PGlite comprueba SQL/leases/deduplicación secuencialmente; los mocks simulan
  workers concurrentes, no demuestran locks de dos conexiones remotas.
- Recepción visible en Android/navegador cerrado, Turnstile real y registro en
  Edge: pendientes, requieren activación posterior autorizada.
- Entrega es al menos una vez. Si FCM acepta y falla la confirmación en DB puede
  haber un reintento; el tag del worker agrupa por cambio, no prueba recepción
  exactamente una vez. Una baja no cancela una petición FCM ya en vuelo.
- Las consultas DB tienen latencia propia; el presupuesto comprueba antes de
  enviar, pero no garantiza duración total ante una red DB bloqueada.
- Los lockfiles fijan la resolución local actual; no se obtuvo el árbol completo
  de dependencias transitorias del paquete vivo. Verificar en staging antes de
  una futura sustitución operativa del bundle.
- La RPC ya aplicada no reclama filas con cinco intentos, incluso si un worker
  cayó durante el quinto lease. Su reconciliación/monitorización debe revisarse
  en staging; no se alteró esa RPC remota ni se agregó limpieza de datos.
- La compilación local usa Firebase existente, clave Supabase pública válida y
  clave oficial Turnstile de prueba, con MAPBOX_PUBLIC_TOKEN omitido. Valida
  build/base/assets, no mapas externos ni configuración de producción.

closing-evidence.json registra la lectura final: servicio v16/hash intactos,
un cron, trigger ausente, 0 suscripciones, 0 entregas y 126 registros históricos.
No se aplicó SQL, se invocó claim ni se envió ninguna notificación en producción.
La migración pendiente debe revisarse y probarse antes de registrarla para
activación. El rollback del emisor requiere usar v16, no main antiguo.

## Auditoría independiente local (PowerShell)

Desde el worktree Admin:

```powershell
node tests/verify_shared_push.mjs
npm --prefix tests ci --ignore-scripts --no-audit --no-fund
npm --prefix tests test
git diff d5c012a7c7c04b1d35822a98edb08bfbabc98a1c --stat
git diff d5c012a7c7c04b1d35822a98edb08bfbabc98a1c -- supabase/migrations
```

El primer script solo lee fuentes y Git de los worktrees nuevos. npm instala
solo la dependencia de tests y ejecuta SQL en memoria, sin URL de base de datos.
La descarga de npm requiere red; no ejecuta scripts de instalación. Los diffs
permiten revisar el cambio sin tocar branches/metadatos ajenos ni producción.
Las pruebas Deno/Flutter exactas están en RESULTS.md y en los README de cada repo.
No ejecutar worktree prune/remove ni migraciones remotas durante esta auditoría.

Después de revisión independiente, el propietario decidirá expresamente una
fase de staging/activación: registro, emisor compartido, trigger y dispositivo
real. Este paquete no autoriza merge, push, despliegue ni migración remota.

Referencias técnicas revisadas:
[changelog Supabase](https://supabase.com/changelog) y
[autenticación en Edge](https://supabase.com/docs/guides/functions/auth).
