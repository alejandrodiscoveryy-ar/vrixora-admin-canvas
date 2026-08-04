# DOCUMENTO DE REQUISITOS DEL PRODUCTO
## Ecosistema VRIXORA Solutions y TukTuk Control

**Empresa:** VRIXORA Solutions  
**Producto administrativo:** Centro de Control de VRIXORA  
**Primera aplicación gestionada:** TukTuk Control  
**Versión del documento:** 1.0  
**Fecha:** 3 de agosto de 2026  
**Estado:** Producto en desarrollo y preparación para operación comercial  
**Eslogan:** Aplicaciones inteligentes para negocios inteligentes

---

# 1. Resumen ejecutivo

El ecosistema VRIXORA está compuesto por dos productos conectados:

1. **TukTuk Control**, aplicación utilizada por propietarios y conductores de triciclos para controlar ingresos, gastos, kilometraje, batería, mantenimiento y rentabilidad.
2. **Centro de Control de VRIXORA**, plataforma administrativa utilizada para gestionar clientes, licencias, planes, pagos, recibos, empleados, permisos, marketing, estadísticas y auditoría.

TukTuk Control es la primera aplicación comercial administrada desde el Centro de Control de VRIXORA. La plataforma deberá quedar preparada para incorporar en el futuro otras aplicaciones desarrolladas por VRIXORA Solutions.

El sistema tiene como principio central que el cliente pueda concentrarse en la gestión de su negocio y que VRIXORA pueda controlar la operación comercial sin modificar manualmente datos sensibles de manera innecesaria.

Cuando un usuario se registra en TukTuk Control, recibe automáticamente una licencia de prueba por 30 días. Si compra un plan, un operador registra el pago desde la sección Pagos del Centro de Control. El sistema actualiza automáticamente la misma licencia, genera el recibo, registra la operación y mantiene la trazabilidad.

---

# 2. Visión del producto

Crear un ecosistema digital que permita a propietarios y conductores de triciclos conocer con precisión el comportamiento económico y operativo de su vehículo, mientras VRIXORA administra de forma centralizada y segura los clientes, planes, pagos, licencias y procesos comerciales.

El producto debe facilitar el trabajo diario, reducir errores manuales y permitir que cada persona vea y utilice únicamente las funciones necesarias para su responsabilidad.

---

# 3. Problemas que resuelve

## 3.1. Problemas del propietario o conductor

Muchos propietarios y conductores de triciclos no conocen con exactitud:

- Cuánto dinero generan diariamente.
- Cuánto gastan en la operación.
- Cuál es su ganancia real.
- Cuántos kilómetros recorren.
- Cómo se comporta el vehículo durante diferentes períodos.
- Cuándo corresponde realizar un mantenimiento.
- Qué gastos afectan más la rentabilidad.
- Cuál es el estado general de su actividad.

La información suele estar dispersa, anotada manualmente o no registrarse.

## 3.2. Problemas de VRIXORA

VRIXORA necesita una plataforma que permita:

- Identificar a cada usuario.
- Gestionar las pruebas gratuitas.
- Configurar planes y precios.
- Registrar pagos manuales.
- Actualizar licencias de manera segura.
- Generar y compartir recibos.
- Controlar renovaciones y vencimientos.
- Separar las responsabilidades de los empleados.
- Medir la captación y conversión de clientes.
- Mantener un historial completo de las operaciones.
- Evitar alteraciones financieras o administrativas sin autorización.
- Gestionar nuevas aplicaciones en el futuro.

---

# 4. Objetivos del producto

## 4.1. Objetivo general

Desarrollar y operar una solución integrada para el control del negocio de triciclos y la administración comercial de los servicios digitales ofrecidos por VRIXORA Solutions.

## 4.2. Objetivos específicos

- Permitir que el cliente registre y analice sus operaciones diarias.
- Mantener disponible la aplicación aunque no exista conexión a internet.
- Sincronizar automáticamente la información cuando se recupere la conexión.
- Asignar automáticamente una prueba gratuita de 30 días.
- Convertir la prueba en un plan pagado sin crear licencias duplicadas.
- Facilitar el registro de pagos y la generación de recibos.
- Reducir la intervención manual sobre las licencias.
- Aplicar permisos diferentes para owner, cobros y marketing.
- Proteger los datos financieros y administrativos.
- Medir registros, conversiones, renovaciones e ingresos.
- Mantener trazabilidad mediante auditoría.
- Preparar el Centro de Control para otras aplicaciones de VRIXORA.

---

# 5. Alcance del proyecto

## 5.1. TukTuk Control

TukTuk Control será la aplicación utilizada por el cliente final.

Debe incluir:

- Registro e inicio de sesión con Google.
- Creación de perfil.
- Creación y gestión del vehículo.
- Registro diario de ingresos.
- Registro de gastos.
- Categorías de gastos.
- Registro de kilometraje.
- Registro del voltaje de la batería.
- Notas de operación.
- Estadísticas por períodos.
- Control de mantenimiento.
- Funcionamiento sin conexión.
- Sincronización automática.
- Consulta del estado de la licencia.
- Sistema de referidos.
- Acceso a soporte.
- Actualizaciones sin pérdida de datos.

## 5.2. Centro de Control de VRIXORA

Será la plataforma administrativa de la empresa.

Debe incluir:

- Panel de resumen.
- Clientes.
- Pagos.
- Recibos.
- Licencias.
- Planes y precios.
- Empleados.
- Roles y permisos.
- Marketing y seguimiento comercial.
- Campañas.
- Referidos.
- Estadísticas.
- Configuración.
- Auditoría.
- Diseño adaptable a móvil y escritorio.

## 5.3. Backend compartido

El backend deberá gestionar:

- Autenticación.
- Usuarios.
- Perfiles.
- Vehículos.
- Registros operativos.
- Licencias.
- Planes.
- Pagos.
- Recibos.
- Empleados.
- Permisos.
- Auditoría.
- Sincronización.
- Seguridad mediante RLS.
- Operaciones transaccionales mediante funciones seguras.

---

# 6. Usuarios del sistema

## 6.1. Cliente de TukTuk Control

Es el propietario o conductor que utiliza la aplicación.

### Puede:

- Registrar ingresos.
- Registrar gastos.
- Consultar estadísticas.
- Gestionar su vehículo.
- Registrar kilometraje y voltaje.
- Consultar mantenimientos.
- Utilizar la aplicación sin conexión.
- Sincronizar sus datos.
- Consultar el estado de su licencia.
- Contactar al soporte.
- Participar en el sistema de referidos.

### No puede:

- Modificar su propia licencia.
- Cambiar su fecha de vencimiento.
- Asignarse un plan.
- Registrar pagos administrativos.
- Modificar precios.
- Acceder al Centro de Control.
- Consultar información de otros clientes.

## 6.2. Owner de VRIXORA

El owner es el propietario y administrador principal del sistema.

### Puede:

- Acceder a todos los módulos.
- Crear y modificar planes.
- Configurar precios y duración.
- Gestionar empleados.
- Asignar roles y permisos.
- Consultar clientes.
- Registrar y revisar pagos.
- Anular pagos cuando corresponda.
- Consultar y gestionar recibos.
- Administrar licencias.
- Ajustar vigencias.
- Suspender o revocar licencias.
- Revisar estadísticas.
- Consultar auditoría.
- Configurar la plataforma.
- Gestionar excepciones administrativas.

### Menú visible:

- Resumen.
- Clientes.
- Pagos.
- Recibos.
- Licencias.
- Planes y precios.
- Marketing.
- Campañas.
- Referidos.
- Empleados.
- Rendimiento.
- Configuración.
- Auditoría.

## 6.3. Operador de cobros

El operador se encarga de registrar el pago y asignar el plan comprado.

Su trabajo debe realizarse principalmente desde la sección **Pagos**.

### Puede:

- Buscar clientes.
- Consultar el resumen de su licencia.
- Consultar los planes activos.
- Seleccionar el plan comprado.
- Registrar el importe.
- Registrar la moneda.
- Registrar el método de pago.
- Añadir referencia u observación.
- Confirmar el pago.
- Generar y compartir el recibo.
- Consultar sus operaciones realizadas.

### No puede:

- Crear o editar planes.
- Modificar precios.
- Modificar directamente la fecha de una licencia.
- Ajustar vigencia manualmente.
- Suspender o revocar licencias.
- Gestionar empleados.
- Cambiar permisos.
- Modificar configuraciones.
- Eliminar pagos confirmados.
- Acceder a la auditoría completa.

### Menú visible:

- Resumen de cobros.
- Pagos.
- Buscar cliente.
- Recibos.
- Mis operaciones.

## 6.4. Marketing y atención comercial

Este empleado se encarga de captar, orientar y dar seguimiento a los clientes.

### Puede:

- Consultar nuevos registros.
- Identificar usuarios en período de prueba.
- Registrar la fuente de captación.
- Gestionar campañas.
- Consultar referidos.
- Añadir notas comerciales.
- Aplicar etiquetas de seguimiento.
- Consultar próximos vencimientos.
- Marcar clientes como listos para cobro.
- Consultar estadísticas de captación y conversión.
- Exportar reportes comerciales sin datos financieros sensibles.

### Estados comerciales permitidos:

- Nuevo.
- Contactado.
- Interesado.
- En prueba.
- Listo para cobro.
- Convertido.
- No interesado.

### No puede:

- Registrar pagos.
- Modificar pagos.
- Anular pagos.
- Cambiar precios.
- Modificar planes.
- Modificar licencias.
- Cambiar vencimientos.
- Suspender o revocar licencias.
- Gestionar empleados.
- Acceder a configuración crítica.
- Consultar datos bancarios sensibles.
- Acceder a auditoría técnica completa.

### Menú visible:

- Resumen comercial.
- Clientes potenciales.
- Seguimiento.
- Campañas.
- Referidos.
- Estadísticas comerciales.
- Reportes.

---

# 7. Flujo general del cliente

```text
El cliente instala TukTuk Control
                ↓
Inicia sesión con Google
                ↓
Se crea su perfil
                ↓
Se crea o vincula su vehículo
                ↓
Se crea automáticamente una licencia de prueba
                ↓
La prueba tiene una duración de 30 días
                ↓
El cliente utiliza la aplicación
                ↓
Marketing realiza seguimiento
                ↓
El cliente decide comprar un plan
                ↓
El operador busca al cliente desde Pagos
                ↓
Selecciona el plan comprado
                ↓
Registra y confirma el pago
                ↓
El sistema actualiza automáticamente la misma licencia
                ↓
Se genera el recibo
                ↓
TukTuk Control recibe el nuevo estado
                ↓
El cliente continúa utilizando la aplicación
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

## 8.11. Licencia en la aplicación

La aplicación debe mostrar:

- Plan actual.
- Estado.
- Fecha de vencimiento.
- Tiempo restante.
- Dispositivos autorizados.
- Información de contacto para renovar.

La aplicación debe actualizar el estado cuando recupere conexión.

## 8.12. Referidos

El sistema podrá permitir:

- Compartir un código o enlace.
- Identificar quién refirió a un nuevo usuario.
- Registrar el beneficio.
- Aplicar días promocionales cuando la condición se cumpla.
- Conservar la trazabilidad del referido.

## 8.13. Soporte

El usuario debe poder:

- Contactar a VRIXORA.
- Consultar métodos de pago.
- Obtener orientación para renovar.
- Acceder a los canales oficiales.

---

# 9. Requisitos funcionales del Centro de Control

## 9.1. Panel principal

Debe mostrar información según el rol.

Para el owner:

- Clientes totales.
- Nuevos registros.
- Usuarios en prueba.
- Licencias activas.
- Licencias vencidas.
- Pagos confirmados.
- Ingresos.
- Renovaciones.
- Próximos vencimientos.
- Actividad reciente.

Para cobros:

- Pagos del día.
- Pagos pendientes.
- Clientes listos para cobro.
- Recibos recientes.
- Mis operaciones.

Para marketing:

- Nuevos registros.
- Usuarios en prueba.
- Clientes contactados.
- Clientes listos para cobro.
- Conversiones.
- Campañas activas.
- Referidos.

## 9.2. Clientes

El módulo debe permitir:

- Buscar por nombre.
- Buscar por correo.
- Buscar por teléfono.
- Buscar por identificador.
- Consultar perfil.
- Consultar licencia.
- Consultar vehículo.
- Consultar pagos.
- Consultar recibos.
- Consultar historial comercial.
- Consultar auditoría relacionada, según permisos.

Los datos sensibles deben limitarse según el rol.

## 9.3. Pagos

El módulo de Pagos será el punto principal para completar una venta o renovación.

El formulario debe incluir:

- Cliente.
- Plan seleccionado.
- Plan actual.
- Estado actual.
- Vencimiento actual.
- Nuevo vencimiento estimado.
- Importe.
- Moneda.
- Método de pago.
- Referencia.
- Observación.
- Operador.
- Fecha y hora.

Antes de confirmar debe mostrarse una vista previa.

## 9.4. Recibos

Cada pago confirmado debe generar un recibo.

El recibo debe incluir:

- Número.
- Cliente.
- Correo.
- Plan.
- Importe.
- Moneda.
- Método de pago.
- Referencia.
- Fecha.
- Vencimiento anterior.
- Nuevo vencimiento.
- Operador.
- Estado.
- Identificador verificable.

El recibo debe poder:

- Visualizarse.
- Compartirse.
- Imprimirse o exportarse cuando corresponda.
- Marcarse como anulado si el pago se anula.

## 9.5. Licencias

El módulo debe permitir al owner consultar y administrar licencias.

La tarjeta debe mostrar:

- Cliente.
- Estado.
- Plan comercial.
- Vencimiento.
- Tiempo restante.
- Dispositivos utilizados y permitidos.

La información técnica debe quedar dentro de los detalles.

Las acciones deben organizarse así:

### Acción principal

- Registrar pago y renovar.

### Acciones secundarias

- Cambiar plan.
- Cambiar estado.

### Opciones avanzadas

- Ajustar vigencia.
- Ver historial.
- Gestionar dispositivos.

## 9.6. Planes y precios

El owner debe poder:

- Crear planes.
- Definir nombre comercial.
- Definir duración.
- Definir precio.
- Definir moneda.
- Definir dispositivos permitidos.
- Activar o desactivar planes.
- Definir orden de presentación.
- Mantener historial de cambios importantes.

El operador solo puede consultar planes activos.

## 9.7. Empleados

El owner debe poder:

- Crear o invitar empleados.
- Activar o desactivar accesos.
- Asignar roles.
- Revisar actividad.
- Revocar sesiones cuando sea necesario.

## 9.8. Roles y permisos

Los permisos deben aplicarse tanto en frontend como en backend.

No es suficiente ocultar botones.

Las acciones bloqueadas deben rechazarse también mediante:

- RLS.
- Funciones seguras.
- Validaciones de rol.
- Políticas de acceso.

## 9.9. Marketing

Debe permitir:

- Gestionar campañas.
- Registrar fuentes.
- Crear códigos o enlaces de campaña.
- Añadir notas.
- Aplicar etiquetas.
- Consultar conversiones.
- Consultar usuarios próximos a terminar la prueba.
- Marcar clientes como listos para cobro.
- Medir resultados por canal.

## 9.10. Auditoría

Debe registrar:

- Usuario que realizó la acción.
- Acción.
- Entidad afectada.
- Valor anterior.
- Valor nuevo.
- Motivo.
- Fecha y hora.
- Identificador de la operación.

Las acciones sensibles incluyen:

- Cambiar plan.
- Ajustar vigencia.
- Cambiar estado.
- Suspender.
- Revocar.
- Anular pago.
- Modificar permisos.
- Cambiar precios.
- Reiniciar dispositivos.

---

# 10. Reglas de negocio de las licencias

## 10.1. Creación inicial

Cuando el usuario se registra por primera vez:

- Se crea una licencia automáticamente.
- Plan: Prueba inicial.
- Estado: Activa.
- Duración: 30 días.
- Fecha de inicio: primer registro.
- Fecha de vencimiento: 30 días después.

Debe existir una sola licencia por usuario y aplicación.

## 10.2. Compra durante la prueba

Cuando el cliente compra durante la prueba:

- No se crea otra licencia.
- Se modifica la licencia existente.
- La prueba se sustituye por el plan comprado.
- El plan comienza desde la confirmación del pago.
- Los días restantes de prueba no se acumulan.
- Se actualizan duración y dispositivos.
- Se conserva el historial de la prueba.

Ejemplo:

- Registro: 1 de agosto.
- Prueba hasta: 31 de agosto.
- Compra mensual: 10 de agosto.
- Nuevo plan: desde el 10 de agosto hasta el vencimiento correspondiente.

## 10.3. Renovación de plan pagado activo

Cuando el cliente tiene un plan pagado vigente:

- Se conservan los días restantes.
- La nueva duración se suma desde el vencimiento actual.
- No se pierden días pagados.

## 10.4. Renovación de licencia vencida

Cuando la licencia está vencida:

- El nuevo período comienza desde la confirmación del pago.
- No se suman días vencidos.

## 10.5. Cambio de plan

El sistema debe indicar si el cambio será:

- Inmediato.
- Aplicado al finalizar el plan actual.

La decisión debe mostrarse antes de confirmar.

## 10.6. Ajuste de vigencia

El ajuste manual será una operación excepcional.

Debe exigir:

- Motivo.
- Fecha anterior.
- Días agregados o retirados.
- Nueva fecha.
- Vista previa.
- Confirmación.
- Auditoría.

No representa un pago.

No genera ingreso.

No genera recibo.

## 10.7. Estados

Estados permitidos:

- Activa.
- Pendiente.
- Suspendida.
- Revocada.
- Vencida.

“Vencida” debe calcularse automáticamente cuando la fecha de vencimiento sea anterior a la fecha actual.

No debe seleccionarse manualmente.

## 10.8. Suspensión

La suspensión debe:

- Exigir motivo.
- Ser reversible.
- Conservar el historial.
- No borrar pagos ni recibos.

## 10.9. Revocación

La revocación debe:

- Exigir motivo.
- Mostrar una confirmación reforzada.
- Conservar el historial.
- No eliminar cliente, pagos ni recibos.
- Quedar registrada en auditoría.

---

# 11. Reglas de negocio de los pagos

## 11.1. Registro

El operador selecciona:

- Cliente.
- Plan.
- Importe.
- Moneda.
- Método.
- Referencia.
- Observación.

## 11.2. Confirmación

Una única operación transaccional debe:

1. Registrar el pago.
2. Actualizar la licencia.
3. Aplicar las reglas de duración.
4. Actualizar los dispositivos permitidos.
5. Generar el recibo.
6. Registrar la auditoría.
7. Actualizar las estadísticas.
8. Devolver los identificadores creados.

El frontend no debe modificar directamente las fechas de la licencia.

## 11.3. Pagos confirmados

Los pagos confirmados no deben eliminarse físicamente.

Deben conservarse por trazabilidad.

## 11.4. Anulación

Un pago confirmado puede anularse únicamente con autorización y motivo.

Al anularlo:

- El pago cambia a estado Anulado.
- El recibo queda marcado como Anulado.
- El importe deja de contar como ingreso.
- La operación queda registrada en auditoría.
- La licencia no debe modificarse automáticamente.

Si corresponde retirar o ajustar la vigencia concedida, el owner deberá hacerlo mediante una operación administrativa separada y documentada.

## 11.5. Pagos pendientes

Un pago pendiente puede eliminarse solamente cuando:

- No tenga recibo.
- No esté vinculado a una licencia.
- No haya producido efectos financieros.
- El usuario tenga permiso.

## 11.6. Duplicados

El sistema debe impedir:

- Confirmaciones por doble clic.
- Dos operaciones con la misma referencia cuando no corresponde.
- Múltiples recibos para el mismo pago.
- Actualizaciones parciales de licencia sin pago confirmado.

---

# 12. Distribución de responsabilidades

| Persona | Función | Pagos | Licencias manuales | Marketing | Configuración |
|---|---|---:|---:|---:|---:|
| Owner | Administración general | Sí | Sí | Sí | Sí |
| Operador de cobros | Cobros y recibos | Sí | No | Lectura limitada | No |
| Marketing | Captación y seguimiento | No | No | Sí | No |
| Cliente | Uso de TukTuk Control | No | No | No | No |

La regla principal será:

> Marketing capta y acompaña, Cobros registra la venta, el sistema actualiza la licencia y el owner controla las excepciones.

---

# 13. Modelo de datos principal

El sistema debe manejar, como mínimo, las siguientes entidades:

- Usuarios.
- Perfiles.
- Vehículos.
- Registros diarios.
- Gastos.
- Categorías.
- Mantenimientos.
- Aplicaciones.
- Clientes.
- Licencias.
- Historial de licencias.
- Planes.
- Pagos.
- Recibos.
- Empleados.
- Roles.
- Permisos.
- Campañas.
- Fuentes de captación.
- Referidos.
- Notas comerciales.
- Auditoría.
- Dispositivos.
- Configuración.

Cada entidad debe utilizar identificadores únicos y relaciones controladas.

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

- Los pagos no deben eliminarse físicamente después de confirmados.
- Los recibos deben conservarse.
- Las anulaciones requieren motivo.
- Los importes deben almacenarse de forma consistente.
- Las estadísticas deben excluir operaciones anuladas.

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

En vistas principales:

- Vence hoy.
- Vence mañana.
- Quedan 12 días.
- Vencida hace 3 días.

La hora exacta debe quedar en los detalles.

## 16.4. Accesibilidad

- Contraste suficiente.
- Etiquetas claras.
- Botones identificables.
- Navegación mediante teclado en escritorio.
- Mensajes comprensibles.

---

# 17. Métricas principales

El Centro de Control debe medir:

- Nuevos registros.
- Usuarios en prueba.
- Conversión de prueba a pago.
- Clientes activos.
- Licencias vencidas.
- Licencias suspendidas.
- Renovaciones.
- Clientes que no renuevan.
- Ingresos por período.
- Ingresos por plan.
- Planes más vendidos.
- Pagos por operador.
- Conversiones por campaña.
- Conversiones por canal.
- Referidos.
- Clientes próximos a vencer.
- Uso de la aplicación.
- Sincronizaciones pendientes o fallidas.

---

# 18. Criterios de éxito

El producto será considerado funcional cuando:

1. Un nuevo usuario pueda registrarse con Google.
2. Se cree automáticamente su perfil.
3. Se cree una licencia de prueba por 30 días.
4. El usuario pueda registrar información sin conexión.
5. Los datos se sincronicen al recuperar internet.
6. Marketing pueda identificar y seguir usuarios en prueba.
7. El operador pueda registrar una venta desde Pagos.
8. El sistema actualice automáticamente la misma licencia.
9. Se genere un recibo.
10. TukTuk Control reconozca el nuevo plan.
11. Las renovaciones conserven los días pagados restantes.
12. Los vencimientos se calculen automáticamente.
13. Los empleados vean solamente sus módulos.
14. Las acciones sensibles queden auditadas.
15. Los pagos anulados no cuenten como ingresos.
16. Las actualizaciones no eliminen los datos del cliente.
17. El owner pueda supervisar toda la operación.

---

# 19. Elementos no incluidos en la primera versión

La primera versión no dependerá de:

- Pasarela de pago automática.
- Cobros bancarios automáticos.
- Facturación fiscal electrónica.
- Marketplace.
- Chat interno avanzado.
- Inteligencia artificial dentro de TukTuk Control.
- Gestión automática de nóminas.
- Contabilidad empresarial completa.
- Gestión de inventario.
- Soporte multimoneda avanzado.
- Venta internacional automatizada.
- Administración de otras aplicaciones todavía no lanzadas.

La arquitectura sí debe permitir incorporar estas funciones posteriormente.

---

# 20. Preparación para el futuro

El Centro de Control deberá estar preparado para administrar otras aplicaciones de VRIXORA.

Cada aplicación podrá tener:

- Sus propios planes.
- Sus propios precios.
- Sus propias licencias.
- Sus propias reglas de dispositivos.
- Sus propios clientes.
- Sus propias estadísticas.
- Sus propios períodos de prueba.

Un mismo cliente podrá utilizar diferentes productos de VRIXORA, pero deberá tener una licencia independiente para cada aplicación.

---

# 21. Prioridades del desarrollo

## Prioridad 1: operación comercial segura

- Pagos.
- Licencias.
- Planes.
- Recibos.
- Clientes.
- Auditoría.

## Prioridad 2: roles y empleados

- Owner.
- Operador de cobros.
- Marketing.
- Permisos de backend.
- Navegación por rol.

## Prioridad 3: seguimiento comercial

- Campañas.
- Fuentes.
- Notas.
- Estados comerciales.
- Conversiones.
- Referidos.

## Prioridad 4: optimización y crecimiento

- Informes avanzados.
- Automatizaciones.
- Notificaciones.
- Nuevas aplicaciones.
- Pagos automáticos.
- Expansión internacional.

---

# 22. Definición final del producto

**VRIXORA Solutions** será la plataforma empresarial que desarrolla y administra aplicaciones inteligentes para pequeños negocios.

**TukTuk Control** será su primera aplicación comercial, orientada al control económico y operativo de triciclos.

El Centro de Control permitirá administrar clientes, pruebas gratuitas, licencias, planes, pagos, recibos, empleados, marketing y estadísticas.

El principio operativo será:

> El cliente controla su negocio desde TukTuk Control. Marketing atrae y acompaña. Cobros registra la venta. El sistema administra automáticamente la licencia. El owner supervisa y controla las excepciones.

Este documento constituye la base funcional oficial para continuar el desarrollo, revisar el sistema existente y definir las siguientes etapas del proyecto.
