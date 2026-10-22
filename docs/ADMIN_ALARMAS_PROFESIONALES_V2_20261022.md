# Alarmas operativas VRIXORA — V2, implementación por validar

## Objetivo
Avisar al gestor de carrera publicada, conductor nuevo y carrera que sigue sin asignar, tanto con la web visible como minimizada o cerrada cuando el navegador/SO permite push.

## Arquitectura
- La web usa el `sw.js` existente, con Firebase Cloud Messaging y **permiso explícito del usuario**.
- Registra el token usando `register_my_admin_push_token`, que ya existe en Supabase.
- Los productores SQL encolan solo eventos para el propietario o usuarios con `marketplace.view` Y dispositivo `admin/web` registrado.
- `notification_outbox` garantiza deduplicación por evento, destinatario y etapa. No se añaden tablas ni cron.
- `send-push-notifications` ya desplegado incorpora las nuevas categorías y usa su cron existente (5 min) para eventos de espera. Para nuevas carreras y conductores invoca el mismo emisor en caliente mediante pg_net, con cron como respaldo.
- Los avisos nunca incluyen teléfonos o direcciones en el push de pantalla bloqueada; muestran información adicional tras autenticación.
- Notificaciones con usuario desconectado o permisos revocados no deben abrir datos sin login.

## Limitaciones no evitables por una webapp
- El navegador y Windows deciden si la notificación aparece y emite sonido cuando la página está cerrada. No se puede imponer un MP3 propio ni saltar el modo «No molestar» del sistema desde una web.
- La entrega no está garantizada si el navegador/sistema operativo suprime push o el equipo está desconectado; FCM enviado no demuestra recepción.
- Si se cierra sesión, el token sigue registrado hasta desactivar; el receptor no puede acceder a información confidencial sin autenticación. Es recomendable desactivarlo al cerrar sesión; verificar antes de lanzamiento.
- Las alertas por carrera pendiente se repiten a los 2 y 10 minutos (vigilancia web cada 20 s, backend cron existente hasta 5 min entre barridos).

## Pruebas imprescindibles ANTES de aprobar merge o migración
1. Actualizar tokens con clic en «Activar avisos Windows»; verificar `admin/web/enabled` para el gestor.
2. Abrir Admin en PC y registrar carrera real; validar aviso en 20 s, tono y registro en outbox.
3. Minimizar navegador y registrar otra carrera: verificar notificación del SO y sonido predeterminado.
4. Cerrar completamente la pestaña y registrar carrera; comprobar notificación y clic que devuelve al panel autenticado.
5. Probar con permisos de Windows denegados, modo No molestar, sin conectividad, varios usuarios, varias pestañas y varios proyectos.
6. Comprobar que carreras de prueba, pendientes no publicadas, canceladas o ya asignadas NO crean push de pendientes.
7. Validar condiciones SQL y restricciones RLS; prueba con actor sin `marketplace.view` y con token scope `client`.
8. En despliegue: migración SQL controlada, Edge Function alineada y por último webapp; pruebas de punta a punta.

## Estado de entrega
Cambios preparados en archivos para revisión y PR; **no se ha aplicado ninguna migración remota ni desplegado esta etapa en producción**.
