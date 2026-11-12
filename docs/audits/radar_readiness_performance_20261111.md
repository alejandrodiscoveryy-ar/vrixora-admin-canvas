# TUKTUK — diagnóstico de rendimiento del radar (11-11-2026)

**Estado actual:** migración aplicada y verificada en Supabase el 11-11-2026 (hora local). Las secciones previas al registro de ejecución describen la auditoría inicial.
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

## Ejecución autorizada — 11-11-2026, hora de La Habana/Nueva York (12-11 UTC)

**Resultado: migración aplicada y verificada en Supabase.** La propuesta anterior y su SQL en `docs/drafts/` se conservan como registro histórico de la auditoría; ya no representan el estado remoto vigente.

- Migración oficial registrada por Supabase: `20261112001335_radar_readiness_materialized`, reproducida exactamente en `supabase/migrations/20261112001335_radar_readiness_materialized.sql`.
- Definición anterior: MD5 `ebbb7bb8ba5fab8de02bec80f352bb11`.
- Definición posterior confirmada: MD5 `129724640d7609df76ae4089951cf629`. Única modificación de la definición: materializar el CTE work. La migración verifica hash y permisos dentro del mismo bloque y limita espera por bloqueos a 3 s.
- Control funcional en transacción de solo lectura: RPC de producción ejecutada con rol authenticated y contexto JWT local de un miembro autorizado, comparada con la consulta anterior dentro de la misma transacción. **Payload completo idéntico** (incluidos los diez contadores, antigüedad GPS y timestamp de comprobación).
- Seguridad posterior: propietario postgres, STABLE, SECURITY DEFINER, search_path vacío, ACL original conservada; anon sin EXECUTE, authenticated con EXECUTE y validación interna marketplace.view. Contexto simulado de usuario no autorizado: rechazo PERMISSION_DENIED, SQLSTATE 42501. No se emitieron sesiones reales ni se modificaron datos de usuarios.
- Mediciones posteriores de la RPC real: **45,801 / 51,701 / 43,720 ms**. Son tres pruebas puntuales, sin garantía sobre picos futuros.
- Asesor de seguridad: aviso `authenticated_security_definer_function_executable` para esta RPC; es una exposición deliberada de una función administrativa protegida por la comprobación explícita de permiso. No se amplió ningún permiso. Mantener como revisión de arquitectura separada, no retirar acceso al panel sin validar su sustitución. [Referencia](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

### Reversión controlada (no ejecutada)
Si aparecen regresiones, obtener autorización para una nueva migración correctiva. Verificar primero que el hash vigente siga siendo `129724640d7609df76ae4089951cf629`. Sustituir únicamente `with work as materialized (` por `with work as (` en la definición obtenida con pg_get_functiondef, usando un bloque DO con las mismas guardas de unicidad y permisos, y verificar que el hash resultante sea `ebbb7bb8ba5fab8de02bec80f352bb11`. No restaurar bases de datos ni revertir otras migraciones.

**Pendiente de cierre:** integrar el PR con la migración oficial y confirmar el funcionamiento desde Vrixora Admin. El cambio de Supabase ya es efectivo; no necesita desplegar APK ni volver a ejecutar la migración.
