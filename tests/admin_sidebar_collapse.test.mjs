import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const chrome = readFileSync(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");
test("El menu de escritorio se contrae a 64px sin desmontar el contenido", () => {
  assert.match(chrome, /collapsed \? "w-16" : compact \? "w-\[232px\]" : "w-\[272px\]"/);
  assert.match(chrome, /collapsed=\{sidebarCollapsed\}/);
  assert.match(chrome, /onToggleSidebar=\{toggleDesktopSidebar\}/);
  assert.match(chrome, /aria-expanded=\{!collapsed\}/);
  assert.match(chrome, /aria-controls="admin-desktop-sidebar"/);
  assert.match(chrome, /<Outlet \/>/);
});
test("El control sigue disponible y tiene nombre accesible en los dos estados", () => {
  assert.match(chrome, /aria-label=\{collapsed \? "Desplegar menú lateral" : "Contraer menú lateral"\}/);
  assert.match(chrome, /collapsed \? <PanelLeftOpen/);
  assert.match(chrome, /motion-reduce:transition-none/);
});
test("La preferencia es local y tolera almacenamiento bloqueado", () => {
  assert.match(chrome, /localStorage\.getItem\(DESKTOP_SIDEBAR_PREFERENCE\)/);
  assert.match(chrome, /localStorage\.setItem\(DESKTOP_SIDEBAR_PREFERENCE, String\(next\)\)/);
  assert.match(chrome, /setSidebarCollapsed\(next\)/);
  assert.match(chrome, /catch \{ \/\* preference is optional \*\/ \}/);
});
test("El modo contraido conserva iconos, permisos, etiquetas accesibles y rutas", () => {
  assert.match(chrome, /\(collapsed \? isActiveProject : expanded\) && visibleTabs\.length > 0/);
  assert.ok(chrome.includes("[&_[data-nav-label]]:sr-only"));
  assert.ok(chrome.includes("[&_[data-nav-chevron]]:hidden"));
  assert.match(chrome, /title=\{view\.label\}/);
  assert.match(chrome, /title=\{child\.label\}/);
  assert.match(chrome, /title=\{tab\.label\}/);
  assert.match(chrome, /MARKETPLACE_WORKSPACE_VIEWS\.filter\(\(view\) => permissions\.includes\(view\.permission\)\)/);
  assert.match(chrome, /search=\{\{ vista: view\.slug \}\}/);
});
test("El menu movil sigue independiente, sin aplicarle el estado de escritorio", () => {
  assert.match(chrome, /<MobileDrawer\s+open=\{mobileDrawerOpen\}/);
  assert.match(chrome, /className="lg:hidden"\s+aria-label="Abrir navegación"/);
  const drawer = chrome.slice(chrome.indexOf("function MobileDrawer("), chrome.indexOf("function TopBar("));
  assert.doesNotMatch(drawer, /sidebarCollapsed|collapsed=\{collapsed\}/);
  assert.match(drawer, /<Sheet open=\{open\} onOpenChange=\{onOpenChange\}>/);
});


test("El nuevo menú temático conserva accesos, estado activo y geometría contraída", () => {
  assert.match(chrome, /function AdminNavIcon/);
  assert.match(chrome, /className="admin-nav-icon" aria-hidden="true"/);
  assert.match(chrome, /data-nav-tone="trabajos"/);
  assert.match(chrome, /data-nav-tone="tarifas"/);
  assert.match(chrome, /data-nav-tone=\{adminNavTone\(tab\.slug\)\}/);
  assert.match(chrome, /data-nav-active=\{viewActive \? "true" : undefined\}/);
  assert.match(chrome, /aria-current=\{childActive \? "page" : undefined\}/);
  assert.match(chrome, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(chrome, /data-nav-tone=\{adminSubnavTone\("trabajos", view\.slug\)\}/);
  assert.match(chrome, /data-nav-tone=\{adminSubnavTone\("precios", view\.code\)\}/);
  assert.match(chrome, /data-nav-tone=\{adminSubnavTone\("administracion", child\.slug\)\}/);
  assert.equal((chrome.match(/data-nav-nested data-nav-submenu/g) ?? []).length, 3);
  assert.match(chrome, /search=\{\{ precio: view\.code \}\}/);
  assert.match(chrome, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(chrome, /visibleChildren = item\.children\.filter/);
  assert.match(chrome, /permissions\.includes\(child\.permission\)/);
});

test("Trabajos abre Pulso y su flecha controla el submenú sin navegar", () => {
  const block = chrome.slice(chrome.indexOf('if (tab.slug === "trabajos")'), chrome.indexOf("// El centro de precios"));
  assert.match(block, /params=\{\{ id: project\.id, section: "trabajos" \}\}/);
  assert.match(block, /search=\{\{ vista: "resumen" \}\}/);
  assert.match(block, /title="Trabajos"/);
  assert.match(block, /setTrabajosExpanded\(true\);\s*closeDrawer\?\.\(\)/);
  assert.match(block, /const trabajosOpen = collapsed \? groupActive : trabajosExpanded/);
  assert.match(block, /aria-controls=\{trabajosGroupId\}/);
  assert.match(block, /aria-expanded=\{trabajosOpen\}/);
  assert.match(block, /onClick=\{\(\) => setTrabajosExpanded\(\(value\) => !value\)\}/);
  assert.match(block, /id=\{trabajosGroupId\} hidden=\{!trabajosOpen\}/);
  assert.match(block, /MARKETPLACE_WORKSPACE_VIEWS\.filter\(\(view\) => permissions\.includes\(view\.permission\)\)/);
  assert.match(block, /search=\{\{ vista: view\.slug \}\}/);
  assert.match(block, /aria-current=\{viewActive \? "page" : undefined\}/);
  assert.doesNotMatch(block, /<summary|<details/);
});

test("El control de expandir se encuentra solo al pie del sidebar, no en la cabecera", () => {
  const aside = chrome.slice(chrome.indexOf("function DesktopSidebar("), chrome.indexOf("function MobileDrawer("));
  const topbar = chrome.slice(chrome.indexOf("function TopBar("), chrome.indexOf("function DesktopLink("));
  assert.match(aside, /onClick=\{onToggleSidebar\}/);
  assert.match(aside, /aria-controls="admin-desktop-sidebar"/);
  assert.match(aside, /aria-expanded=\{!collapsed\}/);
  assert.match(aside, /<span>Contraer menú<\/span>/);
  assert.match(aside, /collapsed \? <PanelLeftOpen/);
  assert.doesNotMatch(topbar, /onToggleSidebar|aria-controls="admin-desktop-sidebar"|PanelLeftOpen|PanelLeftClose/);
  assert.doesNotMatch(aside, /Sistema operativo|Datos sincronizados con Supabase/);
});

test("Un proyecto: solo se presenta su logo, no el botón redundante Proyectos", () => {
  const aside = chrome.slice(chrome.indexOf("function DesktopSidebar("), chrome.indexOf("function MobileDrawer("));
  const mobile = chrome.slice(chrome.indexOf("function MobileDrawer("), chrome.indexOf("function TopBar("));
  assert.match(aside, /!projectsLoading && \(projects\?\.length \?\? 0\) !== 1 && \(/);
  assert.match(mobile, /!projectsLoading && \(projects\?\.length \?\? 0\) !== 1 && \(/);
  assert.match(chrome, /projectIconVariantUrl\(project\.iconUrl, "pwa-192\.png"\)/);
  assert.match(chrome, /params=\{\{ id: project\.id \}\}/);
  assert.match(chrome, /Proyecto activo/);
  assert.match(aside, /<VrixoraLogo variant="mark"/);
  assert.match(mobile, /<VrixoraLogo variant="mark"/);
});
