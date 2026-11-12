# Reglas específicas por producto

Base: decisiones de diseño conocidas al 12 de noviembre de 2026. Verificar main, PRD y producción. El PRD y contratos vigentes gobiernan negocio.

## TukTuk Cliente
Objetivo: solicitar transporte con confianza y pocos pasos.
- Mapa protagonista y consistente entre reserva/seguimiento. Icono original recuperar GPS, atribuciones abajo, destino naranja, ruta, tiempo y km visibles sin ocultar tarjetas.
- Cabecera reducida: Pide tu transporte no desplaza modalidades ni precios. Tarjetas horizontales compactas, icono lateral, nombre, precio, selección evidente. Mantener modalidades vigentes; no agregar Confort ni cambiar tarifas por diseño.
- Km y duración cerca del trayecto antes de datos secundarios. Precio final CUP con cálculo existente; no inventar descuentos/conversiones.
- Pago: selector excluyente Efectivo / Transferencia visible y accesible, elección antes de confirmar y persistida según contrato. No asumir disponibilidad ni cambiar reglas.
- Disponibilidad: puntos azules con halo blanco de conductores reales trabajando y elegibles. Actualizar sin parpadeos; retirar al dejar de ser elegibles. GPS antiguo o desconexión no son ubicación actual. No publicar posiciones exactas sin autorización; preferir aproximadas y sin identidad antes de asignación según privacidad aprobada. No crear puntos ficticios; estado vacío honesto.
- Conductor asignado: marcador diferenciado por forma, tamaño y etiqueta; avatar solo autorizado. Ubicación autorizada, última actualización cuando relevante; coherente con ruta y separado de capa general. No garantizar tiempo real sin señal.
- Cancelación directa sin conductor; con conductor causas según flujo. Volver al inicio accesible. Preservar valoración, agradecimiento, Lite WhatsApp y recuperación.
- Safe areas, teclado, panel inferior desplazable/expandible sin bloquear mapa; autenticación con vía clara de continuación.

## TukTuk Conductor
Objetivo: rapidez sin distracciones ni dependencia de conexión perfecta.
- Trabajar/Descansar grande, estado evidente y confirmación visual. Sin banners o cabeceras que lo oculten.
- Oferta: precio, pago, origen/destino y datos imprescindibles antes de aceptar; acciones y contacto del cliente accesibles según permisos.
- Flujo acordado aceptar → avisar llegada (claxon manual y automático cuando proceda por proximidad/conexión) → finalizar/valorar. Mantener estados y transiciones internas; no confundir llegada con cierre.
- Avatar circular y prioridad de foto vigente. No alterar documentos, exenciones, inscripción, un vehículo operativo por conductor.
- Sincronización offline discreta pero visible; no asegurar guardado sin confirmación. Conflictos según contrato y última modificación; no sobrescribir por UI.
- Evitar interacciones largas conduciendo. Acciones grandes, voz/notificaciones existentes y seguridad.

## Vrixora Admin
Aplicar admin-premium.md, componentes.md y auditoria-admin.md; negocio y permisos prevalecen sobre compactación. Observar, decidir y actuar rápidamente.
- Sidebar contraíble, accesible, seleccionado; móvil con cierre evidente. Cabeceras compactas.
- Operaciones: fichas verticales semáforo, filas expandibles, precio formateado, prioridad señal/estado; conservar notificados y trazabilidad. Evitar bloques/KPI duplicados.
- Flota/mapa: azul disponible, verde en servicio, ámbar GPS reciente. Confirmar umbral y significado vigentes; GPS antiguo distinto. Verde delante en superposición, iconos compactos, fecha/hora última señal y filtro activos GPS antiguo. Hora oficial Cuba cuando proceda, no desplazamiento UTC fijo.
- Driver 360: avatar circular, WhatsApp, búsqueda nombre/teléfono, filtros, documentos, vehículo, fecha inscripción, no aceptadas, históricos y controles según permisos. No mostrar datos sensibles a roles no autorizados.
- Atención: WhatsApp Lite como pestaña, separar solicitudes/ficha 360/acciones; formulario breve, no cambiar modalidad elegida, conservar causas y trazabilidad.
- Dashboard/configuración: jerarquía premium, grupos temáticos, marcas de agua discretas, guardar por sección cuando exista; métricas y operaciones legibles. Wallet/Recargas y tablas móviles pueden usar tarjetas desplegables conservando datos/controles.
- Smart Pricing: no alterar tarifas, porcentajes, modalidades, calendarios o borrador/publicado mediante UI; base USD resultado CUP, hora oficial Cuba. Diferenciar edición/simulación/aprobación/publicación y confirmar operaciones de impacto.

## Identidad compartida
Familia de componentes y marca, densidad según rol: Cliente sencillo, Conductor directo, Admin informativo. Reusar iconos, superficies, estados, espaciado y semántica; no trasladar mecánicamente dashboard a Cliente.
