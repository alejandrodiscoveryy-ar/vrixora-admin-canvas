-- Run after the P3 migration in an isolated database.
-- Required: :project_id, :owner_user_id, :marketing_user_id,
-- :accounting_user_id, :unauthorized_user_id, :registered_user_id,
-- :project_b_id, :project_b_campaign_id, :project_b_lead_id.

do $$
begin
  if not exists (select 1 from public.project_role_permissions where role_code='owner' and permission_code='commercial.manage') then raise exception 'TEST_FAILED: owner cannot manage leads'; end if;
  if not exists (select 1 from public.project_role_permissions where role_code='marketing' and permission_code='commercial.manage') then raise exception 'TEST_FAILED: marketing cannot manage leads'; end if;
  if exists (select 1 from public.project_role_permissions where role_code='accounting' and permission_code like 'commercial.%') then raise exception 'TEST_FAILED: accounting received commercial permission'; end if;
  if exists (select 1 from public.project_role_permissions where role_code='marketing' and permission_code in ('payments.manage','payments.correct','licenses.manage','plans.manage','members.manage','settings.manage')) then raise exception 'TEST_FAILED: marketing received critical permission'; end if;
  if not exists (select 1 from pg_trigger where tgname='audit_commercial_leads_changes' and not tgisinternal) then raise exception 'TEST_FAILED: lead audit missing'; end if;
  if has_table_privilege('authenticated','public.commercial_lead_history','SELECT') then raise exception 'TEST_FAILED: direct lead history SELECT granted'; end if;
end; $$;

-- OWNER creates a lead; expected success.
begin;
select set_config('request.jwt.claim.sub',':owner_user_id',true);
select public.admin_save_commercial_campaign(':project_id'::uuid,null,'Owner campaign','facebook','social','active',current_date,null);
select public.admin_save_commercial_lead(':project_id'::uuid,null,'Lead Owner','+5351234567','owner-lead@example.com','facebook','social',null,'Lanzamiento','REF-OWNER',null,'new','Primera nota',':owner_user_id'::uuid,null,null);
rollback;

-- MARKETING creates, links and changes status; expected success and history.
begin;
select set_config('request.jwt.claim.sub',':marketing_user_id',true);
select public.admin_save_commercial_campaign(':project_id'::uuid,null,'Marketing campaign','instagram','social','active',current_date,null);
with created as (
  select public.admin_save_commercial_lead(':project_id'::uuid,null,'Lead Marketing','+5351234568',(select email from public.profiles where id=':registered_user_id'::uuid),'referral','partner',null,'Referidos agosto','REF-001',':owner_user_id'::uuid,'contacted','Contacto inicial',':marketing_user_id'::uuid,now()+interval '1 day',':registered_user_id'::uuid) id
), changed as (
  select public.admin_save_commercial_lead(':project_id'::uuid,created.id,'Lead Marketing','+5351234568',(select email from public.profiles where id=':registered_user_id'::uuid),'referral','partner',null,'Referidos agosto','REF-001',':owner_user_id'::uuid,'trial','Inició prueba',':marketing_user_id'::uuid,now()+interval '2 days',':registered_user_id'::uuid) id from created
)
select exists(select 1 from public.commercial_lead_history h join changed on changed.id=h.lead_id where h.event_type='status_changed') as status_traced;
rollback;

-- Cross-project campaign update must be rejected before UPDATE.
do $$
begin
  perform set_config('request.jwt.claim.sub',':owner_user_id',true);
  perform public.admin_save_commercial_campaign(':project_id'::uuid,':project_b_campaign_id'::uuid,'Cross tenant','direct',null,'active',null,null);
  raise exception 'TEST_FAILED: campaign from project B was modified through project A';
exception when no_data_found then null;
end; $$;

-- Owner and Marketing are valid commercial responsibles.
begin;
select set_config('request.jwt.claim.sub',':owner_user_id',true);
select public.admin_save_commercial_lead(':project_id'::uuid,null,'Owner responsible','+5351234570',null,'direct',null,null,null,null,null,'new',null,':owner_user_id'::uuid,null,null);
select public.admin_save_commercial_lead(':project_id'::uuid,null,'Marketing responsible','+5351234571',null,'direct',null,null,null,null,null,'new',null,':marketing_user_id'::uuid,null,null);
rollback;

-- Accounting and a non-member client are invalid commercial responsibles.
do $$
begin
  perform set_config('request.jwt.claim.sub',':owner_user_id',true);
  perform public.admin_save_commercial_lead(':project_id'::uuid,null,'Bad accounting responsible','+5351234572',null,'direct',null,null,null,null,null,'new',null,':accounting_user_id'::uuid,null,null);
  raise exception 'TEST_FAILED: accounting accepted as commercial responsible';
exception when invalid_parameter_value then null;
end; $$;
do $$
begin
  perform set_config('request.jwt.claim.sub',':owner_user_id',true);
  perform public.admin_save_commercial_lead(':project_id'::uuid,null,'Bad client responsible','+5351234573',null,'direct',null,null,null,null,null,'new',null,':registered_user_id'::uuid,null,null);
  raise exception 'TEST_FAILED: client accepted as commercial responsible';
exception when invalid_parameter_value then null;
end; $$;

-- Marketing can read history through commercial.view.
begin;
do $$
declare lead_id uuid;
begin
  perform set_config('request.jwt.claim.sub',':owner_user_id',true);
  lead_id:=public.admin_save_commercial_lead(':project_id'::uuid,null,'History lead','+5351234574',null,'direct',null,null,null,null,null,'new','Created note',':owner_user_id'::uuid,null,null);
  perform set_config('request.jwt.claim.sub',':marketing_user_id',true);
  perform public.admin_list_commercial_lead_history(':project_id'::uuid,lead_id);
end; $$;
rollback;
do $$
begin
  perform set_config('request.jwt.claim.sub',':owner_user_id',true);
  perform public.admin_list_commercial_lead_history(':project_id'::uuid,':project_b_lead_id'::uuid);
  raise exception 'TEST_FAILED: history from project B exposed through project A';
exception when no_data_found then null;
end; $$;

-- Conversion/payment is derived from payments, never inserted by P3.
begin;
select set_config('request.jwt.claim.sub',':owner_user_id',true);
select public.admin_list_commercial_leads(':project_id'::uuid);
select public.admin_get_commercial_metrics(':project_id'::uuid);
rollback;

-- ACCOUNTING must be rejected.
do $$
begin
  perform set_config('request.jwt.claim.sub',':accounting_user_id',true);
  perform public.admin_list_commercial_leads(':project_id'::uuid);
  raise exception 'TEST_FAILED: accounting accessed commercial data';
exception when insufficient_privilege then null;
end; $$;

-- UNAUTHORIZED must be rejected.
do $$
begin
  perform set_config('request.jwt.claim.sub',':unauthorized_user_id',true);
  perform public.admin_save_commercial_lead(':project_id'::uuid,null,'Rejected','+5351234569',null,'direct',null,null,null,null,null,'new',null,null,null,null);
  raise exception 'TEST_FAILED: unauthorized user managed commercial data';
exception when insufficient_privilege then null;
end; $$;

-- Source/campaign/referral are stored once on the lead and user/payment IDs are links.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='commercial_leads' and column_name='referral_code') then raise exception 'TEST_FAILED: referral code missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='commercial_leads' and column_name='user_id') then raise exception 'TEST_FAILED: user link missing'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='commercial_leads' and column_name='payment_id') then raise exception 'TEST_FAILED: payment duplicated in lead'; end if;
end; $$;
