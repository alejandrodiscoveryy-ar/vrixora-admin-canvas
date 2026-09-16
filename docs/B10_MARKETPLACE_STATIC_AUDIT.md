# Auditoría estática — Bloque 10 Marketplace

Fecha: 16 de septiembre de 2026.

## Discrepancia de PRD

`PRD_MASTER.md` v1.2 aún enumera Marketplace dentro de los elementos excluidos
de la primera versión, pero la misma versión incorpora reglas explícitas de
referidos de TukTuk Marketplace. El Bloque 10 solicitado desarrolla Customer
PWA/Marketplace V1, por lo que constituye alcance técnico autorizado por este
encargo y no modifica el PRD. La decisión de incorporar Marketplace al alcance
formal del producto y actualizar su versión permanece reservada al owner.

## Resultado de la auditoría

Antes de este cierre existían sesiones anónimas hashadas, operaciones de
solicitud/publicación idempotentes, tracking privado y assets privados de
conductores. Faltaban: la valoración Customer→Driver, la resolución autorizada
de las fotos para el cliente asignado y una capa común de límite de operaciones
anónimas. No se encontraron accesos Flutter directos a tablas transaccionales
ni uso de `service_role`.

El interruptor `captcha_required` se mantiene apagado para desarrollo local.
Cuando se active, las RPC directas quedan bloqueadas y un gateway Edge deberá
validar el proveedor configurado con su secreto antes de reenviar la operación.
No se acepta un token de CAPTCHA sin verificar ni se persiste su valor.
