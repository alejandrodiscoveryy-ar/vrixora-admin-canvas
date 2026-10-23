import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const file = readFileSync(new URL('../src/routes/admin.tsx', import.meta.url), 'utf8');
const topbar = file.slice(file.indexOf('function TopBar('), file.indexOf('function DesktopLink('));

test('cabecera escritorio sin texto duplicado', () => {
  assert.ok(topbar.length > 400, 'TopBar exists');
  assert.doesNotMatch(topbar, /Administración segura|Proyecto activo|\{section\}/);
  assert.doesNotMatch(topbar, /<Badge\b|<ShieldCheck\b/);
  assert.match(topbar, /min-h-12 items-center/);
  assert.match(topbar, /bg-background px-3 py-1/);
});

test('mantiene campana notificaciones y controles de sesion', () => {
  assert.match(topbar, /id="vrixora-admin-operational-alarm-slot"/);
  assert.match(topbar, /<ThemeToggle\s*\/>/);
  assert.match(topbar, /<AvatarImage/);
  assert.match(topbar, /onClick=\{handleSignOut\}/);
});

test('mantiene navegacion movil y proyecto de la cabecera movil', () => {
  assert.match(topbar, /aria-label="Abrir navegación"/);
  assert.match(topbar, /className="flex min-w-0 items-center gap-2 lg:hidden"/);
  assert.match(topbar, /project\?\.name/);
  assert.match(file, /<DesktopSidebar/);
  assert.match(file, /<MobileDrawer/);
});
