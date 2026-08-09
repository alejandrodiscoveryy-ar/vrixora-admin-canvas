-- P4 integrated verification. Run only in an isolated database after all
-- migrations. Every block that writes data is wrapped in a transaction and
-- rolled back.
-- Required variables:
-- :project_id, :project_b_id, :owner_user_id, :accounting_user_id,
-- :marketing_user_id, :unauthorized_user_id, :license_id,
-- :active_plan_code, :project_b_campaign_id.

-- Final permission matrix and structural guardrails.
do $$
declare forbidden text;
begin
  if exists (
    select permission.code from public.project_permissions permission
    except
    select mapping.permission_code from public.project_role_permissions mapping
    where mapping.role_code = 'owner'
  ) then raise exception 'TEST_FAILED: owner lacks a permission'; end if;

  foreach forbidden in array array[
    'licenses.manage','plans.manage','members.manage','settings.manage',
    'whatsapp_settings.manage','payments.correct','commercial.view',
    'commercial.manage','audit.view'
  ] loop
    if exists (
      select 1 from public.project_role_permissions
      where role_code='accounting' and permission_code=forbidden
    ) then raise exception 'TEST_FAILED: accounting has %', forbidden; end if;
  end loop;

  if not exists (
    select 1 from public.project_role_permissions
    where role_code='accounting' and permission_code='payments.manage'
  ) then raise exception 'TEST_FAILED: accounting lacks payments.manage'; end if;

  foreach forbidden in array array[
    'payments.manage','payments.correct','licenses.manage','plans.manage',
    'members.manage','settings.manage','whatsapp_settings.manage','audit.view'
  ] loop
    if exists (
      select 1 from public.project_role_permissions
      where role_code='marketing' and permission_code=forbidden
    ) then raise exception 'TEST_FAILED: marketing has %', forbidden; end if;
  end loop;

  if not exists (
    select 1 from public.project_role_permissions
    where role_code='marketing' and permission_code='commercial.manage'
  ) then raise exception 'TEST_FAILED: marketing lacks commercial.manage'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.licenses'::regclass and contype='u'
      and pg_get_constraintdef(oid) like '%project_id, user_id%'
  ) then raise exception 'TEST_FAILED: duplicate-license constraint missing'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='payments'
      and indexname='payments_idempotency_key_uidx'
  ) then raise exception 'TEST_FAILED: payment idempotency index missing'; end if;

  if has_table_privilege('authenticated','public.commercial_lead_history','SELECT')
    then raise exception 'TEST_FAILED: direct commercial history SELECT granted';
  end if;
end;
$$;

-- OWNER can execute representative reads across every administrative area.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_list_registered_clients(':project_id'::uuid);
select public.admin_list_licenses(':project_id'::uuid);
select public.admin_list_license_plans(':project_id'::uuid);
select public.admin_list_license_payments(':project_id'::uuid);
select public.admin_get_whatsapp_settings(':project_id'::uuid);
select public.admin_get_usage_dimensions(':project_id'::uuid);
select public.admin_list_commercial_campaigns(':project_id'::uuid);
select public.admin_list_commercial_leads(':project_id'::uuid);
select public.admin_list_audit_events(':project_id'::uuid, 10);
rollback;

-- ACCOUNTING: payment -> receipt -> license, repeat idempotently, then renew.
begin;
do $$
declare
  first_key uuid := gen_random_uuid();
  renewal_key uuid := gen_random_uuid();
  first_result jsonb;
  repeated_result jsonb;
  renewal_result jsonb;
  first_expiry timestamptz;
  renewal_expiry timestamptz;
begin
  perform set_config('request.jwt.claim.sub', ':accounting_user_id', true);
  first_result := public.admin_charge_and_assign_plan_with_client_phone(
    ':license_id'::uuid,
    ':active_plan_code',
    (select price from public.license_plans where project_id=':project_id'::uuid and code=':active_plan_code'),
    'cash','P4-ACCOUNTING-FIRST',now(),'P4 integrated charge','after_expiry',
    first_key,null,false
  );
  repeated_result := public.admin_charge_and_assign_plan_with_client_phone(
    ':license_id'::uuid,
    ':active_plan_code',
    (select price from public.license_plans where project_id=':project_id'::uuid and code=':active_plan_code'),
    'cash','P4-ACCOUNTING-FIRST',now(),'P4 idempotent replay','after_expiry',
    first_key,null,false
  );

  if first_result->>'payment_id' is null or first_result->>'receipt_id' is null
    then raise exception 'TEST_FAILED: charge did not create payment and receipt';
  end if;
  if first_result->>'payment_id' is distinct from repeated_result->>'payment_id'
    then raise exception 'TEST_FAILED: charge is not idempotent';
  end if;

  select expires_at into first_expiry from public.licenses where id=':license_id'::uuid;
  renewal_result := public.admin_charge_and_assign_plan_with_client_phone(
    ':license_id'::uuid,
    ':active_plan_code',
    (select price from public.license_plans where project_id=':project_id'::uuid and code=':active_plan_code'),
    'cash','P4-ACCOUNTING-RENEW',now(),'P4 active renewal','after_expiry',
    renewal_key,null,false
  );
  select expires_at into renewal_expiry from public.licenses where id=':license_id'::uuid;
  if renewal_result->>'receipt_id' is null or renewal_expiry <= first_expiry
    then raise exception 'TEST_FAILED: active renewal did not preserve remaining term';
  end if;
end;
$$;
rollback;

-- ACCOUNTING cannot manage licenses, commercial data, settings or audit.
do $$
begin
  perform set_config('request.jwt.claim.sub', ':accounting_user_id', true);
  perform public.admin_update_license(':license_id'::uuid,'extend',jsonb_build_object('days',1,'reason','P4 denied'));
  raise exception 'TEST_FAILED: accounting manually managed a license';
exception when insufficient_privilege then null;
end;
$$;
do $$
begin
  perform set_config('request.jwt.claim.sub', ':accounting_user_id', true);
  perform public.admin_list_commercial_leads(':project_id'::uuid);
  raise exception 'TEST_FAILED: accounting accessed commercial data';
exception when insufficient_privilege then null;
end;
$$;
do $$
begin
  perform set_config('request.jwt.claim.sub', ':accounting_user_id', true);
  perform public.admin_get_whatsapp_settings(':project_id'::uuid);
  raise exception 'TEST_FAILED: accounting accessed global WhatsApp administration';
exception when insufficient_privilege then null;
end;
$$;
do $$
begin
  perform set_config('request.jwt.claim.sub', ':accounting_user_id', true);
  perform public.admin_list_audit_events(':project_id'::uuid,10);
  raise exception 'TEST_FAILED: accounting accessed reserved audit';
exception when insufficient_privilege then null;
end;
$$;

-- MARKETING can manage campaign, lead, status, note, responsible and history.
begin;
do $$
declare campaign_id uuid; lead_id uuid; history_count bigint;
begin
  perform set_config('request.jwt.claim.sub', ':marketing_user_id', true);
  campaign_id := public.admin_save_commercial_campaign(
    ':project_id'::uuid,null,'P4 Marketing','instagram','social','active',current_date,null
  );
  lead_id := public.admin_save_commercial_lead(
    ':project_id'::uuid,null,'P4 Lead','+5351234590',null,'instagram','social',
    campaign_id,'P4 Marketing',null,null,'contacted','Initial note',
    ':marketing_user_id'::uuid,now()+interval '1 day',null
  );
  perform public.admin_add_commercial_lead_note(':project_id'::uuid,lead_id,'Follow-up note');
  select count(*) into history_count
  from public.admin_list_commercial_lead_history(':project_id'::uuid,lead_id);
  if history_count < 2 then raise exception 'TEST_FAILED: commercial history incomplete'; end if;
end;
$$;
rollback;

-- MARKETING cannot charge or manage licenses/members/settings.
do $$
begin
  perform set_config('request.jwt.claim.sub', ':marketing_user_id', true);
  perform public.admin_preview_charge_plan(':license_id'::uuid,':active_plan_code','after_expiry');
  raise exception 'TEST_FAILED: marketing can charge';
exception when insufficient_privilege then null;
end;
$$;
do $$
begin
  perform set_config('request.jwt.claim.sub', ':marketing_user_id', true);
  perform public.admin_update_license(':license_id'::uuid,'extend',jsonb_build_object('days',1,'reason','P4 denied'));
  raise exception 'TEST_FAILED: marketing managed a license';
exception when insufficient_privilege then null;
end;
$$;
do $$
begin
  perform set_config('request.jwt.claim.sub', ':marketing_user_id', true);
  perform public.admin_upsert_project_member(':project_id'::uuid,'nobody@example.com','accounting');
  raise exception 'TEST_FAILED: marketing managed members';
exception when insufficient_privilege then null;
end;
$$;

-- Unauthorized users and cross-project identifiers are rejected.
do $$
begin
  perform set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
  perform public.admin_list_registered_clients(':project_id'::uuid);
  raise exception 'TEST_FAILED: unauthorized user called admin RPC';
exception when insufficient_privilege then null;
end;
$$;
do $$
begin
  perform set_config('request.jwt.claim.sub', ':owner_user_id', true);
  perform public.admin_save_commercial_campaign(
    ':project_id'::uuid,':project_b_campaign_id'::uuid,'P4 cross tenant','direct',null,'active',null,null
  );
  raise exception 'TEST_FAILED: campaign crossed project boundary';
exception when no_data_found then null;
end;
$$;

-- Public WhatsApp read exposes only the client-safe RPC contract.
select public.get_public_whatsapp_settings(':project_id'::uuid);

-- Audit triggers required by the integrated flows.
do $$
begin
  if not exists(select 1 from pg_trigger where tgname='audit_project_members_changes' and not tgisinternal)
    then raise exception 'TEST_FAILED: member audit missing'; end if;
  if not exists(select 1 from pg_trigger where tgname='audit_commercial_leads_changes' and not tgisinternal)
    then raise exception 'TEST_FAILED: commercial audit missing'; end if;
  if not exists(select 1 from pg_trigger where tgname='audit_project_whatsapp_settings_changes' and not tgisinternal)
    then raise exception 'TEST_FAILED: WhatsApp audit missing'; end if;
end;
$$;
