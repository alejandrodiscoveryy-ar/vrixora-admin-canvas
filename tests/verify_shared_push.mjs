// Read-only cross-repository audit. Never repairs Git/worktree metadata.
import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deepStrictEqual as equal, ok } from "node:assert/strict";
const admin = new URL("../", import.meta.url);
const conductor = new URL("../../eltoque-conductor/", import.meta.url);
const cliente = new URL("../../eltoque-cliente/", import.meta.url);
const text = async (root, path) => (await readFile(new URL(path, root), "utf8")).replaceAll("\r\n", "\n").trimEnd();
for (const root of [admin, conductor, cliente]) {
  equal(execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: fileURLToPath(root), encoding: "utf8" }).trim(),
    "codex/eltoque-shared-push-20261011");
}
const folder = "flutter_app/supabase/functions/send-push-notifications/";
const snapshot = "docs/audits/eltoque-shared-push-20261011/production-v16/";
equal(await text(conductor, folder + "core.ts"), await text(admin, snapshot + "core.ts.txt"));
let source = await text(conductor, folder + "index.ts");
source = source.replace('import { customerPayload, processCustomerQueue } from "./customer.ts";\n', "");
source = source.replace('type PushContent = Pick<OutboxRow, "id" | "kind" | "notification_date" | "title" | "body" | "data">;\n', "");
source = source.replaceAll("row: PushContent", "row: OutboxRow");
const start = source.indexOf("    const customer = await processCustomerQueue");
const end = source.indexOf("    summary.duration_ms = Date.now() - startedAt;", start);
ok(start > 0 && end > start);
source = source.slice(0, start) + source.slice(end);
source = source.replace("return Response.json({ ...summary, customer });", "return Response.json(summary);");
equal(source, await text(admin, snapshot + "index.ts.txt"));
console.log("PASS existing Conductor behavior source matches v16 after removing Cliente adapter");
for (const path of ["supabase/functions/marketplace-customer-push-registration/index.ts", "supabase/functions/marketplace-customer-push-registration/registration.ts"]) {
  const value = await text(cliente, path);
  for (const forbidden of ["fcm.googleapis.com", "googleAccessToken", "FIREBASE_SERVICE_ACCOUNT", "marketplace_customer_eltoque_push_claim", "TUKTUK_PUSH_DISPATCH_SECRET"]) ok(!value.includes(forbidden), path + ": " + forbidden);
}
for (const obsolete of ["docs/edge/marketplace-customer-rate-push/index.ts", "docs/sql/PENDIENTE_customer_eltoque_cron.sql", "docs/sql/PENDIENTE_customer_eltoque_push.sql"]) {
  let exists = true; try { await access(new URL(obsolete, cliente)); } catch { exists = false; }
  equal(exists, false);
}
const consumerChanges = execFileSync("git", ["diff", "bbc486415a56f7bbe4c471aff781bbc47550d737", "--name-only", "--", "flutter_app/lib", "flutter_app/android", "flutter_app/ios", "flutter_app/web", "flutter_app/windows", "flutter_app/macos", "flutter_app/linux"], { cwd: fileURLToPath(conductor), encoding: "utf8" }).trim();
equal(consumerChanges, "");
const migrated = execFileSync("git", ["diff", "d5c012a7c7c04b1d35822a98edb08bfbabc98a1c", "--name-only", "--", "supabase/migrations"], { cwd: fileURLToPath(admin), encoding: "utf8" }).trim();
equal(migrated, "");
console.log("PASS registration has no sender; no obsolete emitter/cron proposal; no Flutter Conductor changes; no automatic migrations");
