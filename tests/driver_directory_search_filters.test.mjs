import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync("src/features/admin/MarketplaceSection.tsx", "utf8");

test("la búsqueda de conductores cubre nombre y celular", () => {
  assert.match(panel, /Buscar por nombre o número de celular/);
  assert.match(panel, /normalizeDriverText\(item\.displayName\)\.includes\(query\)/);
  assert.match(panel, /item\.phone \?\? ""\)\.replace\(\/\\D\/g, ""\)\.includes\(phoneDigits\)/);
  assert.match(panel, /normalize\("NFD"\)/);
});

test("busca sobre el directorio completo y conserva paginación visual", () => {
  assert.match(panel, /const drivers = useInfiniteQuery\(/);
  assert.match(panel, /limit: 200,\s*cursor: pageParam/);
  assert.match(panel, /void drivers\.fetchNextPage\(\)/);
  assert.match(panel, /visibleDriverRows = filteredDriverRows\.slice\(0, driverVisibleCount\)/);
  assert.match(panel, /setDriverVisibleCount\(\(count\) => count \+ 25\)/);
});

test("filtros combinables, responsive y entrada a ficha 360", () => {
  for (const filter of ["Estado del perfil", "Disponibilidad", "Vehículo", "Verificación", "Inscripción"]) {
    assert.ok(panel.includes(`labelText="${filter}"`), filter);
  }
  assert.match(panel, /sm:grid-cols-2 xl:grid-cols-5/);
  assert.match(panel, /dateOfRegistration\(item\.createdAt\)/);
  assert.match(panel, /No hay coincidencias/);
  assert.match(panel, /setDriver360Id\(item\.userId\)/);
  assert.match(panel, /Limpiar filtros/);
});
