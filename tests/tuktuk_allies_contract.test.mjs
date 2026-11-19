import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261118233000_marketplace_allies_two_links_v1.sql");
const capSql = read("supabase/migrations/20261119003000_marketplace_ally_maximum_five_percent.sql");
const brandedSql = read("supabase/migrations/20261119013500_marketplace_ally_branded_shortlinks_v1.sql");
const shortEdge = read("supabase/functions/marketplace-ally-shortlink/index.ts");
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
  assert.match(admin, /www\.vrixora\.com\/tuk\//);
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


test("Aliados comparte como máximo cinco puntos y no afecta Impulsa", () => {
  assert.match(capSql, /marketplace_allies_rate_check/);
  assert.match(capSql, /marketplace_ally_attributions_rate_snapshot_check/);
  assert.match(capSql, /rate\s*<=\s*\.05/);
  assert.match(capSql, /rate_snapshot\s*<=\s*\.05/);
  assert.match(capSql, /target_rate>\.05/);
  assert.doesNotMatch(capSql, /update\s+public\.project_marketplace_financial_settings/i);
  assert.match(admin, /pct > 5/);
  assert.match(admin, /newRate > 5/);
  assert.match(admin, /max="5"/);
});

test("nicks públicos comparten espacio sin colisiones entre Aliados e Impulsa", () => {
  assert.match(brandedSql, /get_public_marketplace_ally_shortlink_v1/);
  assert.match(brandedSql, /ALLY_NICK_TAKEN_BY_DRIVER/);
  assert.match(brandedSql, /PROMO_ALIAS_TAKEN/);
  assert.match(brandedSql, /marketplace_driver_promo_aliases/);
  assert.match(brandedSql, /hashtextextended/);
  assert.match(brandedSql, /grant execute on function public\.get_public_marketplace_ally_shortlink_v1\(text\) to service_role/);
  assert.doesNotMatch(brandedSql, /update public\.wallet_transactions/i);
  assert.match(shortEdge, /get_public_marketplace_ally_shortlink_v1/);
  assert.match(shortEdge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(shortEdge, /report_key|report_secret_hash|report_expires_at|\.rate/);
  assert.match(admin, /const promo = \(slug: string\) => shortBase \+ encodeURIComponent\(slug\)/);
  assert.match(admin, /Nick comercial para compartir/);
  assert.doesNotMatch(admin, /\?aliado=/);
});
