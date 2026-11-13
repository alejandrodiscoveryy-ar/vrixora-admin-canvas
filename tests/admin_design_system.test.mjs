import { adminNavTone, adminSubnavTone, adminGroupDefault, ADMIN_PROJECT_TABS, MARKETPLACE_WORKSPACE_VIEWS, PRICING_WORKSPACE_VIEWS, ADMINISTRATION_VIEWS } from "../src/lib/admin-navigation.ts";
import { driverWhatsAppLinks, driverWelcomeMessage, TUKTUK_DRIVER_GROUP_URL } from "../src/lib/driver-whatsapp.ts";
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
import { AdminPeriodSelector } from "../src/components/admin/AdminPeriodSelector.tsx";
import { FilterSelect, EmptyMarketplaceState } from "../src/features/admin/MarketplaceListPrimitives.tsx";
import { readFileSync } from "node:fs";
import { premiumSurface, premiumMetricSurface, premiumHeaderSurface, premiumColumnHeaderSurface, premiumControlSurface, premiumTableDensity, premiumTableRow } from "../src/components/admin/density.ts";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../src/components/ui/table.tsx";

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

test("Premium MetricCard: layered surface, compact KPI and decorative watermark are opt-in", () => {
  const props = {
    label: "Total usuarios",
    value: 162,
    description: "Registrados en el sistema",
    module: "clientes",
    icon: CreditCard,
    density: "compact",
  };
  const standard = render(MetricCard, props);
  assert.equal(standard, render(MetricCard, { ...props, appearance: "standard" }));
  assert.doesNotMatch(standard, /data-appearance=|data-watermark=/);
  const markup = render(MetricCard, { ...props, appearance: "premium" });
  assert.match(markup, /data-appearance="premium"/);
  assert.match(markup, /data-density="compact"/);
  assert.ok(markup.includes("Total usuarios"));
  assert.ok(markup.includes("162"));
  assert.ok(markup.includes("Registrados en el sistema"));
  const watermark = markup.match(/<svg[^>]*data-watermark="metric"[^>]*>/);
  assert.ok(watermark);
  assert.match(watermark[0], /aria-hidden="true"/);
  assert.match(watermark[0], /focusable="false"/);
  hasClasses(markup, ...premiumMetricSurface.split(" "), "p-3", "sm:p-3", "h-px", "tabular-nums", "pointer-events-none", "opacity-[0.06]", "dark:opacity-[0.07]", "bottom-2", "size-12", "sm:size-16", "z-10");
  assert.ok(!classTokens(markup).has("truncate"));
  assert.ok(!classTokens(markup).has("h-7"));
});

test("Premium MetricCard: loading stays discreet and no data or watermark is exposed", () => {
  const markup = render(MetricCard, {
    appearance: "premium",
    density: "compact",
    label: "Usuarios",
    value: "99887766",
    icon: CreditCard,
    isLoading: true,
  });
  assert.match(markup, /data-appearance="premium"/);
  assert.doesNotMatch(markup, /99887766|data-watermark=/);
  hasClasses(markup, "space-y-2");
});

test("Premium table: shared surfaces, dense rows, headers and data remain intact", () => {
  const table = h(Table, { className: premiumTableDensity },
    h(TableHeader, { className: premiumColumnHeaderSurface },
      h(TableRow, null, h(TableHead, null, "Cliente"), h(TableHead, null, "Adopcion"))
    ),
    h(TableBody, null,
      h(TableRow, { className: premiumTableRow },
        h(TableCell, null, "Usuario de prueba"),
        h(TableCell, null, "Sin actividad")
      )
    )
  );
  const props = {
    density: "compact",
    title: "Usuarios registrados",
    description: "Registro y actividad",
    actions: action,
    children: table,
  };
  assert.equal(render(AdminDataTableShell, props), render(AdminDataTableShell, { ...props, appearance: "standard" }));
  assert.doesNotMatch(render(AdminDataTableShell, props), /data-appearance=/);
  const markup = render(AdminDataTableShell, { ...props, appearance: "premium" });
  assert.match(markup, /data-appearance="premium"/);
  assert.ok(markup.includes("Usuarios registrados"));
  assert.ok(markup.includes("Registro y actividad"));
  assert.ok(markup.includes("Accion de prueba"));
  assert.ok(markup.includes("Usuario de prueba"));
  assert.ok(markup.includes("Sin actividad"));
  hasClasses(markup, ...premiumSurface.split(" "), ...premiumHeaderSurface.split(" "), ...premiumColumnHeaderSurface.split(" "), ...premiumTableDensity.split(" "), ...premiumTableRow.split(" "), "overflow-x-auto");
});

test("Premium graphite: neutral surface hierarchy keeps brand accents out of large backgrounds", () => {
  const layers = [premiumSurface, premiumMetricSurface, premiumHeaderSurface, premiumColumnHeaderSurface, premiumControlSurface];
  const backgrounds = layers.map((layer) => layer.split(" ").find((token) => token.startsWith("dark:bg-")));
  assert.equal(new Set(backgrounds).size, layers.length);
  for (const layer of layers) {
    assert.match(layer, /var\(--surface-3\)/);
    assert.match(layer, /var\(--text-secondary\)/);
    assert.doesNotMatch(layer, /var\(--primary\)/);
  }
});

test("Premium DataToolbar: graphite search is opt-in and keeps search/reset controls", () => {
  const props = {
    density: "compact",
    embedded: true,
    searchValue: "ana",
    searchPlaceholder: "Buscar usuarios",
    onSearchChange: noop,
    onReset: noop,
    activeFilterCount: 1,
  };
  const standard = render(DataToolbar, props);
  assert.equal(standard, render(DataToolbar, { ...props, appearance: "standard" }));
  const markup = render(DataToolbar, { ...props, appearance: "premium" });
  assert.match(markup, /aria-label="Buscar usuarios"/);
  assert.match(markup, /value="ana"/);
  assert.ok(markup.includes("Limpiar"));
  hasClasses(markup, ...premiumControlSurface.split(" "));
  assert.ok(!classTokens(standard).has(premiumControlSurface.split(" ")[0]));
});

test("Premium SectionCard: opt-in graphite panel retains heading, actions and contents", () => {
  const props = { density: "compact", title: "Operacion", description: "Datos operativos", actions: action, children: "Registro", module: "resumen" };
  const standard = render(SectionCard, props);
  assert.equal(standard, render(SectionCard, { ...props, appearance: "standard" }));
  assert.doesNotMatch(standard, /data-appearance=/);
  const markup = render(SectionCard, { ...props, appearance: "premium" });
  assert.match(markup, /data-appearance="premium"/);
  assert.ok(markup.includes("Operacion"));
  assert.ok(markup.includes("Datos operativos"));
  assert.ok(markup.includes("Accion de prueba"));
  assert.ok(markup.includes("Registro"));
  hasClasses(markup, ...premiumSurface.split(" "), ...premiumHeaderSurface.split(" "), "p-3", "sm:p-4");
});

test("Premium operational KPI: error and pending values stay distinct from zero", () => {
  const props = { density: "compact", appearance: "premium", label: "Recargas pendientes", description: "En revision financiera", comparison: "Finanzas", semanticState: "warning", icon: CreditCard };
  const error = render(MetricCard, { ...props, value: "—" });
  const zero = render(MetricCard, { ...props, value: 0 });
  assert.match(error, />—<\/span>/);
  assert.match(zero, />0<\/span>/);
  assert.ok(error.includes("En revision financiera"));
  assert.ok(error.includes("Finanzas"));
  assert.ok(error.includes("var(--semantic-warning)"));
});

test("MetricCard: invalid numeric tokens are sanitized without losing valid labels", () => {
  for (const value of [NaN, Infinity, -Infinity, "NaN CUP", "Infinity%", "-Infinity CUP", "undefined"]) {
    const markup = render(MetricCard, { label: "Importe", value, density: "compact", appearance: "premium" });
    assert.match(markup, />0<\/span>/);
    assert.doesNotMatch(markup, /(?:NaN|Infinity|undefined)(?: CUP|%|<)/);
  }
  const markup = render(MetricCard, { label: "Operación", value: "Sin datos", comparison: "Finanzas", density: "compact", appearance: "premium" });
  assert.ok(markup.includes("Sin datos"));
  assert.ok(markup.includes("Finanzas"));
});

test("Premium EmptyState: neutral inset surface preserves message, action and compact density", () => {
  const props = { density: "compact", title: "Sin captacion", description: "No hay resultados", module: "comercial", icon: CreditCard, action };
  const normal = render(EmptyState, props);
  assert.equal(normal, render(EmptyState, { ...props, appearance: "standard" }));
  const markup = render(EmptyState, { ...props, appearance: "premium" });
  assert.match(markup, /data-appearance="premium"/);
  assert.ok(markup.includes("Sin captacion"));
  assert.ok(markup.includes("No hay resultados"));
  assert.ok(markup.includes("Accion de prueba"));
  hasClasses(markup, ...premiumColumnHeaderSurface.split(" "), ...premiumControlSurface.split(" "), "border-solid", "shadow-none", "p-4", "sm:p-5");
  assert.ok(!classTokens(markup).has("border-dashed"));
});

test("Premium AdminPeriodSelector: graphite controls preserve period navigation and displayed dates", () => {
  const props = { value: "custom", range: { from: "2026-09-30", to: "2026-10-06" }, onChange: noop };
  const normal = render(AdminPeriodSelector, props);
  assert.equal(normal, render(AdminPeriodSelector, { ...props, appearance: "standard" }));
  const markup = render(AdminPeriodSelector, { ...props, appearance: "premium" });
  assert.match(markup, /data-appearance="premium"/);
  assert.match(markup, /aria-label="Selector de período"/);
  for (const label of ["Período anterior", "Período siguiente", "Período", "Volver al período actual", "Abrir selector de rango personalizado"]) {
    assert.ok(markup.includes('aria-label="' + label + '"'));
  }
  assert.match(markup, /30 sept.*6 oct.*2026/);
  hasClasses(markup, ...premiumControlSurface.split(" "), ...premiumColumnHeaderSurface.split(" "), "max-sm:h-11", "max-sm:w-11");
  assert.ok(!classTokens(normal).has(premiumControlSurface.split(" ")[0]));
});

test("Premium period selector: one range label, responsive wrap and custom touch target", () => {
  const range = { from: "2026-09-30", to: "2026-10-06" };
  const props = { value: "custom", range, onChange: noop, appearance: "premium" };
  const markup = render(AdminPeriodSelector, props);
  hasClasses(markup, "sm:flex-row", "sm:flex-wrap", "sm:items-center", "max-sm:min-h-11", "whitespace-normal", "break-words");
  assert.equal((markup.match(/30 sept[^<]*6 oct[^<]*2026/g) || []).length, 1);
  const standard = render(AdminPeriodSelector, { ...props, appearance: "standard" });
  assert.ok(!classTokens(standard).has("sm:flex-wrap"));
  const all = render(AdminPeriodSelector, { ...props, value: "all", range: { from: "", to: "" } });
  assert.ok(all.includes("Todo el historial"));
});

test("Operations FilterSelect: premium graphite and native filter values are retained", () => {
  const props = { labelText: "Estado", value: "accepted", onChange: noop, children: [h("option", { key: "all", value: "" }, "Todos"), h("option", { key: "accepted", value: "accepted" }, "Aceptado")] };
  const standard = render(FilterSelect, props);
  assert.equal(standard, render(FilterSelect, { ...props, appearance: "standard" }));
  const markup = render(FilterSelect, { ...props, appearance: "premium" });
  assert.match(markup, /<select/);
  assert.match(markup, /value="accepted" selected/);
  assert.ok(markup.includes("Aceptado"));
  assert.ok(markup.includes("Estado"));
  hasClasses(markup, ...premiumControlSurface.split(" "), "min-h-11", "min-w-0", "focus-within:ring-2");
});

test("Driver directory empty state: premium graphite is opt-in and retains content", () => {
  const props = { title: "No hay coincidencias", description: "Prueba otro nombre o número" };
  const standard = render(EmptyMarketplaceState, props);
  assert.equal(standard, render(EmptyMarketplaceState, { ...props, appearance: "standard" }));
  const markup = render(EmptyMarketplaceState, { ...props, appearance: "premium" });
  assert.ok(markup.includes(props.title));
  assert.ok(markup.includes(props.description));
  hasClasses(markup, ...premiumColumnHeaderSurface.split(" "), ...premiumControlSurface.split(" "), "border-solid", "sm:min-h-28");
  assert.ok(!classTokens(markup).has("border-dashed"));
});

test("Driver premium directory and 360: responsive surfaces, contact, navigation and permission contracts", () => {
  const source = (name) => readFileSync(new URL("../src/features/admin/" + name, import.meta.url), "utf8");
  const panel = source("MarketplaceSection.tsx");
  const directory = panel.slice(panel.indexOf('<TabsContent value="conductores">'), panel.indexOf('<TabsContent value="clientes">'));
  assert.equal((directory.match(/<FilterSelect appearance="premium"/g) ?? []).length, 4);
  assert.match(directory, /driverSearch/);
  assert.match(directory, /driverWhatsAppLinks\(item.phone\)/);
  assert.match(directory, /onClick=\{\(\) => setDriver360Id\(item.userId\)\}/);
  const rows = directory.slice(directory.indexOf("{visibleDriverRows.map"), directory.indexOf("{visibleDriverRows.length < filteredDriverRows.length"));
  assert.match(rows, /data-driver-row="compact"/);
  assert.match(rows, /grid-cols-2 items-center gap-x-3 gap-y-2 xl:grid-cols-\[minmax\(0,1\.65fr\)/);
  assert.match(rows, /px-3 py-2 transition-colors/);
  assert.match(rows, /premiumSurface, "shadow-none"/);
  assert.doesNotMatch(rows, /premiumColumnHeaderSurface|bg-gradient|blur-3xl/);
  assert.match(rows, /h-9 w-9 shrink-0/);
  assert.match(rows, /<StatusBadge status=\{item.status\} compact \/>/);
  assert.match(rows, /item\.isAvailable/);
  assert.match(rows, /dateOfRegistration\(item.createdAt\)/);
  assert.match(rows, /item\.phone \?\? "Sin WhatsApp"/);
  assert.match(rows, /item\.vehicleName \?\? "Sin vehículo"/);
  assert.match(rows, /absolute inset-0 z-10 cursor-pointer/);
  assert.match(rows, /focus-visible:ring-inset/);
  assert.match(rows, /aria-label=\{\x60Abrir ficha 360 de/);
  assert.match(rows, /pointer-events-none relative z-20/);
  assert.match(rows, /pointer-events-auto min-h-11/);
  assert.match(rows, /href=\{welcomeDrivers\s*\? driverWhatsAppLinks\(item\.phone, driverWelcomeMessage\(item\.displayName\)\)!\.desktop\s*:\s*driverWhatsAppLinks\(item\.phone\)!\.web\}/);
  assert.match(rows, /Ver ficha 360/);
  assert.match(rows, /xl:min-h-8/);
  const record = source("MarketplaceDriver360Record.tsx");
  assert.match(record, /<MetricCard density="compact" appearance="premium"/);
  assert.match(record, /grid min-w-0 grid-cols-2 gap-1 sm:flex sm:flex-wrap/);
  assert.match(record, /aria-selected=\{activeTab === id\}/);
  assert.match(record, /canSeeFinancial/);
  assert.match(record, /canManageDriver/);
  assert.match(record, /onChangeSuspension/);
  assert.match(record, /href=\{whatsApp.web\}/);
  assert.match(record, /rounded-full border border-border-default/);
  assert.doesNotMatch(record, /bg-\[#|bg-black/);
  const management = source("MarketplaceDriverManagementPanel.tsx");
  assert.match(management, /driver_document_signed_url/);
  assert.match(management, /admin_update_marketplace_driver_contact_v1/);
  assert.match(management, /not_accepted/);
  assert.match(management, /premiumControlSurface/);
  const editor = source("MarketplaceDriverVehicleEditor.tsx");
  assert.match(editor, /admin_get_marketplace_driver_vehicle_edit_v1/);
  assert.match(editor, /active_job/);
  assert.match(editor, /working/);
  assert.match(editor, /premiumControlSurface/);
  assert.match(editor, /overflow-y-auto overflow-x-hidden/);
});

test("Driver welcome: personalized editable draft retains the complete invitation URL", () => {
  const draft = driverWelcomeMessage("María José");
  assert.ok(draft.startsWith("¡Hola, María!"));
  assert.ok(draft.includes("Agencia TukTuk"));
  assert.ok(draft.includes(TUKTUK_DRIVER_GROUP_URL));
  assert.equal(TUKTUK_DRIVER_GROUP_URL, "https://chat.whatsapp.com/DjmuiDfi6a0CdtqFgqujkb?s=cl&p=a&iam=2");
  const links = driverWhatsAppLinks("+53 5555 0000", draft);
  for (const link of [links.web, links.desktop]) {
    const url = new URL(link);
    assert.equal(url.searchParams.get("phone"), "5355550000");
    assert.equal(url.searchParams.get("text"), draft);
    assert.equal(url.searchParams.has("p"), false);
    assert.equal(url.searchParams.has("iam"), false);
  }
  assert.ok(driverWelcomeMessage(null).startsWith("¡Hola!"));
  assert.ok(driverWelcomeMessage("  ").startsWith("¡Hola!"));
  assert.equal(driverWhatsAppLinks(null, draft), null);
  assert.equal(driverWhatsAppLinks("abc", draft), null);
  assert.equal(driverWhatsAppLinks("+53 5555 0000").web, "https://web.whatsapp.com/send?phone=5355550000");
  assert.equal(driverWhatsAppLinks("+53 5555 0000", " ").desktop, "whatsapp://send?phone=5355550000");
});

test("Driver welcome: scoped to TukTuk directory; 360 remains ordinary contact", () => {
  const route = readFileSync(new URL("../src/routes/admin.proyectos.$id.$section.tsx", import.meta.url), "utf8");
  const directory = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
  const record = readFileSync(new URL("../src/features/admin/MarketplaceDriver360Record.tsx", import.meta.url), "utf8");
  assert.match(route, /welcomeDrivers=\{project\.slug === "tuktuk-control"\}/);
  assert.match(directory, /welcomeDrivers = false/);
  assert.match(directory, /if \(welcomeDrivers\) void copyDriverWelcome\(driverWelcomeMessage\(item\.displayName\)\)/);
  assert.match(record, /driverWhatsAppLinks\(contactPhone\)/);
  assert.doesNotMatch(record, /driverWelcomeMessage/);
});

test("Driver WhatsApp: installed app protocol, web alternative and clipboard are independent", () => {
  const directory = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
  const rows = directory.slice(directory.indexOf("{visibleDriverRows.map"), directory.indexOf("{visibleDriverRows.length < filteredDriverRows.length"));
  assert.match(rows, /href=\{welcomeDrivers\s*\? driverWhatsAppLinks\(item\.phone, driverWelcomeMessage\(item\.displayName\)\)!\.desktop\s*:\s*driverWhatsAppLinks\(item\.phone\)!\.web\}/);
  assert.match(rows, /if \(welcomeDrivers\) void copyDriverWelcome\(driverWelcomeMessage\(item\.displayName\)\)/);
  assert.match(rows, /target=\{welcomeDrivers \? undefined : "_blank"\}/);
  assert.doesNotMatch(rows, /preventDefault|window\.open/);
  assert.match(directory, /await navigator\.clipboard\.writeText\(message\)/);
  assert.match(directory, /setWelcomeCopyFallback\(message\)/);
  assert.match(directory, /value=\{welcomeCopyFallback \?\? ""\}/);
  assert.match(directory, /onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}/);
  assert.equal(driverWhatsAppLinks("+53 5555 0000").web, "https://web.whatsapp.com/send?phone=5355550000");
  const nativeUrl = new URL(driverWhatsAppLinks("+53 5555 0000", driverWelcomeMessage("María")).desktop);
  assert.equal(nativeUrl.protocol, "whatsapp:");
  assert.equal(nativeUrl.searchParams.get("text"), driverWelcomeMessage("María"));
});

test("ModuleHeader premium: opt-in graphite keeps title, actions and compact spacing", () => {
  const props = { title: "Atencion al cliente", description: "Solicitudes", actions: action, icon: CreditCard, density: "compact" };
  const standard = render(ModuleHeader, props);
  assert.equal(standard, render(ModuleHeader, { ...props, appearance: "standard" }));
  const markup = render(ModuleHeader, { ...props, appearance: "premium" });
  assert.match(markup, /data-appearance="premium"/);
  assert.match(markup, /<h1[^>]*>Atencion al cliente<\/h1>/);
  assert.ok(markup.includes("Accion de prueba"));
  hasClasses(markup, ...premiumHeaderSurface.split(" "), "px-3", "py-3", "max-sm:[&_button]:min-h-11");
});

test("FilterToolbar premium: opt-in graphite preserves search and embedded layout", () => {
  const props = { density: "compact", searchValue: "recarga", searchPlaceholder: "Buscar pagos", onSearchChange: noop, showReset: true, onReset: noop };
  const standard = render(FilterToolbar, props);
  assert.equal(standard, render(FilterToolbar, { ...props, appearance: "standard" }));
  const markup = render(FilterToolbar, { ...props, appearance: "premium" });
  assert.match(markup, /data-appearance="premium"/);
  assert.match(markup, /value="recarga"/);
  assert.match(markup, /aria-label="Buscar pagos"/);
  assert.ok(markup.includes("Limpiar filtros"));
  hasClasses(markup, ...premiumSurface.split(" "), ...premiumControlSurface.split(" "));
  const embedded = render(FilterToolbar, { ...props, embedded: true, appearance: "premium" });
  hasClasses(embedded, "bg-transparent", "border-0", "shadow-none");
});

test("Admin final rollout: migrated modules opt in to shared graphite without global theme overrides", () => {
  const source = (name) => readFileSync(new URL("../src/features/admin/" + name + ".tsx", import.meta.url), "utf8");
  for (const name of ["PagosSection", "PlanesPreciosSection", "ComercialSection", "LicenciasSection", "EmpleadosSection", "RendimientoSection", "AuditoriaSection", "ComunicadosSection", "IntegracionesSection", "ConfiguracionSection"]) {
    assert.match(source(name), /appearance="premium"/, name);
  }
  for (const name of ["MarketplaceCustomerCareWorkspace", "MarketplaceLiteContactCard", "MarketplaceConfigurationWorkspace", "MarketplaceDispatchSettingsCard", "MarketplaceJobReminderSettingsCard", "MarketplaceTerritoryCatalog", "MarketplaceTestCenterV2", "MarketplacePricingSection", "MarketplacePricingLaboratoryV2", "MarketplacePricingV3Diagnostics", "MarketplacePricingV3Hierarchy", "MarketplaceTemporalDraftsV3", "MarketplacePricingGlobalAdjustment", "AdministrationWorkspace", "MarketplaceOffersPanel", "CommercialReferralsPanel", "MarketplaceWelcomePolicyPanel"]) {
    assert.match(source(name), /admin-graphite-/, name);
  }
  const workspace = source("MarketplaceSection");
  const wallet = workspace.slice(workspace.indexOf('<TabsContent value="billeteras"'), workspace.indexOf('<TabsContent value="configuracion"'));
  assert.match(wallet, /admin-graphite-/);
  assert.match(wallet, /formatAmount\(wallet.availableBalance, wallet.currency\)/);
  assert.match(wallet, /topupStatus === value/);
  assert.match(wallet, /setNewTopup\(true\)/);
  const map = workspace.slice(workspace.indexOf('<TabsContent value="mapa"'), workspace.indexOf('<TabsContent value="conductores">'));
  assert.doesNotMatch(map, /admin-graphite-/);
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const adapter = css.slice(css.indexOf("/* Opt-in adapters for legacy Admin surfaces."));
  assert.ok(adapter.includes(".dark .admin-graphite-panel"));
  assert.ok(adapter.includes("var(--surface-3) 89%, var(--text-secondary) 11%"));
  assert.doesNotMatch(adapter, /--(?:primary|canvas|surface-1|background)\s*:/);
});


test("Admin navigation: thematic families reuse palette and preserve group membership", () => {
  const expected = { trabajos: "trabajos", "": "panel", clientes: "usuarios", comercial: "comercial", planes: "tarifas", rendimiento: "analitica", administracion: "administracion", auditoria: "auditoria" };
  for (const tab of ADMIN_PROJECT_TABS) assert.equal(adminNavTone(tab.slug), expected[tab.slug]);
  for (const slug of ["configuracion","empleados","comunicados","integraciones"]) assert.equal(adminNavTone(slug), "administracion");
  for (const slug of ["pagos","billeteras","recargas"]) assert.equal(adminNavTone(slug), "finanzas");
  assert.equal(adminNavTone("licencias"), "licencias");
  assert.equal(adminNavTone("unknown"), "panel");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const [tone, token] of Object.entries({trabajos:"licencias",panel:"resumen",usuarios:"clientes",comercial:"comercial",tarifas:"planes",analitica:"rendimiento",administracion:"configuracion",auditoria:"auditoria",finanzas:"pagos"})) {
    assert.ok(css.includes('[data-nav-tone="' + tone + '"]'), tone);
    assert.ok(css.includes("--nav-accent: var(--module-" + token + ")"), token);
  }
  const styles = css.slice(css.indexOf("/* Thematic Admin navigation."));
  assert.match(styles, /\.admin-nav-icon > svg \{ width: 22px; height: 22px; \}/);
  assert.match(styles, /#admin-desktop-sidebar\[data-state="collapsed"\] \.admin-nav-icon > svg \{ width: 23px; height: 23px; \}/);
  assert.match(styles, /\.admin-nav-item:focus-visible/);
  assert.match(styles, /\[data-admin-reference-drawer="graphite"\] \.admin-nav-item \{ min-height: 44px; \}/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(styles, /--(?:primary|canvas|surface-1|background|semantic-success)\s*:/);
});

test("Admin thematic inner menus keep selected links and larger icons", () => {
  for (const [name,tone] of [["MarketplacePricingSection","tarifas"], ["AdministrationWorkspace","administracion"], ["MarketplaceConfigurationWorkspace","administracion"]]) {
    const component = readFileSync(new URL("../src/features/admin/" + name + ".tsx", import.meta.url), "utf8");
    assert.ok(component.includes('data-nav-tone="' + tone + '"'), name);
    assert.match(component, /admin-graphite-nav-item/);
    assert.match(component, /className="admin-nav-icon relative z-10" aria-hidden="true"/);
    assert.match(component, /aria-(?:current|pressed)=/);
  }
});


test("Admin submenus: every destination has a stable thematic accent without changing parent groups", () => {
  const groups = {
    trabajos: {resumen:"panel", trabajos:"trabajos", atencion:"comercial", mapa:"mapa", conductores:"equipo", clientes:"usuarios", billeteras:"finanzas", recargas:"recargas", incidencias:"auditoria", configuracion:"administracion"},
    precios: {global:"tarifas", passenger:"usuarios", cargo:"analitica", courier:"trabajos"},
    administracion: {configuracion:"administracion", empleados:"equipo", comunicados:"comercial", integraciones:"licencias"},
    configuracion: {pruebas:"comercial", operacion:"panel", territorio:"trabajos"},
  };
  assert.deepEqual(MARKETPLACE_WORKSPACE_VIEWS.map(v => v.slug), Object.keys(groups.trabajos));
  assert.deepEqual(PRICING_WORKSPACE_VIEWS.map(v => v.code), Object.keys(groups.precios));
  assert.deepEqual(ADMINISTRATION_VIEWS.map(v => v.slug), Object.keys(groups.administracion));
  for (const [group, children] of Object.entries(groups)) {
    for (const [slug, tone] of Object.entries(children)) assert.equal(adminSubnavTone(group, slug), tone);
    assert.equal(new Set(Object.values(children)).size, Object.keys(children).length);
  }
  assert.equal(adminNavTone("trabajos"), "trabajos");
  assert.equal(adminNavTone("planes"), "tarifas");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /data-nav-tone="equipo".*--module-empleados/);
  assert.match(css, /data-nav-tone="recargas".*--module-pagos.*--module-planes/);
  assert.match(css, /data-nav-tone="mapa".*--module-clientes.*--module-licencias/);
  assert.match(css, /admin-nav-secondary \.admin-nav-icon > svg \{ width: 20px; height: 20px; \}/);
  assert.match(css, /data-nav-submenu/);
  assert.match(css, /admin-nav-secondary\[aria-current="page"\]/);
});

test("Admin submenu accents remain aligned in inner navigation and preserve tab controls", () => {
  for (const [name,group] of [["MarketplacePricingSection","precios"],["AdministrationWorkspace","administracion"],["MarketplaceConfigurationWorkspace","configuracion"]]) {
    const component = readFileSync(new URL("../src/features/admin/" + name + ".tsx", import.meta.url), "utf8");
    assert.ok(component.includes('data-nav-tone={adminSubnavTone("' + group + '",'), name);
    assert.match(component, /admin-nav-watermark/);
    assert.match(component, /admin-workspace-icon/);
  }
  const care = readFileSync(new URL("../src/features/admin/MarketplaceCustomerCareWorkspace.tsx", import.meta.url), "utf8");
  assert.match(care, /data-nav-tone="comercial" className="admin-subnav-tab/);
  assert.match(care, /data-nav-tone="finanzas" className="admin-subnav-tab/);
  assert.match(care, /onKeyDown=\{onCareTabKeyDown\}/);
  assert.match(care, /canManageContact \?/);
  const commercial = readFileSync(new URL("../src/features/admin/ComercialSection.tsx", import.meta.url), "utf8");
  assert.equal((commercial.match(/className="admin-subnav-tab"/g) ?? []).length, 3);
  for (const view of ["ofertas","captacion","referidos"]) assert.ok(commercial.includes('setCommercialView("' + view + '")'));
});

test("Configuración replaces the Administration label without duplicate entries or route changes", () => {
  const group = ADMIN_PROJECT_TABS.find(item => item.slug === "administracion");
  assert.ok(group && "children" in group);
  assert.equal(group.label, "Configuración");
  assert.equal(ADMIN_PROJECT_TABS.filter(item => item.label === "Configuración").length, 1);
  assert.ok(ADMIN_PROJECT_TABS.every(item => item.label !== "Administración"));
  assert.deepEqual(group.children.map(item => [item.slug, item.label, item.permission]), [
    ["configuracion", "Ajustes generales", "settings.view"],
    ["empleados", "Empleados", "members.view"],
    ["comunicados", "Comunicados", "settings.view"],
    ["integraciones", "Integraciones", "settings.view"],
  ]);
  assert.equal(MARKETPLACE_WORKSPACE_VIEWS.find(item => item.slug === "configuracion").label, "Configuración operativa");
  const workspace = readFileSync(new URL("../src/features/admin/AdministrationWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /aria-label="Secciones de configuración del proyecto TukTuk"/);
  assert.match(workspace, />Configuración<\/p>/);
  assert.doesNotMatch(workspace, />Administración<\/p>/);
  assert.match(workspace, /section: section\.slug/);
  assert.match(workspace, /permissions\.includes\(section\.permission\)/);
});


test("Configuration parent selects general settings or the first authorized child", () => {
  const group = ADMIN_PROJECT_TABS.find(item => item.slug === "administracion");
  assert.ok(group && "children" in group);
  assert.equal(adminGroupDefault(group)?.slug, "configuracion");
  assert.equal(adminGroupDefault({...group, children: group.children.filter(child => child.permission === "members.view")})?.slug, "empleados");
  assert.equal(adminGroupDefault({...group, children: []}), undefined);
  const route = readFileSync(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");
  assert.match(route, /const defaultChild = adminGroupDefault\(tab\)/);
  assert.match(route, /params=\{\{ id: project.id, section: defaultChild.slug \}\}/);
  assert.match(route, /setConfigurationExpanded\(true\);\s*closeDrawer\?\.\(\)/);
  assert.match(route, /aria-controls=\{configurationGroupId\}/);
  assert.match(route, /hidden=\{!groupOpen\}/);
  assert.match(route, /setConfigurationExpanded\(\(value\) => !value\)/);
  assert.match(route, /const groupOpen = collapsed \? groupActive : configurationExpanded/);
});
