# Mi TukTuk — especificación funcional y técnica

Estado: borrador de implementación. La vista previa privada de Admin no crea perfiles públicos ni enlaces activos. No aplicar cambios al despacho productivo hasta superar las pruebas integradas.

## Objetivo y experiencia

Cada conductor habilitado podrá autorizar un perfil promocional y compartirlo. Enlace propuesto: https://www.vrixora.com/cliente/tuk/?conductor=<codigo-publico-opaco>. La URL de entrada podrá ser una página HTML con Open Graph dinámico por conductor y redirección a la WebApp, si el hosting estático actual no genera metadatos por enlace. No usar el UUID interno ni el código existente de referidos de licencias. QR apunta al mismo enlace. Un enlace caducado, revocado o inválido abre el flujo general sin prioridad y sin exponer datos.

Tarjeta: foto autorizada, nombre público elegido, modalidad operativa, logo oficial, QR real, mensaje “Tu conductor de confianza. Toda una flota a tu disposición”. Formatos 1080×1080 y 1080×1920. No publicar teléfono personal, correo, carnet, licencia, matrícula, GPS, datos bancarios ni URL privada de almacenamiento. Mostrar “verificado” sólo si existe una señal de verificación real definida y comprobada; no inferirlo del estado activo. Si no hay foto autorizada usar una silueta, nunca una foto de otra persona. Texto y enlace compartibles separados de la imagen para permitir clic desde Facebook/WhatsApp. La miniatura social debe ser obtenible sin sesión, pero sólo con el alcance consentido.

## Diseño de datos (propuesto, aún no migrado)

- app_private.marketplace_driver_promo_profiles: project_id, driver_user_id, opaque_code aleatorio de alta entropía único, public_name, public_photo_asset_ref autorizada, consent_version, consented_at, revoked_at, enabled, updated_at. Clave por proyecto/conductor y vínculo a driver_profiles. Separar consentimiento del permiso operativo de Admin; una autorización del administrador no sustituye consentimiento del conductor. Por defecto desactivado.
- app_private.marketplace_driver_promo_attribution: project_id, service_request_id único, job_id único cuando exista, source_profile_id, preferred_driver_user_id, priority_until, phase, release_reason, created_at, released_at, accepted_at. Un registro por solicitud, nunca una carrera adicional. Atribución histórica separada de asignación final. No aceptar preferred_driver_user_id ni timestamps enviados por cliente.
- Eventos mínimos agregables: visita deduplicada (no IP en métricas visibles), solicitud creada, carrera asignada al recomendado, carrera asignada a otro, carrera finalizada/liquidada. Separar test de real y excluir cancelaciones de conversiones completadas. Sin recompensas automáticas ni cambios de comisiones.
- RLS en tablas, sin acceso directo desde anon/authenticated. RPC de conductor autenticado verifica auth.uid() y pertenencia al proyecto; RPC admin requiere permiso marketplace.view para consulta y permiso de gestión correspondiente para administración. RPC públicas de resolución/atribución sólo por gateway con service_role y rate limiting. No exponer IDs internos al cliente. Retención propuesta: eventos crudos 90 días, agregados históricos; confirmar política antes de activar. Revocación inmediata en resolución y despacho; borrar/invalidar copias controladas, avisar que redes pueden conservar imágenes ya compartidas.

## Integración con el despacho real

Contrato existente confirmado en base de datos de producción:
- app_private.marketplace_driver_can_receive_job(project_id, driver_user_id, vehicle_id, job_id): elegibilidad de oferta.
- app_private.marketplace_dispatch_candidate_state(project_id, driver_user_id, vehicle_id, job_id): radio, GPS de hasta 300 segundos, valoración, expansión temporal y allowed.
- app_private.marketplace_dispatch_policy_allows(...): decisión de aceptación; enforce_marketplace_dispatch_acceptance protege transición.
- app_private.enqueue_marketplace_job_offer_wave(job_id) y dispatch_marketplace_offer_waves(): outbox y expansión.
- public.list_my_marketplace_available_jobs(...), public.accept_job(job_id, vehicle_id, idempotency_key): listado y aceptación concurrente.
- marketplace-customer-gateway: create_request -> create_marketplace_customer_request; publish -> publish_marketplace_customer_job_v2. No cambiar contratos de clientes antiguos.

En create_request, el gateway valida código promocional mediante RPC específica (sesión, proyecto, modalidad, consentimiento), y registra atribución junto con la creación idempotente en una única transacción. Mantener el cálculo de distancia/precio y las validaciones existentes. El perfil preferido sólo se usa si el cliente no desactiva prioridad. No almacenar el código en el JSON libre como autorización; cualquier campo de preferencia enviado por cliente es no confiable.

En publicación de carrera inmediata: bajo bloqueo de la carrera, confirmar conductor activo, asignación activa, vehículo operativo, accepting_jobs e is_available, GPS reciente y reglas geográficas/servicio/capacidad/finanzas existentes; no está en otro trabajo activo. Si es elegible, fijar prioridad de 30 s (propuesta configurable, 0 desactiva). Sólo él recibe ofertas y puede aceptar en ventana, sin relajar la política existente. Si no es elegible, pasar inmediatamente a búsqueda normal. Si rechaza, se desconecta, pierde elegibilidad o transcurre la ventana, liberar preferencia de forma monotónica; no reabrirla. El resto de la flota sigue políticas normales, sin volver a crear solicitud. Debe existir un disparador/worker de liberación por deadline capaz de despertar incluso sin cliente conectado; verificar periodicidad actual de wave scheduler antes de prometer 30 s exactos. Usar hora del servidor.

El filtro debe aplicarse de forma coherente al listado de carreras, push/outbox y aceptación transaccional. No basta con ordenar visualmente el listado; ni con notificar sólo al recomendado. No cambiar estado published/accepted ni la regla de 24 h. El rechazo específico (si existe contrato) es idempotente y libera ventana; timeout es respaldo incluso si push falla. Usar bloqueos/estado de carrera existentes y claves de deduplicación. No realizar aceptación automática en nombre del conductor. Las solicitudes programadas conservan su comportamiento; atribución sí, prioridad al despacho efectivo únicamente después de diseñar y verificar su integración; primera versión puede desactivar prioridad para programadas e informar al cliente.

## Aplicaciones

Admin: ficha 360 > Mi TukTuk. Vista previa real (incluida en este PR), formatos, configuración de perfil con estado de consentimiento, copia de enlace, exportación PNG, vista previa social, desactivación por seguridad y métricas reales. En ficha carrera mostrar origen Mi TukTuk y si terminó en recomendado/flota. No mostrar datos ficticios en producción.

Conductor (tuktuk-control/flutter_app): “Mi TukTuk” en perfil; consentimiento explícito previo, nombre público y foto aprobados, previsualización, compartir mediante Web Share/clipboard según capacidades, descargar PNG, revocar. No modificar referido de conductores ni APK hasta autorización.

Cliente (tuktuk-cliente): leer parámetro conductor antes de inicializar sesión; conservar selección sólo para la solicitud actual durante login/reintentos, limpiar al cancelar/finalizar o si el cliente desmarca prioridad. Obtener perfil público del gateway con límite específico; no descargar GPS del recomendado. Tarjeta compacta, nombre/foto/vehículo, opción “Buscar toda la flota” y mensajes diferenciados de búsqueda. Si no resuelve, continuar sin bloquear. No aumentar tiempos de arranque ni forzar instalación. Pasar código al endpoint de creación v3, conservar create_request anterior para otros clientes. Fallback WhatsApp Lite: informar que es solicitud para gestión humana; no prometer prioridad automática hasta que su flujo Admin esté conectado.

## Pruebas bloqueantes antes de producción

1. Consentimiento/privacidad: enlace sin consentimiento, revocado, suspendido, otro proyecto y manipulado; ningún dato privado en JSON/OG; cliente no puede imponer un UUID preferido ni alterar ventana; permisos de conductor y admin; imágenes y QR reales.
2. Prioridad: recomendado elegible es único visible/notificado y capaz de aceptar; otro no puede aceptar durante ventana; recomendado incompatible, sin señal, descansando, ocupado, suspendido o fuera de radio -> flota inmediata; timeout/rechazo -> flota una vez; doble aceptación simultánea -> un ganador; carrera normal y modo prueba sin modificaciones.
3. Idempotencia: reintentar create/publish y eventos no duplica carreras, atribución, avisos ni comisiones. Conservar tarifa CUP, pago efectivo/transferencia, cancelación, valoración y cierre.
4. Programadas, clientes antiguos, red débil, cambio de sesión, enlace inválido, recarga, revocación durante espera.
5. Web: Facebook/WhatsApp OG comprobado desde un cliente no autenticado; 1080×1080/1920 exportación sin CORS ni fotos rotas; responsive. Verificar con teléfono real. No usar APK.
6. CI de los tres repos, SQL en PostgreSQL aislado, pruebas de contrato gateway y concurrencia. Despliegue por orden: backend compatible con flag apagado, web Cliente y Conductor, Admin, prueba controlada con conductor que consienta; activar flag sólo tras validar URLs y eventos. Revertir desactivando flag sin perder solicitudes ni históricos. No publicar desde workflows obsoletos.

## Entrega actual

Vista previa privada de la tarjeta en ficha 360 con foto registrada y modalidad real. Dos formatos, advertencia de borrador, sin QR funcional o enlaces ni publicación de fotos. El resto de este documento define la siguiente implementación y sus criterios de aceptación. No se han aplicado migraciones, cambios de tarifas ni cambios de despacho.
