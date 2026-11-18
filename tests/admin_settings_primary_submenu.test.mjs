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
  assert.match(shell, /nestedChildren\.map\(\(child\) =>/);
  for (const name of ["Ajustes generales", "Empleados", "Comunicados", "Integraciones"]) {
    assert.ok(navigation.includes('label: "' + name + '"'), name);
  }
});

test("Clicking Configuración reveals the nested icons without widening the desktop rail", () => {
  assert.doesNotMatch(shell, /configurationPageActive|onOpenConfiguration/);
  assert.match(shell, /const \[configurationExpanded, setConfigurationExpanded\] = useState\(false\)/);
  assert.match(shell, /const groupOpen = configurationExpanded/);
  assert.match(shell, /setConfigurationExpanded\(\(value\) => !value\)/);
  assert.match(shell, /aria-expanded=\{groupOpen\}/);
  assert.match(shell, /hidden=\{!groupOpen\}/);
  assert.match(shell, /!collapsed && \(\s*<ChevronRight data-nav-chevron/);
  assert.match(shell, /className="admin-nav-item admin-nav-secondary"/);
  assert.match(shell, /const defaultChild = adminGroupDefault\(tab\)/);
  assert.match(shell, /nestedChildren = tab\.children\.filter\(\(child\) => child\.slug !== "configuracion"\)/);
  assert.match(shell, /section: defaultChild\.slug/);
  assert.match(shell, /mainSettingsActive \? "page" : undefined/);
  assert.match(shell, /collapsed \? "w-16"/);
  assert.match(shell, /function toggleDesktopSidebar\(\)/);
});

test("Mobile navigation, permissions and release controls remain intact", () => {
  assert.match(shell, /permissions\.includes\(child\.permission\)/);
  assert.match(shell, /closeDrawer\?\.\(\)/);
  assert.match(shell, /onClick=\{closeDrawer\}/);
  assert.match(settings, /AppReleaseSettingsCard/);
  assert.doesNotMatch(settings, /aria-label="Cambiar sección de ajustes"/);
  assert.match(settings, /Guardar otros ajustes/);
});
