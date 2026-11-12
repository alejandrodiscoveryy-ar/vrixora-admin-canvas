# Sistema visual, pruebas y ejemplos

## Guía compartida
Para Admin prevalece admin-premium.md y tokens verificados; no sustituir por propuestas generales.
- Usar valores actuales primero; si no existen, proponer escala 4/8/12/16/24/32 px, radios coherentes (12–16 px tarjetas), bordes sutiles y sombras ligeras. Confirmar antes de compartir tokens nuevos.
- Tipografía vigente, jerarquía por peso/tamaño/contraste. Texto operativo móvil orientativo 14–16 px; permitir ampliación.
- Distinguir marca de semántica; no depender del color: etiquetas, iconos, forma. Punto azul + halo blanco Cliente; destino naranja; estados Admin según producto. No inventar códigos de marca.
- Superficies claro/oscuro según tema. Marcas de agua decorativas no compiten con cifras, no interceptan interacción ni se anuncian.
- Contraste WCAG 2.2 AA: 4.5:1 normal, 3:1 texto grande y límites/estados relevantes de controles. Objetivo táctil 44–48 px/dp (mayor conductor). Foco, nombres accesibles, teclado y reducción de movimiento.
- Safe areas, teclado y texto dinámico; anchos 320, 360, 390, 412, 768, 1024 y 1440 px según producto, orientación cuando aplique, zoom 200% web. No altura fija que recorte contenido esencial.
- Iconos existentes, recursos ligeros, evitar animaciones constantes, dependencias y saltos de layout.

## Aceptación
- [ ] Tarea resuelta; acción primaria visible.
- [ ] Marca, componentes, textos, iconos y colores coherentes.
- [ ] Móvil, escritorio si aplica, teclado y safe areas sin recortes/solapamientos esenciales.
- [ ] Mapas conservan atribución, controles, marcadores, ruta y legibilidad.
- [ ] Carga, vacío, error, red lenta/offline, GPS/permisos y recuperación; datos antiguos identificados.
- [ ] Contraste, foco, lectura, targets, zoom y navegación accesible comprobados o pendientes.
- [ ] Contratos, tarifas, pago, estados, seguridad, privacidad y permisos intactos salvo autorización.
- [ ] No datos inventados ni acciones engañosas; no afirmar prueba sin evidencia.
- [ ] Reutilización; revisar rendimiento y dependencias; sin regresiones.
- [ ] Implementación: diff limitado, pruebas pertinentes, comprobación responsive y visual; publicación según autorización y verificar workflow/despliegue/WebApp.

## Ejemplos
- Selección de vehículos Cliente: tarjetas horizontales, icono lateral, nombre/precio, distancia/duración cerca de trayecto, selector de pago claro; comportamiento 360 px y seleccionado; no cambiar tarifas.
- Halo conductores: revisar capa, tamaño, orden y contraste; punto azul con borde blanco en fondos vigentes. No desactivar tema global ni inventar conductores. Preservar privacidad.
- Driver 360 premium: resumen, operación, documentos/vehículo y acciones; nombre, estado, contacto prioritarios; marcas de agua discretas, responsive y filtros. Conservar roles y datos.
- Integrar: identificar repo/main, diff, autorización, pruebas, integración del alcance y mecanismo vigente de publicación. PowerShell descargable si ejecución local. Reportar evidencia/bloqueo; APK no por defecto.

Formato breve: propuesta; cambios concretos; móvil; qué se mantiene; validación real/pendiente; estado (propuesta/prototipo/implementado/verificado/publicado).
