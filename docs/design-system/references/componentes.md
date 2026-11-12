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

## Usuarios app — referencia premium (segunda iteración)

Variante reutilizable opt-in: `appearance="premium"` en MetricCard y AdminDataTableShell, normalmente combinada con `density="compact"`. La apariencia predeterminada y las variantes compactas de los demás módulos permanecen intactas.

- Superficies: `premiumSurface`, `premiumHeaderSurface`, `premiumTableDensity` y `premiumTableRow` en density.ts. Se utilizan tokens existentes de superficies, bordes, sombras, texto y marca; el tema oscuro combina surface-3 con primary (12% en superficie, 18% en encabezados y 20% al pasar el cursor por las filas). No se modifican los tokens globales.
- KPI: padding 12 px, cifra tabular con peso semibold, línea superior fina, icono de fondo decorativo (6% claro y 9% oscuro), sin blur ni movimiento al pasar el cursor. La marca de agua queda detrás del contenido, no capta interacción y se oculta durante la carga. La opacidad del 9% es una excepción local para contraste decorativo del tema oscuro.
- Directorio: encabezado con superficie propia, filas sin altura rígida, padding vertical 6 px, avatares de 32 px en escritorio, bordes y estados legibles. El objetivo orientativo es 44–48 px para una fila sencilla; permitir que crezca si el contenido lo requiere.
- Móvil: tarjetas de registro con padding 12 px; filtros de ancho completo en pantallas estrechas, etiquetas accesibles y acciones de ficha existentes con objetivo táctil de 44 px.
- ClientesSection activa estas variantes tanto en el directorio de TukTuk como en su vista heredada de licencias. Las cuatro métricas de adopción conservan sus datos; los iconos y acentos expresan su significado. Se elimina la cabecera Acciones donde no existía una celda de acción y se añade donde las acciones ya estaban presentes. Sin cambios de consultas, cálculos, filtros, permisos o mutaciones.

Validación: ejecutar pruebas de renderizado y compilación del preflight. Comprobar después en WebApp autenticada, con misma resolución/zoom y datos, altura de KPI, cantidad de filas visibles, tema claro/oscuro, móvil, textos largos, filtros, estados y acciones. La aprobación visual definitiva de Usuarios app como pantalla de referencia requiere esa revisión; no confundir pruebas automáticas con captura o validación de producción.
