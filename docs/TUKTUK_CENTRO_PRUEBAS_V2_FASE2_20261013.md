# Centro de Pruebas Marketplace V2 — Implementación integrada en rama (fase 2)

## Alcance
1. Formulario Admin compacto y responsive con selección múltiple, envío individual o grupal, detalle simulado de carrera e historial. Conserva capacidad de limpiar exclusivamente pruebas.
2. RPC de alta administrativa de carreras de prueba con un cliente sintético interno, destinatarios congelados, idempotencia y auditoría. No usa datos de clientes reales.
3. Compatibilidad con las aplicaciones existentes: las mismas funciones de visibilidad y aceptación se adaptan a los destinatarios congelados, sin alterar el contrato público.
4. Protección de carreras reales: la clasificación como prueba deja de depender del interruptor global. Las carreras del cliente se consideran reales salvo que hayan sido creadas explícitamente como pruebas.
5. Comisión normal simulada sin cargo real; opción financiera extraordinaria únicamente para administradores con permiso payments.manage y doble confirmación.
6. Historial de carreras y estados de entrega de solicitudes de notificación. **Estado `sent` del proveedor no prueba visualización por el conductor.**

## Riesgos y pruebas obligatorias antes de publicar
- La migración nueva **modifica funciones transaccionales críticas**. No se debe aplicar directamente a producción para comprobar si compila. Validar primero en una base aislada con esquema compatible y transacciones de prueba.
- Se incluyen guardas contractuales: si el servidor no conserva los fragmentos esperados de las funciones que se adaptan, la migración debe fallar en conjunto y no crear un estado parcial.
- Probar carrera real publicada desde Cliente con modo de prueba encendido; debe permanecer `is_test=false`.
- Probar destinatario individual, grupo de dos, exclusión de terceros, aceptación atómica de un ganador, recarga/comisión real y comisión cero, eliminación lógica e historial, notificaciones y permisos por rol.
- Verificar que clientes sintéticos no aparezcan en el directorio de Clientes y que la Ficha 360 no cuente pruebas.
- Verificar compatibilidad Android/Web y responsive escritorio-tableta-móvil.
- El botón de registrar comisión real puede afectar saldo financiero; requiere permisos y doble confirmación. No ensayar con cuentas reales sin autorización específica.

## Etapa
Implementación de código y pruebas de contratos en rama. Aun superando la compilación local, **no equivale a pruebas dinámicas ni a autorización para desplegar**. La rama principal, las migraciones remotas y producción permanecen intactas en esta fase.
