import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const fromRoot = (path) => join(root, path);

function sourceFiles(directory) {
  const results = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, item.name);
    if (item.isDirectory()) {
      results.push(...sourceFiles(fullPath));
    } else if (item.isFile() && /\.(?:ts|tsx|js|jsx|mjs)$/.test(item.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

test("los dos modulos de demostracion retirados no existen", () => {
  assert.equal(existsSync(fromRoot("src/lib/demo-auth.tsx")), false);
  assert.equal(existsSync(fromRoot("src/lib/demo-store.ts")), false);
});

test("el codigo activo no conserva referencias a los modulos retirados", () => {
  const abandonedReferences = /\b(?:DemoAuthProvider|useDemoAuth|resetDemoStore|useDemoStore)\b|vrixora_demo_(?:user|state_v1)|(?:demo-auth|demo-store)\.(?:ts|tsx)/;
  for (const path of sourceFiles(fromRoot("src"))) {
    assert.doesNotMatch(readFileSync(path, "utf8"), abandonedReferences, path);
  }
});

test("Administracion mantiene autenticacion y proveedor de datos reales", () => {
  const admin = readFileSync(fromRoot("src/routes/admin.tsx"), "utf8");
  const services = readFileSync(fromRoot("src/lib/services/index.ts"), "utf8");
  assert.match(admin, /SupabaseAuthProvider/);
  assert.match(admin, /useSupabaseAuth/);
  assert.match(services, /getAdminServices\(provider: DataProvider = "supabase"\)/);
  assert.ok(existsSync(fromRoot("src/lib/mock-data.ts")), "Los tipos historicos se conservan");
  assert.ok(existsSync(fromRoot("src/lib/services/demo.ts")), "El proveedor de demostracion queda fuera del alcance de este PR");
});
