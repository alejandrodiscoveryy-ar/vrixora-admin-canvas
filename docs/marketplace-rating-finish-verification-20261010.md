**Informe único — cierre por primera valoración, 10 de octubre de 2026**

Los tres repositorios permanecen en `feat/ride-unified-flow-20261008`. Se conservaron los cambios existentes. No se hicieron commits, push, merge, despliegues, cambios en `main`, conexiones a Supabase remoto ni aplicaciones de migraciones. Las funciones SQL y el gateway quedan como cambios locales pendientes de revisión y validación aislada.

Conductor y Cliente abren directamente su formulario de valoración al pulsar «Finalizar carrera». No se llama a la RPC de cierre antes de enviar la valoración. Abandonar el formulario sin enviarlo conserva la carrera abierta. Se reutilizaron los formularios existentes y la pantalla de seguimiento; el Cliente dispone ahora de un historial paginado porque no existía un acceso a sus carreras anteriores. Ambos participantes pueden enviar su valoración pendiente después de un cierre de la otra parte o de Admin.

Las dos RPC de valoración conservan sus firmas publicadas. El código nuevo valida identidad, estrellas y texto, bloquea la misma fila de carrera, inserta la valoración y llama al núcleo de liquidación dentro de la misma transacción. No captura errores de liquidación: PostgreSQL debe revertir también la valoración si falla el cierre. La segunda valoración encuentra `settled` y no vuelve a entrar en el débito. Se mantienen las restricciones únicas existentes por carrera en valoraciones y movimientos de comisión. El replay con la misma clave y contenido devuelve la valoración existente; también se admite recuperar el mismo contenido con otra clave tras reiniciar la aplicación. Una clave reutilizada para una operación diferente sigue siendo rechazada.

Admin conserva el cierre excepcional con motivo obligatorio, permisos `marketplace.manage` y `payments.manage`, y eventos que registran actor y motivo. No se cambiaron tarifas, porcentajes, cálculos de comisión, billeteras ni reglas de incidencias. Se conservaron la conciliación acotada con cursores persistidos, la recuperación de ingresos antiguos, los identificadores compartidos de vehículos, la exclusión de `is_test=true` en ingresos de Control y el tratamiento de `test_deleted_at`. No se elimina automáticamente ningún ingreso anterior.

**RPC anteriores y APK**

`finish_my_marketplace_job`, `finish_marketplace_customer_job` y el `complete_service` de `advance_my_marketplace_job` pasan por el núcleo protegido. Para una carrera abierta, los cierres de participantes sin su valoración persistida reciben `RATING_REQUIRED`. `complete_service` ya no conserva un débito independiente. Las demás acciones anteriores de avance conservan sus transiciones. El gateway de Cliente mantiene las operaciones existentes y agrega únicamente `history`, con categoría de lectura; el cierre y el nuevo historial de Cliente requieren el gateway de servidor. Las RPC administrativas de incidencias existentes siguen exigiendo motivo y auditoría y conservan su comportamiento excepcional.

Las APK que primero ejecutan una RPC de cierre y después abren la valoración no pueden mantener ese orden bajo la nueva regla: deben actualizarse. Conservación de firmas no significa compatibilidad funcional de ese flujo antiguo. Las versiones anteriores todavía pueden valorar una carrera ya liquidada por otra parte o Admin. Se analizaron los contratos y el código local, pero no se ejecutaron APK publicadas ni pruebas contra el backend instalado. El gateway con `history`, el SQL nuevo y las aplicaciones requieren una futura entrega coordinada; no se realizó esa entrega.

La regla anterior del PRD, líneas 618–622, exigía valoración posterior a `settled`. Esta implementación sigue la instrucción explícita más reciente del propietario: la primera valoración produce `settled` atómicamente. Se registra aquí la diferencia; no se modificó el PRD ni sus copias.

**Verificación ejecutada por Codex**

| Comprobación | Resultado final |
| --- | --- |
| Control: `marketplace_jobs_refresh_test.dart`, `marketplace_records_read_only_test.dart`, `marketplace_models_test.dart` | 55 pruebas aprobadas, salida 0 |
| Cliente: suite Flutter completa, `test --no-pub --reporter expanded` | 51 pruebas aprobadas, salida 0 |
| Control: `analyze --no-pub --no-fatal-infos` | Salida 0; sin errores ni warnings; un aviso informativo anterior `prefer_const_declarations` en `screens.dart:3262` |
| Cliente: `analyze --no-pub --no-fatal-infos` | Sin incidencias, salida 0 |
| SQL: `20261008220000_marketplace_unified_finish_static.ps1` | 35 comprobaciones de código aprobadas |
| Git: rama y `diff --check` de los tres repositorios | Rama correcta y diferencias sin errores de espacios |
| SQL: delimitadores de funciones | Pares completos; no sustituye compilación en PostgreSQL |

Las pruebas Flutter nuevas comprueban apertura directa, abandono, rechazo de envío sin estrellas, reintento tras desconexión con la misma clave, ausencia de llamada al cierre independiente, y valoración pendiente desde historial después de cierre por la otra parte o Admin. Las pruebas de conciliación ejecutadas comprueban recuperación acotada, reanudación del cursor, errores independientes, exclusión de pruebas, preservación de ingresos y deduplicación. La prueba con Hive y `HistoryScreen` comprueba que el ingreso aparece en Registros al seleccionar el vehículo cuyo ID coincide exactamente con el asignado en Marketplace, y desaparece de esa vista al seleccionar el vehículo original.

Estas pruebas de interfaz usan servicios simulados. No demuestran una comisión real única, atomicidad PostgreSQL ni simultaneidad financiera. El primer intento de las pruebas nuevas detectó un controlador de texto destruido antes de acabar la animación del formulario de Conductor. Se corrigió esperando la retirada de la ruta y la repetición final aprobó las 55 pruebas específicas.

Logs locales: [Control pruebas](D:/TukTuk-Unificado-20261008/tuktuk-control/flutter_app/definitive-specific-tests.log), [Control análisis](D:/TukTuk-Unificado-20261008/tuktuk-control/flutter_app/definitive-analyze.log), [Cliente suite completa](D:/TukTuk-Unificado-20261008/tuktuk-cliente/definitive-all-tests.log), [Cliente análisis](D:/TukTuk-Unificado-20261008/tuktuk-cliente/definitive-analyze.log), [SQL estático](D:/TukTuk-Unificado-20261008/vrixora-admin-canvas/definitive-sql-static.log).

**Bloqueo real y verificación independiente pendiente**

No existe un PostgreSQL aislado disponible en este equipo: `psql`, `postgres` e `initdb` no están en PATH, no hay instalación en `C:\Program Files\PostgreSQL`, y Docker no puede conectarse a `dockerDesktopLinuxEngine`. No se usó una base remota como alternativa. El SQL no se aplicó, compiló ni ejecutó en PostgreSQL. No se certifica el cierre financiero definitivo.

En una base local desechable, con esquema y usuarios de prueba, quedan pendientes los escenarios financieros: Conductor → Cliente; Cliente → Conductor; Admin → ambas valoraciones; intentos simultáneos de los tres actores; reenvíos tras respuesta perdida; rollback de valoración cuando falla la liquidación; rechazo de cierres antiguos sin valoración; comisión única con las instantáneas existentes; promoción real gratuita; carreras de prueba y eliminadas; e historial e ingreso del vehículo asignado tras reconexión. Para cada escenario deben verificarse las filas de ambas tablas de valoraciones, `jobs`, `job_assignments`, `commission_reservations`, `wallet_transactions` y `job_events`, antes y después. Las carreras promocionales reales deben generar ingreso de viaje en Control aunque la comisión sea cero; `is_test=true` no debe generarlo. También falta probar APK antiguas y nuevas contra ese backend aislado.

El propietario puede repetir externamente estas comprobaciones gratuitas en PowerShell:

```powershell
Set-Location 'D:\TukTuk-Unificado-20261008\vrixora-admin-canvas'
& .\supabase\verification\20261008220000_marketplace_unified_finish_static.ps1
docker info
```

El primer comando solo lee código SQL y debe imprimir 35 `PASS`; no conecta con una base. El segundo solo consulta el motor Docker y permite comprobar si el bloqueo local ya está resuelto. No configura PostgreSQL ni ejecuta operaciones financieras. Las pruebas financieras posteriores deben usar exclusivamente una base local aislada y datos ficticios.

**Archivos modificados en esta tarea**

Control:

- [marketplace_service.dart](D:/TukTuk-Unificado-20261008/tuktuk-control/flutter_app/lib/data/marketplace_service.dart): consulta de valoración propia por carrera.
- [marketplace_jobs.dart](D:/TukTuk-Unificado-20261008/tuktuk-control/flutter_app/lib/presentation/marketplace_jobs.dart): valoración directa, reintentos, valoración pendiente en historial y ciclo de vida del formulario.
- [marketplace_jobs_refresh_test.dart](D:/TukTuk-Unificado-20261008/tuktuk-control/flutter_app/test/presentation/marketplace_jobs_refresh_test.dart): pruebas actualizadas y nuevas.

Cliente:

- [marketplace_customer_service.dart](D:/TukTuk-Unificado-20261008/tuktuk-cliente/lib/data/marketplace_customer_service.dart): consulta de historial con sesión y cursor.
- [marketplace_customer_booking_flow.dart](D:/TukTuk-Unificado-20261008/tuktuk-cliente/lib/presentation/marketplace_customer_booking_flow.dart): acceso al historial desde el inicio del flujo existente.
- [marketplace_customer_tracking.dart](D:/TukTuk-Unificado-20261008/tuktuk-cliente/lib/presentation/marketplace_customer_tracking.dart): valoración directa, actualización del estado y lista paginada de historial.
- [marketplace_customer_finish_test.dart](D:/TukTuk-Unificado-20261008/tuktuk-cliente/test/domain/marketplace_customer_finish_test.dart): contrato de historial, sesión y cursor.
- [marketplace_rating_finish_test.dart](D:/TukTuk-Unificado-20261008/tuktuk-cliente/test/presentation/marketplace_rating_finish_test.dart): nuevo archivo con pruebas de valoración y navegación desde historial.

Admin/backend:

- [20261008220000_marketplace_unified_finish.sql](D:/TukTuk-Unificado-20261008/vrixora-admin-canvas/supabase/migrations/20261008220000_marketplace_unified_finish.sql): valoración y cierre en una transacción, protección de RPC anteriores y consultas de historial/valoración propia.
- [marketplace-customer-gateway/index.ts](D:/TukTuk-Unificado-20261008/vrixora-admin-canvas/supabase/functions/marketplace-customer-gateway/index.ts): operación de historial de solo lectura.
- [20261008220000_marketplace_unified_finish_static.ps1](D:/TukTuk-Unificado-20261008/vrixora-admin-canvas/supabase/verification/20261008220000_marketplace_unified_finish_static.ps1): comprobaciones estáticas adicionales.
- Este informe.

Los registradores de plugins de Control y Cliente y `src/routeTree.gen.ts` ya tenían modificaciones al comenzar; no fueron editados en esta tarea. No se corrigieron los errores históricos de TypeScript. La suite completa de Control no se ejecutó en esta tarea; se ejecutaron sus 55 pruebas específicas indicadas arriba.
