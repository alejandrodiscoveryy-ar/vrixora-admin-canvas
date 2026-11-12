import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreditCard } from "lucide-react";
import { ModuleHeader } from "../src/components/admin/ModuleHeader.tsx";
import { SectionCard } from "../src/components/admin/SectionCard.tsx";
import { MetricCard } from "../src/components/admin/MetricCard.tsx";
import { AdminDataTableShell } from "../src/components/admin/AdminDataTableShell.tsx";
import { FilterToolbar } from "../src/components/admin/FilterToolbar.tsx";
import { DataToolbar } from "../src/components/admin/DataToolbar.tsx";
import { EmptyState } from "../src/components/admin/EmptyState.tsx";

const render = (Component, props) => renderToStaticMarkup(h(Component, props));
const noop = () => {};
const action = h("button", { type: "button" }, "Accion de prueba");

function classTokens(markup) {
  return new Set(
    Array.from(markup.matchAll(/class="([^"]*)"/g)).flatMap((match) =>
      match[1].replaceAll("&amp;", "&").split(/\s+/),
    ),
  );
}

function hasClasses(markup, ...tokens) {
  const actual = classTokens(markup);
  for (const token of tokens) {
    assert.ok(actual.has(token), `Missing class: ${token}`);
  }
}

const cases = [
  [ModuleHeader, { title: "Cabecera", description: "Descripcion", icon: CreditCard, actions: action }],
  [SectionCard, { title: "Seccion", children: "Contenido", actions: action }],
  [MetricCard, { label: "Ingresos", value: "1234567.89 CUP" }],
  [AdminDataTableShell, { title: "Tabla", children: "Registro", actions: action }],
  [FilterToolbar, { searchValue: "ana", onSearchChange: noop, showReset: true, onReset: noop }],
  [DataToolbar, { searchValue: "ana", onSearchChange: noop, activeFilterCount: 1, onReset: noop }],
  [EmptyState, { title: "Sin datos", description: "No hay resultados", action }],
];

for (const [Component, props] of cases) {
  test(`${Component.name}: comfortable by default, compact opt-in`, () => {
    const normal = render(Component, props);
    assert.match(normal, /data-density="comfortable"/);
    assert.equal(normal, render(Component, { ...props, density: "comfortable" }));
    const compact = render(Component, { ...props, density: "compact" });
    assert.match(compact, /data-density="compact"/);
    assert.notEqual(normal, compact);
  });
}

test("ModuleHeader: compact heading retains title, context and action", () => {
  const markup = render(ModuleHeader, {
    title: "Pagos",
    description: "Gestion financiera",
    icon: CreditCard,
    actions: action,
    module: "pagos",
    density: "compact",
  });
  assert.match(markup, /<h1[^>]*>Pagos<\/h1>/);
  assert.ok(markup.includes("Gestion financiera"));
  assert.ok(markup.includes("Accion de prueba"));
  assert.match(markup, /data-admin-module="pagos"/);
  hasClasses(markup, "px-3", "py-3", "sm:px-4", "bg-surface-1");
});

test("SectionCard: shared compact padding and content", () => {
  const markup = render(SectionCard, {
    title: "Prefacturas",
    description: "Cobros preparados",
    children: "Registro de ejemplo",
    actions: action,
    density: "compact",
  });
  assert.ok(markup.includes("Prefacturas"));
  assert.ok(markup.includes("Cobros preparados"));
  assert.ok(markup.includes("Registro de ejemplo"));
  assert.ok(markup.includes("Accion de prueba"));
  hasClasses(markup, "p-3", "sm:p-4", "backdrop-blur-none");
});

test("MetricCard: full financial value and comparison survive compact render", () => {
  const markup = render(MetricCard, {
    label: "Ingresos",
    value: "1234567890.12 CUP",
    description: "Pagos confirmados",
    comparison: "98765.43 CUP",
    density: "compact",
  });
  assert.ok(markup.includes("1234567890.12 CUP"));
  assert.ok(markup.includes("Pagos confirmados"));
  assert.ok(markup.includes("98765.43 CUP"));
  hasClasses(markup, "whitespace-normal", "break-words", "tabular-nums", "sm:p-4");
  assert.ok(!classTokens(markup).has("truncate"));
});

test("MetricCard: loading state does not expose the finished metric", () => {
  const markup = render(MetricCard, {
    label: "Ingresos",
    value: "987654321 CUP",
    isLoading: true,
    density: "compact",
  });
  assert.ok(!markup.includes("987654321 CUP"));
  hasClasses(markup, "space-y-2");
});

for (const Toolbar of [FilterToolbar, DataToolbar]) {
  test(`${Toolbar.name}: embedded compact toolbar retains labelled search and reset`, () => {
    const markup = render(Toolbar, {
      density: "compact",
      embedded: true,
      searchValue: "ana",
      searchPlaceholder: "Buscar usuarios",
      onSearchChange: noop,
      onReset: noop,
      showReset: true,
      activeFilterCount: 1,
      resultCount: 7,
      actions: action,
    });
    assert.match(markup, /aria-label="Buscar usuarios"/);
    assert.match(markup, /value="ana"/);
    assert.ok(markup.includes("Limpiar"));
    assert.ok(markup.includes("Accion de prueba"));
    if (Toolbar === DataToolbar) assert.ok(markup.includes("7 resultados"));
    hasClasses(markup, "border-0", "p-0", "shadow-none", "max-sm:[&_button]:min-h-11");
  });
}

test("DataTableShell: table, toolbar and footer are retained", () => {
  const markup = render(AdminDataTableShell, {
    density: "compact",
    title: "Historial",
    actions: action,
    children: h("table", null, h("tbody", null, h("tr", null, h("td", null, "Registro")))),
    footer: "Pagina 1",
  });
  assert.ok(markup.includes("Historial"));
  assert.ok(markup.includes("Accion de prueba"));
  assert.ok(markup.includes("<table>"));
  assert.ok(markup.includes("Registro"));
  assert.ok(markup.includes("Pagina 1"));
  hasClasses(markup, "overflow-x-auto", "px-3", "sm:px-4");
});

test("DataTableShell: empty state replaces rows but preserves the toolbar", () => {
  const markup = render(AdminDataTableShell, {
    density: "compact",
    title: "Historial",
    actions: action,
    isEmpty: true,
    emptyState: h(EmptyState, {
      density: "compact",
      title: "Sin registros",
      description: "Revisa los filtros",
    }),
    children: "Fila no visible",
  });
  assert.ok(markup.includes("Sin registros"));
  assert.ok(markup.includes("Revisa los filtros"));
  assert.ok(markup.includes("Accion de prueba"));
  assert.ok(!markup.includes("Fila no visible"));
  hasClasses(markup, "p-3", "sm:p-4", "p-4", "sm:p-5");
});
