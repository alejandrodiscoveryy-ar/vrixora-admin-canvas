# TUKTUK Marketplace — Laboratorio de Precios V2

**Corte 1 / entrega segura:** 14-10-2026. Proyecto Vrixora Admin, repo `alejandrodiscoveryy-ar/vrixora-admin-canvas`.

## Estado

Se prepara una rama de trabajo aislada. No modifica ninguna tarifa, tabla, función de producción, aplicación Cliente o Conductor, motor `smart_pricing_v1`, sincronización elTOQUE, ni despacho de carreras.

## Objetivo

Un laboratorio para introducir un escenario (distancia, pasajeros, paradas y hora de Cuba), comparar los importes de las modalidades **que ya tienen tarifa publicada** y consultar sus desgloses directamente al **mismo motor oficial** que calcula las cotizaciones.

## Contrato existente

`public.preview_marketplace_customer_quote_v2` (SQL, `stable`) invoca `app_private.calculate_marketplace_customer_quote_smart_v1` sin crear carreras. Acepta servicio, categoría de vehículo, número de pasajeros, distancia, paradas y fecha/hora. Retorna `recommended_price`, `currency`, `pricing_breakdown.total_usd`, `pricing_breakdown.components_usd`, `adjustments`, tipo de cambio y redondeo.

Se verificó en Supabase real **solo mediante lectura**, con triciclo pasajeros y carga, 5 km, 1 parada, 14/10/2026 22:00 America/Havana. Ambas cotizaciones devolvieron el desglose, sin mutar datos.

**Limitación explícita:** la distancia se introduce manualmente; el preview v2 no recibe coordenadas de destino. Los recargos de zonas especiales (p. ej. aeropuerto) no quedan representados; tampoco se valida capacidad del vehículo. La pantalla avisa de ello. No debe presentarse como cotización de recorrido completo ni como precio hipotético con nueva tarifa.

## Siguientes cortes

1. **Precio propuesto:** nuevo RPC de simulación de tarifas y ajustes hipotéticos, validado y autorizado, usando el mismo núcleo del motor en un contexto de simulación, sin escribir tarifas activas. Historial/borrador separado de publicar; control de permisos.
2. **Reglas configurables:** horario, nocturnidad, festivos, alta demanda manual, pasajeros, paradas; motor existente soporta gran parte, falta CRUD administrativo seguro para reglas y exclusiones. Simulación con reglas superpuestas y límites de recargo. Auditar `stack_group`, cap del 40 % y `cap_exempt`.
3. **Inteligencia asistida:** recomendaciones basadas en datos observados de solicitudes, aceptación, conductores elegibles y márgenes; no activar demanda automática sin backtesting y protecciones contra fluctuaciones. Los resultados proyectados no son rentabilidad real.
4. **Catálogo dinámico:** descubrir categorías y modalidades reales en la DB; Turismo y Bicicleta requieren contratos de Cliente y cotizador antes de ser habilitados comercialmente.

## Criterios de cierre del corte 1

- Cotizar varias modalidades reales por el mismo escenario sin modificar el backend.
- Estado de carga, error por modalidad y desgloses visibles.
- Fecha/hora especificada como Cuba; invalidaciones por parámetros cambiados.
- Pruebas y compilación del repositorio correctas.
- Nueva rama y commit con solo archivos de alcance; main, producción y Supabase intactos.
- Prueba visual en navegador **pendiente**; integrar y desplegar solo con autorización posterior.
