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
