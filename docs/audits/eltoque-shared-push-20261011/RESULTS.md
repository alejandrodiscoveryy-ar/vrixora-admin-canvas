# Integración elTOQUE — cierre de desarrollo

La corrección final del propietario sustituye la distribución anterior: únicamente Admin y Cliente se publican en la rama codex/eltoque-shared-push-20261011. No se modifica main ni producción.

## Entrega

Admin mantiene supabase/functions/send-push-notifications y su configuración verify_jwt=false. Se reutilizó el trabajo local del servicio y sus pruebas sin cherry-pick del commit Conductor. El único servicio operativo sigue siendo Supabase v16; la futura activación sustituirá su bundle usando el mismo Firebase y cron tuktuk-push-dispatch de cinco minutos.

Cliente mantiene cabecera elTOQUE, alta/baja voluntaria sin cuenta y Turnstile en altas nuevas. marketplace-customer-push-registration solo registra dispositivos; no envía notificaciones.

Conductor 79919fd8d18edb0c286d91d6ea29a125323f7d37 queda aislado, sin edición ni publicación. Sus pruebas previas de consumidor (19 PASS) son evidencia histórica; en este cierre la compatibilidad se prueba desde Admin con la igualdad de fuentes v16 y las regresiones del handler completo.

## Pruebas comprobadas por Codex

- Admin SQL local PGlite: 11 PASS, sin conexión remota.
- Admin emisor: 39 PASS (17 núcleo, 14 cola Cliente, 8 handler); sin permiso de red, credenciales sintéticas.
- Comparación v16 y aislamiento de registro/cron/migraciones: 2 PASS.
- Entrypoints reales Admin y Cliente: deno check PASS con dependencias fijadas.
- Cliente registro/Turnstile: 12 PASS.
- Cliente analyze: exit 0, un info preexistente en marketplace_vector_map.dart:232.

- Cliente suite completa Flutter: 70 PASS; build web release y ensayo Wasm PASS. Base /cliente/tuk/ y SHA256 main.dart.js 0FA88AB61C0105119DE86654B2D4BAB73D6B3D9BB1DCE937BF259673EE3E06D9.
- Admin modelo financiero existente: 8 PASS; es un modelo de especificación, no prueba SQL multisesión.
- Revisión de credenciales privadas: sin valores privados en los cambios. Los delimitadores PEM pertenecen al parser y al generador sintético del test.
- Workflows de despliegue de Admin/Cliente requieren ejecución manual; no se invocan al publicar esta rama.
- Admin lint completo: FALLÓ, 39396 errores y 10 warnings (incluye abundantes CRLF/formato en archivos sin cambios y las fuentes Deno trasladadas). No se aplicó un formateo masivo ni se alteró v16 para ocultar el resultado. Log local ignorado: build-lint.local.
- Lint de contraste excluyendo únicamente el nuevo directorio del emisor: 38878 errores y 10 warnings. Ese contraste no certifica la base histórica completa; distingue los 518 errores adicionales del directorio trasladado, cuya validación funcional y de tipos usa Deno. Log local ignorado: build-lint-existing.local.
- Admin build completo navegador/SSR/Nitro y guard: PASS, exit 0, BUILD_GUARD=OK (URL pública, publishable key, Trabajos, Integraciones, elTOQUE y Mapas). Se ejecutó con binario Vite local y variables públicas. Dos ejecuciones iniciales fallaron por resolución de dependencias y un EPERM transitorio del generador de rutas; la repetición final generó las rutas y completó todas las etapas. No se modificaron permisos ni configuración productiva.

Cliente final: b7e67a09140efde38b544da9e02d7d64276c3fba (incluye la implementación anterior 9e970855). El hash exacto de Admin se entrega en el mensaje final, evitando una autorreferencia dentro del commit.

Cliente publicado y comprobado en GitHub en la rama autorizada; main conserva b04da6ab812b1a731a17a7e70e238f6a48b460e9. Admin se publica únicamente después del commit de este cierre; la comprobación remota final figura en la entrega. Conductor conserva 79919fd aislado y main remoto bbc486415a56f7bbe4c471aff781bbc47550d737.

## Reproducción local independiente (PowerShell)

Admin, desde la raíz del worktree:

```powershell
node tests/verify_shared_push.mjs
node tests/customer_eltoque_sql.test.mjs
bun install --frozen-lockfile --ignore-scripts
bun run lint
bun run build:production-safe
```

El build guard necesita VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY públicas. Las instalaciones descargan dependencias; no alteran Supabase. Para el emisor, desde supabase/functions/send-push-notifications:

```powershell
deno check --config deno.json index.ts
deno test --config deno.test.json --allow-env=FIREBASE_SERVICE_ACCOUNT_JSON,TUKTUK_PUSH_DISPATCH_SECRET core_test.ts customer_test.ts dispatcher_test.ts
```

Cliente, desde su raíz:

```powershell
deno test --no-config --no-lock supabase/functions/marketplace-customer-push-registration/registration_test.ts
deno check --config supabase/functions/marketplace-customer-push-registration/deno.json supabase/functions/marketplace-customer-push-registration/index.ts
flutter analyze --no-pub --no-fatal-infos
flutter test --no-pub
flutter build web --no-pub --release --base-href /cliente/tuk/ --output build/eltoque-web-test --dart-define-from-file=build/test-public-defines.json
```

El JSON local ignorado usa solo valores públicos y Turnstile oficial de prueba; omite Mapbox. Este build sirve para validar código y assets, no para publicar configuración real.

## Pendientes de activación, por separado

- Auditoría independiente de los dos commits y aprobación posterior de staging/activación.
- Concurrencia SQL con sesiones PostgreSQL distintas, carga y límites de abuso.
- Smokes financieros existentes contra PostgreSQL 17 aislado: pendientes por ausencia de una instancia local activa (Docker no estaba iniciado). No se sustituyeron por pruebas contra producción.
- Conciliar el historial de migraciones, revisar el quinto lease abandonado y la selección de tasa previa USD/CUP de la RPC ya aplicada; no se modificó esa RPC remota.
- Validar dependencias del bundle en staging, configuración real de Turnstile y Firebase, registro/baja desplegado y recepción FCM visible (también navegador cerrado y permisos denegados).
- Activar posteriormente el registro, actualizar el mismo emisor y aplicar el trigger pendiente de Admin, solo con autorización expresa. No crear otro cron ni emisor.

Entrega es al menos una vez: FCM aceptado con confirmación DB fallida puede reintentarse. Revocar no cancela una petición FCM ya en vuelo. No hubo despliegues, migraciones remotas, cambios de cron ni push real en este trabajo.
