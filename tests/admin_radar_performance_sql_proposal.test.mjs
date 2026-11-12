import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../docs/drafts/radar_readiness_materialized_20261111.sql", import.meta.url),
  "utf8",
);

test("El ajuste conserva la misma RPC y cambia solo la materializacion del CTE", () => {
  assert.match(sql, /admin_get_marketplace_radar_readiness\(uuid\)/);
  assert.match(sql, /old_fragment text := 'with work as \('/);
  assert.match(sql, /new_fragment text := 'with work as materialized \('/);
  assert.match(sql, /EXECUTE replace\(src, old_fragment, new_fragment\)/);
});

test("La propuesta impide sobrescribir una definicion distinta sin nueva auditoria", () => {
  assert.match(sql, /to_regprocedure\('public\.admin_get_marketplace_radar_readiness\(uuid\)'\)/);
  assert.match(sql, /md5\(src\) <> 'ebbb7bb8ba5fab8de02bec80f352bb11'/);
  assert.match(sql, /RADAR_READINESS_SOURCE_CHANGED_REAUDIT_REQUIRED/);
  assert.match(sql, /RADAR_READINESS_EXPECTED_CTE_NOT_UNIQUE/);
  assert.match(sql, /RADAR_READINESS_SECURITY_CONTRACT_CHANGED/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE FROM|ALTER TABLE)\b/i);
});

test("El SQL sigue siendo un borrador no ejecutable automaticamente como migracion", () => {
  assert.match(sql, /BORRADOR EXCLUSIVAMENTE PARA REVISION/);
  assert.match(sql, /NO APLICADO A SUPABASE/);
  assert.match(sql, /autorizacion expresa del propietario/);
});
