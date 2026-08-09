# Modo temporal de revisión visual

Esta superficie es independiente del Admin autenticado y utiliza exclusivamente el snapshot
sanitizado de `src/lib/review`. No crea sesiones ni concede permisos administrativos.

## Generar un enlace

Ejecutar:

```bash
pnpm review:token -- 168
```

El argumento es la duración en horas. El comando imprime el token una sola vez y un registro con
su hash SHA-256 y `expiresAt`. Configurar en el runtime server-side el secreto
`ADMIN_REVIEW_TOKENS` con un array JSON de registros; nunca incluir el token original:

```json
[{ "hash": "<sha256>", "expiresAt": "<ISO-8601>", "revokedAt": null }]
```

La URL será `https://<dominio>/review/<token>`.

## Revocar

Actualizar el mismo secreto y asignar a `revokedAt` una fecha ISO-8601. La siguiente petición a
cualquier ruta del enlace responderá `410`. También puede eliminarse el registro del array, en cuyo
caso responderá `404`.

## Retirada posterior a la auditoría

Eliminar las rutas `src/routes/review.*`, `src/features/review`, `src/lib/review`, los dos scripts
`scripts/*review*`, la integración del guard en `src/server.ts` y este documento. Finalmente,
eliminar el secreto `ADMIN_REVIEW_TOKENS` del despliegue.
