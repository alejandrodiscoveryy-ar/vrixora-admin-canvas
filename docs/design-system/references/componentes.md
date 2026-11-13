# Biblioteca compartida de componentes — Vrixora Admin

## Regla
Buscar primero en src/components, src/components/ui, rutas y estilos globales. Reutilizar los componentes reales; estos nombres son propuestas conceptuales, no evidencia de que existan. No crear una nueva biblioteca paralela. Si existe variante equivalente, normalizarla. Mantener una sola fuente de tokens en src/styles.css.

| Patrón | Contrato | Verificación |
|---|---|---|
| PageHeader / SectionHeader | título, contexto breve, acción primaria, slot de filtros cuando proceda; sin redundancia | 48–64 px orientativo; wrap móvil, misma jerarquía |
| PremiumCard / Card | variantes estándar, compacta, KPI y operativa expandible; usar tokens de superficie, borde, radio y sombra | Card actual p-6 en secciones: inventariar y probar variante 12–16 px; no modificar globalmente sin consumidores |
| StatCard | cifra, etiqueta, periodo/variación si aplica; alineación y alturas coherentes | números tabulares, carga/vacío/error, contraste |
| FilterBar | búsqueda, filtros esenciales, secundarios plegables y limpiar | persistir estado, teclado, móvil sin overflow |
| CompactTable / lista | encabezados, filas densas, importe alineado, acciones accesibles | orden/filtros/paginación; móvil expandible cuando sea adecuado |
| StatusBadge | semántica común, texto/icono además de color | contraste claro/oscuro; azul disponible, verde en servicio, ámbar GPS reciente en mapa |
| Button | reutilizar Button existente, variantes por jerarquía | default 36 px, touch 44 px objetivo; foco, disabled, loading |
| SectionPanel | agrupación por tarea, superficie compartida, encabezado y acciones | no tarjetas anidadas innecesariamente, responsive |
| PremiumDialog | reutilizar dialog/drawer existentes, overlay, foco y confirmaciones | Escape, foco restaurado, scroll interno, teclado móvil |
| MapControls / marcador | conservar mapa y controles; capas por función, atribuciones y actualización | GPS antiguo distinto; marcador asignado y disponibilidad no confundidos; privacidad |

## Procedimiento de normalización
- Registrar nombre real, ruta, props/variantes, tokens, pantallas consumidoras, excepciones y pruebas.
- Seleccionar referencias comparables de Admin aprobadas por el propietario.
- Proponer variantes semánticas en lugar de clases duplicadas por ruta.
- Migrar primero un piloto y verificar consumidores. Mantener compatibilidad hasta migrar todos los usos.
- Documentar cambios y excepciones; no eliminar datos, flujos ni permisos por compactar.
- Aplicar rúbrica de auditoria-admin.md; no afirmar que un componente existe o está migrado sin evidencia.

La biblioteca de esta guía es una especificación. No crea componentes ejecutables ni cambia la aplicación por sí misma.

## Fase 1 — implementación piloto (12-11-2026)

Contrato de densidad compartida en `src/components/admin/density.ts`: `density="compact"` opt-in; `comfortable` conserva la presentación predeterminada. Componentes adaptados: ModuleHeader, SectionCard, MetricCard, AdminDataTableShell, FilterToolbar, DataToolbar y EmptyState. Los dos toolbars aceptan `embedded` para evitar superficie, borde, sombra y padding duplicados dentro de la cabecera de tabla. Las tarjetas compactas utilizan los tokens existentes, padding 12–16 px y no dependen de blur; las acciones de toolbar en móvil tienen objetivo de 44 px. KPI compactos permiten envolver importes y detalles, sin truncarlos deliberadamente. No se ha cambiado el componente Card base ni sus atributos globales: la normalización de data-slot queda pendiente de inventario de efectos en consumidores.

Pilotos: PagosSection y ClientesSection (Usuarios app, incluidas sus ramas de proyecto). Se mantienen flujos, consultas, cálculos, filtros, permisos, acciones y contenido. Los demás módulos siguen usando el comportamiento anterior hasta su migración explícita.

### Verificación obligatoria antes de extender
- Confirmar compilación y checks del PR; comparar diffs y comprobar consumidores no migrados.
- Revisar Pagos y Usuarios app a 360/390/768/1024/1440 px, claro y oscuro; sidebar abierta/cerrada; datos largos, filtros múltiples, tablas vacías y acciones táctiles.
- Probar búsqueda, limpiar filtros, paginación, expansión/acciones móviles y accesos existentes. Comprobar importes y estados financieros intactos.
- Medir cabecera, área visible, padding y filas antes/después; no emitir puntuación definitiva sin captura y prueba funcional.
- Registrar pendientes y excepciones; la adopción de variantes no constituye certificación visual. No desplegar ni integrar sin autorización y controles vigentes.

## Usuarios app — referencia premium (segunda iteración, antecedente)

Variante reutilizable opt-in: `appearance="premium"` en MetricCard y AdminDataTableShell, normalmente combinada con `density="compact"`. La apariencia predeterminada y las variantes compactas de los demás módulos permanecen intactas.

- Superficies: `premiumSurface`, `premiumHeaderSurface`, `premiumTableDensity` y `premiumTableRow` en density.ts. Se utilizan tokens existentes de superficies, bordes, sombras, texto y marca; el tema oscuro combina surface-3 con primary (12% en superficie, 18% en encabezados y 20% al pasar el cursor por las filas). No se modifican los tokens globales.
- KPI: padding 12 px, cifra tabular con peso semibold, línea superior fina, icono de fondo decorativo (6% claro y 9% oscuro), sin blur ni movimiento al pasar el cursor. La marca de agua queda detrás del contenido, no capta interacción y se oculta durante la carga. La opacidad del 9% es una excepción local para contraste decorativo del tema oscuro.
- Directorio: encabezado con superficie propia, filas sin altura rígida, padding vertical 6 px, avatares de 32 px en escritorio, bordes y estados legibles. El objetivo orientativo es 44–48 px para una fila sencilla; permitir que crezca si el contenido lo requiere.
- Móvil: tarjetas de registro con padding 12 px; filtros de ancho completo en pantallas estrechas, etiquetas accesibles y acciones de ficha existentes con objetivo táctil de 44 px.
- ClientesSection activa estas variantes tanto en el directorio de TukTuk como en su vista heredada de licencias. Las cuatro métricas de adopción conservan sus datos; los iconos y acentos expresan su significado. Se elimina la cabecera Acciones donde no existía una celda de acción y se añade donde las acciones ya estaban presentes. Sin cambios de consultas, cálculos, filtros, permisos o mutaciones.

Validación: ejecutar pruebas de renderizado y compilación del preflight. Comprobar después en WebApp autenticada, con misma resolución/zoom y datos, altura de KPI, cantidad de filas visibles, tema claro/oscuro, móvil, textos largos, filtros, estados y acciones. La aprobación visual definitiva de Usuarios app como pantalla de referencia requiere esa revisión; no confundir pruebas automáticas con captura o validación de producción.

## Usuarios app — refinamiento grafito (tercera iteración, referencia visual oficial)

La captura de producción del PR #213 confirmó mayor densidad, pero mostró exceso de verde azulado y contraste casi negro entre lienzo, navegación, campos y paneles. Se conserva la estructura y se refina la jerarquía cromática. Esta sección reemplaza la mezcla con primary y las marcas de agua de la segunda iteración.

- Modo oscuro premium: grafito ligeramente azulado, no negro plano. Se derivan fondos de surface-3 y text-secondary; el cian primary y los colores semánticos se reservan para identidad, foco, acciones y estados, no grandes superficies. No modificar los tokens globales.
- Capas: lienzo 5% text-secondary, navegación 7%, barra superior 10%, tabla 11%, controles 12%, encabezados de columna 15%, KPI 17%, cabecera de panel 20%. Los porcentajes restantes son surface-3; mezcla en OKLab. Mantener bordes y contrastes legibles. Hover de fila 18%, insignia inactiva 19%, sin negro puro.
- Contrato reutilizable: premiumSurface, premiumMetricSurface, premiumHeaderSurface, premiumColumnHeaderSurface, premiumControlSurface y premiumInactiveBadge en density.ts. DataToolbar admite appearance="premium" para el campo de búsqueda; filtros SelectTrigger utilizan premiumControlSurface.
- Marcas de agua: 48 px móvil, 64 px escritorio, dentro de la tarjeta (8 px desde abajo); opacidad 6% claro / 7% oscuro, sin interacción, no competir con la cifra. Conservar padding 12 px y densidad.
- Shell: aplicar el tratamiento solo al directorio /clientes mediante data-admin-reference-shell y al drawer móvil mediante data-admin-reference-drawer; no afecta Cliente 360 ni otras rutas. El logo conserva su fondo de marca. El tema claro conserva sus tokens y superficies.
- Mantener datos, consultas, filtros, accesos, acciones, estructura de tabla, responsive y navegación. No extender al resto de Admin hasta comparar visualmente la referencia en producción en claro/oscuro y escritorio/móvil. Verificar también apertura del menú móvil, foco y contraste.

El propietario aprobó la dirección visual de la captura de producción del PR #214 (12-11-2026). Usuarios app es la referencia oficial de composición grafito y densidad; la validación funcional/visual móvil y tema claro sigue pendiente. Las pruebas automáticas validan contratos y compilación, no certifican el acabado visual.

## Fase 2 — shell, Panel general y Pulso operativo

- Shell autenticado: los marcadores data-admin-reference-shell y data-admin-reference-drawer pasan de usuarios a graphite en todas las rutas de Admin. Se conserva la misma jerarquía de fondo/navegación/barra superior del PR #214 sin modificar tokens globales, login público, logo ni estilos internos del mapa. Sidebar abierto/contraído y drawer móvil mantienen el comportamiento.
- Panel general: MobileDashboardStat y DashboardMetric delegan en MetricCard (compact + premium), con los mismos valores, textos, períodos, cargas y accesos. Acentos en los tokens de módulo o semántica; el fondo no tiene gradientes cromáticos. SectionCard incorpora appearance="premium" opt-in para los paneles de Captación, Operación Marketplace, Actividad reciente, Accesos rápidos y Requiere atención; contenido compacto y marcas de agua discretas. Se retira el gran fondo ornamental y los halos blur; se preservan los grupos, navegación y condiciones de visibilidad.
- Pulso operativo (trabajos/resumen): ocho indicadores existentes reutilizan MetricCard, conservan detalle y categoría, carga, error, valores y reglas de visibilidad/expansión móvil. Cabecera y panel compactos. FleetPulse queda para la siguiente migración; no se alteran categorías, vehículos, conductores, mapa, trabajos, filtros ni acciones.
- El tratamiento compartido no modifica otros componentes por defecto. La generalización del shell no implica que todas las pantallas hayan migrado al nuevo diseño.
- Validación: preflight de componentes y compilación, prueba de shell en rutas y mapa a pantalla completa, modo claro/oscuro, escritorio/móvil, periodos del Panel general, acceso por permisos, estados de error y expansión de Pulso. No publicar hasta autorización y no aprobar visualmente sin evidencia.

### Refinamiento posterior a captura de producción del Panel general (#215)

La captura de escritorio oscuro confirmó el grafito del shell y los KPI, pero el selector de período y el estado vacío de Captación mantenían fondos casi negros. Ambos componentes incorporan appearance="premium" opt-in, sin alterar los consumidores estándar.

- AdminPeriodSelector: contenedor premiumControlSurface sin sombra profunda; SelectTrigger premiumColumnHeaderSurface con borde, foco existente y controles táctiles de 44 px en móvil. SelectContent y PopoverContent usan premiumHeaderSurface incluso al renderizarse en portal; calendario transparente para heredar el fondo. Mantener rango, opciones, fechas, navegación anterior/siguiente, volver al período actual, calendario personalizado y acciones.
- EmptyState: premiumColumnHeaderSurface como recuadro interior, borde sólido discreto, icono sobre premiumControlSurface, sin sombra. Conserva densidad, mensaje, acento del módulo, acción y lógica de estado.
- Activar ambas variantes en escritorio y móvil del Panel general; los demás consumidores mantienen su apariencia por defecto. No modificar tokens globales, datos, permisos, consultas ni lógica temporal.
- Validar renderizado, contraste en tema claro/oscuro, navegación de períodos y calendario desplegado, texto del estado vacío, foco y layout móvil. El diseño no se considera visualmente cerrado hasta revisar la captura de producción.

## Fase 3 — Flota y Operaciones

- Referencia validada visualmente: Usuarios app y Panel general en escritorio oscuro (capturas de producción de #214, #215 y #216). Mantener grafito, evitar fondos negros aislados y gradientes extensos; tema claro y móvil requieren comprobación real.
- Selector de período premium: mostrar el rango una sola vez; controles y rango pueden compartir línea desde sm, con wrap y segunda línea en móvil. Controles táctiles de 44 px, rango personalizado accesible y sin truncar. Retirar únicamente la etiqueta duplicada del Panel general; conservar cálculos, persistencia y opciones.
- Flota: superficies premium de modalidad, categorías y listado de conductores, marcas de agua 48/64 px y padding compacto, sin alturas fijas grandes ni halos. Dos columnas en móvil y cuatro en escritorio; permitir crecimiento para nombres y detalles. Mantener selección de modalidad, categoría, conteos, actualización, paginación y apertura de ficha 360.
- Operaciones: panel y barra de filtros grafito, FilterSelect premium opt-in con foco visible y min-h-11, estado vacío neutro, información expandida sobre superficies coherentes. Mantener colores del semáforo (verde completadas, ámbar activas/pendientes, rojo incidencias/canceladas), badges existentes y bordes de estado; fondo oscuro con tinte semántico discreto. No cambiar estados, permisos, tarifas, consultas, acciones, paginación, mapa ni radar. Acciones móviles con altura mínima 44 px.
- Verificar 360/390/768/1024/1440 px, tema claro/oscuro, filtros, carreras reales y de prueba, expansión, precios, contactos, radar, mapa y ficha 360. No inventar cifras ni concluir aprobación visual únicamente por CI.

## Fase 4 — Conductores y Driver 360

- Directorio: misma búsqueda y cuatro filtros de perfil, disponibilidad, vehículo e inscripción (fecha de Cuba); FilterSelect premium, estados vacíos premium opt-in y contador de coincidencias. Filas grafito con avatar circular, contacto y vehículo visibles, sin halos/degradados; una columna en móvil, dos en tablet y distribución horizontal al disponer de espacio. Nombres y vehículos largos pueden envolver. Conservar acceso a ficha y WhatsApp, paginación y estados.
- Ficha 360: modal grafito con scroll interior y margen seguro, cabecera compacta con avatar circular y marca de agua contenida, contactos y fecha de alta. Pestañas Resumen, Vehículo, Expediente, Actividad y Finanzas en grid móvil y flex con wrap en escritorio; sin desplazamiento horizontal obligatorio. Indicadores RecordMetric delegan en MetricCard compact/premium; tarjetas y estados coherentes.
- Expediente: documentación protegida por URL firmada, requisitos, edición de contacto, oportunidades/notificaciones y auditoría; conservar consultas, RPC, permisos y motivos. Editor de vehículo: panel y campos grafito, objetivos táctiles 44px, conservar restricciones de trabajo/carrera activa y confirmaciones.
- No cambiar lógica de permisos, estados de disponibilidad, vehículos, seguridad de documentos, tarifas ni saldos. Mapa, radar y demás vistas quedan fuera del alcance. El directorio y modal comparten tokens, no colores negros codificados. Verificar claro/oscuro, 360/390/768/1024/1440 px, nombre largo, fotos, navegación y acciones, carga/error/vacío, documentación y edición autorizada, permisos financieros; validación visual real pendiente.

### Ajuste del directorio tras revisión visual

La captura del propietario muestra exceso de altura causado por tarjetas internas de WhatsApp y vehículo. Se sustituyen por texto e imágenes compactos sin paneles anidados. La fila usa una sola superficie grafito, sin sombra ni halo, avatar circular 36 px, miniatura del vehículo 36 × 28 px, padding 12 × 8 px, badges compactos y fecha de alta. En escritorio las columnas se alinean con ancho reservado para la acción; altura objetivo aproximada 60–76 px con contenido habitual, crecimiento libre cuando haya textos largos. En móvil/tablet identidad a ancho completo, contacto y vehículo en dos columnas con texto adaptable y acciones debajo; sin recortes ni scroll horizontal obligatorio.

Toda la fila abre Driver 360 mediante botón real que ocupa la superficie y dispone de nombre accesible y anillo de foco interior. WhatsApp mantiene enlace independiente por encima del área clicable, con objetivo mínimo 44 px en móvil y 32 px en escritorio. No cambiar filtros, fotos, datos, navegación, permisos ni consultas. Verificar mediante ratón, teclado y pantalla táctil; abrir WhatsApp sin abrir Driver 360. Medir altura y reflow en la WebApp tras publicación; no afirmar reducción medida hasta captura real.

## Fase final — Unificación transversal de Admin

Referencia visual: Usuarios app y Conductores (grafito aprobado en escritorio oscuro). El resto de los módulos adopta el mismo sistema, sin alterar datos, permisos, operaciones, consultas ni tokens globales.

- ModuleHeader y FilterToolbar admiten appearance="premium" opt-in, preservan la variante estándar y el contrato compacto, con superficies compartidas y controles accesibles. Los módulos restantes reutilizan SectionCard, MetricCard, EmptyState, AdminDataTableShell, DataToolbar y AdminPeriodSelector en sus variantes compactas/premium.
- Para los componentes heredados de composición especial se usan adaptadores explícitos admin-graphite-panel, admin-graphite-header, admin-graphite-inset, admin-graphite-control, admin-graphite-dialog y admin-graphite-nav-item. Se derivan del mismo contrato de capas de density.ts, sin redefinir variables globales. Los adaptadores sustituyen fondos/degradados locales en sus consumidores; no aplicar indiscriminadamente a elementos semánticos, mapas ni aplicaciones públicas.
- Atención al cliente y WhatsApp Lite: recepción asistida, búsqueda/identificación, ruta, cotización, aceptación, publicación y ajustes conservados. Paneles, campos y navegación compactos; los mapas y las reglas de cálculo conservan su comportamiento.
- Billeteras y Recargas: mantener importes, estados, permisos, confirmaciones, registro y conciliación; tarjetas y detalles financieros adaptables, filtros de estado con wrap, diálogos con scroll interior. No alterar saldos, facturación ni Smart Pricing.
- Centro de precios: navegación, fichas, controles, laboratorio, diagnóstico, jerarquía, borradores temporales y ajuste global con superficies grafito. Las capas de mapa y sus dimensiones se conservan; el CSS del área de precios normaliza solo la presentación de tarjetas/editor fuera del mapa. No modificar tarifas, recargos, moneda, fechas, simulaciones ni publicaciones.
- Configuración y Administración: navegación de áreas, categorías, formularios y paneles de integración, radar, avisos, provincias, centro de pruebas, roles y usuarios. También Pagos, Comercial, Licencias, Rendimiento, Auditoría y Comunicados.
- Completar los diálogos y fichas 360 de conductor, cliente y carrera, y los diálogos financieros. Mantener apertura de WhatsApp instalada y bienvenida de Conductores (PR #222).
- Validación obligatoria: 360/390/768/1024/1440 px, tema claro/oscuro, teclado y foco, formularios con textos largos, listas/diálogos, mapas, carga/error/vacío, permisos y acciones de negocio. Las pruebas automáticas no equivalen a revisión visual. Registrar las excepciones y los componentes especiales que todavía requieran ajuste tras capturas reales.

## Navegación temática — ajuste final del shell

- `adminNavTone` en admin-navigation.ts relaciona las familias de navegación con los tokens cromáticos existentes: Trabajos turquesa (licencias), Panel cian (resumen), Usuarios azul (clientes), Comercial violeta, Tarifas ámbar, Analítica naranja, Administración gris azulado (configuración), Auditoría magenta; Billeteras y Recargas conservan la familia financiera verde dentro de Trabajos. Son acentos de navegación, no estados de disponibilidad ni permisos.
- ProjectNavItem, DesktopLink y DrawerLink comparten AdminNavIcon y clases admin-nav-item/primary/secondary; iconos 22 px principales, 19 px secundarios y 23 px en la barra contraída. El activo tiene fondo tonal suave, borde, texto de alto contraste y marcador lateral; los iconos son decorativos y las etiquetas conservan nombres accesibles. En móvil, controles de navegación con mínimo 44 px.
- Sidebar contraída conserva 64 px y preferencia local. Expandida en Trabajos pasa de 208 a 232 px para evitar recortes con iconos más grandes; los demás espacios mantienen 272 px. Indentación y etiquetas adaptables; mantener navegación, permisos, agrupación, rutas y estado de mapas intactos.
- Menús internos de Centro de precios, Configuración y Administración comparten los acentos; no modificar colores semánticos, tokens globales, logo, tarjetas de tarifas ni mapas.
- Validación pendiente en producción: claro/oscuro, ancho estrecho, menú expandido/contraído y drawer móvil, navegación con teclado, labels largos y visualización a 200% de zoom. Las pruebas de fuente/compilación no sustituyen auditoría visual.

### Submenús — diferenciación por destino

`adminSubnavTone(group, child)` centraliza la identidad de cada destino sin cambiar las familias del menú principal. En Trabajos: Pulso cian, Operaciones turquesa, Atención violeta, Mapa azul verdoso, Conductores índigo, Clientes azul, Billeteras verde, Recargas verde dorado (mezcla de pagos y planes), Incidencias magenta y Configuración gris azulado. Los colores son de navegación; los estados operativos mantienen su semántica independiente.

Centro de precios: Ajuste general ámbar, Pasajeros azul, Carga naranja, Mensajería turquesa. Administración: Configuración gris azulado, Empleados índigo, Comunicados violeta, Integraciones turquesa. Configuración de TukTuk: Pruebas violeta, Radar cian y Provincia turquesa. Los menús internos y las cabeceras correspondientes reutilizan esta asignación; Comercial y Atención emplean el patrón admin-subnav-tab para sus propias pestañas y conservan las condiciones de permisos y selección.

Los submenús laterales mantienen la línea de jerarquía, iconos de 20 px en contenedor de 32 px y objetivo de 42 px por fila de escritorio, 44 px en móvil/contraído. La opción hija activa tiene mayor énfasis que la cabecera de su grupo; al contraer la barra permanecen etiquetas accesibles y la separación de grupos sin aumentar el ancho. Las tonalidades son derivadas de los tokens de módulos y no alteran su definición. Validar contraste, reflow, navegación por teclado y ambos temas en pantallas reales.

### Nombre definitivo del grupo de configuración

Por decisión del propietario, el grupo lateral visible antes llamado Administración se llama **Configuración**. Sus cuatro destinos son Ajustes generales, Empleados, Comunicados e Integraciones, en el mismo orden y con los mismos permisos y enlaces existentes. La primera opción lleva el icono de ajustes deslizantes, evitando duplicar nombre e icono del grupo padre. La vista operativa dentro de Trabajos se identifica como **Configuración operativa** (Centro de pruebas, Radar y Provincia), sin moverla ni cambiar su URL. El identificador interno del grupo `administracion` y sus contratos de tonos, rutas y permisos se conservan para compatibilidad. La navegación interior y su encabezado adoptan el mismo nombre visible.

### Accesos directos en grupos de navegación

Configuración y Trabajos comparten el patrón de cabecera con dos acciones independientes: el nombre/icono es un enlace a la vista predeterminada (Ajustes generales, con alternativa autorizada, o Pulso mediante vista=resumen); la flecha controla exclusivamente la expansión. Mantener los destinos hijos, permisos, estado activo y colores, cierre del drawer al navegar y acceso en barra contraída. El grupo activo se abre al entrar desde otra sección; los submenús se pueden contraer sin abandonar la pantalla. No introducir botones anidados ni alterar las reglas operativas o el estado del mapa.

### Clientes, Billeteras y Recargas — directorio operativo compacto

Se sustituye la duplicación de listas móvil/escritorio por una única fila responsive por registro, con superficie premium grafito compartida, icono circular, etiqueta de identidad y métricas tabulares. La anchura real del contenido controla las columnas (container queries a 680 y 850 px), sin anchuras mínimas de tabla que provoquen desbordamiento al abrir el sidebar. Los detalles secundarios de billetera y recarga se expanden de forma nativa en todos los tamaños. No hay marcas de agua por fila, gradientes ni imágenes decorativas repetidas; se conservan colores temáticos de Usuarios/Clientes, Finanzas y Recargas y estados semánticos independientes.

Clientes conserva búsqueda y orden del servidor, puntos, distancia, trabajos totales/activos/liquidados, fechas en hora de Cuba y acceso a Cliente 360; se compactan sus indicadores, cabecera, modalidades e historial. Billeteras mantiene disponible, reservado y total visibles, depósito inicial y todos los saldos de origen en el desplegable. Recargas mantiene importe, método, estado, fecha y gestión de pendientes siempre visibles, referencia, notas, rechazo, fechas y comprobante dentro del detalle. Las acciones de gestión conservan permisos y clave de idempotencia.

Las búsquedas nuevas de Billeteras y Recargas actúan exclusivamente sobre las páginas cargadas, indicando coincidencias y permitiendo cargar más incluso cuando no haya coincidencias. No se presentan totales financieros incompletos como globales; no se cambia el RPC, límites, paginación ni acceso. Se indexan los documentos por recarga una vez por respuesta, conservando la primera coincidencia previa. Los fallos de carga tienen acción de reintento; no se confunden con una lista vacía. Validación visual pendiente en 360/390/768/1024/1440 px, claro/oscuro, sidebar abierta y contraída, datos largos y acciones con teclado.
