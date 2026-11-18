import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261118233000_marketplace_allies_two_links_v1.sql");
const admin = read("src/features/admin/MarketplaceAlliesPanel.tsx");
const commercial = read("src/features/admin/ComercialSection.tsx");
const personal = read("src/routes/aliados.tsx");
const edge = read("supabase/functions/marketplace-impulsa-analytics/index.ts");
const map = read("supabase/functions/marketplace-map-gateway/index.ts");

test("allies are isolated from Impulsa, with RLS and no table access", () => {
  assert.match(sql, /marketplace_ally_attributions/);
  assert.match(sql, /marketplace_ally_payments/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on app_private.marketplace_allies/);
  assert.match(sql, /not exists\(select 1 from app_private.marketplace_driver_promo_attribution/);
  assert.match(sql, /coalesce\(j\.is_test,false\)=false/);
  assert.match(sql, /j\.status='settled'/);
  assert.doesNotMatch(sql, /insert into public\.wallet_transactions/i);
  assert.doesNotMatch(sql, /update public\.project_marketplace_financial_settings/i);
});

test("two distinct URLs and a no-login private panel", () => {
  assert.match(admin, /cliente\/tuk\/\?aliado=/);
  assert.match(admin, /admin\.vrixora\.com\/aliados/);
  assert.match(admin, /admin_rotate_marketplace_ally_key_v1/);
  assert.match(admin, /admin_record_marketplace_ally_payment_v1/);
  assert.match(personal, /createFileRoute\("\/aliados"\)/);
  assert.match(personal, /get_marketplace_ally_report_v1/);
  assert.match(personal, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(personal, /customer_phone|destination_text|contact_email/);
  assert.match(commercial, /MarketplaceAlliesPanel/);
});

test("public telemetry is service-only and actual trips use verified gateway wrapper", () => {
  assert.match(sql, /grant execute on function public\.record_public_marketplace_ally_event_v1[\s\S]*to service_role/);
  assert.match(edge, /record_public_marketplace_ally_event_v1/);
  assert.match(edge, /marketplace_customer_gateway_rate_limit/);
  assert.match(map, /create_marketplace_customer_request_ally_v1/);
  assert.match(map, /const allySlug = params\.target_ally_slug/);
  assert.match(sql, /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_ALLY/);
  assert.match(sql, /rate_snapshot/);
  assert.match(sql, /report_secret_hash=extensions\.digest/);
});
