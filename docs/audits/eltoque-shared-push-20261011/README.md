# Integración elTOQUE compartida — preflight detenido

Fecha: 2026-10-11. Estado: NO IMPLEMENTADO; pruebas NO_PROBADAS.

## Alcance autorizado

Admin gobierna configuración, contratos y migraciones; Supabase ejecuta los
servicios compartidos; Cliente y Conductor consumen un único emisor y cron.
Solo desarrollo local: sin publicaciones, merges, migraciones remotas,
despliegues, cambios de cron ni notificaciones reales.

El documento solicitado amplía el alcance del PRD v1.1: su sección 19 excluye
Marketplace de la primera versión y la sección 24 no enumera la app Cliente.
La solicitud del propietario autoriza esta integración de desarrollo; no se
modificó el PRD ni se interpretó como autorización de activación.

## Repositorios comprobados

Las referencias remotas se verificaron mediante `git ls-remote`, seguido de
fetch y creación de worktrees aislados. No se retrocedieron los checkouts.
Rama independiente en cada repositorio: `codex/eltoque-shared-push-20261011`.

| Repositorio | Base verificada | Worktree bajo el proyecto Admin |
|---|---|---|
| vrixora-admin-canvas | d5c012a7c7c04b1d35822a98edb08bfbabc98a1c | .worktrees/eltoque-admin |
| tuktuk-cliente | 9b740b2d35ff303c2c8d1477187e3ceed1051c23 | .worktrees/eltoque-cliente |
| tuktuk-control | bbc486415a56f7bbe4c471aff781bbc47550d737 | .worktrees/eltoque-conductor |

Checkouts originales preservados: Admin tenía `docs/backend/` sin seguimiento;
Cliente tenía `.wrangler/` sin seguimiento; Conductor tenía cambios en
`flutter_app/lib/presentation/screens.dart`, un test de colores sin seguimiento
y otros directorios de trabajos previos. No se incorporaron a esta tarea.

## Supabase: evidencia de solo lectura

Proyecto: `vvxvnywzgtqhlaqpxyqh`.

- Emisor `send-push-notifications` ACTIVE, versión 16, `verify_jwt=false`.
- Hash de paquete informado: `d1063eb8221095415ee7278c3cb0aef8d79000c5ea85efde2180b0361246b786`.
- Se recuperaron completos `index.ts` y `core.ts` mediante get_edge_function;
  se conservan como `.txt` de auditoría, fuera de cualquier carpeta desplegable.
- Único cron cuyo nombre contiene push: `tuktuk-push-dispatch`, activo,
  `*/5 * * * *`. No se consultó ni expuso su comando, que podría contener secretos.
- Trigger `trg_marketplace_customer_eltoque_push`: 0.
- Migración registrada: versión `20261011141714`, nombre
  `tuktuk_cliente_eltoque_schema_preactivation_20261011`. También se recuperaron
  sus statements: esquema, privilegios y RPC ya aplicados, sin trigger ni cron.
- Suscripciones Cliente: 0. Entregas Cliente: 0. Historial de tasas: 126 al leer.
- Lista de Edge Functions sin `marketplace-customer-rate-push` ni
  `marketplace-customer-push-registration`.
- No se ejecutaron RPC de claim, DDL, escrituras, dispatch ni pruebas contra
  servicios remotos. No se consultaron valores de variables o credenciales.

## Diferencia GitHub / emisor operativo

Comparación de los dos archivos con la base Conductor `bbc4864`:

1. Producción agrega `new_subscription` a ALLOWED_KINDS.
2. Producción lee `data.target_audience`; admite admin/client y usa admin
   por defecto para new_subscription, client para los demás eventos.
3. Producción filtra tokens por `app_scope=targetAudience`, además de los
   filtros existentes por proyecto, usuario, habilitación y plataforma.
4. Producción registra la audiencia en el mensaje de ausencia de tokens.
5. El comentario sobre el tipo Database presente en GitHub no está en producción.
6. `core.ts` no tiene diferencias funcionales; la copia documental añade una
   línea final. No hay otras diferencias en index.ts salvo formato/línea final.

Se preservarán los seis eventos operativos, la autenticación privada
`x-tuktuk-dispatch-secret`, Google OAuth, buildFcmMessage, clasificación de
errores, reintentos, leases y límites. No es seguro usar main de Conductor como
rollback: perdería new_subscription y la separación admin/client. El rollback
deberá partir del snapshot v16 y requerirá autorización posterior de despliegue.
No se preparó todavía ningún cambio del emisor ni se verificó una regresión.

## Motivo de detención

Durante `git worktree add` de Conductor, Git informó:

```
error: failed to delete '.git/worktrees/harden-referral-attribution': Permission denied
error: failed to delete '.git/worktrees/technical-cleanup': Permission denied
error: failed to delete '.git/worktrees/tuktuk-control-push-hardening': Permission denied
```

La operación terminó con código 0 y el nuevo worktree está limpio en la base
correcta. Son errores de mantenimiento de metadatos de otros worktrees, no
fallos demostrados del código. No se puede afirmar que esas otras entradas
quedaron intactas. No se hicieron reparaciones ni borrados manuales.
Se detuvo la implementación conforme a la instrucción del adjunto:
«Ante divergencia, error, inseguridad o ausencia de acceso: parar, informar y esperar».

## Pendiente

Resolver o autorizar continuar tras los errores de metadatos. Después:
conciliar esquema aplicado en Admin sin habilitar su repetición, preparar SQL
de activación/verificación/rollback sin ejecutar, integrar la cola Cliente en
el emisor v16 preservando prioridad Conductor, separar registro seguro con
Turnstile, ajustar Flutter y ejecutar pruebas backend/Flutter/build Web.

No se ejecutaron pruebas: el código de integración todavía no existe.
No se crearon commits de implementación en Cliente ni Conductor.

```
UN_SOLO_EMISOR=PENDIENTE
CRON_NUEVO=NO
PRODUCCION_MODIFICADA=NO
PUSH_REAL=NO_PROBADO
CONDUCTOR_SIN_REGRESIONES=PENDIENTE
```

## Verificación independiente del propietario (PowerShell)

Estos comandos solo leen estado y metadatos. Permiten revisar por separado
las entradas que originaron los errores. No ejecutar prune, remove ni borrar
metadatos antes de comprobar a qué trabajos pertenecen.

```powershell
git -C D:\Codex\tuktuk-control worktree list --porcelain
git -C D:\Codex\tuktuk-control worktree prune --dry-run --verbose
git -C D:\Codex\vrixora-admin-canvas\.worktrees\eltoque-conductor status --short --branch
```

El dry-run describe entradas que Git eliminaría; no las elimina. Esta revisión
independiente no fue ejecutada por Codex. Git puede necesitar acceso adicional
a metadatos; no cambiar ACL de forma masiva para resolverlo.
