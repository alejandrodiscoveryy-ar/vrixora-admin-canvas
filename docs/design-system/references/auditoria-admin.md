# Auditoría obligatoria — Admin Premium Consistency

## Antes de diseñar
- Identificar ruta, usuario/rol, tarea, datos críticos, permisos, viewport y tema. Capturar estado actual con datos de prueba autorizados o anonimizados; no mostrar datos personales.
- Consultar main, estilos globales, componentes importados, variantes, overrides y consumidores. Comparar con dos pantallas de referencia del mismo producto, no con dashboard externo. Si falta acceso, marcar lo no verificado.
- Registrar alto de cabecera y toolbar, padding, gaps, filas completas visibles, scroll, acción primaria y condiciones del mapa. Comparar con igual viewport, datos y zoom.
- Clasificar por impacto: crítico (impide uso, datos, seguridad o accesibilidad esencial); alto (incoherencia sistemática, pérdida importante de espacio o función); medio (desviación localizada); bajo (detalle visual). Justificar severidad.

## Rúbrica de aprobación (100 puntos propuestos)
Puntuar únicamente con evidencia. Por categoría asignar 0 (incumple), 0.5 (parcial) o 1 (cumple) multiplicado por peso. Marcar NV (no verificado); no convertir en cero ni aprobar por suposiciones. Con NV informar subtotal comprobado y peso pendiente, sin nota definitiva. N/A solo si realmente no aplica; justificar y normalizar denominador aplicable cuando no haya NV. No rellenar resultados ficticios.

| Categoría | Peso | Evidencia |
|---|---:|---|
| Coherencia visual | 25 | tokens, tipografía, iconos, superficies y patrones compartidos; claro/oscuro consistentes |
| Compactación útil | 20 | cabecera/toolbar, padding y filas medidos; no duplica bloques; gana espacio sin sacrificar contenido |
| Jerarquía y profundidad | 15 | acción primaria, lectura de datos, capas y sombras discretas, marca de agua no invasiva |
| Componentes reutilizables | 15 | componentes existentes/variantes comunes, sin CSS duplicado injustificado |
| Responsive y accesibilidad | 15 | 360/390/768/1440 px y zoom, foco, contraste AA, teclado, targets y overflow |
| Estados y desempeño | 10 | carga, vacío, error, red lenta, actualización, sin saltos ni animaciones costosas; no regresiones observadas |

Umbral propuesto >=90/100, sin categoría completamente incumplida, críticos/altos abiertos ni NV obligatorios. 75–89: ajustar; <75: rediseño/revisión. Un crítico bloquea aunque nota alta. Sin evidencia: pendiente. Negocio, privacidad y permisos son puerta obligatoria independiente.

## Checklist posterior
- [ ] Misma estructura de cabecera, toolbar, tarjetas, estados y acciones que referencias; sin nueva paleta, fuente o iconografía local.
- [ ] Eliminar espacios vacíos/repetidos; mantener legibilidad y controles táctiles. Comparación antes/después.
- [ ] Desktop 1440×900 y 1024×768; tablet 768 px; móvil 360×800 y 390×844, más 320 si procede. Claro/oscuro, menú expandido/contraído, zoom 200% o reflow equivalente.
- [ ] Acciones, filtros, búsquedas, expansiones, navegación, confirmaciones y foco funcionan. Datos críticos visibles; no overflow accidental ni recorte.
- [ ] Contraste WCAG AA (4.5:1 texto normal, 3:1 texto grande y controles relevantes), nombres accesibles, teclado y reduced motion; comprobar fondos reales.
- [ ] Mapas/tablas: atribuciones, controles, leyenda, fecha/hora, GPS antiguo y semántica; privacidad.
- [ ] Carga, vacío, error, desconexión, datos desactualizados y recuperación; no confundir datos antiguos y actuales.
- [ ] Sin cambios no autorizados en contratos, políticas, tarifas, pagos, permisos, datos o endpoints.
- [ ] Si se implementa: diff revisado, lint/build y pruebas pertinentes según scripts actuales, verificación visual de consumidores compartidos. Build no equivale a prueba de UI.
- [ ] Documentar excepciones, evidencia, pendientes y autorización de publicación. APK excluida salvo autorización explícita.

## Informe
1. Ruta, rama/commit o versión, viewport/tema, referencia comparativa y evidencia.
2. Hallazgo | impacto | evidencia | componente afectado | solución compartida | severidad.
3. Antes/después: altura cabecera/toolbar, padding, filas visibles o área útil de mapa, acción primaria; medición real o pendiente.
4. Rúbrica por categoría, NV/N/A, bloqueantes y decisión.
5. Recomendación, alcance, consumidores, pruebas y estado real: propuesta / implementado / verificado / publicado. No llamar aprobado a una maqueta.

## Ejemplo ilustrativo
Ficha hipotética con cabecera de 120 px, dos títulos repetidos y padding 24 px: eliminar redundancia, usar cabecera común, variante compacta 12–16 px y detalle expandible. Comprobar nombre, estado, WhatsApp y acciones; medir antes/después. No atribuir a un módulo sin verlo.
