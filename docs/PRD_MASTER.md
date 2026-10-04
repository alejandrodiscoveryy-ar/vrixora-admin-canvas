# DOCUMENTO DE REQUISITOS DEL PRODUCTO
## Ecosistema VRIXORA Solutions y TukTuk Control

**Empresa:** VRIXORA Solutions
**Producto administrativo:** Centro de Control de VRIXORA
**Primera aplicación gestionada:** TukTuk Control
**Versión del documento:** 2.0
**Fecha:** 4 de octubre de 2026
**Estado:** Producto en evolución con componentes en producción; el modelo comercial TUKTUK 2.0 es el objetivo aprobado y permanece pendiente de implementación y verificación completa
**Eslogan:** Aplicaciones inteligentes para negocios inteligentes

## Historial de versiones

| Versión | Fecha | Cambios principales | Aprobación |
|---|---|---|---|
| 1.0 | 3 de agosto de 2026 | Documento inicial del ecosistema VRIXORA Solutions y TukTuk Control | Owner |
| 1.1 | 4 de agosto de 2026 | Configuración dinámica de WhatsApp, separación entre soporte y pagos, plantillas de mensajes, registro manual del WhatsApp del cliente y reglas de actualización del PRD | Owner |
| 1.2 | 15 de septiembre de 2026 | Regla oficial de referidos de TukTuk Marketplace: crédito de 100 CUP en billetera por referido válido, sin días promocionales ni impacto en TukTuk Control | Owner |
| 1.3 | 16 de septiembre de 2026 | Regla oficial de calificación Customer → Driver de TukTuk Marketplace | Owner |
| 2.0 | 4 de octubre de 2026 | Nuevo modelo comercial TUKTUK: Control y Estadísticas permanentes; alta diferenciada de conductor; promoción configurable; continuidad por billetera; recargas y referidos; comisión por trabajo; facturación por recarga confirmada; Conductor 360; retirada de licencias y planes de TUKTUK | Owner |

---

# 1. Resumen ejecutivo

El ecosistema VRIXORA está compuesto por productos digitales conectados que pueden utilizar modelos comerciales diferentes según cada proyecto.

Para **TUKTUK**, la versión 2.0 sustituye el modelo anterior basado en licencia, plan, vencimiento y renovación.

El ecosistema TUKTUK se organiza en cuatro componentes conectados:

1. **TUKTUK Control**, utilizado por cualquier usuario autenticado con Google para controlar ingresos, gastos, kilometraje, batería, mantenimiento y estadísticas. Control y Estadísticas son permanentes y no vencen.
2. **TUKTUK Trabajos**, integrado en la aplicación del prestador. Un usuario solo se convierte en **conductor** cuando completa el alta requerida de conductor y vehículo.
3. **TUKTUK Cliente**, experiencia desde la cual el solicitante crea y sigue servicios.
4. **Centro de Control de VRIXORA**, plataforma administrativa para gestionar usuarios, conductores, clientes Marketplace, trabajos, billeteras, recargas, referidos, comisiones, facturación, configuración comercial, empleados, permisos, métricas y auditoría.

Al completar correctamente el alta de Trabajos, el conductor recibe una **promoción comercial inicial de X días**. Su duración se configura desde Gestión Comercial y se congela al iniciarse.

Durante la promoción, las nuevas aceptaciones usan el modo promocional definido para Trabajos y no consumen comisión de la billetera.

Terminada la promoción, no existe compra ni renovación de plan. El conductor puede continuar aceptando trabajos siempre que su saldo disponible cubra la comisión aplicable. El saldo puede proceder de recargas pagadas o de recompensas por referidos.

Una recarga solo aumenta saldo después de que el pago sea confirmado. La confirmación debe acreditar la billetera y generar el documento financiero correspondiente de forma transaccional e idempotente.

Para TUKTUK dejan de ser productos operativos las licencias de Control, los planes periódicos, las renovaciones y los bloqueos por vencimiento. La infraestructura heredada se retirará únicamente después de auditar dependencias y verificar que no se afecten usuarios ni datos reales.

---

# 2. Visión del producto

Crear un ecosistema en el que cualquier usuario pueda utilizar permanentemente TUKTUK Control para conocer el comportamiento económico y operativo de su actividad, y pueda convertirse en conductor de TUKTUK Trabajos cuando decida prestar servicios.

VRIXORA administrará la operación comercial del conductor mediante una promoción inicial configurable, una billetera prepago, recargas, recompensas por referidos, comisión por trabajo, facturación y auditoría.

La experiencia administrativa se organizará alrededor de la cadena:

**usuario → conductor → promoción → billetera → trabajos → comisiones**

Los conceptos heredados de licencia y plan no condicionarán el acceso a Control y Estadísticas.

---

# 3. Problemas que resuelve

## 3.1. Problemas del usuario

Los usuarios necesitan conocer con precisión:

- cuánto dinero generan;
- cuánto gastan;
- cuál es su ganancia real;
- cuántos kilómetros recorren;
- cómo se comporta su vehículo;
- cuándo corresponde realizar mantenimiento;
- qué gastos afectan más su rentabilidad;
- cómo evoluciona su actividad.

Estas funciones no deben dejar de estar disponibles porque termine una promoción comercial o no exista saldo Marketplace.

## 3.2. Problemas del conductor

Quien decide prestar servicios necesita:

- completar una sola vez sus datos de conductor;
- registrar vehículos válidos;
- recibir oportunidades compatibles;
- conocer el estado de su promoción;
- conocer saldo real, promocional, reservado y disponible;
- recargar la billetera;
- utilizar recompensas de referidos;
- comprender la comisión aplicable;
- mantener historial de trabajos, valoraciones, incidencias y movimientos.

## 3.3. Problemas de VRIXORA

VRIXORA necesita:

- distinguir usuario de conductor;
- disponer de un Conductor 360;
- configurar la promoción sin publicar código;
- gestionar billeteras, recargas y comisiones de forma trazable;
- confirmar pagos antes de acreditar saldo;
- generar documentos financieros por recargas confirmadas;
- separar recargas, saldo promocional, reservas y comisiones;
- administrar referidos sin duplicaciones;
- separar responsabilidades de empleados;
- medir captación, conversión, actividad e ingresos por comisión;
- conservar auditoría;
- retirar de forma segura el modelo antiguo de licencias TUKTUK;
- mantener la plataforma preparada para otros productos de VRIXORA.

---

# 4. Objetivos del producto

## 4.1. Objetivo general

Operar TUKTUK como una suite de control y marketplace en la que Control y Estadísticas permanezcan disponibles para el usuario y la monetización de Trabajos se base en promoción inicial, billetera y comisión por trabajo.

## 4.2. Objetivos específicos

- Permitir que el usuario registre y analice sus operaciones diarias.
- Mantener las funciones esenciales de Control disponibles sin conexión.
- Sincronizar automáticamente al recuperar conectividad.
- Mantener Control y Estadísticas sin vencimiento de licencia.
- Convertir al usuario en conductor solo cuando complete el onboarding de Trabajos.
- Configurar la duración de la promoción desde Gestión Comercial.
- Permitir continuidad posterior sin planes ni renovaciones.
- Cubrir comisiones con saldo real o promocional.
- Confirmar pagos antes de acreditar una recarga.
- Generar documento financiero al confirmar una recarga.
- Centralizar la situación operativa y comercial en Conductor 360.
- Aplicar permisos diferentes para owner, finanzas/cobros, operaciones, soporte y marketing.
- Proteger datos financieros y administrativos.
- Mantener trazabilidad mediante ledger y auditoría.
- Retirar de forma controlada el modelo heredado de licencias TUKTUK.
- Preparar el Centro de Control para otros productos de VRIXORA.

---

# 5. Alcance del proyecto

## 5.1. TUKTUK Control

Debe incluir:

- registro e inicio de sesión con Google;
- perfil del usuario;
- vehículos;
- ingresos y gastos;
- categorías;
- kilometraje;
- batería cuando corresponda;
- notas;
- estadísticas;
- mantenimiento;
- funcionamiento sin conexión;
- sincronización;
- referidos;
- soporte;
- actualizaciones sin pérdida de datos;
- acceso permanente a Control y Estadísticas.

## 5.2. TUKTUK Trabajos — Prestador

Debe incluir:

- onboarding de conductor;
- datos y foto del conductor;
- vehículo y foto principal;
- capacidades y servicios;
- disponibilidad;
- promoción comercial;
- oportunidades;
- trabajos activos, programados e históricos;
- billetera;
- recargas;
- referidos;
- comisiones;
- valoraciones;
- incidencias.

## 5.3. TUKTUK Cliente

Debe permitir solicitar y seguir servicios sin confundir la identidad del cliente con la del conductor.

## 5.4. Centro de Control de VRIXORA

Debe incluir para TUKTUK:

- Resumen;
- Usuarios;
- Conductores;
- Conductor 360;
- Clientes Marketplace;
- Trabajos;
- Billeteras;
- Recargas;
- Facturación;
- Referidos;
- Gestión Comercial;
- Tarifas y comisiones;
- Incidencias;
- Valoraciones;
- Empleados;
- Roles y permisos;
- Marketing;
- Rendimiento;
- Configuración;
- Auditoría.

Las pantallas operativas de **Licencias** y **Planes de licencia** dejan de formar parte del negocio de TUKTUK.

## 5.5. Backend compartido

El backend debe gestionar:

- autenticación;
- usuarios y perfiles;
- conductores;
- vehículos;
- relaciones conductor–vehículo;
- registros operativos;
- promoción comercial;
- trabajos;
- billeteras y ledger;
- recargas y pagos;
- documentos financieros;
- referidos;
- comisiones y reservas;
- valoraciones e incidencias;
- empleados y permisos;
- auditoría;
- sincronización;
- RLS;
- operaciones transaccionales e idempotentes.

La infraestructura antigua de licencias y planes se considera legado de TUKTUK hasta completar su retiro seguro.

---

# 6. Usuarios del sistema

## 6.1. Usuario TUKTUK

Es la persona que inicia sesión con su cuenta Google.

Ser usuario no significa ser conductor.

Puede:

- registrar ingresos y gastos;
- consultar estadísticas;
- gestionar sus datos y vehículos permitidos;
- registrar kilometraje y batería cuando corresponda;
- consultar mantenimientos;
- utilizar funciones esenciales sin conexión;
- sincronizar datos;
- contactar al soporte;
- consultar el programa de referidos;
- iniciar el alta de conductor cuando quiera trabajar.

No puede:

- modificar saldos;
- confirmar pagos;
- modificar tarifas;
- acceder al Centro de Control;
- consultar datos de otros usuarios.

## 6.2. Conductor TUKTUK

Un usuario se convierte en conductor cuando completa los requisitos obligatorios de Trabajos y el backend reconoce un perfil de conductor válido.

Puede:

- gestionar su disponibilidad;
- recibir oportunidades compatibles;
- aceptar y ejecutar trabajos;
- consultar promoción;
- consultar billetera;
- solicitar recargas;
- utilizar saldo de referidos para cubrir comisiones;
- consultar trabajos, valoraciones, incidencias y movimientos propios.

## 6.3. Cliente Marketplace

Es la persona o empresa que solicita un servicio. Es una entidad distinta del conductor y del usuario de Control.

## 6.4. Owner de VRIXORA

Puede:

- acceder a todos los módulos;
- consultar usuarios, conductores y clientes;
- configurar promoción, recompensa y comisión;
- gestionar empleados, roles y permisos;
- revisar y anular operaciones financieras según reglas;
- gestionar tarifas;
- revisar incidencias;
- consultar auditoría;
- gestionar excepciones.

## 6.5. Finanzas / Cobros

Puede:

- buscar conductores;
- consultar solicitudes de recarga;
- revisar importe, moneda, método y referencia;
- registrar o actualizar WhatsApp autorizado cuando corresponda;
- confirmar pagos recibidos;
- generar/consultar el documento financiero resultante;
- consultar sus operaciones.

No puede:

- editar balances directamente;
- alterar ledger;
- modificar promoción o comisión salvo permiso específico;
- gestionar empleados;
- cambiar permisos;
- eliminar pagos confirmados.

## 6.6. Marketing y Gestión Comercial

Puede, según permisos:

- consultar nuevos registros;
- registrar fuentes;
- gestionar campañas;
- consultar referidos;
- añadir notas y etiquetas;
- seguir conversión de usuario a conductor;
- consultar promociones;
- gestionar parámetros comerciales autorizados;
- consultar estadísticas comerciales sin datos financieros sensibles innecesarios.

## 6.7. Operaciones y Soporte

Puede supervisar conductores, trabajos, estados e incidencias según permisos. No puede acreditar saldo ni confirmar pagos sin capacidad financiera.

---

# 7. Flujos generales

## 7.1. Usuario de Control

```text
Instala TUKTUK
      ↓
Inicia sesión con Google
      ↓
Se crea o vincula su perfil
      ↓
Utiliza Control y Estadísticas
      ↓
Registra y sincroniza sus datos
      ↓
El acceso permanece disponible sin vencimiento
```

## 7.2. Alta como conductor

```text
Usuario decide trabajar
      ↓
Entra en Trabajos
      ↓
Completa conductor + vehículo + fotos
      ↓
Backend valida onboarding
      ↓
Se consolida su condición de conductor
      ↓
Se inicia promoción comercial de X días configurada en Gestión Comercial
      ↓
Durante promoción acepta en modo promocional
      ↓
Finaliza promoción
      ↓
Continúa si el saldo disponible cubre la comisión
```

## 7.3. Recarga

```text
Conductor solicita recarga
      ↓
Realiza el pago por una vía habilitada
      ↓
La solicitud permanece pendiente
      ↓
Finanzas/Cobros verifica el pago
      ↓
Confirma
      ↓
El servidor acredita exactamente una vez la billetera
      ↓
Genera exactamente un documento financiero
      ↓
Movimiento y documento aparecen en Conductor 360
```

## 7.4. Referido

```text
Conductor comparte código/enlace
      ↓
Nuevo usuario queda vinculado
      ↓
Completa alta de conductor
      ↓
Completa su primer trabajo válido
      ↓
Se acredita una sola recompensa
      ↓
El saldo promocional puede cubrir comisiones futuras
```

---

# 8. Requisitos funcionales de TukTuk Control

## 8.1. Autenticación

- El usuario debe iniciar sesión mediante Google.
- La cuenta debe vincularse a un perfil único.
- No deben crearse perfiles duplicados por múltiples inicios de sesión.
- El sistema debe conservar la sesión cuando corresponda.
- Los errores de autenticación deben mostrarse claramente.

## 8.2. Perfil del usuario

El perfil debe incluir:

- Nombre.
- Correo.
- Identificador.
- Fecha del primer registro.
- Fecha de creación.
- Estado.
- Información de contacto, cuando esté disponible.

## 8.3. Vehículos

El usuario podrá:

- Crear o completar la información de su vehículo.
- Consultar sus datos.
- Editar información permitida.
- Identificar un vehículo principal.
- Mantener la información asociada a su cuenta.

## 8.4. Registro diario

Cada registro puede incluir:

- Fecha.
- Ingresos.
- Gastos.
- Categoría del gasto.
- Kilometraje.
- Voltaje de batería.
- Nota.
- Vehículo.
- Estado de sincronización.
- Identificador del dispositivo.

## 8.5. Ingresos y gastos

- El usuario debe poder registrar ingresos diarios.
- Debe poder registrar gastos.
- Los gastos deben clasificarse por categorías.
- Los valores deben validarse antes de guardarse.
- Los registros deben poder editarse según las reglas definidas.
- Las estadísticas deben calcularse a partir de los datos válidos.

## 8.6. Kilometraje

- Debe registrarse el odómetro.
- El sistema debe evitar valores evidentemente menores que registros anteriores, salvo confirmación.
- El kilometraje debe utilizarse para estadísticas y mantenimiento.

## 8.7. Batería

- El usuario registrará el voltaje de la batería.
- El sistema utilizará el voltaje como dato principal.
- El valor de referencia máximo será configurable.
- Para el modelo actual, 80 V representa la carga máxima de referencia.
- No se deben mostrar porcentajes engañosos cuando no exista una conversión confiable.

## 8.8. Mantenimiento

El módulo debe permitir:

- Definir intervalos.
- Consultar próximos mantenimientos.
- Registrar mantenimientos realizados.
- Mantener historial.
- Relacionar el mantenimiento con fecha o kilometraje.

## 8.9. Estadísticas

El usuario podrá consultar:

- Ingresos.
- Gastos.
- Ganancia neta.
- Kilómetros recorridos.
- Promedio diario.
- Rendimiento por período.
- Categorías de gasto.
- Evolución de los registros.

Los períodos deben incluir:

- Día.
- Semana.
- Mes.
- Intervalo personalizado.

## 8.10. Funcionamiento sin conexión

- Los registros deben guardarse localmente.
- La aplicación debe funcionar sin internet para las funciones esenciales.
- Cada registro debe indicar si está pendiente de sincronización.
- Al recuperar la conexión, los datos deben sincronizarse automáticamente.
- Las actualizaciones no deben eliminar la base de datos local.
- Los conflictos deben resolverse mediante reglas predecibles.
- La eliminación debe ser lógica cuando sea necesario.

## 8.11. Acceso permanente a Control y Estadísticas

TUKTUK Control no utilizará plan, licencia, vencimiento ni tiempo restante como condición para usar las funciones de Control y Estadísticas.

El usuario podrá continuar utilizando:

- registros;
- ingresos y gastos;
- kilometraje;
- batería cuando corresponda;
- mantenimiento;
- estadísticas;
- historial;
- sincronización.

La finalización de la promoción de Trabajos o la falta de saldo no convierten Control en modo solo lectura.

Las restricciones económicas se aplican únicamente a las operaciones de Trabajos que requieren saldo.

## 8.12. Referidos

### Alcance

El programa vigente de referidos de TUKTUK acredita una recompensa en la billetera Marketplace. No genera días de licencia, no prolonga Control y no crea ni reinicia la promoción comercial inicial.

El mensaje comercial principal será:

**"Invita a un amigo y gana dinero".**

El valor inicial de referencia será **100 CUP por referido válido**. Importe, moneda y activación deberán ser configurables desde VRIXORA y el valor aplicable quedará congelado cuando el referido cualifique.

### Elegibilidad

Un referido será válido únicamente cuando el nuevo conductor:

1. quede correctamente vinculado al referente;
2. complete los requisitos obligatorios para Trabajos;
3. tenga conductor y vehículo válidos;
4. complete su primer trabajo válido.

Un **primer trabajo válido** es el primer trabajo del referido completado satisfactoriamente por Marketplace. Califica cuando alcanza `settled` o, si pasó por una incidencia, cuando esta se resuelve administrativamente con `resolution = completed`.

No califican `cancelled_by_customer`, `cancelled_by_driver`, `expired` ni una incidencia resuelta como `cancelled`.

La recompensa se genera exactamente una vez. No se genera por abrir un enlace, instalar, iniciar sesión, introducir un código, completar solo el perfil, cambiar de vehículo, reinstalar, recargar la billetera ni modificar la promoción.

### Naturaleza del saldo

El crédito:

- entra en la billetera como saldo promocional;
- aumenta el saldo disponible para cubrir comisiones;
- puede cubrir comisiones aunque no exista una recarga pagada previa;
- no es retirable ni transferible como efectivo;
- no requiere un depósito inicial mínimo;
- no genera una factura de pago;
- no modifica `started_at` ni `ends_at` de la promoción;
- no crea ni reinicia promociones;
- no afecta el acceso permanente a Control y Estadísticas.

Si la promoción terminó y el saldo disponible procedente únicamente de referidos cubre la comisión requerida, el conductor puede aceptar el trabajo.

### Trazabilidad

El crédito se registra mediante ledger y nunca mediante una modificación directa del balance, un pago o una recarga.

La operación positiva utilizará el tipo funcional `referral_credit` y procedencia `referral_reward`, o sus equivalentes versionados si el contrato técnico evoluciona.

La trazabilidad conservará, como mínimo:

- referente;
- referido;
- trabajo que cualificó;
- importe;
- moneda;
- versión de regla;
- clave de idempotencia.

Se impedirán autorreferidos, duplicaciones, reinstalaciones utilizadas para obtener una segunda recompensa y reasignaciones indebidas.

En ayuda y términos se aclarará que el saldo obtenido por referidos se utiliza dentro de TUKTUK Marketplace para cubrir comisiones y no puede retirarse en efectivo.

## 8.13. Calificación Customer → Driver en Marketplace

Después de que un trabajo alcance `settled`, el cliente Marketplace podrá
calificar al transportista asignado con **1 a 5 estrellas** y un comentario
opcional. Solo podrá existir una valoración por trabajo; deberá quedar ligada a
`project_id`, `job_id`, `customer_id` y `driver_user_id`, ser idempotente y no
podrá ser creada, modificada ni eliminada por el conductor. El cliente solo
podrá valorar su propio trabajo y no habrá calificaciones antes de `settled`.

## 8.14. Atención al cliente y contacto por WhatsApp

TUKTUK deberá disponer de dos vías diferenciadas:

1. **Atención al cliente**, para soporte y consultas generales.
2. **Recargas y billetera**, para solicitudes y seguimiento financiero del conductor.

Ambas vías podrán usar inicialmente el mismo número, pero deberán generar mensajes distintos y quedar preparadas para números diferentes.

### Atención al cliente

El mensaje podrá incluir:

- nombre;
- correo;
- nombre de la aplicación;
- descripción opcional.

### Recargas y billetera

El mensaje podrá incluir automáticamente:

- nombre del conductor;
- correo;
- identificador de solicitud de recarga;
- importe;
- moneda;
- método;
- referencia;
- motivo de contacto.

No deberá incluir plan, licencia ni vencimiento de Control.

### Configuración dinámica

El número, las etiquetas, plantillas y estado de cada vía se administrarán desde el Centro de Control.

La aplicación consultará la configuración remota cuando tenga conexión y conservará localmente la última configuración válida.

Cuando no haya conexión:

- utilizará la última configuración válida;
- no bloqueará el funcionamiento general;
- utilizará un valor de respaldo únicamente cuando nunca haya existido una configuración válida.

Los enlaces de WhatsApp utilizarán formato internacional y codificación segura.

## 8.15. Plantillas y variables de WhatsApp

Las plantillas podrán utilizar:

- `{{user_name}}`
- `{{user_email}}`
- `{{driver_name}}`
- `{{application_name}}`
- `{{topup_request_id}}`
- `{{topup_amount}}`
- `{{currency}}`
- `{{payment_method}}`
- `{{payment_reference}}`
- `{{contact_reason}}`

Si falta un dato opcional, el mensaje se generará sin variables sin resolver.

La primera versión no utilizará la API de WhatsApp para identificar automáticamente el número del usuario. Las actualizaciones manuales autorizadas conservarán trazabilidad.

# 9. Requisitos funcionales del Centro de Control

## 9.1. Panel principal

Debe mostrar información según rol.

Para el owner:

- usuarios totales;
- nuevos registros;
- conductores totales y activos;
- conductores en onboarding;
- promociones activas y próximas a finalizar;
- trabajos por estado;
- recargas pendientes y confirmadas;
- comisiones reservadas y liquidadas;
- referidos;
- documentos financieros recientes;
- incidencias;
- actividad reciente.

Para finanzas/cobros:

- recargas pendientes;
- pagos confirmados del período;
- documentos recientes;
- operaciones propias;
- elementos que requieran conciliación.

Para marketing:

- nuevos usuarios;
- usuarios interesados en Trabajos;
- onboarding iniciado;
- nuevos conductores;
- campañas;
- referidos;
- conversiones.

Las recargas y las comisiones deben medirse por separado.

## 9.2. Usuarios

Debe permitir:

- buscar por nombre;
- correo;
- teléfono o WhatsApp;
- identificador;
- consultar perfil;
- consultar vehículos;
- consultar historial comercial;
- consultar auditoría relacionada, según permisos.

Un usuario sin alta completa de Trabajos no debe aparecer como conductor.

El perfil podrá incluir:

- WhatsApp principal;
- fecha de actualización;
- usuario que lo actualizó;
- origen;
- estado de confirmación manual;
- historial de cambios.

Si un operador introduce un WhatsApp diferente, se mostrará el valor anterior y el nuevo antes de confirmar. No se sustituirá silenciosamente.

## 9.3. Conductores y Conductor 360

Cada conductor tendrá una ficha 360° única vinculada a su cuenta de usuario.

Debe integrar, según permisos:

- identidad y contacto;
- cuenta Google vinculada;
- foto y datos del conductor;
- onboarding;
- estado operativo y suspensión;
- vehículo o vehículos;
- servicios y capacidades;
- promoción: inicio, fin, duración y estado;
- billetera: saldo real, promocional, reservado y disponible;
- recargas;
- pagos y referencias;
- movimientos financieros con saldo antes y después cuando corresponda;
- documentos financieros;
- referidos y recompensas;
- trabajos;
- comisiones;
- valoraciones;
- incidencias;
- actividad y auditoría.

El objetivo es comprender la situación completa del conductor sin reconstruirla entre módulos.

## 9.4. Recargas y pagos

El módulo será el punto principal para acreditar saldo pagado.

La solicitud deberá incluir:

- conductor;
- nombre y correo;
- WhatsApp;
- importe;
- moneda;
- método de pago;
- referencia;
- observación;
- operador;
- fecha y hora;
- estado.

Antes de confirmar se mostrará una vista previa.

Si el conductor no tiene WhatsApp registrado, un operador autorizado podrá introducirlo. Si cambia, se mostrarán valor anterior y nuevo, se pedirá confirmación y se conservará auditoría.

Al confirmar el pago, una única operación deberá:

1. confirmar la recarga;
2. acreditar exactamente una vez el saldo real;
3. generar exactamente un documento financiero;
4. guardar o actualizar el WhatsApp autorizado cuando corresponda;
5. registrar actor, fecha y procedencia;
6. actualizar las métricas correctas.

Una solicitud pendiente no aumenta saldo.

## 9.5. Facturación / documentos financieros

Cada recarga pagada y confirmada debe generar exactamente un documento financiero único asociado a esa operación.

La interfaz administrativa podrá presentarlo dentro del módulo **Facturación**. Su clasificación fiscal formal deberá adaptarse a la jurisdicción aplicable antes de utilizarlo como factura fiscal oficial.

El documento debe incluir, como mínimo:

- número único;
- conductor;
- correo;
- importe;
- moneda;
- concepto;
- método de pago;
- referencia;
- fecha de pago;
- fecha de emisión;
- identificador de recarga;
- operador;
- estado;
- identificador verificable;
- proyecto;
- snapshot de la identidad y datos del emisor utilizados al emitirlo.

Debe poder:

- visualizarse;
- compartirse;
- imprimirse o exportarse.

Una vez emitido, su contenido histórico no se reescribirá silenciosamente.

Cuando corresponda corregir o anular una operación:

- se conservará el documento original;
- se registrará el motivo;
- se realizará el reverso o asiento compensatorio necesario;
- se generará el documento correctivo o nota de crédito cuando corresponda;
- se vinculará la corrección con el documento original;
- se conservará la auditoría completa.

Una recarga de saldo promocional por referidos no genera factura de pago porque no representa dinero recibido del conductor.

## 9.6. Gestión Comercial

El owner o rol autorizado podrá configurar:

- duración de la promoción inicial;
- activación de promoción para nuevas altas;
- importe y moneda de recompensa por referido;
- activación del programa de referidos;
- comisión Marketplace;
- métodos o vías de pago habilitados para recargas y sus instrucciones;
- parámetros de seguimiento;
- otros parámetros comerciales expresamente aprobados.

Los cambios no recalculan retroactivamente promociones, recompensas ni comisiones cuyo snapshot ya esté congelado.

## 9.7. Tarifas y comisiones

Para TUKTUK, Planes y precios deja de referirse a planes de licencia.

Debe permitir administrar:

- tipos/modalidades de servicio;
- precio base;
- reglas por distancia u otros factores;
- moneda;
- tasa cuando corresponda;
- comisión;
- estado;
- orden;
- versionado e historial de cambios importantes.

## 9.8. Empleados

El owner debe poder:

- crear o invitar empleados;
- activar o desactivar accesos;
- asignar roles;
- revisar actividad;
- revocar sesiones cuando sea necesario.

## 9.9. Roles y permisos

Los permisos deben aplicarse en frontend y backend.

No es suficiente ocultar botones.

Las acciones bloqueadas deben rechazarse también mediante:

- RLS;
- funciones seguras;
- validaciones de rol;
- políticas de acceso.

## 9.10. Marketing

Debe permitir:

- gestionar campañas;
- registrar fuentes;
- crear códigos o enlaces de campaña;
- añadir notas;
- aplicar etiquetas;
- consultar conversiones;
- seguir usuarios interesados en Trabajos;
- consultar onboarding y nuevos conductores;
- consultar referidos;
- medir resultados por canal;
- exportar reportes autorizados sin datos financieros sensibles.

## 9.11. Auditoría

Debe registrar:

- usuario que realizó la acción;
- acción;
- entidad afectada;
- valor anterior;
- valor nuevo;
- motivo;
- fecha y hora;
- identificador de operación.

Son acciones sensibles:

- confirmar/anular una recarga;
- acreditar/revertir saldo;
- modificar promoción;
- modificar comisión o tarifas;
- suspender/reactivar conductor;
- modificar permisos;
- corregir un documento;
- modificar WhatsApp principal;
- intervenir una relación de referido.

## 9.12. Configuración de WhatsApp por proyecto

Dentro de la configuración del proyecto, el owner podrá administrar:

### Configuración general

- número principal;
- estado activo/inactivo;
- nombre visible.

### Atención al cliente

- número específico opcional;
- texto del botón;
- plantilla;
- estado.

### Recargas y billetera

- número específico opcional;
- texto del botón;
- plantilla;
- estado;
- variables.

Cuando no exista número específico, se utilizará el principal.

Solo roles autorizados podrán modificarlo.

Toda modificación debe registrar valor anterior, valor nuevo, usuario, fecha, proyecto y motivo opcional.

La lectura necesaria para TUKTUK debe ser segura y no exponer datos administrativos sensibles.

No se utilizará `service_role` en frontend.

---

# 10. Modelo comercial de TUKTUK

## 10.1. Control y Estadísticas

Son permanentes para el usuario autenticado. No existe vencimiento de licencia que las bloquee o convierta en solo lectura.

## 10.2. Conversión a conductor

La cuenta Google identifica al usuario.

La condición de conductor se adquiere cuando se completan los datos obligatorios de Trabajos y el backend valida el onboarding.

## 10.3. Promoción inicial

Al completar el alta se inicia una única promoción comercial inicial.

Debe cumplir:

- duración de **X días** configurada desde Gestión Comercial;
- inicio y fin calculados por servidor;
- duración congelada al inicio;
- una promoción inicial por conductor/proyecto;
- independencia absoluta respecto a Control;
- trabajos aceptados en modo promocional sin comisión retroactiva.

## 10.4. Después de la promoción

No existe renovación, compra de plan ni cuota periódica.

Para una nueva aceptación:

- el servidor calcula la comisión;
- verifica saldo disponible;
- si alcanza, reserva la comisión;
- si no alcanza, rechaza únicamente esa aceptación con un mensaje comprensible.

## 10.5. Fuentes de saldo

El saldo puede proceder de:

1. **Recargas pagadas y confirmadas**: saldo real.
2. **Recompensas por referidos**: saldo promocional.

Ambas fuentes pueden cubrir comisiones.

El conductor puede recargar antes, durante o después de la promoción. Una recarga no inicia, reinicia, extiende ni modifica las fechas de la promoción.

No existe un depósito inicial mínimo obligatorio como condición separada de habilitación.

## 10.6. Comisión

La comisión debe quedar congelada según la regla aplicable al trabajo.

Fuera de promoción:

- se reserva al aceptar;
- se liquida cuando corresponde;
- se libera si corresponde;
- ninguna interfaz modifica balances directamente.

## 10.7. Suspensión

La suspensión es una decisión operativa o de riesgo independiente de Control y del saldo.

Una suspensión puede impedir participar en TUKTUK Trabajos según su alcance, pero no debe bloquear las funciones permanentes de Control y Estadísticas.

Debe exigir permiso, motivo, trazabilidad y ser reversible cuando corresponda.

## 10.8. Retirada del modelo anterior

Para TUKTUK quedan obsoletos:

- licencia de prueba de Control;
- planes periódicos;
- vencimiento de Control;
- renovación;
- pago para desbloquear Control;
- extensión de licencia por referidos;
- pantalla operativa de Licencias;
- planes de licencia como producto comercial TUKTUK.

Se conservan usuarios y datos reales de Control.

Los datos exclusivamente de prueba no requieren migración de negocio. Las tablas, RPC y dependencias heredadas solo se eliminan después de auditoría técnica.

---

# 11. Recargas, pagos y facturación

## 11.1. Registro de solicitud

Debe registrar:

- conductor;
- importe;
- moneda;
- método;
- referencia;
- observación;
- estado;
- fecha;
- actor;
- clave de idempotencia cuando corresponda.

La solicitud no altera el saldo.

## 11.2. Confirmación

Una única operación transaccional debe:

1. confirmar el pago;
2. acreditar exactamente una vez el saldo real;
3. actualizar saldos derivados;
4. generar exactamente un documento;
5. registrar auditoría;
6. actualizar métricas;
7. devolver identificadores.

El frontend no modifica balances.

## 11.3. Pagos confirmados

No se eliminan físicamente como corrección ordinaria.

## 11.4. Anulación y corrección

Requiere autorización y motivo.

Antes de confirmar debe mostrarse una vista previa de consecuencias.

La corrección debe:

- conservar la operación y el documento originales;
- realizar reverso o asiento compensatorio cuando corresponda;
- generar y vincular un documento correctivo o nota de crédito cuando corresponda;
- actualizar el estado administrativo sin reescribir el contenido histórico;
- excluir de métricas aquello que corresponda;
- registrar auditoría.

Nunca se corrige dinero reescribiendo silenciosamente el saldo ni sustituyendo el documento histórico.

## 11.5. Pagos pendientes

Pueden cancelarse o eliminarse únicamente cuando:

- no hayan acreditado saldo;
- no tengan un documento final emitido que requiera anulación;
- no hayan producido efectos financieros;
- el usuario tenga permiso.

## 11.6. Duplicados

El sistema debe impedir:

- confirmaciones por doble clic;
- doble crédito para la misma operación;
- referencias duplicadas cuando la regla no lo permita;
- múltiples documentos finales para la misma confirmación salvo corrección formal;
- estados parciales en los que el pago quede confirmado sin crédito o documento.

## 11.7. Separación contable

Debe distinguirse entre:

- efectivo recibido como recarga/prepago;
- saldo promocional;
- saldo reservado;
- comisión liquidada;
- reversos y ajustes.

Una recarga no se contabiliza automáticamente como ingreso ganado por comisión.

---

# 12. Distribución de responsabilidades

| Persona | Función principal | Recargas/Pagos | Billetera | Gestión Comercial | Operación | Auditoría |
|---|---|---:|---:|---:|---:|---:|
| Owner | Administración general | Sí | Supervisión | Sí | Sí | Sí |
| Finanzas/Cobros | Verificar y confirmar recargas | Sí | Sin edición directa | Lectura | Limitada | Sus operaciones |
| Operaciones/Soporte | Conductores, trabajos e incidencias | No, salvo permiso | Lectura según rol | No | Sí | Limitada |
| Marketing | Captación, campañas y referidos | No | No sensible | Según permiso | No | Comercial |
| Usuario | Control y Estadísticas | No | No | No | No | No |
| Conductor | Prestación de servicios | Solicita recarga | Consulta la propia | No | Sus trabajos | No |

La regla principal será:

> El usuario utiliza Control permanentemente. El conductor trabaja primero con promoción y después con saldo. Finanzas confirma el dinero recibido. El servidor acredita y liquida. El owner controla reglas y excepciones.

---

# 13. Modelo de datos principal

El sistema debe manejar, como mínimo:

- Usuarios.
- Perfiles.
- Conductores.
- Vehículos.
- Relaciones conductor–vehículo.
- Registros diarios.
- Gastos.
- Categorías.
- Mantenimientos.
- Aplicaciones/proyectos.
- Clientes Marketplace.
- Solicitudes de servicio.
- Trabajos.
- Asignaciones y eventos.
- Promociones comerciales.
- Billeteras.
- Ledger.
- Reservas de comisión.
- Recargas.
- Pagos.
- Facturas/comprobantes.
- Referidos.
- Recompensas.
- Valoraciones.
- Incidencias.
- Tarifas y reglas comerciales.
- Empleados.
- Roles.
- Permisos.
- Campañas.
- Fuentes de captación.
- Notas comerciales.
- Auditoría.
- Dispositivos.
- Configuración.

Cada entidad debe utilizar identificadores únicos y relaciones controladas.

Las entidades heredadas de licencias, planes y recibos antiguos pueden permanecer temporalmente por compatibilidad técnica, pero no forman parte del modelo comercial vigente de TUKTUK.

---

# 14. Seguridad

## 14.1. Autenticación

- Inicio de sesión seguro.
- Google Sign-In para clientes.
- Acceso administrativo controlado.
- Sesiones revocables.
- Validación del usuario en backend.

## 14.2. Autorización

- RBAC para roles.
- RLS en las tablas de Supabase.
- Validación de permisos en funciones.
- El frontend no debe utilizar `service_role`.
- Los usuarios solo deben acceder a sus propios datos.

## 14.3. Datos financieros

- Los pagos confirmados no deben eliminarse físicamente como corrección ordinaria.
- Los documentos financieros deben conservarse.
- Las anulaciones y reversos requieren motivo.
- Los importes deben almacenarse de forma consistente.
- Ningún frontend modifica balances directamente.
- Créditos y débitos se registran mediante ledger e idempotencia.
- Las estadísticas deben separar recargas, saldo promocional, reservas y comisiones.
- Las operaciones anuladas o revertidas no deben contaminar métricas.

## 14.4. Auditoría

Toda acción sensible debe quedar registrada.

La auditoría no podrá editarse desde el frontend.

---

# 15. Requisitos de sincronización

- Los datos locales deben persistir.
- Los registros pendientes deben identificarse.
- La sincronización debe reintentarse automáticamente.
- Los errores deben ser visibles.
- No deben crearse duplicados.
- La aplicación debe funcionar en modo avión para tareas esenciales.
- Al recuperar internet debe sincronizar sin intervención innecesaria.
- Las actualizaciones de la aplicación no deben borrar información local.

---

# 16. Requisitos de experiencia de usuario

## 16.1. Diseño general

- Interfaz en español.
- Nombres comerciales en lugar de códigos técnicos.
- Compatible con móvil y escritorio.
- Apariencia profesional.
- Navegación clara.
- Acciones sensibles con confirmación.
- Estados visibles de carga, éxito y error.

## 16.2. Móvil

- Sin desplazamiento horizontal.
- Áreas táctiles mínimas de 44 píxeles.
- Formularios adaptados.
- Menús inferiores o laterales claros.
- Modales y paneles inferiores utilizables.
- Compatibilidad con anchos de 320, 360, 390 y 412 píxeles.

## 16.3. Fechas

En vistas principales se usarán textos comprensibles según el contexto.

Ejemplos:

- Promoción finaliza hoy.
- Promoción finaliza mañana.
- Quedan 12 días de promoción.
- Recarga confirmada hoy.
- Trabajo programado para mañana.

La hora exacta debe quedar en los detalles cuando sea relevante.

## 16.4. Accesibilidad

- Contraste suficiente.
- Etiquetas claras.
- Botones identificables.
- Navegación mediante teclado en escritorio.
- Mensajes comprensibles.

---

# 17. Métricas principales

El Centro de Control debe medir:

- nuevos usuarios;
- usuarios activos de Control;
- onboarding iniciado;
- conversión de usuario a conductor;
- conductores por estado;
- promociones activas y finalizadas;
- trabajos por estado;
- valor de servicios;
- recargas solicitadas, pendientes y confirmadas;
- importe recibido por recargas;
- saldo real, promocional y reservado;
- comisiones reservadas, liquidadas y revertidas;
- ingresos por comisión;
- pagos por operador;
- conversiones por campaña;
- conversiones por canal;
- referidos vinculados, cualificados y recompensados;
- documentos financieros emitidos y anulados;
- valoraciones;
- incidencias;
- uso de aplicación;
- sincronizaciones pendientes o fallidas.

No se utilizarán licencias vencidas, renovaciones o planes vendidos como métricas principales de TUKTUK.

---

# 18. Criterios de éxito

El producto será considerado alineado con TUKTUK 2.0 cuando:

1. un usuario pueda registrarse con Google;
2. se cree o vincule su perfil;
3. pueda usar Control y Estadísticas sin licencia temporal;
4. pueda registrar información sin conexión;
5. pueda sincronizar al recuperar internet;
6. el fin de promoción o la falta de saldo no bloquee Control;
7. un usuario solo se convierta en conductor al completar el alta requerida;
8. cada conductor tenga un Conductor 360 coherente;
9. la duración promocional proceda de Gestión Comercial y no esté fijada en 30 días;
10. una promoción iniciada conserve su duración;
11. durante promoción no exista comisión retroactiva;
12. después de promoción se pueda aceptar si el saldo cubre la comisión;
13. saldo procedente solo de referidos pueda cubrir comisiones;
14. no se exija depósito inicial mínimo adicional;
15. saldo insuficiente bloquee únicamente la nueva aceptación;
16. una recarga pendiente no aumente saldo;
17. confirmar un pago acredite exactamente una vez la billetera;
18. la confirmación genere exactamente un documento financiero;
19. una corrección financiera conserve historia y use compensación cuando corresponda;
20. empleados vean y ejecuten solo módulos y acciones autorizadas;
21. acciones sensibles queden auditadas;
22. los datos reales de usuarios y Control se conserven al retirar el legado;
23. WhatsApp de soporte y recargas se configure sin publicar nueva versión;
24. los cambios manuales de WhatsApp queden auditados;
25. TUKTUK no presente planes ni renovaciones de licencia como requisito de uso.

---

# 19. Elementos no incluidos en esta etapa

Esta etapa no dependerá de:

- pasarela internacional automática;
- cobros bancarios automáticos;
- facturación fiscal electrónica completa para todas las jurisdicciones;
- chat interno avanzado;
- inteligencia artificial dentro de TUKTUK Control;
- gestión automática de nóminas;
- contabilidad empresarial completa;
- gestión de inventario;
- soporte multimoneda avanzado;
- venta internacional automatizada;
- identificación automática del número del usuario mediante API de WhatsApp;
- webhooks de WhatsApp Business Platform;
- retiro o transferencia a efectivo del saldo promocional;
- pago del servicio del cliente mediante la billetera de comisiones;
- eliminación inmediata de la infraestructura heredada de licencias.

La arquitectura debe permitir incorporar posteriormente pasarelas y requisitos fiscales sin reconstruir el ledger ni el flujo de recargas.

---

# 20. Preparación para el futuro

El Centro de Control deberá estar preparado para administrar otras aplicaciones de VRIXORA.

Cada producto podrá tener un modelo comercial propio, por ejemplo:

- suscripción;
- licencia;
- compra única;
- billetera;
- comisión;
- consumo;
- promoción;
- combinaciones.

Cada aplicación podrá tener además:

- sus propios precios;
- reglas de dispositivos;
- usuarios y clientes;
- estadísticas;
- parámetros comerciales.

La retirada de licencias en TUKTUK no obliga a otros productos a utilizar el mismo modelo.

Los servicios compartidos de usuarios, empleados, permisos, auditoría, facturación, pagos y configuración deben poder reutilizarse sin imponer el modelo comercial de un proyecto a otro.

---

# 21. Prioridades del desarrollo

## Prioridad 0: alineación con el nuevo modelo

- Actualizar PRD Maestro, Centro de Control y Marketplace.
- Retirar el bloqueo de Control por licencia.
- Sustituir 30 días fijos por promoción configurable.
- Retirar requisito de depósito inicial mínimo.
- Permitir continuidad por saldo real o promocional.
- Definir Conductor 360.
- Transformar Licencias/Planes de TUKTUK.
- Adaptar mensajes, métricas y estados.

## Prioridad 1: operación financiera segura

- Recargas.
- Confirmación de pagos.
- Ledger.
- Facturación/documentos.
- Reversos.
- Conciliación.
- Auditoría.
- Roles y permisos.

## Prioridad 2: operación y crecimiento

- Conductores.
- Trabajos.
- Incidencias.
- Valoraciones.
- Campañas.
- Fuentes.
- Notas.
- Referidos.
- Informes.

## Prioridad 3: retirada del legado

- Inventario de dependencias.
- Migración o eliminación de referencias.
- Limpieza de datos exclusivamente de prueba.
- Retirada de UI y RPC obsoletos.
- Verificación de que ningún usuario real pierda datos.

## Prioridad 4: optimización y expansión

- Automatizaciones.
- Notificaciones.
- Pagos automáticos.
- Pasarelas.
- Facturación fiscal según jurisdicción.
- Nuevas aplicaciones.
- Expansión internacional.

---

# 22. Definición final del producto

**VRIXORA Solutions** será la plataforma empresarial que desarrolla y administra productos digitales con modelos comerciales configurables.

**TUKTUK Control** será la herramienta permanente de control económico y operativo del usuario.

**TUKTUK Trabajos** convertirá en conductor únicamente al usuario que complete su alta y monetizará mediante comisión cubierta por billetera después de una promoción inicial configurable.

El Centro de Control administrará usuarios, conductores, Conductor 360, clientes Marketplace, trabajos, billeteras, recargas, referidos, comisiones, facturación, empleados, marketing, configuración, rendimiento y auditoría.

El principio operativo será:

> El usuario controla su actividad sin vencimiento. El conductor trabaja primero con promoción y después con saldo. Los referidos y las recargas alimentan la billetera. El sistema cobra comisión por trabajo, no una licencia periódica de TUKTUK.

El modelo anterior de licencia, plan y renovación queda declarado legado para TUKTUK.

---

# 23. Gobernanza y actualización del PRD

`docs/PRD_MASTER.md` será la fuente oficial de requisitos del producto.

El PRD será un documento vivo, pero no se modificará automáticamente por cada cambio de código.

El proceso para incorporar una nueva funcionalidad será:

1. identificar la necesidad;
2. comparar la propuesta con el PRD vigente;
3. analizar el impacto en los proyectos;
4. obtener aprobación del owner;
5. actualizar el PRD y su versión;
6. registrar el cambio en el historial;
7. añadir la tarea al backlog;
8. desarrollar;
9. probar;
10. actualizar el estado de implementación.

No será necesario cambiar la versión del PRD por:

- correcciones de errores que no alteren el producto;
- cambios visuales menores;
- refactorizaciones;
- actualizaciones de dependencias;
- optimizaciones internas sin cambio funcional.

Cuando durante una auditoría se encuentre una función existente que no aparezca en el PRD:

- no se eliminará ni modificará automáticamente;
- se documentará;
- se clasificará como necesaria, técnica, posiblemente obsoleta, contradictoria o no verificable;
- se solicitará decisión del owner;
- solo después de su aprobación se incorporará, corregirá o retirará.

El PDF se regenerará a partir de `PRD_MASTER.md` cuando se cierre una versión relevante.

---

# 24. Distribución entre los proyectos

## 24.1. Centro de Control de VRIXORA

Responsable de:

- usuarios;
- conductores;
- Conductor 360;
- clientes Marketplace;
- trabajos;
- billeteras;
- recargas;
- documentos financieros;
- Gestión Comercial;
- tarifas y comisiones;
- referidos;
- empleados;
- roles;
- marketing;
- configuración;
- auditoría;
- administración de WhatsApp de soporte y recargas.

## 24.2. TUKTUK Control / Prestador

Responsable de:

- experiencia del usuario;
- datos operativos;
- Control y Estadísticas permanentes;
- funcionamiento sin conexión;
- sincronización;
- onboarding de conductor;
- experiencia de Trabajos;
- consulta de promoción;
- consulta de billetera y recargas;
- referidos;
- soporte;
- uso de configuración remota autorizada;
- caché local de la última configuración válida.

No debe decidir directamente saldos, comisiones, confirmaciones de pago ni autorizaciones críticas.

## 24.3. TUKTUK Cliente

Responsable de:

- solicitud y seguimiento del servicio;
- interacción del cliente con el trabajo;
- visualización autorizada del conductor asignado;
- valoración cuando corresponda.

## 24.4. Sitio web de VRIXORA

Responsable de:

- información pública;
- captación;
- presentación comercial;
- privacidad;
- soporte;
- enlaces de instalación o acceso;
- uso de configuración de contacto cuando corresponda.

## 24.5. Regla de arquitectura

La lógica crítica de billetera, recargas, pagos, facturación, comisiones, referidos, permisos y estados de trabajo no deberá duplicarse entre repositorios.

Las dependencias antiguas de licencias de TUKTUK se retirarán de forma incremental y verificable.
