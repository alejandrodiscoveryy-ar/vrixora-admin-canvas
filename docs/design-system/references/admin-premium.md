# Vrixora Admin — estándar premium y compacto v2.0

## Contrato visual
Panel SaaS ejecutivo, tecnológico, sobrio, de alta densidad útil y lectura rápida. Mantener lenguaje continuo entre Pulso, Flota, Operaciones, Conductores/Driver 360, Atención al cliente, Wallet/Recargas, Smart Pricing y Configuración. Los acentos distinguen funciones, no sistemas visuales. Premium no es decoración: orden, profundidad, jerarquía, alineación, legibilidad y consistencia. Evitar sombras exageradas, gradientes arbitrarios, tarjetas anidadas y espacios vacíos.

## Fuente técnica verificada
Inspección de main, 12-11-2026, alejandrodiscoveryy-ar/vrixora-admin-canvas. Archivos fuente, no auditoría visual de producción. Comprobar nuevamente antes de modificar.

| Archivo | Hallazgo |
|---|---|
| [src/styles.css](../../../src/styles.css) | Tailwind v4, variables OKLCH claro/oscuro, superficies, semántica, acentos, sombras, motion. Blob e6a38c603213a5ec6cc1df6b145fda6061441447. |
| [src/components/ui/card.tsx](../../../src/components/ui/card.tsx) | Card rounded-xl, border, bg-card, shadow; Header p-6 y Content/Footer p-6 pt-0. Blob d886b020243248cee648b14274a763b325a3bc55. |
| [src/components/ui/button.tsx](../../../src/components/ui/button.tsx) | Button común, variantes, touch min-h-11 y foco. Blob 3aa1fa48f950bc010da2974e306e675516f252ba. |
| [src/routes/__root.tsx](../../../src/routes/__root.tsx) | Inter y JetBrains Mono; preferencia system/light/dark. Blob 3c8fbe3d4bd75923d4871b1e911b63f9e5225dac. |
| [package.json](../../../package.json) | React 19, Tailwind 4, Radix, Lucide, Mapbox GL, TanStack, Recharts; scripts lint y build:production-safe. Verificar versiones actuales. |

## Tokens existentes
| Rol | Token / valor verificado |
|---|---|
| Marca | --primary light oklch(0.65 0.18 195), dark oklch(0.85 0.15 195); comprobar contraste con foreground. |
| Lienzo | --canvas, --canvas-elevated, --background para compatibilidad |
| Capas | --surface-1, --surface-2, --surface-3, --surface-overlay |
| Texto | --text-primary, --text-secondary, --text-tertiary, --text-disabled |
| Bordes | --border-subtle, --border-default, --border-strong, --border-focus |
| Radios | --radius-control 8 px, --radius-compact 12 px, --radius-card 16 px, --radius-dialog 20 px (raíz 16 px); legacy --radius 14 px |
| Elevación | --shadow-xs, --shadow-card, --shadow-overlay |
| Movimiento | --motion-interaction 180 ms, --motion-enter 280 ms; reduced motion |
| Fuentes | Inter UI; JetBrains Mono código/identificadores técnicos; números tabulares cuando ayuden |
| Semántica | --semantic-success, --semantic-warning, --semantic-danger, --semantic-info, --semantic-inactive y variantes surface/border/foreground |
| Acentos | data-admin-module, --module-accent, --module-surface, --module-border, --module-foreground, --module-glow donde existan |

Coexisten tokens legacy y SaaS; para nuevos patrones usar semánticos SaaS preservando compatibilidad. No sustituir indiscriminadamente bg-card o rounded-xl; inventariar consumidores y migrar por etapas. Acentos disponibles: resumen, clientes, comercial, licencias, planes, pagos, empleados, rendimiento, configuración y auditoría. No asignar módulos nuevos sin revisar configuración; no confundir acentos con estados.

## Presupuesto de espacio (objetivos propuestos)
Validar con propietario y pruebas; no son medidas actuales de todas las pantallas. Evitar alturas fijas que recorten contenido.

| Elemento | Escritorio | Móvil |
|---|---|---|
| Cabecera global | 48–56 px | 48–56 px + safe area |
| Cabecera de módulo | 48–64 px | 44–64 px, envolver si necesario |
| Margen de contenido | 16–24 px | 12–16 px |
| Separación entre módulos | 12–16 px | 12 px |
| Tarjeta compacta | padding 12–16 px | padding 12–16 px |
| Fila simple | 44–48 px | 44–56 px o más si necesario |
| Controles | default 36 px, sm 32 px secundario | touch mínimo objetivo 44 px |
| Títulos de módulo | 20–24 px semibold | 18–22 px semibold |
| Títulos de tarjeta | 14–16 px | 14–16 px |
| Texto operativo | 13–14 px orientativo | 14–16 px |
| Etiquetas secundarias | 12–13 px | 12–14 px, no datos críticos |

Escala 4/8/12/16/24/32 px. Evitar títulos, subtítulos, KPI e instrucciones repetidos. Reducir padding de 24 px con variante compartida compacta cuando proceda, no sustitución global sin pruebas. Objetivo a 1440×900: primera unidad operativa completa o área útil de mapa tras cabecera y filtros; a 390×844: acción primaria y estado clave visibles cuando el flujo permita. Medir antes/después con iguales datos, viewport y zoom. No penalizar scroll justificado.

## Patrones
- Shell: sidebar común contraíble, estado activo, etiquetas accesibles; móvil drawer con cierre y gestión de foco. No duplicar barras.
- Cabecera: título, contexto indispensable y acción primaria; subtítulo solo si aporta; sin hero gigante ni banners fijos ornamentales.
- Toolbar: búsqueda, filtros esenciales, acciones; secundarios plegables con resumen y limpiar. Preservar contexto.
- KPI: cifra, etiqueta, variación/periodo si aporta, escala y alturas uniformes. Sin gradientes chillones.
- Tarjetas: compacta, estándar, resumen KPI, operativa expandible son variantes conceptuales, no componentes confirmados. Una superficie, borde sutil, una elevación si necesaria. Información principal arriba, detalles expandibles.
- Tablas: encabezados claros, filas compactas, importes alineados, estados con texto, filtros y orden preservados. Móvil: tarjetas expandibles o scroll horizontal limitado a región explícita si comparación exige.
- Formularios: etiquetas permanentes, grupos por tarea, errores junto a campo, guardar por sección cuando exista; preservar confirmaciones y acciones.
- Modales: radio dialog, overlay y sombra común; scroll interno y foco, Escape, teclado y controles táctiles.
- Mapas: conservar atribuciones, zoom, GPS, leyenda, controles, fecha/hora y señal antigua. Azul disponible, verde en servicio, ámbar GPS reciente conforme contrato. No alterar tema global para arreglar marcadores.
- Marca de agua: icono relacionado, decorativo, detrás, sin interacción ni anuncio; opacidad inicial 3–6%, ajustar contraste. Preferir cabeceras o KPI; no por fila.
- Profundidad: lienzo → superficie → seleccionado/overlay. Evitar blur y sombras acumuladas; mantener hotfix móvil que desactiva blur.

## Familias y estados
Usar Button existente (default, secondary, outline, ghost, subtle, destructive, success, warning, link); una acción primaria por región. Iconos Lucide y nombres accesibles; estados hover, focus, pressed, disabled, loading. Sin nuevas bibliotecas para un módulo. Usar semántica y texto/icono además de color; comprobar contraste en ambos temas. Si falla, proponer token o variante común, no parches dispersos.

## Migración
1. Inventario de pantallas, estilos, consumidores, duplicados y excepciones; referencia aprobada tras inspección.
2. Normalizar primitives/variantes compartidos (Card, Button, cabecera, toolbar, badges, tablas); documentar API y consumidores.
3. Piloto operativo y administrativo; claro/oscuro, desktop/móvil y flujos reales.
4. Migrar shell → Pulso/Flota/Operaciones → Conductores/Atención → Wallet/Recargas → Configuración/Smart Pricing (orden propuesto).
5. Eliminar duplicados solo tras verificar usos. Registrar excepciones: ruta, razón, aprobación, alternativa y revisión. No cambiar lógica de negocio ni desplegar sin autorización.

Esta especificación no equivale a auditoría visual ni implementación. Consultar componentes.md y auditoria-admin.md.
