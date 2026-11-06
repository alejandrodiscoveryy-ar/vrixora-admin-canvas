# Comercial: trazabilidad de referidos

Estado: rama de desarrollo, sin cambios aplicados en Supabase ni despliegue.

Objetivo: mostrar para cada conductor referente todas las personas que invitó, aunque sean 57, 2 o 1, y cuánto ha generado la actividad válida de cada referido.

Criterios: relaciones y carreras de prueba excluidas; solo carreras liquidadas. Separar valor bruto de carreras, comisión consumida de saldo real, comisión cubierta con saldo promocional y créditos de recompensa al referente. Los premios no son ingresos de TUKTUK.

Permisos: commercial.view para acceder a la red; payments.view adicional para importes económicos.

La primera entrega presenta datos acumulados y búsqueda por nombre o código. Las cifras están expresadas en CUP, sin conversiones implícitas.

Pendiente: validar sintaxis y permisos de la función en un entorno aislado, ejecutar pruebas y compilación, aprobar aplicación de migración, merge y despliegue. Ninguno de esos pasos posteriores está autorizado todavía.