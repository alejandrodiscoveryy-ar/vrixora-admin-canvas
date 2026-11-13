# TukTuk · Confort como categoría comercial de Auto — preimplementación

Fecha: 2026-11-11. Estado: **especificación técnica propuesta, sin cambios de ejecución**. Rama aislada. No habilitar producción por incorporar este documento.

## Decisión comercial autorizada

- Añadir **Confort** como nivel comercial del servicio de pasajeros en **Auto**.
- **No** crear otro vehículo al conductor ni sustituir `vehicles.category_code = 'light_car'`.
- Mantener **Auto** como servicio normal y Confort como servicio diferenciado.
- Activar únicamente cuando existan autos aprobados, tarifa comercial competitiva y pruebas de punta a punta satisfactorias.
- Revisar antes los costos y los recorridos; **no** activar por defecto incremento de 10–20 %, solo orientación inicial de análisis.
- No modificar las tarifas vigentes de Moto, Bicitaxi, Triciclo y Auto en esta etapa.

## Evidencia verificada (11-11-2026)

- Supabase TukTuk: 13 vehículos `light_car` registrados sin baja lógica; 12 con `marketplace_status='active'`. **Ninguno se presume Confort**.
- `vehicle_categories` incluye `light_car`, no `comfort`. La app Cliente presenta únicamente `motorcycle`, `bicitaxi`, `tricycle`, `light_car`.
- `marketplace-map-gateway` calcula los cuatro precios usando `preview_marketplace_customer_quote_v3`; cotejar `route_quote`, `price_quote` y `create_request`.
- `marketplace_driver_can_receive_job` hoy exige que la categoría física del vehículo coincida con la pedida, pero **no** comprueba elegibilidad Confort.
- `enqueue_marketplace_job_offer_wave` llama a `marketplace_driver_can_receive_job`; `marketplace_dispatch_candidate_state` y `enforce_marketplace_dispatch_acceptance` componen la selección y aceptación.
- `list_marketplace_published_modalities` restringe pasajeros a cuatro categorías. El catálogo público debe reconocer Confort como **nivel**, no como nueva categoría física.
- La tarifa activa de Auto es `base_price_usd=0.8`, `per_km_price_usd=0.64`, `minimum_price_usd=2.4`; tasa automática registrada 910 CUP/USD y redondeo hacia arriba a 100 CUP. **Estos valores no son una propuesta de tarifa Confort**.

## Contrato técnico propuesto

### 1. Identidad y elegibilidad

- Modelo lógico: `vehicle_category_code='light_car'` y `commercial_tier='comfort'` cuando aplica. Auto normal conserva `commercial_tier='standard'` o ausencia compatible.
- Registrar aprobación por vehículo dentro de un proyecto, no por conductor: estado pendiente/aprobado/revocado; fecha, auditor y comprobación de requisitos (aire acondicionado funcional, estado técnico, limpieza, cinturones, servicio y calidad verificados).
- Solo un administrador autorizado podrá aprobar/revocar; conductor no podrá escribir su aprobación ni elegir Confort unilateralmente.
- Revocación inmediata para **nuevas** ofertas Confort, sin alterar las carreras ya aceptadas; mantener historial/auditoría.
- Mantener la regla `un conductor — un vehículo`, sin duplicar `vehicles`, `vehicle_categories` ni inscripciones.

### 2. Tarifas y experiencia

- Definir tarifa **independiente** de Confort en USD con mínimo/base/km y cálculo servidor CUP; mantener tasa, redondeo y desglose verificables. La diferencia frente a Auto debe resultar de tarifas aprobadas, **no** de un multiplicador oculto en la interfaz.
- Añadir simulación 3, 5, 8, 10 y 15 km y comparación con mercado. No usar la comparación de dos rutas distintas como prueba definitiva de paridad.
- Cliente: quinta opción «Confort» junto a las cuatro actuales, con descripción «Auto climatizado y verificado» y precio propio; accesible y responsive.
- No mostrar una cotización inventada si falta configuración, verificación de ruta o tarifa publicada. Si Confort está inactivo/no hay disponibilidad, mostrar estado comprensible sin permitir una solicitud engañosa.
- Conductor: marcar claramente solicitud Confort en tarjeta, aviso y detalle; no exigir registrar un segundo auto.
- Administración: lista de autos, filtro Confort, control de aprobación y revocación con auditoría; sección tarifaria y control separado de publicación.

### 3. Contratos y fronteras obligatorias

- Aplicar validación del nivel comercial tanto al calcular precio como **al crear la solicitud**. La cotización autorizada debe concordar con `commercial_tier`, ruta, vehículo físico y tarifa vigente.
- Persistir el nivel comercial en la solicitud y en la carrera, garantizando que no desaparezca durante el despacho, aceptación, conclusión, valoración, auditoría ni atención al cliente.
- **Fail closed:** si una solicitud pide Confort, `marketplace_driver_can_receive_job` debe rechazar cualquier auto sin aprobación Confort del proyecto. No basta filtrar la tarjeta del cliente.
- Incluir control también en aceptación y vistas/listados de carreras para no dejar bypass por solicitudes antiguas, ejecución de radar desactivado, WhatsApp, atención humana o clientes previos.
- Mantener visibilidad compatible para los conductores y clientes que no conocen Confort: solicitudes normales seguirán funcionando con `light_car`.
- No alterar comisiones, cuenta/billetera, valoraciones ni notificaciones existentes sin verificar sus contratos.

### 4. Seguridad

- Las aprobaciones deben ser persistidas por servidor, vinculadas a proyecto+vehículo, nunca fiarse de un valor enviado por Cliente o Conductor.
- Políticas RLS y permisos de lectura/escritura mínimos; no exponer decisiones administrativas ni datos sensibles en catálogo público.
- Evitar `SECURITY DEFINER` expuesto sin comprobación de permisos y `search_path` seguro.
- Nuevas funciones y migraciones deben ser incrementales, auditablemente reversibles y sin edición de datos existentes.

## Orden de implementación y cierre por etapa

**A · Modelo y protección (cerrar antes de UI):**
- Modelo de elegibilidad Confort por vehículo y estado desactivado por defecto.
- Funciones servidor de consulta/gestión protegidas, pruebas de RLS.
- Cobertura completa de cotización, creación, despacho, notificación y aceptación. Rechazar Confort no autorizado en backend incluso si cliente está manipulado.
- Pruebas de regresión que confirmen Auto normal y otras modalidades intactas.

**B · Administración:**
- Pantalla de evaluación/aprobación y auditoría; tarifa Confort independiente en borrador.
- Control de visibilidad explícito, independiente de aprobación del vehículo y publicación de la tarifa.
- Mostrar cero autos habilitados al inicio. No convertir automáticamente los 12 activos.

**C · Cliente y Conductor:**
- Selector Confort en Cliente condicionado por publicación y cotización válida, diferenciación clara de Auto.
- Conductor informa nivel Confort en oferta, confirmación y carrera; sin cambiar categoría física.
- Pruebas de responsividad y compatibilidad WebApp/APK instalada; no generar APK sin autorización.

**D · Pruebas integradas y lanzamiento con aprobación expresa:**
- Simular 3/5/8/10/15 km y comparar resultados reales de motor y mapa; validar origen/destino similares y ruta.
- Caso positivo: auto aprobado recibe, acepta y finaliza Confort; cliente ve precio acordado.
- Casos negativos: auto normal NO recibe ni acepta Confort; vehículo revocado deja de recibir; sin tarifa, sin vehículo aprobado, modo sin radar, llamada directa y WhatsApp no saltan protección.
- Repetir pruebas completas de Auto estándar, Moto, Bicitaxi, Triciclo, Carga y Mensajería.
- Revisar logs, permisos, CI y prueba en WebApps antes de proponer publicación.
- **Sin merge a main, cambios en Supabase remoto, despliegues o APK** sin autorización expresa del propietario.

## Riesgos a controlar

1. **Seguridad del despacho:** una UI nueva sin validación servidor permitiría ofertas Confort a vehículos no verificados.
2. **Precios excesivos:** copiar tarifa Auto y aplicarle recargo empeoraría la desventaja comprobada en las capturas.
3. **Contrato de datos:** crear categoría física `comfort` rompería coincidencia exacta con autos `light_car` y la regla un vehículo/conductor.
4. **Compatibilidad:** clientes y conductores anteriores desconocen el campo comercial; introducirlo como extensión compatible.
5. **Disponibilidad:** publicar Confort antes de tener autos aprobados induciría solicitudes sin conductor.

## Verificación de este documento

Este archivo describe la implementación; **no significa que Confort esté desarrollado ni probado**. Se debe actualizar el documento maestro cuando cada etapa tenga evidencia: commits, PR, pruebas estáticas, integración y producción diferenciadas.
