import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/proposals/marketplace_cancellation_policy.sql','utf8');
const gateway=readFileSync('supabase/functions/marketplace-customer-gateway/index.ts','utf8');
const section=readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');
const settings=readFileSync('src/features/admin/MarketplaceConfigurationWorkspace.tsx','utf8');
const record=readFileSync('src/features/admin/MarketplaceDriver360Record.tsx','utf8');
test('replacement is scoped, serialized and does not rewrite the old job',()=>{
 assert.match(sql,/previous_job_id\)\s*,/);
 assert.match(sql,/previous_id for update/);
 assert.match(sql,/req.customer_id is distinct from cid/);
 assert.match(sql,/oldj.status<>'cancelled_by_driver'/);
 assert.match(sql,/oldj.final_price/);
 assert.match(sql,/req.notes,req.details/);
 assert.match(sql,/marketplace_replacement_driver_excluded/);
 assert.match(sql,/source_code,'fleet'/);
 assert.match(sql,/grant execute on function public.replace_marketplace_customer_job\(uuid,text,uuid\) to service_role/);
 assert.match(gateway,/replace_cancelled_job: "publish"/);
 assert.match(gateway,/replace_cancelled_job: "replace_marketplace_customer_job"/);
});
test('no-show guard and manual review do not impose financial penalties',()=>{
 assert.match(sql,/before insert on public.job_events/);
 assert.match(sql,/NO_SHOW_REQUIRES_ARRIVAL/);
 assert.match(sql,/NO_SHOW_WAIT_REQUIRED/);
 assert.match(sql,/review_cancellation/);
 assert.doesNotMatch(sql,/insert into public.wallet_transactions|update public.wallets/i);
 assert.match(sql,/marketplace_job_cancelled/);
});
test('admin exposes recovery, settings and manual review',()=>{
 assert.match(section,/admin_replace_marketplace_cancelled_job/);
 assert.match(section,/¿El cliente confirma/);
 assert.match(settings,/id: "cancelaciones"/);
 assert.match(settings,/<MarketplaceCancellationSettingsCard/);
 assert.match(record,/<MarketplaceDriverCancellationReview/);
});
