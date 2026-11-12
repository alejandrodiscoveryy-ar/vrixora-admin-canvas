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
