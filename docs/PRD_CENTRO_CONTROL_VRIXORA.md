# PRD — Centro de Control de VRIXORA

**Documento:** `PRD_CENTRO_CONTROL_VRIXORA.md`
**Versión:** 2.0
**Fecha:** 4 de octubre de 2026
**Estado:** Modelo objetivo aprobado para TUKTUK 2.0; pendiente de implementación y verificación completa
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
- `Promoción activa`
- `Recarga confirmada`

No se utilizarán códigos técnicos como presentación principal.

### 3.5. Lo rutinario se agrupa; lo excepcional se destaca

Esta regla será especialmente importante en Auditoría, pero aplicará también a otras áreas del Centro de Control.

---

## 4. Arquitectura general de navegación

El flujo principal será:

**VRIXORA → Proyectos → seleccionar proyecto**

Ejemplo:

**VRIXORA → Proyectos → TUKTUK**

Al seleccionar TUKTUK se abrirá directamente el **Resumen del proyecto**.

No existirá una pantalla intermedia innecesaria.

### 4.1. Áreas principales de TUKTUK

La navegación lógica debe exponer:

1. **Resumen**
2. **Usuarios**
3. **Marketplace**
4. **Comercial**
5. **Finanzas**
6. **Rendimiento**
7. **Administración**
8. **Auditoría**

La ubicación visual exacta podrá adaptarse al diseño existente, pero la separación funcional debe mantenerse.

### 4.2. Marketplace

Marketplace agrupa la operación del servicio:

- Trabajos
- Conductores
- Clientes Marketplace
- Billeteras
- Incidencias
- Valoraciones
- Configuración operativa

Un usuario registrado no se mostrará como conductor solo por existir en TUKTUK.

### 4.3. Finanzas

Finanzas agrupa:

- Recargas
- Pagos y confirmaciones
- Facturación / documentos
- Conciliación y correcciones

### 4.4. Comercial

Comercial agrupa:

- Seguimiento
- Campañas
- Referidos
- Gestión Comercial
- Tarifas y comisiones

### 4.5. Administración

Administración agrupa:

- Equipo y permisos
- Configuración del proyecto
- Identidad
- Métodos de pago
- Entorno y pruebas

Auditoría mantiene un acceso propio porque debe poder revisar transversalmente el resto de las áreas.

---

## 5. Roles y permisos

Los permisos deben aplicarse tanto en interfaz como en backend.

Ocultar un botón no constituye autorización.

### 5.1. Owner

Puede:

- acceder a todas las áreas;
- gestionar configuración;
- administrar roles y permisos;
- configurar promoción, referidos, tarifas y comisión;
- revisar y corregir operaciones financieras según reglas;
- consultar Auditoría completa;
- activar o desactivar el modo de pruebas;
- administrar tasa de cambio;
- administrar métodos de pago;
- gestionar excepciones.

### 5.2. Administrador

Puede tener acceso amplio según permisos concedidos.

Cuando corresponda podrá:

- gestionar usuarios y conductores;
- corregir operaciones;
- anular o revertir pagos;
- revisar billeteras;
- gestionar incidencias;
- revisar Auditoría;
- gestionar operaciones de prueba.

No podrá realizar acciones financieras o de seguridad para las que no posea permiso específico.

### 5.3. Finanzas / Cobros

Puede:

- buscar conductores;
- consultar solicitudes de recarga;
- verificar pagos;
- confirmar recargas;
- consultar documentos financieros;
- ejecutar correcciones autorizadas;
- registrar referencias y observaciones;
- consultar sus operaciones.

No puede:

- editar balances directamente;
- alterar el ledger;
- modificar permisos;
- cambiar comisión o promoción salvo permiso específico;
- borrar pagos confirmados.

### 5.4. Comercial / Marketing

Puede:

- gestionar campañas y fuentes;
- registrar seguimiento;
- consultar usuarios interesados en Trabajos;
- consultar conversión a conductor;
- gestionar referidos según permisos;
- consultar promociones;
- gestionar parámetros comerciales autorizados;
- consultar métricas comerciales.

No puede confirmar pagos ni modificar balances.

### 5.5. Operaciones / Soporte

Puede, según permisos:

- consultar conductores;
- supervisar trabajos;
- gestionar incidencias;
- revisar valoraciones;
- suspender o reactivar conductores cuando tenga autorización;
- actualizar datos de contacto permitidos.

No puede acreditar saldo ni confirmar pagos sin permiso financiero.

### 5.6. Principio de mínimo privilegio

Las acciones sensibles deben estar protegidas mediante:

- RLS;
- funciones seguras;
- validación de rol;
- auditoría;
- confirmación reforzada cuando corresponda.

---

## 6. Resumen del proyecto

La pantalla Resumen debe responder:

> ¿Cómo marcha TUKTUK y qué requiere atención ahora?

### 6.1. Indicadores principales

Se mostrarán preferentemente entre 3 y 6 indicadores.

Podrán incluir:

- usuarios registrados;
- conductores activos;
- trabajos del período;
- promociones activas;
- recargas confirmadas;
- comisiones liquidadas.

### 6.2. Requiere atención

Tendrá prioridad sobre gráficos decorativos.

Podrá mostrar:

- onboarding incompleto;
- promociones próximas a finalizar;
- recargas pendientes;
- incidencias abiertas;
- saldos o reservas que requieran revisión;
- operaciones financieras que necesiten conciliación;
- acciones administrativas críticas.

### 6.3. Acciones rápidas

Según permisos:

- Buscar usuario
- Buscar conductor
- Ver trabajos
- Revisar recargas
- Ver incidencias
- Abrir Conductor 360

### 6.4. Gráficos

El Resumen mostrará solo tendencias esenciales.

El análisis profundo se concentrará en **Rendimiento**.

---

## 7. Usuarios

Usuarios representa todas las cuentas registradas en TUKTUK.

### 7.1. Regla de identidad

Una cuenta Google crea o identifica un **usuario**.

Ser usuario:

- permite utilizar Control y Estadísticas;
- no significa ser conductor;
- no crea una promoción de Trabajos;
- no crea una billetera con saldo;
- no debe confundirse con Cliente Marketplace.

### 7.2. Listado

Debe permitir buscar por:

- nombre;
- correo;
- teléfono o WhatsApp;
- identificador.

La vista principal mostrará solo información útil:

- usuario;
- contacto;
- fecha de registro;
- estado de cuenta;
- estado de onboarding de Trabajos, cuando exista;
- acción principal.

### 7.3. Detalle del usuario

Podrá incluir:

- perfil;
- vehículos;
- datos de Control;
- estado de sincronización cuando sea relevante;
- referidor, si existe;
- inicio de onboarding de Trabajos;
- relación con conductor, si ya completó el alta;
- actividad administrativa relacionada.

Un onboarding incompleto no convierte al usuario en conductor.

---

## 8. Conductores y Conductor 360°

El **Conductor 360** será la ficha administrativa integral del prestador Marketplace.

No se creará un Conductor 360 para cada usuario registrado. Solo corresponde a quien haya completado el alta operativa requerida para ser conductor.

### 8.1. Cabecera

Debe mostrar:

- nombre;
- foto;
- estado operativo;
- disponibilidad;
- vehículo principal;
- estado de promoción;
- saldo disponible.

Acciones principales según permisos:

- **Ver / gestionar operación**
- **Contactar**
- **Más acciones**

### 8.2. Identidad y perfil

Incluirá:

- cuenta Google vinculada;
- correo;
- teléfono;
- WhatsApp;
- foto;
- fecha de alta como conductor;
- estado de onboarding;
- estado operativo;
- suspensión y motivo cuando exista.

Una suspensión del conductor puede limitar su participación en Marketplace, pero no debe bloquear las funciones permanentes de Control y Estadísticas.

### 8.3. Vehículos y capacidades

Incluirá:

- vehículos;
- fotos;
- modalidad/categoría;
- servicios;
- capacidades;
- estado;
- relación conductor–vehículo.

### 8.4. Promoción

La promoción inicial se inicia automáticamente cuando el backend confirma que el conductor completó correctamente el alta operativa requerida.

No existirá un botón comercial separado para iniciar manualmente una promoción que ya corresponde por alta completada.

El inicio debe ser idempotente y controlado por servidor: una sola promoción inicial por conductor/proyecto.

Incluirá:

- estado;
- fecha de inicio;
- fecha de fin;
- duración congelada;
- regla/versionado aplicado.

La duración procede de Gestión Comercial y se congela al iniciarse.

La promoción es independiente del acceso a Control.

### 8.5. Billetera

Incluirá:

- saldo real;
- saldo promocional;
- saldo reservado;
- saldo disponible;
- movimientos;
- origen de cada crédito/débito;
- saldo antes y después cuando corresponda;
- reservas y liquidaciones de comisión.

### 8.6. Recargas y facturación

Incluirá:

- solicitudes de recarga;
- pagos;
- método y referencia;
- estados;
- documentos financieros;
- reversos y correcciones.

### 8.7. Referidos

Incluirá:

- código/enlace;
- quién lo refirió;
- personas referidas;
- estado de cualificación;
- primer trabajo válido;
- recompensa;
- ledger e idempotencia.

### 8.8. Trabajos y reputación

Incluirá:

- trabajos;
- comisiones;
- valoraciones;
- incidencias;
- cancelaciones;
- actividad relevante.

### 8.9. Línea temporal

Mostrará eventos comprensibles, por ejemplo:

**Alta de conductor → promoción → trabajo → comisión → recarga → referido → incidencia → corrección**

La información técnica completa se consultará solo cuando sea necesaria.

### 8.10. Clientes Marketplace

Los solicitantes de servicios se administrarán como **Clientes Marketplace**, separados de Usuarios y Conductores.

Podrán disponer de su propia ficha operativa, pero no se denominarán Conductor 360.

---

## 9. Comercial

Comercial concentra captación, seguimiento, conversión y reglas de crecimiento.

### 9.1. Seguimiento

Debe permitir identificar:

- usuario o prospecto;
- estado comercial;
- responsable;
- último contacto;
- próxima acción;
- notas;
- interés en convertirse en conductor.

### 9.2. Campañas

Debe permitir analizar:

- fuente;
- campaña;
- registros obtenidos;
- onboarding iniciado;
- conductores completados;
- primeros trabajos;
- referidos;
- rendimiento comercial.

### 9.3. Gestión Comercial

Debe ofrecer acceso autorizado a:

- promoción inicial;
- recompensa de referidos;
- comisión Marketplace;
- métodos de pago habilitados;
- parámetros comerciales que no deban estar codificados.

### 9.4. Referidos

Referidos será una función comercial formal con trazabilidad financiera propia.

---

## 10. Programa de referidos

Cada conductor podrá disponer de un código o enlace personal.

El programa vigente recompensa mediante **saldo promocional en la billetera Marketplace**.

No genera días de licencia, no amplía Control y no crea ni reinicia la promoción inicial.

Ejemplo:

`vrixora.com/tuk?ref=XXXXX`

### 10.1. Regla principal

Por cada nuevo conductor referido que complete su **primer trabajo válido**, el referente obtendrá la recompensa configurada.

Valor inicial:

**100 CUP por referido válido.**

La comunicación comercial será:

**"Invita a un amigo y gana dinero".**

No existirá un límite de referidos válidos mientras el programa esté activo, salvo que en el futuro el owner apruebe expresamente una regla comercial diferente y esta quede versionada.

### 10.2. Configuración

La recompensa tendrá:

- importe;
- moneda;
- estado activo/inactivo;
- versión de regla.

El valor aplicable se congelará cuando el referido cualifique.

### 10.3. Elegibilidad

No se concede recompensa por:

- abrir el enlace;
- instalar;
- registrarse;
- introducir el código;
- completar solo el perfil;
- iniciar onboarding;
- recargar;
- reinstalar.

El referido debe:

1. estar correctamente vinculado;
2. completar conductor y vehículo requeridos;
3. convertirse en conductor válido;
4. completar su primer trabajo válido.

Califica cuando el trabajo alcanza `settled` o, si pasó por incidencia, cuando esta se resuelve con `resolution = completed`.

No califican estados cancelados, expirados ni incidencias resueltas como cancelación.

### 10.4. Saldo promocional

El crédito:

- entra mediante ledger;
- puede cubrir comisiones;
- puede ser suficiente por sí solo después de la promoción;
- no necesita depósito pagado previo;
- no es retirable ni transferible como efectivo;
- no representa dinero recibido del conductor;
- no genera factura de pago;
- no altera la promoción.

### 10.5. Protección contra abusos

Debe impedir:

- autorreferido;
- duplicación;
- varias recompensas por la misma persona;
- recompensa mediante cuentas duplicadas creadas para abusar del programa;
- reasignación indebida;
- recompensa por reinstalación o recreación de perfil.

Una vez cualificado el referido, el vínculo con su referente será inmutable salvo una corrección administrativa excepcional, autorizada y auditada.

### 10.6. Trazabilidad

La recompensa será idempotente y conservará:

- referente;
- referido;
- trabajo que cualificó;
- importe;
- moneda;
- versión de regla;
- identificador de movimiento.

Los datos históricos identificados como prueba no requieren migración comercial. Cualquier relación o recompensa real debe conservarse hasta que una auditoría demuestre su tratamiento correcto.

---

## 11. Finanzas — Recargas, pagos y facturación

Finanzas representa el proceso completo desde la intención de añadir saldo hasta su confirmación, acreditación y documentación.

No será solo una tabla de pagos.

### 11.1. Flujo principal

**Conductor solicita recarga**

→ selecciona una vía de pago habilitada

→ recibe instrucciones cuando corresponda

→ realiza el pago

→ la solicitud permanece pendiente

→ Finanzas/Cobros verifica el pago

→ confirma

→ el servidor acredita exactamente una vez saldo real en la billetera

→ genera exactamente un documento financiero

→ registra Auditoría

→ el movimiento aparece en Conductor 360.

### 11.2. Regla principal

Una solicitud o pago pendiente no aumenta saldo.

Confirmar un pago debe ser una única operación transaccional e idempotente.

### 11.3. Separación financiera

El sistema distinguirá:

- dinero recibido como recarga/prepago;
- saldo promocional;
- saldo reservado;
- comisión liquidada;
- reversos y ajustes.

Una recarga no se registrará automáticamente como ingreso ganado por comisión.

---

## 12. Solicitudes de recarga e instrucciones de pago

### 12.1. Creación

La solicitud debe contener, como mínimo:

- identificador;
- conductor;
- proyecto;
- importe;
- moneda;
- método de pago;
- instrucciones;
- referencia cuando corresponda;
- fecha y hora;
- estado;
- actor/origen.

### 12.2. Estados

Como mínimo:

- Preparada
- Pendiente de pago
- En verificación
- Confirmada
- Rechazada
- Cancelada
- Revertida, cuando corresponda

### 12.3. Efectos

Crear una solicitud:

- no acredita saldo;
- no genera comisión;
- no inicia ni extiende promoción;
- no genera factura final;
- no convierte una operación pendiente en dinero recibido.

### 12.4. Vigencia

TUKTUK 2.0 no establece una vigencia fija obligatoria de 48 horas para todas las recargas.

Si un método de pago necesita caducidad, esta deberá configurarse explícitamente y congelarse en la solicitud.

### 12.5. Condiciones congeladas

Cuando corresponda, la solicitud conservará:

- importe;
- moneda;
- tasa aplicada;
- método;
- instrucciones;
- vencimiento configurado.

Los cambios posteriores de configuración no reescriben una solicitud ya creada.

---

## 13. Identidad de los documentos

Los documentos financieros tomarán automáticamente la identidad configurada para el proyecto.

### 13.1. Fuente

La identidad procederá de:

**Proyecto → Configuración → Identidad**

Podrá incluir:

- logo;
- nombre comercial;
- datos de contacto;
- datos del emisor;
- información administrativa o fiscal aprobada;
- otros elementos autorizados.

### 13.2. Sin configuración duplicada

No habrá identidades independientes para cada tipo de documento salvo necesidad legal expresa.

### 13.3. Conservación histórica

Cada documento conservará un **snapshot** de la identidad utilizada al emitirse.

Los cambios posteriores de logo o datos del proyecto no modificarán documentos históricos.

### 13.4. Inmutabilidad

Un documento emitido no se reescribe silenciosamente.

Las correcciones utilizarán reversos y, cuando corresponda, documento correctivo o nota de crédito vinculada al original.

### 13.5. Contenido mínimo del documento financiero

Cada documento generado por una recarga pagada y confirmada deberá conservar, como mínimo:

- número único;
- conductor;
- correo;
- proyecto;
- importe;
- moneda;
- concepto;
- método de pago;
- referencia;
- fecha real del pago;
- fecha de emisión;
- identificador de la solicitud o recarga;
- operador o actor de confirmación;
- estado;
- identificador verificable;
- snapshot de la identidad y datos del emisor.

El documento deberá poder:

- visualizarse;
- compartirse;
- imprimirse o exportarse.

Una recompensa por referido no genera este documento porque no representa un pago realizado por el conductor.

---

## 14. Confirmación del pago

El operador abrirá la solicitud correspondiente y seleccionará:

**Confirmar pago**

No deberá volver a introducir información que el sistema ya conoce.

### 14.1. Datos a comprobar

La pantalla mostrará:

- conductor;
- importe esperado;
- importe recibido;
- moneda;
- método;
- referencia;
- tasa aplicada cuando corresponda;
- solicitud;
- cambio de WhatsApp, si existiera.

### 14.2. Revisión final

Antes de ejecutar la operación debe existir una vista clara de consecuencias.

La acción principal será:

**Confirmar pago y acreditar saldo**

### 14.3. Consecuencias

La confirmación debe, de forma transaccional e idempotente:

1. confirmar el pago;
2. acreditar exactamente una vez saldo real;
3. registrar el movimiento en ledger;
4. actualizar saldos derivados;
5. generar exactamente un documento financiero;
6. registrar Auditoría;
7. actualizar métricas;
8. guardar cambios de contacto autorizados;
9. devolver los identificadores de la operación.

No modifica la promoción.

No genera recompensa de referido por sí misma.

No actualiza ninguna licencia de Control.

---

## 15. Monedas, precios y tasa de cambio

TUKTUK podrá manejar precios de servicios o parámetros comerciales en una moneda base y convertirlos cuando corresponda.

La tasa de cambio no estará asociada a planes de licencia.

### 15.1. Aplicación

La tasa podrá utilizarse para:

- tarifas de servicios;
- cotizaciones;
- recargas que requieran conversión;
- documentos;
- reportes.

Cada operación conservará la tasa que realmente utilizó.

### 15.2. Principio

Los valores históricos nunca se recalcularán con una tasa posterior.

---

## 16. Gestión de la tasa de cambio

VRIXORA debe funcionar tanto si existe una API disponible como si no.

### 16.1. Modo automático

La tasa podrá obtenerse mediante una API configurada.

### 16.2. Modo manual

El Owner o administrador autorizado podrá introducir la tasa vigente.

La tasa manual es una capacidad soportada del producto y no una solución provisional.

### 16.3. Fuente

Cada tasa deberá identificar su fuente.

El sistema no presentará una tasa como "oficial" salvo que la fuente configurada y aprobada permita afirmarlo.

Ejemplos:

- API configurada;
- Manual;
- futura fuente autorizada.

### 16.4. Información visible

Debe mostrarse:

- tasa vigente;
- fuente;
- fecha de actualización;
- usuario cuando sea manual.

### 16.5. Historial

Cada modificación conservará:

- tasa nueva;
- tasa anterior;
- fuente;
- fecha y hora;
- usuario;
- observación cuando proceda.

### 16.6. Congelación por operación

Cotizaciones, recargas, pagos y documentos conservarán la tasa aplicada cuando la operación la utilice.

---

## 17. Billeteras

Billeteras representa la capacidad económica del conductor para cubrir comisiones de Marketplace.

Cada billetera debe mostrar claramente:

- conductor;
- saldo real;
- saldo promocional;
- saldo reservado;
- saldo disponible;
- moneda;
- últimos movimientos.

### 17.1. Movimientos

Cada movimiento debe conservar:

- tipo;
- origen;
- importe;
- saldo antes;
- saldo después;
- estado;
- fecha;
- referencia;
- idempotencia.

### 17.2. Fuentes de crédito

Como mínimo:

- recarga pagada y confirmada;
- recompensa por referido;
- reverso o ajuste autorizado.

### 17.3. Comisiones

Fuera de promoción:

- se verifica saldo disponible;
- se reserva comisión al aceptar;
- se liquida o libera según el resultado del trabajo.

### 17.4. Acciones administrativas

No existirá edición directa del balance.

Toda corrección deberá realizarse mediante una operación trazable de ledger.

---

## 18. Gestión Comercial, tarifas y comisiones

TUKTUK no utilizará planes de licencia como producto comercial.

Gestión Comercial deberá permitir administrar:

- duración de la promoción inicial;
- activación de promoción para nuevas altas;
- recompensa por referido;
- comisión Marketplace;
- modalidades y tipos de servicio;
- precio base;
- reglas por distancia u otros factores;
- moneda;
- tasa aplicable cuando corresponda;
- métodos o vías de pago;
- estado;
- versionado;
- historial de cambios.

### 18.1. Snapshots

Los cambios no recalculan retroactivamente:

- promociones iniciadas;
- trabajos publicados/aceptados cuando el contrato ya se congeló;
- recompensas cualificadas;
- documentos emitidos.

### 18.2. Legado

Los módulos antiguos de Licencias y Planes pueden permanecer técnicamente hasta completar la auditoría de dependencias, pero no son el modelo comercial vigente de TUKTUK.

---

## 19. Rendimiento

Rendimiento concentrará el análisis detallado del negocio.

Podrá incluir:

- usuarios;
- conversión a conductor;
- conductores activos;
- promociones;
- trabajos;
- valor de servicios;
- recargas;
- dinero recibido;
- saldo promocional;
- comisiones reservadas y liquidadas;
- ingresos por comisión;
- referidos;
- campañas;
- operadores;
- valoraciones;
- incidencias;
- evolución temporal.

El Resumen no deberá duplicar todo Rendimiento.

Las métricas de licencias, renovaciones y planes vendidos dejan de ser indicadores principales de TUKTUK.

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
- revocación de acceso.

### 20.2. Configuración del proyecto

La configuración se organizará por bloques.

#### General e identidad

- nombre comercial;
- logo;
- datos de contacto;
- datos de emisor usados en documentos;
- estado del proyecto.

#### Gestión Comercial

- duración de promoción;
- comisión;
- recompensa por referido;
- reglas comerciales;
- parámetros de seguimiento.

#### Tarifas y moneda

- tarifas;
- moneda base;
- moneda de cobro;
- modo de tasa;
- tasa manual;
- API cuando exista.

#### Métodos de pago

- método;
- estado;
- instrucciones;
- referencias requeridas;
- datos visibles al conductor;
- configuración de caducidad cuando corresponda.

#### Referidos

- programa activo/inactivo;
- importe;
- moneda;
- reglas generales.

Valor inicial:

**100 CUP por referido válido que complete su primer trabajo válido.**

#### Comunicación

- WhatsApp;
- información de contacto;
- plantillas;
- parámetros de comunicación.

#### Aplicación y Marketplace

- parámetros administrativos de TUKTUK;
- configuración operativa;
- parámetros de mapas/tarifas cuando corresponda.

#### Entorno y pruebas

- modo de pruebas;
- herramientas para limpiar exclusivamente datos de prueba identificados como tales.

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

## 22. Anulación, reversión y corrección financiera

### 22.1. Pago confirmado

Un pago real confirmado no se borra físicamente.

### 22.2. Permisos

Solo usuarios con permiso específico podrán corregir o revertir operaciones.

### 22.3. Motivo obligatorio

Toda corrección requiere un motivo.

### 22.4. Vista previa de consecuencias

Antes de confirmar, VRIXORA mostrará los elementos asociados:

- solicitud de recarga;
- pago;
- movimiento de billetera;
- documento;
- reservas o comisiones afectadas;
- métricas;
- otras consecuencias.

### 22.5. Reversión

El sistema deberá, según corresponda:

- conservar la operación original;
- crear reverso o asiento compensatorio;
- corregir saldos derivados;
- conservar el documento original;
- generar documento correctivo o nota de crédito cuando corresponda;
- registrar Auditoría.

Nunca se corregirá dinero editando directamente el balance anterior.

### 22.6. Histórico

La operación original, su corrección y los documentos vinculados permanecerán consultables.

---

## 23. Auditoría

Auditoría será el núcleo de control y trazabilidad administrativa.

Debe permitir comprender:

> ¿Qué ocurrió?
> ¿Quién lo hizo?
> ¿En qué área?
> ¿Qué cambió?
> ¿Existe algo que requiera revisión?

### 23.1. Organización

La vista interior se organizará preferentemente en:

**Resumen | Por usuario | Por área**

No se añadirán pestañas sin necesidad funcional.

---

## 24. Auditoría — Resumen

Mostrará:

- usuarios con actividad;
- operaciones realizadas;
- acciones importantes;
- acciones críticas;
- elementos que requieran revisión.

### 24.1. Requiere atención

Ejemplos:

- recarga anulada o revertida;
- corrección de billetera;
- suspensión de conductor;
- modificación manual de tasa;
- cambio de comisión o tarifa;
- cambio de permisos;
- intervención de un referido;
- corrección de documento.

Si no existen incidencias:

**Sin incidencias críticas en el período**

---

## 25. Auditoría — Por usuario

La actividad se agrupará por usuario.

Ejemplo:

**María Pérez — Finanzas**
23 operaciones
12 Recargas
8 Documentos
2 Correcciones
1 cambio sensible

**Ver actividad**

Al abrir un usuario, volverá a agruparse por áreas antes de mostrar eventos individuales.

---

## 26. Auditoría — Por área

Podrá analizarse por:

- Usuarios
- Marketplace
- Finanzas
- Comercial
- Administración
- Seguridad

La auditoría no duplicará registros; solo ofrecerá distintas formas de consulta.

---

## 27. Auditoría — Detalle de operación

La jerarquía será:

**Resumen → Usuario/Área → Tipo → Operación**

El detalle se expresará en lenguaje administrativo.

Ejemplo:

**Alejandro revirtió una recarga**

Conductor: Juan Pérez
Importe: 750 CUP
Motivo: Pago registrado por error
Fecha: 14 de agosto de 2026

**Consecuencias**

- 1 pago revertido
- 1 movimiento compensatorio
- 1 documento corregido

Los identificadores técnicos estarán bajo:

**Ver información técnica**

---

## 28. Auditoría — Antes y después

No se utilizarán grandes bloques JSON como presentación principal.

Se mostrará lo que cambió.

Ejemplo:

**WhatsApp**
535XXXXXXX → 536XXXXXXX

**Comisión**
10 % → 8 %

**Tasa USD/CUP**
480 → 500

Los datos originales podrán conservarse internamente para investigación.

---

## 29. Niveles de importancia en Auditoría

### Normal

Operaciones rutinarias.

### Importante

Cambios que afectan usuarios, conductores, trabajos, dinero o servicio.

### Crítica

Acciones administrativas sensibles, reversos, permisos, seguridad o cambios manuales de reglas.

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

Las acciones críticas requerirán motivo.

Entre ellas:

- revertir pago;
- ajustar billetera mediante operación compensatoria;
- suspender conductor;
- modificar tasa;
- modificar comisión o tarifa;
- modificar permisos;
- conceder beneficio manual;
- intervenir relación de referido;
- modificar información sensible.

### 30.1. Auditoría no es diagnóstico técnico

Logs, fallos de sincronización e infraestructura no deben mezclarse con Auditoría empresarial.

Cuando sean necesarios pertenecerán a diagnóstico técnico.

---

## 31. Selectores de fecha y filtros

Los filtros deben ser simples.

### 31.1. Períodos rápidos

Se utilizarán:

**Hoy | 7 días | 30 días | Este mes | Personalizado**

`Desde` y `Hasta` aparecerán únicamente con `Personalizado`.

### 31.2. Período inicial recomendado

- Auditoría: **Hoy**
- Finanzas: **Este mes**
- Rendimiento: **Este mes**

### 31.3. Filtros

Por defecto se mostrarán solo los de uso frecuente.

Ejemplo:

**Buscar | Estado | Tipo | Más filtros**

La selección podrá conservarse durante la navegación dentro de una sección cuando sea útil.

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

La arquitectura deberá permitir incorporar pagos automáticos sin reconstruir el modelo de recargas.

### 33.1. Principio

La pasarela confirma el pago.

VRIXORA continúa siendo responsable de:

**Pago → recarga → billetera → documento → auditoría**

### 33.2. Orígenes posibles

El mismo modelo deberá admitir:

- pago manual;
- pasarela internacional;
- enlace de pago;
- pago desde web;
- pago desde aplicación;
- otros proveedores futuros.

### 33.3. Datos externos

Cuando se implemente podrán conservarse:

- proveedor;
- identificador externo;
- importe;
- moneda;
- estado;
- comisión del proveedor cuando exista;
- origen;
- fecha;
- conductor;
- solicitud de recarga.

### 33.4. Sin proveedor fijado

Este PRD no selecciona todavía una pasarela específica.

---

## 34. Flujos prioritarios de extremo a extremo

### 34.1. Alta de usuario

**Google → usuario → Control y Estadísticas permanentes**

### 34.2. Alta de conductor

**Usuario → Trabajos → conductor + vehículo + fotos → validación → conductor → promoción configurable**

### 34.3. Continuidad después de promoción

**Fin de promoción → cálculo de comisión → verificación de saldo → reserva → trabajo → liquidación/liberación**

### 34.4. Recarga

**Solicitud → método de pago → pago → verificación → confirmación → billetera → documento → Auditoría**

### 34.5. Referido

**Enlace/código → usuario vinculado → conductor válido → primer trabajo válido → saldo promocional al referente**

### 34.6. Corrección

**Operación incorrecta → usuario autorizado → vista previa → motivo → reverso/compensación → documento correctivo → Auditoría**

### 34.7. Pruebas

**Modo de pruebas → operación marcada como prueba → validación → limpieza controlada → desactivación**

---

## 35. Requisitos de aceptación funcional

El Centro de Control estará alineado con TUKTUK 2.0 cuando:

- seleccionar TUKTUK lleve directamente a Resumen;
- Usuarios y Conductores sean entidades diferenciadas;
- un usuario con onboarding incompleto no aparezca como conductor;
- cada conductor completo disponga de Conductor 360;
- Control no dependa de licencia ni vencimiento;
- suspender a un conductor en Marketplace no bloquee Control y Estadísticas;
- la promoción se configure sin código y conserve snapshot;
- la promoción inicial se inicie automáticamente y una sola vez al completar el alta válida;
- no exista depósito inicial mínimo obligatorio;
- saldo de referidos pueda cubrir comisiones sin recarga pagada previa;
- una solicitud pendiente no aumente saldo;
- confirmar un pago acredite la billetera exactamente una vez;
- la confirmación genere exactamente un documento financiero con número único, vínculo a la recarga y snapshot del emisor;
- una recarga no cambie la promoción;
- Billeteras no permita edición directa del balance;
- las comisiones utilicen reservas/liquidaciones trazables;
- los documentos históricos conserven identidad y contenido;
- las correcciones conserven histórico y usen reversos;
- las operaciones de prueba no contaminen métricas reales;
- Auditoría agrupe actividad y destaque excepciones;
- acciones críticas requieran permisos y motivo;
- tasa manual funcione aunque no exista API;
- una API pueda incorporarse sin modificar el flujo financiero;
- pantallas móviles no requieran tablas horizontales;
- códigos técnicos y JSON no dominen la experiencia;
- permisos se apliquen en interfaz y backend;
- Licencias y Planes no sean el flujo comercial activo de TUKTUK.

---

## 36. Prioridad recomendada para el rediseño

### Prioridad 0 — Alineación del modelo

- Usuarios separados de Conductores;
- Conductor 360;
- Control sin licencia;
- promoción configurable;
- continuidad por billetera;
- retirada del depósito mínimo obligatorio;
- referidos utilizables como saldo;
- transformación de Licencias/Planes;
- actualización de navegación y métricas.

### Prioridad 1 — Flujo financiero seguro

- solicitudes de recarga;
- métodos de pago;
- confirmación transaccional;
- ledger;
- facturación/documentos;
- reversos;
- conciliación;
- Auditoría.

### Prioridad 2 — Operación Marketplace

- Conductores;
- Trabajos;
- Clientes Marketplace;
- Billeteras;
- Incidencias;
- Valoraciones;
- tarifas;
- mapas/configuración operativa.

### Prioridad 3 — Crecimiento y administración

- Referidos;
- campañas;
- Rendimiento;
- configuración por bloques;
- roles y permisos;
- mejoras de Auditoría;
- modo de pruebas.

### Prioridad 4 — Escalabilidad

- API de tasa;
- pasarelas;
- facturación fiscal según jurisdicción;
- nuevas aplicaciones VRIXORA;
- automatizaciones.

---

## 37. Decisiones expresamente pendientes

Las siguientes decisiones no se fijan todavía cuando no existe información suficiente.

### 37.1. Clasificación jurídica/fiscal del documento

El producto gestionará **Facturación / documentos financieros**.

La denominación fiscal definitiva, numeración legal, impuestos y datos obligatorios se ajustarán a la jurisdicción aplicable antes de utilizar el documento como factura fiscal formal.

### 37.2. Proveedor definitivo de tasa

La arquitectura admite API y tasa manual.

No se fija proveedor todavía.

### 37.3. Pasarela internacional

La integración futura está contemplada, pero no se selecciona proveedor.

### 37.4. Configuración global frente a configuración por proyecto

Se definirá a medida que existan otros productos y una necesidad real.

### 37.5. Orden de consumo de saldos

Este PRD establece que saldo real y saldo promocional pueden cubrir comisiones.

El orden exacto de consumo entre ambos saldos deberá respetar el contrato técnico vigente o definirse explícitamente antes de modificarlo. No se inventará desde la interfaz.

---

## 38. Regla final del producto

El Centro de Control debe construirse alrededor de los **flujos reales del negocio**, no alrededor de tablas técnicas ni del modelo comercial antiguo.

Para TUKTUK:

- una cuenta autenticada es un **Usuario**;
- un usuario solo se convierte en **Conductor** cuando completa el alta de Trabajos;
- Control y Estadísticas son permanentes;
- el conductor recibe una promoción inicial configurable;
- después trabaja con saldo disponible;
- recargas y referidos alimentan la billetera;
- la comisión se gestiona por trabajo;
- Finanzas confirma dinero;
- el servidor acredita y liquida;
- Conductor 360 concentra la radiografía del prestador;
- Auditoría permite reconstruir quién hizo qué y por qué.

**Usuarios, Conductores, Marketplace, Comercial, Finanzas, Rendimiento, Administración y Auditoría deben compartir contexto y trazabilidad.**

El legado de Licencias y Planes se retirará de forma incremental, después de comprobar dependencias y sin destruir información real.
