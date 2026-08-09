# Instrucciones de Copilot — Centro de Control de VRIXORA

Antes de analizar, proponer o modificar código, leer:

- `AGENTS.md`
- `docs/PRD_MASTER.md`

Este repositorio contiene la fuente oficial del PRD del ecosistema:

`docs/PRD_MASTER.md`

No modificar una regla crítica del producto sin documentar primero la diferencia y obtener aprobación del owner.

## Alcance

Este repositorio corresponde al Centro de Control de VRIXORA.

Incluye:

- autenticación administrativa;
- dashboard;
- clientes;
- pagos;
- recibos;
- licencias;
- planes y precios;
- empleados;
- roles y permisos;
- marketing;
- campañas;
- referidos;
- estadísticas;
- configuración;
- auditoría;
- navegación móvil y de escritorio;
- configuración dinámica de WhatsApp.

No implementar aquí funciones operativas propias de TukTuk Control, como:

- registros diarios del vehículo;
- almacenamiento local Hive;
- modo sin conexión de la aplicación;
- kilometraje;
- voltaje de batería;
- mantenimiento del vehículo;
- compilación Android.

No implementar aquí contenido público propio de la web corporativa, salvo configuraciones compartidas necesarias para el ecosistema.

## Reglas de licencias

- Cada cliente tendrá una sola licencia por aplicación.
- El primer registro genera una prueba de 30 días.
- La primera compra sustituye la prueba sin acumular los días restantes.
- Una renovación pagada activa conserva los días restantes.
- Una licencia vencida comienza desde la confirmación del nuevo pago.
- La misma licencia debe reutilizarse al comprar o
