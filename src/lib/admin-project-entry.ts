/**
 * Decide si Vrixora puede saltarse el selector de proyectos.
 *
 * Solo se aplica a proyectos que devuelve la consulta autorizada del usuario.
 * El selector explícito y las consultas pendientes o fallidas nunca redirigen.
 */
export function singleProjectEntry(
  projects: readonly { id: string }[],
  options: { loaded: boolean; selectorRequested: boolean },
): string | null {
  if (!options.loaded || options.selectorRequested || projects.length !== 1) return null;
  return projects[0].id;
}
