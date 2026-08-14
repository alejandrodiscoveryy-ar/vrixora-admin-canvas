# PRD — Centro de Control de VRIXORA

**Documento:** `PRD_CENTRO_CONTROL_VRIXORA.md`  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026  
**Estado:** Listo para incorporación al repositorio  
**Documento superior:** `docs/PRD_MASTER.md`  
**Producto administrativo:** Centro de Control de VRIXORA  
**Primer proyecto administrado:** TukTuk Control  

---

## 1. Propósito y relación con el PRD maestro

Este documento desarrolla específicamente los requisitos funcionales y de experiencia del **Centro de Control de VRIXORA**.

No sustituye al `PRD_MASTER.md`. El PRD maestro continúa siendo la fuente principal para la visión del ecosistema, las reglas generales de negocio, TukTuk Control, backend, seguridad y principios compartidos.

Este PRD define con mayor profundidad **cómo debe funcionar la administración de un proyecto dentro de VRIXORA**, cómo se conectan sus módulos y cuáles son los flujos operativos prioritarios.

Cuando exista una contradicción:

1. Las reglas generales del ecosistema se resolverán en el PRD maestro.
2. Las reglas específicas de experiencia y operación administrativa se resolverán en este documento.
3. Las decisiones nuevas que afecten a todo el ecosistema deberán incorporarse también al PRD maestro cuando corresponda.

---

## 2. Objetivo del Centro de Control

El Centro de Control debe permitir administrar proyectos de VRIXORA de forma:

- clara;
- segura;
- trazable;
- rápida;
- escalable;
- adaptable a móvil y escritorio;
- comprensible para usuarios no técnicos.

El sistema no debe mostrar toda la información disponible por defecto. Debe presentar primero los datos necesarios para **comprender una situación, tomar una decisión o ejecutar una acción**.

TukTuk Control será el primer proyecto gestionado, pero la arquitectura debe permitir incorporar nuevos proyectos sin rediseñar la plataforma.

---

## 3. Principios funcionales y de diseño

### 3.1. Una pantalla, un objetivo principal

Cada pantalla debe tener una finalidad claramente identificable.

La acción principal debe distinguirse de las acciones secundarias y excepcionales.

### 3.2. Información progresiva

La cantidad de datos almacenados no determina la cantidad de datos mostrados.

La interfaz debe:

- mostrar primero la información esencial;
- agrupar los datos relacionados;
- ocultar los detalles secundarios hasta que el usuario los solicite;
- utilizar `Más filtros`, `Más acciones`, detalles desplegables o fichas cuando sea necesario.

### 3.3. Pantallas limpias

Se evitarán:

- grandes bloques de tarjetas sin utilidad operativa;
- tablas con demasiadas columnas;
- filtros permanentemente visibles que se utilizan poco;
- códigos internos;
- JSON;
- identificadores técnicos en vistas principales;
- información duplicada entre módulos;
- gráficos que no ayuden a decidir o actuar.

### 3.4. Lenguaje administrativo

La interfaz utilizará términos comprensibles.

Ejemplos:

- `Activo`
- `Pendiente de pago`
- `Vence en 8 días`
- `Plan mensual`
- `Pago anulado`

No se utilizarán códigos técnicos como presentación principal.

### 3.5. Lo rutinario se agrupa; lo excepcional se destaca

Esta regla será especialmente importante en Auditoría, pero aplicará también a otras áreas del Centro de Control.

---

## 4. Arquitectura general de navegación

El flujo principal será:

**VRIXORA → Proyectos → seleccionar proyecto**

Ejemplo:

**VRIXORA → Proyectos → TukTuk Control**

Al seleccionar TukTuk Control se abrirá directamente el **Resumen del proyecto**.

No existirá una tercera pantalla intermedia denominada “Centro de gestión del proyecto”.

### 4.1. Navegación del proyecto

La navegación principal será:

1. **Resumen**
2. **Clientes**
3. **Comercial**
4. **Cobros**
5. **Licencias**
6. **Rendimiento**
7. **Administración**
8. **Auditoría**

La visibilidad de cada área dependerá de los permisos del usuario.

### 4.2. Agrupación interna recomendada

**Comercial**
- Seguimiento
- Campañas
- Referidos

**Cobros**
- Prefacturas
- Pagos
- Confirmaciones y documentos

**Licencias**
- Licencias
- Planes y precios

**Administración**
- Equipo y permisos
- Configuración del proyecto

Auditoría mantiene su ubicación actual dentro de la navegación existente del proyecto. Este PRD redefine principalmente su organización interior.

---

## 5. Roles y permisos

Los permisos deben aplicarse tanto en la interfaz como en backend.

Ocultar un botón no constituye una medida de seguridad suficiente.

### 5.1. Owner

Puede:

- acceder a todas las áreas;
- gestionar configuración;
- administrar roles;
- gestionar planes;
- revisar y anular pagos;
- realizar excepciones administrativas;
- consultar Auditoría completa;
- activar o desactivar el modo de pruebas;
- administrar parámetros de tasa de cambio;
- gestionar reglas de referidos.

### 5.2. Administrador

Puede tener acceso amplio según permisos concedidos.

Debe poder, cuando el permiso correspondiente esté activo:

- corregir operaciones;
- anular pagos reales;
- administrar licencias;
- gestionar clientes;
- revisar Auditoría;
- gestionar operaciones de prueba.

### 5.3. Operador de cobros

Puede:

- buscar clientes;
- preparar cobros;
- generar prefacturas;
- confirmar pagos;
- generar y enviar la confirmación/documento correspondiente;
- consultar sus operaciones.

No puede:

- alterar precios;
- cambiar permisos;
- borrar pagos reales;
- ajustar manualmente licencias si no posee permiso administrativo;
- cambiar configuración sensible.

### 5.4. Comercial / Marketing

Puede:

- gestionar clientes potenciales;
- registrar seguimiento;
- gestionar campañas;
- consultar y gestionar referidos;
- registrar fuentes de captación;
- marcar clientes listos para cobro;
- consultar métricas comerciales autorizadas.

No puede:

- confirmar pagos;
- anular pagos;
- modificar licencias;
- cambiar precios;
- acceder a configuración crítica.

---

## 6. Resumen del proyecto

La pantalla Resumen debe responder:

> ¿Cómo marcha el proyecto y qué requiere atención ahora?

### 6.1. Indicadores principales

Se mostrarán preferentemente entre 3 y 5 indicadores principales.

Para TukTuk Control podrán incluir:

- clientes activos;
- ingresos del período;
- clientes en prueba;
- licencias próximas a vencer;
- conversión comercial.

### 6.2. Requiere atención

Tendrá prioridad sobre los gráficos.

Podrá mostrar:

- pruebas próximas a terminar;
- prefacturas pendientes;
- pagos pendientes de confirmación;
- licencias próximas a vencer;
- seguimientos comerciales pendientes;
- operaciones administrativas que requieran revisión.

### 6.3. Acciones rápidas

Según permisos:

- Buscar cliente
- Preparar cobro
- Registrar cliente
- Ver vencimientos
- Ver seguimiento comercial

### 6.4. Gráficos

El Resumen mostrará solo tendencias esenciales.

El análisis profundo se concentrará en **Rendimiento**.

---

## 7. Clientes

Clientes será una de las áreas centrales del sistema.

### 7.1. Listado

La vista principal debe permitir:

- búsqueda por nombre;
- email;
- teléfono;
- WhatsApp;
- identificador;
- filtros esenciales;
- acceso inmediato a la ficha del cliente.

La tabla o tarjeta mostrará únicamente:

- cliente;
- contacto principal;
- estado;
- plan o licencia;
- vencimiento;
- acción principal.

El resto de la información se consultará dentro de la ficha.

---

## 8. Ficha única del cliente — Cliente 360°

Cada cliente tendrá **una única ficha administrativa**.

El usuario no deberá recorrer Comercial, Cobros, Licencias y Auditoría para reconstruir la situación de una persona.

### 8.1. Cabecera

Debe mostrar:

- nombre;
- estado;
- plan actual;
- vencimiento.

Acciones principales:

- **Preparar cobro / Renovar**
- **WhatsApp**
- **Más acciones**

### 8.2. Resumen

Incluirá:

- datos personales;
- correo;
- teléfono;
- WhatsApp;
- fecha de registro;
- vehículo;
- estado;
- plan actual;
- vencimiento;
- último pago.

### 8.3. Comercial

Incluirá:

- fuente de captación;
- campaña;
- referido por;
- estado comercial;
- responsable;
- notas;
- último contacto;
- próxima acción.

### 8.4. Cobros y documentos

Incluirá:

- prefacturas;
- pagos;
- confirmaciones de pago;
- documentos emitidos;
- importe;
- moneda;
- estado;
- método de pago.

### 8.5. Licencia y dispositivos

Incluirá:

- licencia actual;
- estado;
- plan;
- vencimiento;
- días restantes;
- dispositivos autorizados;
- renovaciones;
- cambios administrativos.

### 8.6. Referidos

Incluirá:

- código personal;
- enlace personal;
- quién lo refirió;
- personas referidas;
- estado de cada referido;
- conversiones a pago;
- días ganados;
- días aplicados;
- días pendientes.

### 8.7. Actividad

Mostrará una línea temporal comprensible con eventos relevantes:

**Registro → prueba → contacto → prefactura → pago → licencia → documento → renovación → referido**

No mostrará por defecto todos los registros técnicos de Auditoría.

Cuando sea necesario existirá acceso a **Ver auditoría relacionada**.

---

## 9. Comercial

Comercial debe concentrar captación, seguimiento y conversión.

### 9.1. Seguimiento

Debe permitir identificar:

- quién debe ser contactado;
- estado comercial;
- responsable;
- último contacto;
- próxima acción;
- notas relevantes.

### 9.2. Campañas

Debe permitir:

- identificar fuente;
- campaña;
- registros obtenidos;
- pruebas iniciadas;
- conversiones;
- rendimiento comercial.

### 9.3. Referidos

El programa de referidos será una función comercial formal y no un simple campo del cliente.

---

## 10. Programa de referidos

Cada cliente podrá tener un código o enlace personal de referido.

Ejemplo:

`vrixora.com/tuk?ref=XXXXX`

### 10.1. Regla principal

Por cada nuevo cliente referido que complete **su primer pago confirmado**, la persona que lo refirió obtendrá:

**15 días adicionales de servicio.**

No existirá un límite de referidos válidos.

### 10.2. Configuración

Los 15 días serán un parámetro configurable del proyecto.

El valor no quedará fijado permanentemente en el código.

### 10.3. Momento de la recompensa

No se concederá recompensa por:

- abrir el enlace;
- instalar la aplicación;
- registrarse;
- iniciar la prueba.

La recompensa se genera únicamente cuando existe un **primer pago confirmado**.

### 10.4. Referidor con licencia pagada

Los días se añadirán al vencimiento de su licencia.

### 10.5. Referidor todavía en prueba

Los días quedarán como:

**Ganados / pendientes de aplicar**

Se aplicarán cuando el referidor realice su propio primer pago y pase a ser cliente de pago.

### 10.6. Protección contra abusos

El sistema debe impedir:

- autorreferido;
- recompensa duplicada;
- varias recompensas por renovaciones del mismo referido;
- recompensa por cuentas duplicadas;
- reasignación libre del referidor después de la conversión;
- recompensa asociada a un pago anulado.

Si se anula el primer pago que originó una recompensa, VRIXORA deberá revisar y revertir el beneficio asociado cuando corresponda.

---

## 11. Cobros

Cobros representa el proceso completo desde la intención de compra hasta la confirmación del servicio.

No será únicamente una tabla de pagos.

### 11.1. Flujo nacional

El flujo será:

**Cliente contacta para pagar**

→ se busca o selecciona al cliente

→ se selecciona el plan deseado

→ VRIXORA calcula el importe

→ se genera la prefactura

→ se envía al cliente

→ el cliente paga mediante transferencia o pago físico

→ el operador verifica el pago

→ se confirma el pago

→ se actualiza la misma licencia

→ se genera la confirmación/documento final

→ se envía al cliente

→ se registra la trazabilidad completa.

---

## 12. Prefacturas

### 12.1. Generación

La prefactura se generará a partir del cliente y el plan seleccionado.

Debe contener como mínimo:

- número de prefactura;
- cliente;
- proyecto;
- plan;
- duración;
- precio base;
- moneda base;
- tasa aplicada;
- importe en moneda de pago;
- fecha y hora de emisión;
- fecha y hora de vencimiento;
- métodos o instrucciones de pago;
- estado.

### 12.2. Vigencia

Toda prefactura tendrá una validez de **48 horas desde su emisión**.

Ejemplo:

**Emitida:** 14/08/2026 · 11:30 a. m.  
**Válida hasta:** 16/08/2026 · 11:30 a. m.

### 12.3. Congelación de condiciones

Durante las 48 horas se conservarán:

- plan;
- precio base;
- tasa aplicada;
- importe final.

Un cambio posterior de la tasa no modificará una prefactura vigente.

### 12.4. Vencimiento

Si no se confirma el pago dentro de la vigencia:

**Estado → Vencida**

Para realizar el cobro deberá generarse una nueva prefactura utilizando las condiciones y la tasa vigentes.

Si el cliente realizó el pago dentro de las 48 horas pero la verificación administrativa ocurre posteriormente, el sistema debe permitir registrar la **fecha real del pago** para no invalidar incorrectamente una operación realizada dentro del plazo.

### 12.5. Estados

Como mínimo:

- Preparada
- Enviada
- Pendiente de pago
- Pagada
- Vencida
- Cancelada

### 12.6. Efectos

La emisión de una prefactura:

- no registra ingreso;
- no renueva la licencia;
- no modifica el vencimiento;
- no convierte al usuario en cliente pagado;
- no genera recompensa de referido.

---

## 13. Identidad de los documentos

La prefactura y la confirmación de pago deberán tomar automáticamente la identidad configurada para el proyecto.

### 13.1. Fuente

La identidad procederá de:

**Proyecto → Configuración → Identidad**

Incluirá, según lo configurado:

- logo;
- nombre comercial;
- datos de contacto;
- datos generales utilizados en documentos;
- otros elementos de identidad aprobados.

### 13.2. Sin configuración duplicada

No existirá un logo independiente para:

- prefacturas;
- confirmaciones de pago;
- otros documentos emitidos.

Todos utilizarán la identidad del proyecto.

### 13.3. Conservación histórica

Cada documento deberá conservar la identidad utilizada en el momento de su emisión.

Si posteriormente cambia el logo o los datos del proyecto, los documentos históricos no deben modificarse retroactivamente.

---

## 14. Confirmación del pago

El operador abrirá la prefactura correspondiente y seleccionará:

**Confirmar pago**

No deberá volver a introducir información ya conocida.

### 14.1. Datos a comprobar

La pantalla mostrará:

- cliente;
- plan;
- importe esperado;
- importe recibido;
- moneda;
- método;
- referencia, cuando corresponda;
- tasa aplicada;
- vencimiento actual;
- nuevo vencimiento estimado;
- cambio de WhatsApp, si existiera.

### 14.2. Revisión final

Antes de ejecutar la operación debe existir una vista de confirmación sencilla y comprensible.

La acción principal será:

**Confirmar pago y activar / renovar**

### 14.3. Consecuencias

La confirmación deberá:

1. registrar el pago;
2. marcar la prefactura como pagada;
3. actualizar la misma licencia existente;
4. calcular la nueva vigencia;
5. generar la confirmación o documento final correspondiente;
6. registrar la operación en Auditoría;
7. actualizar las métricas reales;
8. aplicar la recompensa de referido cuando proceda;
9. permitir enviar el documento al cliente.

Estas acciones deben pertenecer a un único flujo de negocio y no depender de modificaciones manuales dispersas.

---

## 15. Precio base y tasa de cambio

Los planes podrán utilizar una moneda base.

Para TukTuk Control se define inicialmente:

**Moneda base de referencia: USD**

Ejemplo:

**Plan mensual: 1,50 USD**

Cuando el cliente nacional pague en CUP:

**Precio USD × tasa USD/CUP = importe CUP**

### 15.1. Principio

El precio comercial del plan se mantiene en su moneda base.

El importe en CUP se calcula según la tasa aplicable al momento de generar la prefactura.

---

## 16. Gestión de la tasa de cambio

VRIXORA debe poder funcionar tanto si existe una API disponible como si no.

### 16.1. Modo automático

La tasa podrá obtenerse mediante una API configurada.

### 16.2. Modo manual

El Owner o administrador autorizado podrá introducir manualmente la tasa vigente.

La tasa manual no será una solución provisional improvisada: será una capacidad soportada del producto.

### 16.3. Fuente

El sistema no asumirá internamente que cualquier tasa es necesariamente “oficial”.

Cada tasa deberá identificar su fuente.

Ejemplos:

- API configurada;
- Manual;
- futura fuente autorizada.

### 16.4. Información visible

Debe ser fácil comprender:

- tasa vigente;
- fuente;
- fecha de actualización;
- usuario que la estableció cuando sea manual.

### 16.5. Historial

Cada modificación deberá conservar:

- tasa nueva;
- tasa anterior;
- fuente;
- fecha y hora;
- usuario;
- observación cuando proceda.

### 16.6. Congelación por operación

Cada prefactura y cada pago conservarán la tasa aplicada.

Los pagos históricos nunca se recalcularán utilizando una tasa posterior.

---

## 17. Licencias

Licencias debe centrarse en la gestión operativa del servicio.

Cada licencia debe mostrar claramente:

- cliente;
- plan;
- estado;
- vencimiento;
- tiempo restante;
- dispositivos.

### 17.1. Acción prioritaria

La acción cotidiana principal será:

**Cobrar / Renovar**

### 17.2. Acciones administrativas

Las operaciones excepcionales deberán quedar subordinadas dentro de `Más acciones` o `Administración avanzada`.

Entre ellas:

- crear licencia manualmente;
- cambiar plan;
- cambiar estado;
- ajustar vigencia;
- gestionar dispositivos;
- revocar.

Estas acciones deben estar restringidas por permisos y auditadas.

---

## 18. Planes y precios

Cada plan podrá definir:

- nombre comercial;
- duración;
- precio base;
- moneda base;
- dispositivos permitidos;
- estado;
- orden de presentación.

Los códigos internos y características técnicas no deben dominar la interfaz.

Planes y precios será una función administrativa vinculada a Licencias, no el centro del flujo cotidiano de cobro.

---

## 19. Rendimiento

Rendimiento concentrará el análisis detallado del negocio.

Podrá incluir:

- ingresos;
- clientes;
- renovaciones;
- no renovaciones;
- conversiones;
- comportamiento por plan;
- campañas;
- referidos;
- operadores;
- evolución temporal.

El Resumen no deberá duplicar todo Rendimiento.

---

## 20. Administración del proyecto

Administración contendrá elementos inherentes al proyecto seleccionado.

### 20.1. Equipo y permisos

Permitirá:

- empleados;
- roles;
- permisos;
- estado;
- actividad relevante;
- revocación de acceso cuando proceda.

### 20.2. Configuración del proyecto

La configuración debe organizarse por bloques, no como una página extensa de campos.

#### General e identidad

- nombre comercial;
- logo;
- datos de contacto;
- datos utilizados en documentos;
- estado del proyecto.

#### Comercial

- duración de prueba gratuita;
- reglas comerciales;
- parámetros de seguimiento.

#### Cobros y moneda

- moneda base;
- moneda de cobro;
- modo de tasa;
- tasa manual;
- API cuando exista;
- métodos de pago.

#### Referidos

- programa activo / inactivo;
- días de recompensa;
- reglas generales.

Valor inicial:

**15 días por referido convertido.**

#### Comunicación

- WhatsApp;
- información de contacto;
- parámetros de comunicación.

#### Aplicación

- parámetros administrativos propios de TukTuk Control.

#### Entorno y pruebas

- modo de pruebas;
- herramientas para limpiar datos de prueba.

---

## 21. Modo de pruebas

Durante la implantación existirá:

**Modo de pruebas: Activado / Desactivado**

### 21.1. Permisos

Solo Owner o administradores autorizados podrán gestionarlo.

### 21.2. Creación de operaciones de prueba

Mientras el modo esté activo podrá aparecer una opción clara al crear una operación:

**Marcar como prueba**

La marca solo podrá establecerse al crear la operación.

Un pago real no podrá convertirse posteriormente en pago de prueba.

### 21.3. Identificación

Toda operación de prueba deberá mostrar de forma inequívoca:

**OPERACIÓN DE PRUEBA — NO CONTABILIZAR**

### 21.4. Métricas

Las operaciones de prueba:

- no contabilizarán como ingreso real;
- no afectarán indicadores comerciales reales;
- no alterarán métricas de rendimiento;
- no generarán beneficios reales de referidos.

### 21.5. Limpieza

Los administradores autorizados podrán utilizar:

**Eliminar datos de prueba**

La limpieza afectará exclusivamente datos identificados desde su creación como pruebas.

### 21.6. Paso a producción estable

Cuando VRIXORA termine la validación:

**Modo de pruebas → Desactivado**

La opción para crear nuevas operaciones de prueba dejará de aparecer en la interfaz cotidiana.

La capacidad interna podrá conservarse para futuras validaciones controladas.

---

## 22. Anulación y corrección de pagos

### 22.1. Pago real

Un pago real confirmado no se borrará físicamente.

La acción será:

**Anular pago**

### 22.2. Permisos

Solo usuarios con permiso administrativo específico podrán anular pagos.

### 22.3. Motivo obligatorio

Toda anulación requerirá un motivo.

### 22.4. Vista previa de consecuencias

Antes de confirmar, VRIXORA debe explicar qué elementos están asociados al pago:

- prefactura;
- pago;
- documento;
- licencia;
- vigencia;
- recompensa de referido;
- otras consecuencias relacionadas.

### 22.5. Reversión

El sistema debe revertir de forma segura aquello que corresponda y conservar la trazabilidad.

### 22.6. Histórico

La operación original y su anulación permanecerán consultables en Auditoría.

---

## 23. Auditoría

Auditoría será el núcleo de control y trazabilidad administrativa.

Su función principal no es mostrar una lista interminable de eventos, sino permitir comprender rápidamente:

> ¿Qué ocurrió?  
> ¿Quién lo hizo?  
> ¿En qué área?  
> ¿Existe algo que requiera revisión?

### 23.1. Organización interna

La vista interior se organizará preferentemente en:

**Resumen | Por usuario | Por área**

No se añadirán múltiples pestañas sin una necesidad funcional clara.

---

## 24. Auditoría — Resumen

La pantalla inicial mostrará únicamente información crítica y operativa.

Podrá incluir:

- usuarios con actividad;
- operaciones realizadas;
- operaciones importantes;
- acciones críticas;
- elementos que requieran revisión.

### 24.1. Requiere atención

Las excepciones se mostrarán primero.

Ejemplos:

- pago anulado;
- ajuste manual de licencia;
- modificación manual de tasa;
- cambio de permisos;
- modificación sensible de cliente;
- ajuste manual de un beneficio.

Si no existen incidencias:

**Sin incidencias críticas en el período**

---

## 25. Auditoría — Por usuario

La actividad se agrupará por usuario.

Ejemplo:

**María Pérez — Operadora de cobros**  
23 operaciones  
12 Cobros  
8 Licencias  
2 Clientes  
1 Anulación  
1 acción crítica

**Ver actividad**

No se mostrarán inicialmente 23 eventos independientes.

### 25.1. Segundo nivel

Al abrir un usuario, la información volverá a agruparse:

- Cobros
- Licencias
- Clientes
- Comercial
- Configuración
- Anulaciones

Solo cuando se abra una categoría se mostrarán las operaciones concretas.

---

## 26. Auditoría — Por área

La misma información podrá analizarse por área.

Ejemplo:

**Cobros**  
18 operaciones · 2 usuarios · 1 anulación

**Licencias**  
11 operaciones · 3 usuarios

**Clientes**  
6 cambios · 2 usuarios

La auditoría no duplicará registros; únicamente ofrecerá diferentes formas de agruparlos.

---

## 27. Auditoría — Detalle de operación

La jerarquía será:

**Resumen → Usuario/Área → Tipo de operación → Operación individual**

El detalle se expresará en lenguaje administrativo.

Ejemplo:

**Alejandro anuló un pago**

Cliente: Juan Pérez  
Importe: 750 CUP  
Motivo: Pago registrado por error  
Fecha: 14 de agosto de 2026

**Consecuencias**

- 1 pago anulado
- 1 documento anulado
- 1 licencia corregida

Los identificadores técnicos estarán bajo:

**Ver información técnica**

---

## 28. Auditoría — Antes y después

No se utilizarán grandes bloques JSON como presentación principal.

Se mostrará únicamente lo que cambió.

Ejemplo:

**WhatsApp**  
535XXXXXXX → 536XXXXXXX

**Vencimiento**  
20/08/2026 → 20/09/2026

**Tasa USD/CUP**  
480 → 500

Los datos originales podrán conservarse internamente para investigación técnica.

---

## 29. Niveles de importancia en Auditoría

Las operaciones podrán clasificarse al menos como:

### Normal

Operaciones rutinarias.

### Importante

Cambios que afectan clientes, dinero o servicio.

### Crítica

Acciones administrativas sensibles, anulaciones, permisos, cambios manuales o seguridad.

Las operaciones rutinarias se agrupan.

Las excepcionales se destacan.

---

## 30. Seguridad de Auditoría

Los registros reales de Auditoría no podrán editarse ni eliminarse desde la operación administrativa normal.

No se podrá modificar:

- actor;
- fecha;
- acción;
- entidad;
- antes;
- después;
- motivo;
- identificador de operación.

Las acciones críticas requerirán motivo cuando corresponda.

Entre ellas:

- anular pago;
- ajustar manualmente una licencia;
- modificar tasa manual;
- modificar permisos;
- conceder beneficios manuales;
- cambiar relación de referido;
- modificar información sensible del cliente.

### 30.1. Auditoría no es diagnóstico técnico

Los logs técnicos, fallos de sincronización o información de infraestructura no deben mezclarse con la Auditoría empresarial.

En caso de necesitarse, pertenecerán a una futura zona de diagnóstico técnico.

---

## 31. Selectores de fecha y filtros

Los filtros deben ser simples y funcionales.

### 31.1. Períodos rápidos

Se utilizarán accesos como:

**Hoy | 7 días | 30 días | Este mes | Personalizado**

Los campos `Desde` y `Hasta` aparecerán únicamente al seleccionar `Personalizado`.

### 31.2. Período inicial recomendado

- Auditoría: **Hoy**
- Cobros: **Este mes**
- Rendimiento: **Este mes**

### 31.3. Filtros

Por defecto se mostrarán solo los filtros de uso frecuente.

Ejemplo:

**Buscar | Estado | Plan | Más filtros**

La selección de período podrá conservarse mientras el usuario navega dentro de una sección cuando resulte útil.

---

## 32. Experiencia móvil y escritorio

La plataforma debe funcionar correctamente en ambos contextos.

### 32.1. Móvil

- no habrá desplazamiento horizontal obligatorio;
- las tablas complejas se convertirán en tarjetas;
- la acción principal permanecerá fácil de encontrar;
- los detalles secundarios estarán ocultos hasta que se soliciten;
- los filtros avanzados utilizarán paneles compactos;
- los controles deberán tener tamaño táctil adecuado.

### 32.2. Escritorio

La mayor superficie no justificará mostrar información innecesaria.

Se mantendrá la misma jerarquía funcional.

---

## 33. Futuras pasarelas internacionales

La arquitectura deberá permitir incorporar pagos internacionales sin reconstruir Cobros y Licencias.

### 33.1. Principio

La pasarela confirma el pago.

VRIXORA continúa siendo responsable de:

**Pago → licencia → vigencia → documento → auditoría**

### 33.2. Orígenes futuros posibles

El mismo modelo deberá admitir:

- pago manual;
- pasarela internacional;
- enlace de pago;
- pago desde web;
- pago desde aplicación;
- otros proveedores futuros.

### 33.3. Datos de pago externos

Cuando se implemente deberán poder conservarse:

- proveedor;
- identificador externo;
- importe;
- moneda;
- estado;
- comisión cuando exista;
- origen;
- fecha;
- cliente;
- plan.

### 33.4. Sin proveedor fijado

Este PRD no selecciona todavía una pasarela específica.

---

## 34. Flujos prioritarios de extremo a extremo

### 34.1. Alta y conversión

**Registro → prueba → seguimiento → selección de plan → prefactura → pago → licencia → confirmación/documento**

### 34.2. Renovación

**Próximo vencimiento → contacto → prefactura → pago → renovación → documento**

### 34.3. Referido

**Enlace/código → registro → prueba → primer pago confirmado → conversión → +15 días al referidor**

### 34.4. Corrección

**Pago incorrecto → administrador → vista previa de consecuencias → motivo → anulación → reversión correspondiente → Auditoría**

### 34.5. Pruebas

**Modo de pruebas → operación marcada como prueba → validación → limpieza → desactivación del modo**

---

## 35. Requisitos de aceptación funcional

El Centro de Control se considerará correctamente implementado cuando:

- seleccionar un proyecto lleve directamente a su Resumen;
- un usuario pueda comprender la situación de un cliente desde una sola ficha;
- el flujo de cobro nacional pueda completarse de principio a fin;
- una prefactura tenga 48 horas de vigencia;
- una prefactura conserve su precio y tasa durante su vigencia;
- el sistema pueda operar con tasa manual aunque no exista API;
- una API pueda incorporarse posteriormente sin modificar el flujo comercial;
- confirmar un pago actualice la misma licencia existente;
- la identidad del proyecto se utilice automáticamente en prefacturas y confirmaciones;
- los documentos históricos conserven la identidad con la que fueron emitidos;
- los referidos se registren y recompensen según las reglas establecidas;
- un administrador pueda anular un pago real sin destruir el historial;
- las operaciones de prueba no contaminen las métricas reales;
- Auditoría agrupe actividad por usuario y por área;
- las acciones rutinarias no generen una lista inmanejable de eventos;
- las acciones críticas sean fáciles de detectar;
- los filtros y fechas sean simples de utilizar;
- las pantallas móviles no requieran tablas horizontales;
- los códigos técnicos y JSON no formen parte de la experiencia cotidiana;
- los permisos sean aplicados tanto en interfaz como en backend.

---

## 36. Prioridad recomendada para el rediseño

### Prioridad 0 — Confianza y flujo principal

- ficha Cliente 360;
- flujo prefactura → pago → confirmación → licencia;
- tasa manual;
- vigencia de 48 horas;
- identidad del proyecto en documentos;
- anulación segura de pagos;
- modo de pruebas;
- corrección de métricas comerciales incorrectas;
- eliminación de códigos técnicos visibles;
- corrección de textos con problemas de codificación.

### Prioridad 1 — Organización funcional

- agrupación de navegación;
- simplificación del Resumen;
- Referidos;
- rediseño interior de Auditoría;
- configuración del proyecto por bloques;
- normalización visual de tablas, filtros, estados y acciones.

### Prioridad 2 — Profundidad y escalabilidad

- mejoras avanzadas de Rendimiento;
- automatización de tasa mediante API;
- integración futura de pasarela internacional;
- refinamientos de accesibilidad;
- capacidades adicionales para nuevos proyectos de VRIXORA.

---

## 37. Decisiones expresamente pendientes

Las siguientes decisiones **no se fijan todavía** porque no existe información suficiente:

### 37.1. Denominación jurídica del documento final

No se decide todavía si será:

- factura;
- recibo;
- comprobante de pago;
- otra denominación.

La interfaz y el modelo deberán permitir definirlo correctamente cuando se determinen los requisitos aplicables.

### 37.2. Proveedor definitivo de tasa USD/CUP

La arquitectura admite API y tasa manual.

No se fija todavía el proveedor de API.

### 37.3. Pasarela internacional

La integración futura está contemplada, pero no se selecciona un proveedor específico.

### 37.4. Configuración global frente a configuración por proyecto

La separación definitiva de determinados parámetros globales de VRIXORA se establecerá a medida que se incorporen otros proyectos y exista una necesidad real.

---

## 38. Regla final del producto

El Centro de Control debe construirse alrededor de los **flujos de gestión del negocio**, no alrededor de tablas técnicas independientes.

**Clientes, Comercial, Cobros, Licencias, Referidos, Configuración y Auditoría deben compartir contexto y trazabilidad.**

La experiencia debe permitir que el usuario:

1. comprenda qué está ocurriendo;
2. identifique qué necesita atención;
3. ejecute la acción correcta;
4. compruebe el resultado;
5. pueda reconstruir posteriormente quién hizo qué y por qué.

La profundidad de información seguirá disponible, pero nunca deberá impedir comprender la operación cotidiana.
