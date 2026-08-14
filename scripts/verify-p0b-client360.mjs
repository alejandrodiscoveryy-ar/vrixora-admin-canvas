import { readFileSync } from "node:fs";

const service = readFileSync("src/lib/services/supabase.ts", "utf8");
const ui = readFileSync("src/features/admin/Cliente360Section.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260814182000_p0b_client_360.sql", "utf8");

const checks = [
  [
    "service maps the human payment plan name with a code fallback",
    service.includes("planName: String(row.plan_name ?? row.plan)"),
  ],
  ["billing UI renders the human payment plan name", ui.includes("subtitle: item.planName")],
  [
    "global navigation is absent from contextual actions",
    !["Abrir Licencias", "Abrir Pagos", "Abrir Comercial"].some((label) => ui.includes(label)),
  ],
  ["normal preinvoices exclude test data", migration.includes("and not invoice.is_test")],
  ["normal referrals exclude test data", migration.includes("and not relationship.is_test")],
  [
    "client list does not synthesize a 30-day license",
    !migration.includes("profile.created_at+interval '30 days'"),
  ],
];

for (const [name, passed] of checks) {
  console.log(`${passed ? "OK" : "ERROR"}: ${name}`);
}

if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
