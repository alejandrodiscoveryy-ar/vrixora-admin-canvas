# Vrixora Admin — Alarmas operativas (primera entrega)

Fecha: 22 de octubre de 2026.

## Alcance implementado en rama (no producción)
- Barra compacta en todas las páginas del proyecto para usuarios con `marketplace.view`.
- Comprobación de conductores y trabajos con RPC administrativas ya existentes cada 20 segundos mientras el panel está abierto.
- Nuevo conductor: incorporación al directorio de conductores Marketplace, no mero inicio de sesión Google.
- Nueva carrera: trabajo ya publicado, nunca borrador ni carrera de prueba (`isTest`).
- Sonidos diferenciados para registro y carrera. Activación mediante clic para respetar restricciones de audio del navegador.
- Una notificación visual por ID detectado, con acción de abrir Marketplace y botón de marcar como revisadas.
- Primera conexión fija una línea base para no notificar como nuevo todo el historial; almacenamiento local de identificadores por usuario y proyecto (sin datos personales).
- Estado de conectividad visible, fallos sin falsas afirmaciones de sincronización.

## Limitaciones deliberadas
- **No hay notificaciones push persistentes con navegador cerrado.** Esto exige alta de dispositivos Admin y backend, todavía no implementados.
- No hay confirmación centralizada de recepción o lectura compartida entre administradores/dispositivos.
- El sondeo consulta los 80 registros más recientes de cada categoría y puede no captar todos los eventos si se generan más de 80 entre comprobaciones o períodos sin conectividad.
- El audio depende de permisos, políticas de reproducción, volumen, pestaña activa y suspensión del equipo; no se promete audio al bloquear Android.
- No se han cambiado migraciones, cron, tokens FCM, funciones SQL, Conductor ni Cliente.

## Verificaciones para cierre de fase 1
1. `node --test tests/admin_operational_alerts.test.mjs`.
2. `bun install --frozen-lockfile` y `npm run build`.
3. Prueba real web Admin con un conductor de prueba creado mediante flujo legítimo: aparece un único aviso, distinguible de un usuario Google.
4. Prueba con carrera real publicada: aviso, sonido diferente, acceso a Marketplace.
5. Crear una carrera de prueba y mantener un borrador sin publicar: no deben generar alarmas.
6. Recargar, cambiar de sección, abrir dos pestañas y desconectarse temporalmente: comprobar que no se multiplican avisos ni se muestra conexión falsa.

## Segunda entrega prevista, sujeta a aprobación separada
- Confirmar roles destinatarios y registrar dispositivos Admin con consentimiento explícito (scope `admin`, no `client`).
- Guardar eventos y acuses de lectura en servidor con RLS y deduplicación por conductor/trabajo; ninguna consulta pública debe exponer identidad del conductor ni ruta del cliente.
- Incorporar productores para nuevos perfiles operativos y trabajos publicados y conectar con el emisor FCM existente. No crear un cron o emisor paralelo.
- Probar en segundo plano, navegador cerrado y Android bloqueado; considerar alerta de carrera sin asignar tras el umbral operativo acordado.
- Desplegar únicamente tras pruebas de seguridad, integración y autorización del propietario.
