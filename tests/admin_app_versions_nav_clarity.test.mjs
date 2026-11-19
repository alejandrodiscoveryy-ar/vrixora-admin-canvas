import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const workspace = read("src/features/admin/AdministrationWorkspace.tsx");
const config = read("src/features/admin/ConfiguracionSection.tsx");
const sidebar = read("src/routes/admin.tsx");
const updates = read("src/features/admin/AppReleaseSettingsCard.tsx");

test("The Android configuration view displays one main release header", () => {
  assert.match(workspace, /selectedMeta && activeSection !== "configuracion"/);
  assert.match(config, /visibleSection !== "application" && \(/);
  assert.doesNotMatch(config, /aria-label="Cambiar sección de ajustes"/);
  assert.match(config, /aria-label="Categorías de ajustes del proyecto"/);
  assert.match(config, /<nav aria-label="Cambiar módulo de configuración"/);
  assert.match(config, /Actualización APK Android/);
  assert.match(config, /const \[activeSection, setActiveSection\] = useState<SectionKey>\("general"\)/);
  assert.doesNotMatch(config, /useState<SectionKey \| "inicio">\("inicio"\)/);
  assert.match(sidebar, /admin-nav-config-group/);
  assert.match(sidebar, /adminSubnavTone\("administracion", child\.slug\)/);
  assert.match(updates, /title="Centro de actualizaciones"/);
});

test("Saving unrelated project settings is only offered for actual edits", () => {
  assert.match(config, /canSave && isDirty \? \(/);
  assert.match(config, /Guardar otros ajustes/);
  assert.match(config, /save\.mutate\(\)/);
  assert.match(updates, /admin_save_app_release_policy/);
  assert.match(updates, /admin_send_driver_app_update/);
});

test("Navigation stays accessible outside Android view", () => {
  assert.match(config, /aria-label="Cambiar módulo de configuración"/);
  assert.match(config, /aria-current=\{visibleSection === section\.key/);
  assert.match(config, /onClick=\{\(\) => setActiveSection\(section\.key\)\}/);
  assert.doesNotMatch(sidebar, /onOpenConfiguration|configurationPageActive/);
  assert.match(sidebar, /const groupOpen = configurationExpanded/);
  assert.match(sidebar, /aria-controls=\{configurationGroupId\}/);
});

test("Se accede a las cinco pantallas sin un selector intermedio ni perder navegación en APK", () => {
  for (const [key, name] of [
    ["general", "Identidad y marca"],
    ["billing", "Monedas y cambio"],
    ["referrals", "Referidos"],
    ["communication", "Comunicación y contacto"],
    ["application", "Aplicación y versiones"],
  ]) {
    assert.ok(config.includes('key: "' + key + '"'), key);
    assert.ok(config.includes('label: "' + name + '"'), name);
  }
  assert.match(config, /sections\.map\(section => \{/);
  assert.match(config, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(config, /onClick=\{\(\) => setActiveSection\(section\.key\)\}/);
  assert.match(config, /\{visibleSection === "application" \? \(/);
  assert.match(config, /<AppReleaseSettingsCard projectId=\{projectId\}/);
  assert.match(updates, /title="Centro de actualizaciones"/);
  assert.doesNotMatch(config, /onClick=\{\(\) => setActiveSection\("inicio"\)\}/);
});
