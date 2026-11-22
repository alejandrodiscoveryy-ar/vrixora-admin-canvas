import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { singleProjectEntry } from "../src/lib/admin-project-entry.ts";

const ready = { loaded: true, selectorRequested: false };
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Un proyecto autorizado: Vrixora entra directamente sin pantalla de selección", () => {
  assert.equal(singleProjectEntry([{ id: "tuktuk-control-id" }], ready), "tuktuk-control-id");
});

test("Dos o más proyectos: se conserva el selector para el futuro", () => {
  assert.equal(singleProjectEntry([{ id: "tuktuk" }, { id: "otro" }], ready), null);
  assert.equal(singleProjectEntry([{ id: "a" }, { id: "b" }, { id: "c" }], ready), null);
});

test("Sin proyectos, con datos pendientes o si falla la consulta: no hay redirección", () => {
  assert.equal(singleProjectEntry([], ready), null);
  assert.equal(singleProjectEntry([{ id: "tuktuk" }], { loaded: false, selectorRequested: false }), null);
});

test("Selector antiguo: recupera entrada directa solo después de verificar el permiso", () => {
  assert.equal(singleProjectEntry([{ id: "tuktuk" }], { loaded: true, selectorRequested: true }), null);
  assert.equal(singleProjectEntry([{ id: "tuktuk" }], { loaded: true, selectorRequested: true, recoveredAccess: false }), null);
  assert.equal(singleProjectEntry([{ id: "tuktuk" }], { loaded: true, selectorRequested: true, recoveredAccess: true }), "tuktuk");
  assert.equal(singleProjectEntry([{ id: "a" }, { id: "b" }], { loaded: true, selectorRequested: true, recoveredAccess: true }), null);
  const index = read("src/routes/admin.proyectos.index.tsx");
  const project = read("src/routes/admin.proyectos.$id.tsx");
  assert.match(index, /isLoading && !isFetching && !error/);
  assert.match(index, /\(state\.location\.search as Record<string, unknown>\)\.seleccionar === "1"/);
  assert.match(index, /useProjectAccess\(user\?\.id \?\? null, recoveryId\)/);
  assert.match(index, /recoveredAccess: recoveredAccess === true && !recoveryLoading && !recoveryError/);
  assert.match(index, /params: \{ id: redirectProjectId \}/);
  assert.match(index, /replace: true/);
  assert.match(project, /search: \{ seleccionar: "1" \}/);
  assert.match(project, /!accessError && hasAccess === false/);
  assert.match(project, /void retryAccess\(\)/);
});

test("Errores transitorios jamás se convierten en denegación de acceso", () => {
  const service = read("src/lib/services/projects.ts");
  const project = read("src/routes/admin.proyectos.$id.tsx");
  assert.match(service, /if \(error\.code === "PGRST116"\) return false/);
  assert.match(service, /Error checking project access:[\s\S]+?throw error/);
  assert.match(service, /Error fetching project:[\s\S]+?throw error/);
  assert.match(project, /if \(projectError \|\| accessError\)/);
  assert.match(project, /No se pudo comprobar el acceso al proyecto/);
  assert.match(project, /Reintentar/);
});

test("Se conserva el acceso con Google, el selector y el panel existente", () => {
  const auth = read("src/lib/supabase-auth.tsx");
  const login = read("src/routes/admin.login.tsx");
  const index = read("src/routes/admin.proyectos.index.tsx");
  assert.match(auth, /redirectTo: `\$\{window\.location\.origin\}\/admin\/proyectos`/);
  assert.match(login, /to: "\/admin\/proyectos"/);
  assert.match(index, /projects\.map\(\(p\) =>/);
  assert.match(index, /<EmptyState \/>/);
  assert.match(index, /if \(error\)/);
});
