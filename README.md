# Vrixora Admin — Centro de Control de TUKTUK

Repositorio de la interfaz administrativa de VRIXORA, que incluye las áreas de gestión y operación de **TUKTUK**. Se mantiene por separado de las aplicaciones del conductor y del cliente.

## Estructura de trabajo

- `src/routes/`: rutas de la aplicación, navegación y control de acceso a vistas.
- `src/features/admin/`: pantallas y flujos del Centro de Control.
- `src/components/`: componentes de interfaz reutilizables.
- `src/lib/`: servicios y conexiones con Supabase.
- `tests/`: verificaciones automatizadas del contrato administrativo.
- `supabase/migrations/`, `supabase/functions/`, `supabase/verification/`: SQL, funciones y pruebas del backend compartido. **Su presencia en el repositorio no significa que estén desplegados.**
- `.github/workflows/`: comprobaciones y publicación controlada.

Las reglas de producto y experiencia se documentan en `docs/PRD_CENTRO_CONTROL_VRIXORA.md` y, para el ecosistema, en `docs/PRD_MASTER.md`. Estas especificaciones pueden describir objetivos todavía pendientes: confirmar siempre el estado mediante código, migraciones y ejecuciones recientes.

## Tecnologías

React, TypeScript, TanStack Router, Vite y Tailwind CSS. Supabase proporciona servicios del backend compartido. El proyecto utiliza también componentes e integraciones que pueden proceder de Lovable.

## Desarrollo y comprobaciones

Con Node.js y un gestor de paquetes compatible con `package.json`:

```sh
npm install
npm run dev
```

Comprobaciones disponibles en `package.json`:

```sh
npm run lint
npm run build
npm run build:production-safe
npm run test:gateway-security
```

Los archivos de entorno deben configurarse localmente a partir de `.env.example`. **Nunca subir contraseñas, claves privadas o tokens de servicio.** Las claves públicas y los permisos de acceso se deben revisar por separado.

## Publicación y precauciones

- Las modificaciones se preparan en una rama y se revisan mediante un Pull Request.
- Un PR integrado o un build satisfactorio **no prueba** que la aplicación esté desplegada.
- La publicación de Administración está definida en `.github/workflows/deploy-production.yml` y requiere autorización expresa.
- **No ejecutar migraciones, SQL de verificación que escriba datos o funciones de Supabase en producción sin autorización y revisión previa.**
- No modificar repositorios de Cliente, Conductor o backend histórico desde este proyecto sin una tarea específica y validada.

## Repositorios relacionados

- `tuktuk-control`: WebApp y código Android del conductor.
- `tuktuk-cliente`: WebApp del cliente y preparación Android.
- `tuktuk-backend`: archivo central histórico de referencias; **no es todavía una fuente de despliegue certificada**.

Esta documentación sustituye las instrucciones genéricas del proyecto inicial sin cambiar código, comportamiento ni despliegues.
