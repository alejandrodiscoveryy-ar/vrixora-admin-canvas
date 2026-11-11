import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/supabase-auth.tsx", import.meta.url), "utf8");
const sdk = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const effectStart = source.indexOf("  useEffect(() => {");
const effectEnd = source.indexOf("\n  const signInWithGoogle", effectStart);
const effect = source.slice(effectStart, effectEnd);

test("Auth usa la sesión administrada por Supabase sin conservar una segunda copia", () => {
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  assert.match(sdk, /client\s*\?\?=\s*createClient\(/);
  assert.match(effect, /client\.auth\.getSession\(\)/);
  assert.match(effect, /client\.auth\.onAuthStateChange\(/);
  assert.match(effect, /removeItem\(LEGACY_STORAGE_KEY\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\(/);
  assert.doesNotMatch(source, /JSON\.stringify\((?:data\.session|newSession|session)\)/);
});

test("La suscripción de Auth se libera al desmontar el componente", () => {
  assert.match(effect, /let mounted = true/);
  assert.match(effect, /subscription = authSubscription/);
  assert.match(effect, /if \(mounted\) setSession\(nextSession\)/);
  assert.match(effect, /if \(mounted\) setSession\(data\.session\)/);
  assert.match(effect, /return \(\) => \{\s*mounted = false;\s*subscription\?\.unsubscribe\(\);\s*\};/);
});

test("Se conservan las operaciones reales de acceso y cierre de sesión", () => {
  assert.match(source, /client\.auth\.signInWithOAuth\(/);
  assert.match(source, /provider: "google"/);
  assert.match(source, /if \(savedAdminPushToken\(\)\) await unregisterAdminPush\(\)/);
  assert.match(source, /client\.auth\.signOut\(\)/);
  assert.match(source, /<AuthContext\.Provider/);
});
