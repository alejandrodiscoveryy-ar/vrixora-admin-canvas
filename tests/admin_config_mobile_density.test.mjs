import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const config = readFileSync(new URL("../src/features/admin/ConfiguracionSection.tsx", import.meta.url), "utf8");

test("Configuración móvil: selector de cinco categorías y atajo APK sustituyen el grid de tres filas", () => {
  assert.match(config, /aria-label="Cambiar módulo de configuración" className="flex min-w-0 items-center gap-2 md:hidden"/);
  assert.match(config, /Select value=\{visibleSection\} onValueChange=\{\(value\) => setActiveSection\(value as SectionKey\)\}/);
  assert.match(config, /<SelectItem key=\{section\.key\} value=\{section\.key\}>\{section\.label\}<\/SelectItem>/);
  assert.match(config, /aria-label="Abrir aplicación y versiones APK Android"/);
  assert.match(config, /onClick=\{\(\) => setActiveSection\("application"\)\}/);
  assert.match(config, /className="hidden min-w-0 grid-cols-5 gap-1\.5 md:grid"/);
  assert.doesNotMatch(config, /sm:grid-cols-3 xl:grid-cols-5/);
  assert.match(config, /<div className="hidden md:block">\s*<PremiumSettingsSnapshot/);
});

test("Identidad móvil: datos clave primero y campos legales desplegables sin perder valores", () => {
  const general = config.slice(config.indexOf('{visibleSection === "general" ? ('), config.indexOf('{visibleSection === "billing" ? ('));
  assert.match(general, /title="Datos principales"/);
  assert.match(general, /order-1 space-y-1\.5/);
  assert.match(general, /order-2 space-y-1\.5/);
  assert.match(general, /order-3 space-y-1\.5/);
  assert.match(general, /order-4 space-y-1\.5/);
  assert.match(general, /<details className="group order-5/);
  assert.match(general, /Enlaces legales/);
  assert.match(general, /value=\{form\.privacyUrl\}/);
  assert.match(general, /value=\{form\.termsUrl\}/);
  assert.match(general, /update\("privacyUrl", event\.target\.value\)/);
  assert.match(general, /update\("termsUrl", event\.target\.value\)/);
});

test("Marca móvil: logos visibles junto a acciones, ayudas recuperables y miniaturas compactas", () => {
  const start = config.indexOf('title="Marca e identidad visual"');
  const end = config.indexOf('{visibleSection === "billing" ? (', start);
  const brand = config.slice(start, end);
  assert.match(brand, /grid min-w-0 gap-3 lg:grid-cols-2/);
  assert.match(brand, /flex h-20 w-28 shrink-0/);
  assert.match(brand, /flex size-20 shrink-0/);
  assert.match(brand, /variant="secondary"/);
  assert.match(brand, /Cambiar logo/);
  assert.match(brand, /Cambiar icono/);
  assert.match(brand, /Formato recomendado/);
  assert.match(brand, /Requisitos del icono/);
  assert.match(brand, /<IconMasterPreview label="Cuadrado"/);
  assert.match(brand, /<IconMasterPreview label="Círculo"/);
  assert.match(brand, /<IconMasterPreview label="Redondeado"/);
  assert.match(brand, /update\("primaryColor", event\.target\.value\)/);
  assert.match(brand, /update\("secondaryColor", event\.target\.value\)/);
  for (const id of ["project-logo", "project-favicon"]) assert.ok(brand.includes('htmlFor="' + id + '"'));
  assert.match(brand, /selectBrandAsset\("logo", file\)/);
  assert.match(brand, /selectBrandAsset\("favicon", file\)/);
  assert.doesNotMatch(brand, /Reemplazar logo completo|Reemplazar icono maestro/);
  assert.match(config, /mx-auto flex size-11/);
});

test("Guardar cambios al final del formulario móvil sin alterar las RPC ni el flujo Android", () => {
  const footer = config.slice(config.lastIndexOf('{canSave && isDirty && ('));
  assert.match(footer, /md:hidden/);
  assert.match(footer, /onClick=\{\(\) => save\.mutate\(\)\}/);
  assert.match(footer, /disabled=\{save\.isPending\}/);
  assert.match(config, /<AppReleaseSettingsCard projectId=\{projectId\}/);
  assert.equal((config.match(/<AppReleaseSettingsCard /g) || []).length, 1);
  assert.match(config, /uploadBrandAsset\.mutate/);
});
