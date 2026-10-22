# PR: Alarmas operativas profesionales de VRIXORA Admin

## Alcance exacto
Este PR prepara notificaciones FCM (PC minimizada / navegador cerrado cuando lo admite Windows), sonido en pestaña visible u oculta, avisos de carreras publicadas, nuevos conductores y avisos de carreras sin conductor (2/10 min). Reutiliza Firebase, `push_device_tokens`, `notification_outbox`, `send-push-notifications` y el cron existente.

## Implementación NO implica publicación
La migración SQL y el Edge Worker son cambios de producción de alto impacto y **no deben desplegarse automáticamente desde este PR**. La entrega exige comprobar permisos, tokens admin, backend, frontend y pruebas dinámicas.

## Limitaciones y seguridad
La reproducción de sonido con la web cerrada depende del sistema operativo, no de nuestro JavaScript. Permiso explícito para push. No se introducen claves privadas en el cliente. Los avisos push no llevan datos de la carrera sensibles. La navegación por click abre rutas internas y comprueba autenticación. La emisión solo se dirige a usuarios con permiso o al propietario con token admin habilitado.
