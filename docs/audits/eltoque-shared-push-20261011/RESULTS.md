# Resultados de desarrollo y auditoría — 11/10/2026

Estado: PREPARADO PARA AUDITORÍA LOCAL, NO ACTIVADO.
Todos los commits son locales; no hubo push, merge, despliegue o migración remota.
Rama independiente de cada repo: codex/eltoque-shared-push-20261011.

## Commits y worktrees

| Repo | Base | Commit entregado |
|---|---|---|
| Admin | d5c012a7c7c04b1d35822a98edb08bfbabc98a1c | HEAD del paquete de auditoría; hash en la entrega final |
| Conductor | bbc486415a56f7bbe4c471aff781bbc47550d737 | 79919fd8d18edb0c286d91d6ea29a125323f7d37 |
| Cliente | 9b740b2d35ff303c2c8d1477187e3ceed1051c23 | 9e970855f9fe16ed75916b0c88015c1a8273d4a0 |

Admin conserva además el preflight en 4ca5de78c3804db0031174e38e42e388c5bf8df3.
Los worktrees están en D:/Codex/vrixora-admin-canvas/.worktrees/
eltoque-admin, eltoque-conductor y eltoque-cliente.

## Pruebas ejecutadas por Codex

| Validación | Resultado final |
|---|---|
| SQL PostgreSQL en memoria: activación, no backfill, cambio real, deduplicación, RLS, grants, claims, lease, expiración, rollback | 11 PASS, 0 fallos |
| Igualdad del código existente Conductor con snapshot v16, y ausencia de segundo emisor/cron/migración automática/cambios Flutter Conductor | 2 comprobaciones PASS |
| Deno dispatcher: núcleo existente + cola Cliente + handler completo | 39 PASS (17 + 14 + 8), 0 fallos |
| Deno registro: Turnstile, alta, renovación, rotación, baja, secretos, conflictos, revocación y outage | 12 PASS, 0 fallos |
| Entrypoints reales de registro y emisor, con dependencias fijadas y lockfiles | deno check PASS, exit 0 |
| Flutter Conductor: push_notification_service y push_token_registration_coordinator | 19 PASS, 0 fallos |
| Flutter Cliente: suite completa | 70 PASS, 0 fallos |
| Flutter Cliente analyze --no-fatal-infos | exit 0; un info preexistente en marketplace_vector_map.dart:232, sin cambios en ese archivo |
| Flutter Web Cliente release local, base /cliente/tuk/ | PASS, exit 0; dry-run Wasm PASS |
| Git staged diff --check de Conductor y Cliente | PASS |
| Supabase cierre, solo lectura | versión/hash/cron/contadores preservados |

Entorno: Flutter 3.44.4, Dart 3.12.2, Deno 2.9.7, Node 24.20.0;
PostgreSQL en memoria PGlite 0.3.14. El servicio Docker local no estaba activo;
no se encendió ni se recurrió a producción para suplirlo.
La falta inicial de cache JSR se resolvió con un adaptador de asserts basado
en Node para ejecutar las pruebas existentes sin red; no se omitieron tests.

## Comandos reproducibles (PowerShell)

Admin:

```powershell
node tests/verify_shared_push.mjs
npm --prefix tests ci --ignore-scripts --no-audit --no-fund
npm --prefix tests test
```

Conductor, desde flutter_app/supabase/functions/send-push-notifications:

```powershell
deno check --config deno.json index.ts
deno test --config deno.test.json --allow-env=FIREBASE_SERVICE_ACCOUNT_JSON,TUKTUK_PUSH_DISPATCH_SECRET core_test.ts customer_test.ts dispatcher_test.ts
```

Conductor, desde flutter_app:

```powershell
flutter pub get --offline
flutter test --no-pub test/services/push_notification_service_test.dart test/services/push_token_registration_coordinator_test.dart
```

Cliente:

```powershell
deno test --no-config --no-lock supabase/functions/marketplace-customer-push-registration/registration_test.ts
deno check --config supabase/functions/marketplace-customer-push-registration/deno.json supabase/functions/marketplace-customer-push-registration/index.ts
flutter pub get --offline
flutter analyze --no-pub --no-fatal-infos
flutter test --no-pub
flutter build web --no-pub --release --base-href /cliente/tuk/ --output build/eltoque-web-test --dart-define-from-file=build/test-public-defines.json
Get-FileHash build/eltoque-web-test/main.dart.js -Algorithm SHA256
```

Los tests Deno no tienen --allow-net y usan únicamente credenciales sintéticas.
deno check/npm ci pueden descargar dependencias; no invocan servicios.
El JSON de defines es un artefacto local ignorado con valores solo públicos:
Supabase válido, Firebase existente y Turnstile oficial de prueba. No se incluyó
MAPBOX_PUBLIC_TOKEN. No usar este build para publicación.
Flutter produjo la advertencia de fuente CupertinoIcons faltante, ya ajena a
estos cambios; se preservó el alcance de mapas/UI.

Build final:

- main.dart.js SHA256: 0FA88AB61C0105119DE86654B2D4BAB73D6B3D9BB1DCE937BF259673EE3E06D9
- firebase-messaging-sw.js SHA256: DF3A96342EE3C1831A28B3A9F7C3310CDD6125BB4F5FF49FCE3B29767F9FA55F
- index.html: base href /cliente/tuk/; service worker propio presente.
- Local: eltoque-cliente/build/eltoque-web-test y build/build-verification.json.

## Pendiente, por separado

1. Auditoría independiente del propietario sobre los tres commits y los comandos
   anteriores. No equivale a las comprobaciones ya ejecutadas por Codex.
2. Concurrencia SQL con conexiones PostgreSQL distintas y carga sostenida.
   Los mocks no demuestran bloqueo real multisesión; PGlite validó SQL local.
3. Build y prueba con MAPBOX/Turnstile reales de la configuración aprobada.
4. Registro/baja sobre Edge desplegado, validación Turnstile real y recepción
   FCM visible en navegador/dispositivo, también cerrado y con permisos denegados.
5. Revisión del historial de despliegues/migraciones, límites de capacidad/abuso,
   transitorios npm del bundle vivo y quinto lease abandonado, antes de activación.

La futura activación exige autorización expresa. No ejecutar el SQL pendiente
ni desplegar funciones como parte de esta revisión. El rollback no borra datos;
para el emisor se preserva v16, no la copia antigua de GitHub main.

```
UN_SOLO_EMISOR=PREPARADO
CRON_NUEVO=NO
PRODUCCION_MODIFICADA=NO
PUSH_REAL=NO_PROBADO
CONDUCTOR_SIN_REGRESIONES=VERIFICADO
```

VERIFICADO se limita a comparación de fuentes v16 y pruebas locales del alcance
afectado. No afirma validación operativa de la ampliación en producción.
