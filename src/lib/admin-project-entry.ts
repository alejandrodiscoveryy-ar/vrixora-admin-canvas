/**
 * Decide si Vrixora puede saltarse el selector de proyectos.
 *
 * Solo se aplica a proyectos que devuelve la consulta autorizada del usuario.
 * El selector explícito y las consultas pendientes o fallidas nunca redirigen.
 */
export function singleProjectEntry(
  projects: readonly { id: string }[],
  options: { loaded: boolean; selectorRequested: boolean; recoveredAccess?: boolean },
): string | null {
  if (!options.loaded || projects.length !== 1) return null;
  // Si el selector se abrió tras un error anterior, reingresar únicamente
  // cuando una nueva consulta confirme el acceso; evita bucles de permisos.
  if (options.selectorRequested && !options.recoveredAccess) return null;
  return projects[0].id;
}
