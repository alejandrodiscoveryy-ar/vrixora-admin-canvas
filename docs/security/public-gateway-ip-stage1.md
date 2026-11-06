# Etapa 1: identidad de red de los gateways públicos

Fecha: 6 de noviembre de 2026.
Base revisada: `main`, commit `772a495ed9fb13a4579f9e32d896668fa16ffad0`.
Estado: corrección candidata con pruebas locales; pendiente de validar la frontera
de confianza del alojamiento. Mantener el PR en borrador. No integrar ni desplegar.

## Evidencia comprobada

Los gateways `marketplace-customer-gateway` y `marketplace-map-gateway` usan
`x-forwarded-for.split(",")[0]` para construir la entrada del HMAC que identifica
el contador. El HMAC oculta la dirección pero no autentica su procedencia.
La consulta de solo lectura del proyecto `vvxvnywzgtqhlaqpxyqh` en esta conversación
identificó versiones activas customer v11 y mapas v15 y confirmó ese mismo patrón
en el código desplegado. No se hizo una prueba de evasión contra producción.

La nueva prueba ejecuta los archivos reales de ambos gateways: conserva su
derivación HMAC y sus llamadas a la RPC, sustituyendo únicamente el SDK, la base
de datos, el proveedor de mapas y el servidor HTTP por servicios simulados. No
dispone de credenciales reales ni acceso de red. El contador simulado permite dos
peticiones por identidad; no se ejecuta el SQL real ni se prueban sus transacciones.

En el código original, tres peticiones con la misma IP posterior y diferentes
prefijos XFF obtienen tres identidades y superan ese presupuesto. Esto demuestra
el fallo del código cuando la cadena recibida conserva el prefijo. No demuestra
que la infraestructura del proyecto permita entregar esa cadena desde Internet.

Cloudflare documenta que puede añadir direcciones a una cadena XFF existente:
[referencia oficial de cabeceras](https://developers.cloudflare.com/fundamentals/reference/http-headers/#x-forwarded-for).
Esa documentación no sustituye la comprobación del recorrido completo de Supabase.

## Corrección candidata

- Helper compartido que utiliza exclusivamente `cf-connecting-ip`.
- Validación de una única dirección IPv4/IPv6; rechaza listas, datos ausentes,
  direcciones inválidas y zonas IPv6. Canonicaliza IPv6 antes del HMAC.
- Sin fallback a XFF, `x-real-ip` ni `unknown-network`.
- Error `GATEWAY_CLIENT_IP_UNAVAILABLE` con HTTP 503 antes de crear el cliente
  de base de datos o consultar proveedores si falta una dirección válida.
- Conserva secretos, categorías, presupuestos SQL y contratos de operaciones.
- Elimina XFF de las cabeceras admitidas por CORS en customer. CORS por sí solo
  no es una defensa frente a clientes que llaman directamente por HTTP.

**Condición obligatoria:** una dirección sintácticamente válida NO es una prueba
de procedencia. Si el alojamiento no sobrescribe `cf-connecting-ip`, esta propuesta
también permitiría cambiar de contador. No considerarla una corrección de producción
hasta verificar el contrato del ingreso administrado y la ausencia de rutas que
lo eludan. Si no se puede garantizar, hace falta otra frontera autenticada; no se
debe resolver añadiendo cabeceras alternativas sin verificar.

El cliente `tuktuk-cliente`, referencia consultada `e9d77ed49f15e3cf2325c8cf6bd5c27a512b6ebd`,
invoca los gateways con el cuerpo de las operaciones. No requiere enviar cabeceras
de IP. No se cambió ese repositorio ni se compiló APK.

## Pruebas ejecutadas por Codex

Entorno: Windows, Node 24.20.0, Deno 2.9.7.

| Verificación | Base original | Corrección candidata |
|---|---:|---:|
| Nuevas pruebas de gateways, mismo archivo en ambos árboles | 2 pasan / 9 fallan | 11 pasan / 0 fallan |
| Suite existente `tests/*.test.mjs` | 220 pasan / 6 fallan | 220 pasan / mismos 6 fallos |
| Contratos existentes de búsqueda de mapas | incluidas en suite | 3 pasan / 0 fallan |
| Chequeo Deno de ambos gateways | 4 errores en mapas | mismos 4 errores en mapas |
| Chequeo Deno del helper y gateway customer | no aplica al helper nuevo | satisfactorio |
| `git diff --check` | — | satisfactorio |

Las pruebas nuevas cubren rotación XFF, ausencia/duplicación/formato inválido de
la cabecera elegida, canonicalización IPv6, presupuestos independientes por IP,
presupuesto read compartido entre gateways, métodos HTTP y bloqueo antes de Mapbox.
Simulan una cabecera que ya ha sido autenticada por el ingreso; no prueban el proxy.

Los seis fallos previos corresponden a `customer_eltoque_sql.test.mjs`, dos casos
de `marketplace_pricing_lab_v2.test.mjs`, uno de `marketplace_pricing_map_v3.test.mjs`,
uno de `marketplace_test_lab_runtime.test.mjs` y uno de `tuktuk_job_reminders_contract.test.mjs`.
Los cuatro errores de tipos previos están en las firmas de `managedCredential` /
`resolveMapboxCredential` del gateway de mapas (TS2345 y TS2339). No se ampliaron
los cambios para corregir esos asuntos ajenos a esta etapa.

No se ejecutó compilación frontend ni APK: el cambio funcional está limitado a
Edge Functions. No hubo pruebas dinámicas de Postgres, móviles o producción.
La verificación CI específica no instala dependencias y no recibe secretos;
los resultados remotos deben comprobarse por separado.

## Verificación independiente del propietario con PowerShell

Desde la carpeta del repositorio y esta rama, con Node 24.20.0:

```powershell
node --experimental-vm-modules --test tests/security/public_gateway_ip_boundary.test.mjs
node --test tests/havana_poi_search.test.mjs
```

Resultado esperado: 11 y 3 pruebas satisfactorias. Estos comandos ejecutan código
local de pruebas; no modifican Supabase ni llaman a Mapbox. Node puede mostrar
avisos sobre las APIs experimentales utilizadas por el arnés de pruebas.
No hace falta ejecutarlos de nuevo para continuar la revisión: ya se ejecutaron.

## Pendientes para integrar y publicar

1. Obtener confirmación verificable del ingreso administrado de Supabase: qué
   componente sobrescribe `cf-connecting-ip`, dominios admitidos, duplicados y
   posibles accesos que eludan ese componente. No dar por garantizado ese contrato
   basándose en respuestas de la comunidad o en la validación de formato.
2. Con aprobación específica y un entorno de pruebas identificado, comprobar el
   paso real por el proxy con cabeceras falsificadas y duplicadas, IPv4/IPv6,
   ausencia de cabeceras y dominios alternativos habilitados. No devolver ni
   registrar IPs reales, tokens o cabeceras completas en un diagnóstico público.
3. Probar allí ambos gateways con clientes reales, presupuestos reales y fallos
   del ingreso; comprobar también que una petición bloqueada no consume Mapbox.
4. Revisar los fallos heredados, cerrar el bloqueo de confianza y solicitar al
   propietario aprobación expresa para merge y para cada despliegue.

Riesgo operativo: una instalación sin la cabecera exigida devolverá 503 a todos
los POST de estos gateways. Los usuarios que compartan dirección pública
seguirán compartiendo presupuesto. Estas limitaciones impiden desplegar a ciegas.

## Plan de reversión

- Mientras el PR permanezca sin integrar/desplegar: cerrarlo deja producción
  intacta; no es necesario borrar ramas ni datos.
- Si se integrase, preparar un commit de reversión del cambio de código y
  someterlo a revisión y aprobación, sin reescribir historia publicada.
- Si se desplegase posteriormente, conservar antes los artefactos completos de
  las dos versiones anteriores. Ante errores 503 o regresiones, con autorización
  expresa, volver a publicar ambos artefactos anteriores, comprobar operaciones
  esenciales y revisar errores y consumo. No basta con revertir Git para cambiar
  una Edge Function ya desplegada.
- La reversión a esas versiones restablecería el riesgo XFF anterior; mantener
  registrado el hallazgo y acordar la mitigación operativa. No hay migraciones,
  datos, CAPTCHA ni secretos que revertir en este PR.

## Nota para el documento maestro

Etapa 1 preparada para revisión: fallo de identidad XFF reproducido en aislamiento,
corrección candidata compartida y pruebas incluidas. No integrada ni desplegada.
Bloqueo pendiente: contrato verificable de `cf-connecting-ip` en el ingreso real
y prueba autorizada fuera de producción. Mantener las etapas siguientes pendientes.
