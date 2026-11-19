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

test("Selector explícito: evita bucles si cambia el acceso", () => {
  assert.equal(singleProjectEntry([{ id: "tuktuk" }], { loaded: true, selectorRequested: true }), null);
  const index = read("src/routes/admin.proyectos.index.tsx");
  const project = read("src/routes/admin.proyectos.$id.tsx");
  assert.match(index, /isLoading && !isFetching && !error/);
  assert.match(index, /\(state\.location\.search as Record<string, unknown>\)\.seleccionar === "1"/);
  assert.match(index, /singleProjectEntry\(projects/);
  assert.match(index, /params: \{ id: redirectProjectId \}/);
  assert.match(index, /replace: true/);
  assert.match(project, /search: \{ seleccionar: "1" \}/);
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
