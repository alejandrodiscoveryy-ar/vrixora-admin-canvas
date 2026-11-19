import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { suggestDriverPromoAlias, validDriverPromoAlias } from "../src/lib/marketplace-promo-alias.ts";

const idA = "00000000-1111-4222-8333-99999999abcd";
const idB = "00000000-1111-4222-8333-88888888bcde";

test("Impulsa propone nombres legibles que distinguen conductores homónimos", () => {
  const a = suggestDriverPromoAlias("Andy Cosculluela", idA);
  const b = suggestDriverPromoAlias("Andy Cosculluela", idB);
  assert.notEqual(a, b);
  assert.match(a, /^andy-cosculluela-[a-f0-9]{8}$/);
  assert.match(b, /^andy-cosculluela-[a-f0-9]{8}$/);
  assert.ok(validDriverPromoAlias(a));
  assert.ok(validDriverPromoAlias(b));
});

test("Nombres con acentos, nombres largos y vacíos generan propuestas válidas", () => {
  for (const name of [
    "José Ramón Núñez", "María del Carmen Pérez González",
    "Nombre Extraordinariamente Largo Con Muchísimas Palabras",
    "", "Á É Ñ", "admin",
  ]) {
    const alias = suggestDriverPromoAlias(name, idA);
    assert.ok(validDriverPromoAlias(alias), `${name} => ${alias}`);
    assert.ok(alias.length <= 32);
    assert.ok(alias.endsWith("9999abcd"));
  }
});

test("Rechaza formatos, nombres reservados y duplicación delegada a base de datos", () => {
  for (const alias of ["admin", "api", "tuktuk", "impulsa", "éxito", "a", "a-", "con espacio", "a".repeat(33)]) {
    assert.equal(validDriverPromoAlias(alias), false, alias);
  }
  assert.equal(validDriverPromoAlias("andy-cosculluela-9999abcd"), true);
  const sql = readFileSync(new URL("../supabase/migrations/20261114115854_marketplace_impulsa_short_aliases.sql", import.meta.url), "utf8");
  assert.match(sql, /alias text primary key/);
  assert.match(sql, /on conflict\(alias\) do nothing/);
  assert.match(sql, /PROMO_ALIAS_TAKEN/);
});
