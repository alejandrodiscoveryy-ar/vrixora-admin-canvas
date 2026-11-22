import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("Admin no consulta proyectos antes de completar la restauración de la sesión", () => {
  const admin = source("src/routes/admin.tsx");
  assert.match(admin, /useProject\(loading \|\| !user \? null : currentProjectId\)/);
  assert.match(admin, /useUserProjects\(loading \|\| !user \? null : user\.id\)/);
  assert.match(admin, /if \(loading\) \{/);
});

test("Una restauración fallida no conserva una sesión administrativa obsoleta", () => {
  const auth = source("src/lib/supabase-auth.tsx");
  assert.match(auth, /const \{ data, error \} = await client\.auth\.getSession\(\)/);
  assert.match(auth, /if \(mounted\) setSession\(null\);/);
});

test("La lista de proyectos exige sesión del usuario autenticado antes de solicitar datos", () => {
  const projects = source("src/lib/services/projects.ts");
  const validationIndex = projects.indexOf("await client.auth.getSession()");
  const projectsQueryIndex = projects.indexOf('.from("projects")');
  assert.ok(validationIndex >= 0 && validationIndex < projectsQueryIndex);
  assert.match(projects, /if \(authError\) throw authError;/);
  assert.match(projects, /authData\.session\?\.user\.id !== userId/);
  assert.match(projects, /Tu sesión administrativa ha caducado/);
});
