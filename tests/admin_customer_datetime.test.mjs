import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url),
  "utf8",
);

test("la fecha de registro se presenta en lista móvil y escritorio", () => {
  const count = source.split("Registrado: <time dateTime={customer.createdAt}>").length - 1;
  assert.equal(count, 2);
  assert.match(source, /formatCustomerDateTime\(customer\.createdAt\)/);
  assert.match(source, /formatCustomerDateTime\(detail\.customer\.createdAt\)/);
});

test("la hora es la de Cuba y se maneja dato inválido sin inventarlo", () => {
  assert.match(source, /const formatCustomerDateTime = \(value: string \| null \| undefined\)/);
  assert.match(source, /timeZone: "America\/Havana"/);
  assert.match(source, /hour: "2-digit"/);
  assert.match(source, /minute: "2-digit"/);
  assert.match(source, /if \(!value\) return "—"/);
  assert.match(source, /if \(Number\.isNaN\(parsed\.getTime\(\)\)\) return "—"/);
  const havana = new Intl.DateTimeFormat("es-CU", {
    timeZone: "America/Havana",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date("2026-11-09T18:30:00Z"));
  assert.match(havana, /13:30/);
});

test("última carrera usa horario cubano y no se inventa si está vacía", () => {
  assert.match(source, /Última carrera: <time dateTime=\{customer\.lastJobAt\}>/);
  assert.match(source, /customer\.lastJobAt\s*\?\s*formatCustomerDateTime\(customer\.lastJobAt\)\s*:\s*"Sin actividad"/);
  assert.match(source, /Cliente desde \{formatCustomerDateTime\(detail\.customer\.createdAt\)\} \(Cuba\)/);
});
