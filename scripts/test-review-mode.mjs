import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { authorizeReviewRequest } from "../src/lib/review/access.server.ts";

const token = "review-test-token-with-at-least-thirty-two-random-like-characters";
const hash = createHash("sha256").update(token).digest("hex");
const future = "2030-01-01T00:00:00.000Z";
const now = new Date("2026-08-09T12:00:00.000Z");
const routes = [
  "",
  "clientes",
  "licencias",
  "planes",
  "pagos",
  "comercial",
  "empleados",
  "rendimiento",
  "configuracion",
  "auditoria",
];

const environment = {
  ADMIN_REVIEW_TOKENS: JSON.stringify([{ hash, expiresAt: future, revokedAt: null }]),
};
for (const section of routes) {
  const suffix = section ? `/${section}` : "";
  const result = await authorizeReviewRequest(
    new Request(`https://review.test/review/${token}${suffix}`),
    environment,
    now,
  );
  assert.equal(result, null, `GET ${section || "resumen"} debe autorizarse`);
}

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  const result = await authorizeReviewRequest(
    new Request(`https://review.test/review/${token}/pagos`, { method }),
    environment,
    now,
  );
  assert.equal(result?.status, 405, `${method} debe devolver 405`);
}

assert.equal(
  (
    await authorizeReviewRequest(
      new Request("https://review.test/review/invalid-token"),
      environment,
      now,
    )
  )?.status,
  404,
);
assert.equal(
  (
    await authorizeReviewRequest(
      new Request(`https://review.test/review/${token}`),
      { ADMIN_REVIEW_TOKENS: JSON.stringify([{ hash, expiresAt: "2026-08-08T00:00:00.000Z" }]) },
      now,
    )
  )?.status,
  410,
);
assert.equal(
  (
    await authorizeReviewRequest(
      new Request(`https://review.test/review/${token}`),
      {
        ADMIN_REVIEW_TOKENS: JSON.stringify([
          { hash, expiresAt: future, revokedAt: "2026-08-09T00:00:00.000Z" },
        ]),
      },
      now,
    )
  )?.status,
  410,
);

for (const directory of ["src/lib/review", "src/features/review", "src/routes"]) {
  const names = await readdir(directory);
  for (const name of names.filter(
    (item) => directory !== "src/routes" || item.startsWith("review."),
  )) {
    const path = join(directory, name);
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /supabase/i, `${path} no puede importar ni mencionar Supabase`);
  }
}

console.log(
  "Review mode: 10 GET, 4 métodos bloqueados, token inválido/expirado/revocado y aislamiento verificados.",
);
