# Auditoría estática — Bloque 10 Marketplace

Fecha: 16 de septiembre de 2026.

## PRD

La regla oficial Customer → Driver fue incorporada al PRD canónico y a su copia
sincronizada: 1–5 estrellas, comentario opcional, máximo una valoración por
trabajo `settled`, ligada a proyecto/trabajo/cliente/conductor y no editable por
el conductor.

## Resultado de la auditoría

Antes de este cierre existían sesiones anónimas hashadas, operaciones de
solicitud/publicación idempotentes, tracking privado y assets privados de
conductores. Faltaban: la valoración Customer→Driver, la resolución autorizada
de las fotos para el cliente asignado y una capa común de límite de operaciones
anónimas. No se encontraron accesos Flutter directos a tablas transaccionales
ni uso de `service_role`.

El interruptor `captcha_required` se mantiene apagado para desarrollo local.
El gateway Edge verifica el proveedor configurado con secretos de entorno antes
de llamar a los RPC internos. No acepta una prueba sin verificar ni la persiste.
