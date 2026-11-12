<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
## Fuente oficial de requisitos

Antes de analizar, modificar o implementar cualquier función, leer:

- `docs/PRD_MASTER.md`

El archivo `docs/PRD_MASTER.md` es la fuente oficial de requisitos del ecosistema VRIXORA Solutions y TukTuk Control.

No considerar una función terminada únicamente porque exista una pantalla o porque el proyecto compile.

Verificar, cuando corresponda:

- frontend;
- backend;
- base de datos;
- migraciones;
- RPC;
- RLS;
- permisos;
- pruebas;
- despliegue;
- funcionamiento real.

Si el código contradice una regla crítica del PRD, documentar la diferencia antes de modificarla.

## Sistema de diseño oficial — Vrixora Design System v2.0

Antes de analizar, diseñar o implementar cualquier cambio de interfaz o experiencia de usuario en Vrixora Admin, leer:

- [Skill de diseño](docs/design-system/SKILL.md)
- [Estándar premium y compacto](docs/design-system/references/admin-premium.md)
- [Componentes compartidos](docs/design-system/references/componentes.md)
- [Auditoría de calidad](docs/design-system/references/auditoria-admin.md)

Consultar también las referencias de productos y calidad enlazadas desde la skill cuando corresponda.

El PRD_MASTER.md sigue siendo la fuente oficial de requisitos y lógica de negocio. El sistema de diseño gobierna la coherencia visual y UX; no autoriza cambios de negocio, permisos, seguridad ni publicación.

Reglas de intervención visual:
- Reutilizar tokens y componentes existentes; no introducir un lenguaje visual aislado ni una biblioteca paralela.
- Mantener estilo premium, compacto y responsive en todos los módulos, claro/oscuro y accesibilidad.
- Revisar consumidores de componentes compartidos antes de cambiarlos; documentar excepciones y migrar por etapas.
- Aplicar auditoría previa/posterior y rúbrica basada en evidencia. No aprobar con problemas críticos o altos, regresiones o pruebas obligatorias pendientes.
- Distinguir propuesta, implementación, verificación y publicación. No modificar producción por una solicitud de diseño.

Los valores dimensionales y umbrales nuevos se documentan como propuestas; verificar contra main y pruebas reales antes de imponer cambios globales.
