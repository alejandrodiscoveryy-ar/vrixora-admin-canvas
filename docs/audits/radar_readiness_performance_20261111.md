# TUKTUK — diagnóstico de rendimiento del radar (11-11-2026)

**Estado:** análisis y pruebas de lectura completados. **Cambio SQL NO aplicado.**
**Repositorio:** Vrixora Admin, rama de propuesta independiente.
**Función actual:** `public.admin_get_marketplace_radar_readiness(uuid)`.

## Problema observado
- Historial acumulado de `pg_stat_statements` al revisar: 481 ejecuciones de esta RPC, **368,87 ms de media** y 7.902 ms máximo. Es un dato histórico, no la latencia permanente garantizada.
- En paralelo, el mapa operativo registra 26.545 ejecuciones, con 28,18 ms de media; son cargas y frecuencias distintas.
- El radar evalúa por asignación comprobaciones de perfil y documentación, GPS, Android y acceso comercial de legado. La consulta agrupadora utiliza el CTE `work` como subconsulta no materializada; el plan puede recalcular expresiones al evaluar varios agregados `FILTER` sobre los mismos conductores.

## Prueba no destructiva
Fecha: 11-11-2026. Consultas `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` bajo `BEGIN TRANSACTION READ ONLY`, con la misma proyección y los mismos agregados; la única diferencia entre variantes fue `WITH work AS (...)` frente a `WITH work AS MATERIALIZED (...)`.

| Muestra | Sin materialización | Con materialización |
|---|---:|---:|
| 1 | 272,116 ms | 82,068 ms |
| 2 | 194,784 ms | 40,902 ms |
| 3 | 204,703 ms | 41,646 ms |

Los planes registraron aproximadamente 11.300 accesos a bloques de memoria compartida por consulta en la variante actual y 3.849–3.859 en la optimizada. Son mediciones puntuales en una base activa; no constituyen garantía de rendimiento futuro.

También se comparó el resultado completo de **los diez contadores** calculados a partir de ambas variantes en la misma transacción y se obtuvo `identical = true`, preservando todos los valores (incluidos los campos comerciales de compatibilidad). No se ejecutó ninguna escritura o migración, ni se sustituyó la función remota.

## Ajuste mínimo propuesto
Incluir la palabra clave `MATERIALIZED` únicamente en la definición del CTE `work` de la función de diagnóstico, sin modificar:
- firma de la RPC, nombres y tipos del objeto JSON de respuesta;
- validación de permisos `marketplace.view`, `SECURITY DEFINER` y `search_path`;
- reglas de GPS, documentación, estado de conductores y selección de carreras;
- funciones de billeteras, comisiones y disponibilidad real;
- aplicaciones Cliente, Conductor y APK.

El borrador protegido está en `docs/drafts/radar_readiness_materialized_20261111.sql`, **fuera** de `supabase/migrations/` para evitar asumir que ya fue desplegado. Verifica la firma, hash exacto de la definición actual y unicidad del fragmento antes de permitir una modificación. El hash de la definición auditada es `ebbb7bb8ba5fab8de02bec80f352bb11`.

## Requisitos antes de implementar
1. Obtener aprobación expresa del propietario para migración en la base de datos remota.
2. Verificar que la definición actual no cambió (hash y funciones dependientes). Si cambió, suspender y volver a auditar.
3. Generar una migración oficial con la herramienta Supabase y mantener un rollback incremental revisado.
4. Ejecutar control funcional de la RPC con sesión admin, comparar indicadores y tiempos antes/después.
5. Integrar documentación/migración con el historial del repositorio solo tras verificar el cambio y su alcance, sin modificar carreras ni datos reales.

**Criterio de cierre:** equivalencia de valores del radar, ausencia de regresiones de permisos, reducción de latencia observada, migración registrada e integridad de los tres mecanismos de publicación existentes.

## Limitaciones
Las pruebas se realizaron con conjuntos reales **sin modificar datos**, pero la comparación se efectuó sobre una copia lógica del SQL (no reemplazando la RPC en producción). Para confirmar el beneficio en producción es necesario desplegar la migración con autorización y repetir mediciones bajo carga comparable.
