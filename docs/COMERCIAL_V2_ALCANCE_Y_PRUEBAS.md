# Comercial V2 — Política general de bienvenida

## Alcance y límites

- Gestión de bienvenida en **Comercial → Ofertas TukTuk**: interruptor, 1–365 días cuando está habilitada, historial y permisos `settings.view/manage`.
- **Trabajo → Configuración**: se elimina solamente la edición de los días generales; **modo de prueba** y **búsqueda de conductores** permanecen intactos. La comisión mantiene su formulario sin poder sobrescribir la duración.
- Se conserva el 10 % de comisión y **no se activa** ninguna de las ofertas de catálogo (siguen siendo borradores). La compatibilidad/acumulación de campañas adicionales corresponde a otro bloque controlado de Comercial V2, con motor transaccional y pruebas.
- Política inicial `promotion_enabled=true`: duración vigente y beneficios ya concedidos permanecen exactamente iguales.
- Al deshabilitar, un nuevo conductor elegible se incorpora con un **registro de activación idempotente de 0 días**. Así se conserva la activación de perfil y vehículo y la creación de billetera sin conceder períodos gratuitos ni requerir una actualización de las aplicaciones cliente/conductor.
- Los registros existentes conservan `duration_days_snapshot`, `rule_version_snapshot`, inicio y fin.
- El historial registra los cambios efectivos y el usuario autorizado; no añade registros al guardar el mismo valor.

## Orden seguro de puesta en servicio

1. Crear rama/PR con la migración y frontend, sin tocar `main` ni Supabase de producción.
2. Validar el build y la revisión de cambios. La migración debe probarse en un entorno aislado con una réplica estructural de PostgreSQL.
3. Aplicar la migración verificada mediante el registro de migraciones de Supabase, **antes del despliegue web**. Su default `true` no altera el comportamiento.
4. Verificar RPC con `settings.view` y `settings.manage` y rechazos al intentar modificar sin permisos; comprobar auditabilidad, idempotencia y cero días.
5. Integrar el PR y desplegar Admin. Confirmar que Comercial carga la política de 10 días y que Trabajo conserva su modo de prueba/búsqueda, sin editor de días.
6. Dejar el interruptor activado hasta la decisión comercial expresa del propietario.

## Pruebas mínimas

- [ ] Regresión: con política `true` y 10 días, conductor nuevo obtiene 10 días; los existentes siguen igual.
- [ ] Política `false`: alta completa activa perfil, vehículo y billetera, registra 0 días y no concede comisión gratis.
- [ ] Idempotencia: doble alta no agrega ni reinicia promoción.
- [ ] Dos administradores: guardar comisión no cambia `promotion_duration_days` ni `promotion_enabled`.
- [ ] El usuario sin `settings.manage` no modifica la política, incluyendo llamadas RPC directas.
- [ ] El historial es visible solo con permisos de configuración.
- [ ] UI: bloque premium en Comercial primero; historial; nueva duración; modo de prueba y selector de conductor sin alteraciones.
- [ ] Ofertas de 15 días: permanecen **borrador**, no pueden activarse por este cambio.
