import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const shell = read("src/routes/admin.tsx");
const workspace = read("src/features/admin/AdministrationWorkspace.tsx");
const settings = read("src/features/admin/ConfiguracionSection.tsx");
const navigation = read("src/lib/admin-navigation.ts");

test("Configuration children live under their main sidebar category, not a second panel", () => {
  assert.doesNotMatch(workspace, /aria-label="Secciones de configuración del proyecto TukTuk"/);
  assert.doesNotMatch(workspace, /xl:grid-cols-\[252px_minmax\(0,1fr\)\]/);
  assert.match(shell, /data-nav-submenu/);
  assert.match(shell, /admin-nav-config-group/);
  assert.match(shell, /tab\.children\.map\(\(child\) =>/);
  for (const name of ["Ajustes generales", "Empleados", "Comunicados", "Integraciones"]) {
    assert.ok(navigation.includes('label: "' + name + '"'), name);
  }
});

test("Entering Configuración reveals the main submenu even when desktop rail was collapsed", () => {
  assert.match(shell, /configurationPageActive/);
  assert.match(shell, /if \(configurationPageActive\) setSidebarCollapsed\(false\)/);
  assert.match(shell, /setConfigurationExpanded\(true\)/);
  assert.match(shell, /onOpenConfiguration\?\.\(\)/);
  assert.match(shell, /onOpenConfiguration=\{onOpenConfiguration\}/);
  assert.match(shell, /const groupOpen = !collapsed && configurationExpanded/);
  assert.match(shell, /aria-expanded=\{groupOpen\}/);
  assert.match(shell, /hidden=\{!groupOpen\}/);
});

test("Mobile navigation, permissions and release controls remain intact", () => {
  assert.match(shell, /permissions\.includes\(child\.permission\)/);
  assert.match(shell, /closeDrawer\?\.\(\)/);
  assert.match(shell, /onClick=\{closeDrawer\}/);
  assert.match(settings, /AppReleaseSettingsCard/);
  assert.doesNotMatch(settings, /aria-label="Cambiar sección de ajustes"/);
  assert.match(settings, /Guardar otros ajustes/);
});
