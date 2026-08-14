-- P0-D integration verification. Run after applying the matching migration in
-- an isolated database, replacing every :placeholder. Every mutation rolls back.

create or replace function pg_temp.assert_raises(statement text, expected_message text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'TEST_FAILED: expected %, got %',expected_message,sqlerrm;
  end;
  raise exception 'TEST_FAILED: expected error % but statement succeeded',expected_message;
end;
$$;

-- Codes are unique, immutable and private; administrative RPCs enforce grants.
do $$
begin
  if exists(select 1 from public.project_referral_codes group by project_id,user_id having count(*)>1)
     or exists(select 1 from public.project_referral_codes group by project_id,code having count(*)>1) then
    raise exception 'TEST_FAILED: duplicate referral code';
  end if;
  if exists(
    select 1 from (
      select license.project_id,license.user_id from public.licenses license
      union select payment.project_id,payment.user_id from public.payments payment
      union select lead.project_id,lead.user_id from public.commercial_leads lead
        where lead.user_id is not null and lead.archived_at is null
    ) client left join public.project_referral_codes code
      on code.project_id=client.project_id and code.user_id=client.user_id
    where code.user_id is null
  ) then raise exception 'TEST_FAILED: current client without referral code'; end if;
  if has_table_privilege('authenticated','public.project_referral_codes','select')
     or has_table_privilege('anon','public.project_referral_codes','select') then
    raise exception 'TEST_FAILED: referral codes exposed directly';
  end if;
  if has_function_privilege('anon','public.admin_get_referral_overview(uuid)','execute')
     or has_function_privilege('anon','public.admin_link_client_referrer_code(uuid,uuid,text)','execute') then
    raise exception 'TEST_FAILED: anonymous can execute referral RPCs';
  end if;
end;
$$;

-- Validation, project isolation and relationship locking.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_link_client_referrer_code(':project_id'::uuid,':referrer_user_id'::uuid,':referrer_code')$$,
  'SELF_REFERRAL_NOT_ALLOWED'
);
select pg_temp.assert_raises(
  $$select public.admin_link_client_referrer_code(':project_id'::uuid,':referred_user_id'::uuid,'NO-EXISTE')$$,
  'REFERRAL_CODE_NOT_FOUND'
);
select pg_temp.assert_raises(
  $$select public.admin_link_client_referrer_code(':project_id'::uuid,':paid_referred_user_id'::uuid,':alternate_referrer_code')$$,
  'REFERRAL_RELATIONSHIP_LOCKED'
);
select pg_temp.assert_raises(
  $$select public.admin_link_client_referrer_code(':other_project_id'::uuid,':referred_user_id'::uuid,':referrer_code')$$,
  'PERMISSION_DENIED'
);
rollback;

-- Applied rewards on the same license reverse additively in either order.
begin;
do $$ begin
  if (select count(*) from public.referral_reward_ledger reward
    where reward.qualifying_payment_id in (
      ':older_applied_reward_payment_id'::uuid,':newer_applied_reward_payment_id'::uuid
    ) and reward.status='applied' and reward.applied_license_id=':shared_reward_license_id'::uuid)<>2 then
    raise exception 'TEST_SETUP_FAILED: two applied rewards on shared license required';
  end if;
end $$;
update public.payments set status='refunded' where id=':older_applied_reward_payment_id'::uuid;
update public.payments set status='refunded' where id=':newer_applied_reward_payment_id'::uuid;
do $$
declare base_expiry timestamptz; final_expiry timestamptz;
begin
  select min(reward.previous_expires_at) into base_expiry
  from public.referral_reward_ledger reward
  where reward.qualifying_payment_id in (
    ':older_applied_reward_payment_id'::uuid,':newer_applied_reward_payment_id'::uuid
  );
  select license.expires_at into final_expiry from public.licenses license
  where license.id=':shared_reward_license_id'::uuid;
  if final_expiry is distinct from base_expiry
     or (select count(*) from public.referral_reward_ledger reward
       where reward.qualifying_payment_id in (
         ':older_applied_reward_payment_id'::uuid,':newer_applied_reward_payment_id'::uuid
       ) and reward.status='reverted')<>2 then
    raise exception 'TEST_FAILED: additive reversal failed in oldest-first order';
  end if;
end $$;
rollback;

begin;
do $$ begin
  if (select count(*) from public.referral_reward_ledger reward
    where reward.qualifying_payment_id in (
      ':older_applied_reward_payment_id'::uuid,':newer_applied_reward_payment_id'::uuid
    ) and reward.status='applied' and reward.applied_license_id=':shared_reward_license_id'::uuid)<>2 then
    raise exception 'TEST_SETUP_FAILED: two applied rewards on shared license required';
  end if;
end $$;
update public.payments set status='refunded' where id=':newer_applied_reward_payment_id'::uuid;
update public.payments set status='refunded' where id=':older_applied_reward_payment_id'::uuid;
do $$
declare base_expiry timestamptz; final_expiry timestamptz;
begin
  select min(reward.previous_expires_at) into base_expiry
  from public.referral_reward_ledger reward
  where reward.qualifying_payment_id in (
    ':older_applied_reward_payment_id'::uuid,':newer_applied_reward_payment_id'::uuid
  );
  select license.expires_at into final_expiry from public.licenses license
  where license.id=':shared_reward_license_id'::uuid;
  if final_expiry is distinct from base_expiry
     or (select count(*) from public.referral_reward_ledger reward
       where reward.qualifying_payment_id in (
         ':older_applied_reward_payment_id'::uuid,':newer_applied_reward_payment_id'::uuid
       ) and reward.status='reverted')<>2 then
    raise exception 'TEST_FAILED: additive reversal failed in newest-first order';
  end if;
end $$;
rollback;

-- P0-C finishes the commercial expiry before P0-D applies all earned days.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select now() as referral_conversion_charged_at \gset
select public.admin_create_preinvoice(
  ':project_id'::uuid,':earned_without_license_user_id'::uuid,
  ':active_plan_code',null,null,null,false
) as referral_conversion_invoice_id \gset
select public.admin_confirm_preinvoice_payment(
  ':project_id'::uuid,:'referral_conversion_invoice_id'::uuid,
  (select charge_amount from public.preinvoices where id=:'referral_conversion_invoice_id'::uuid),
  (select charge_currency from public.preinvoices where id=:'referral_conversion_invoice_id'::uuid),
  'cash','P0D-CONVERSION',:'referral_conversion_charged_at'::timestamptz,null,gen_random_uuid()
);
do $$
declare license public.licenses%rowtype; invoice public.preinvoices%rowtype;
  earned_days integer; applied_rewards integer; commercial_expiry timestamptz;
begin
  select * into invoice from public.preinvoices where id=:'referral_conversion_invoice_id'::uuid;
  select * into license from public.licenses where project_id=':project_id'::uuid
    and user_id=':earned_without_license_user_id'::uuid;
  select coalesce(sum(reward_days),0) into earned_days from public.referral_reward_ledger
  where project_id=':project_id'::uuid and referrer_user_id=':earned_without_license_user_id'::uuid
    and status='applied' and not is_test;
  select count(*) into applied_rewards from public.referral_reward_ledger
  where project_id=':project_id'::uuid and referrer_user_id=':earned_without_license_user_id'::uuid
    and status='applied' and not is_test;
  commercial_expiry:=:'referral_conversion_charged_at'::timestamptz
    +make_interval(days=>(invoice.plan_snapshot->>'duration_days')::integer);
  if earned_days<=0 or applied_rewards<2
     or exists(select 1 from public.referral_reward_ledger where project_id=':project_id'::uuid
       and referrer_user_id=':earned_without_license_user_id'::uuid and status='earned' and not is_test)
     or license.expires_at<>commercial_expiry+make_interval(days=>earned_days) then
    raise exception 'TEST_FAILED: P0-C overwrote accumulated earned referral days';
  end if;
end $$;
rollback;

-- Legacy real RPC accepts only the stable code owned by the declared referrer.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_register_referral_relationship(
    ':project_id'::uuid,':referrer_user_id'::uuid,':unconverted_user_id'::uuid,
    'ARBITRARY-CODE',false)$$,
  'REFERRAL_CODE_NOT_FOUND'
);
select pg_temp.assert_raises(
  $$select public.admin_register_referral_relationship(
    ':project_id'::uuid,':referrer_user_id'::uuid,':unconverted_user_id'::uuid,
    ':alternate_referrer_code',false)$$,
  'REFERRAL_CODE_OWNER_MISMATCH'
);
rollback;

-- A first real relationship cannot be attributed after conversion.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_link_client_referrer_code(
    ':project_id'::uuid,':paid_without_referral_user_id'::uuid,':referrer_code')$$,
  'REFERRAL_RELATIONSHIP_LOCKED'
);
rollback;

-- A test payment does not block a later real referral relationship.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select public.admin_link_client_referrer_code(
  ':project_id'::uuid,':test_paid_without_referral_user_id'::uuid,':referrer_code'
) as test_payment_link_id \gset
do $$ begin
  if not exists(select 1 from public.referral_relationships relationship
    where relationship.id=:'test_payment_link_id'::uuid and not relationship.is_test) then
    raise exception 'TEST_FAILED: test payment blocked real referral link';
  end if;
end $$;
rollback;

-- First real paid payment creates one configured reward; renewal creates none.
begin;
update public.project_referral_settings set reward_days=23 where project_id=':project_id'::uuid;
update public.payments set status='paid' where id=':first_real_payment_id'::uuid;
do $$
declare reward public.referral_reward_ledger%rowtype;
begin
  select * into reward from public.referral_reward_ledger
  where project_id=':project_id'::uuid and referred_user_id=':referred_user_id'::uuid and not is_test;
  if not found or reward.qualifying_payment_id<>':first_real_payment_id'::uuid or reward.reward_days<>23 then
    raise exception 'TEST_FAILED: first payment reward/configuration incorrect';
  end if;
end $$;
update public.payments set status='paid' where id=':renewal_payment_id'::uuid;
do $$ begin
  if (select count(*) from public.referral_reward_ledger where project_id=':project_id'::uuid
      and referred_user_id=':referred_user_id'::uuid and not is_test)<>1 then
    raise exception 'TEST_FAILED: renewal generated duplicate reward';
  end if;
end $$;
rollback;

-- Test payments never create real rewards or extend real licenses.
begin;
create temporary table p0d_before_test on commit drop as select id,expires_at from public.licenses
where project_id=':project_id'::uuid;
update public.payments set status='paid' where id=':test_payment_id'::uuid;
do $$ begin
  if exists(select 1 from public.referral_reward_ledger where qualifying_payment_id=':test_payment_id'::uuid and not is_test)
     or exists(select 1 from p0d_before_test before join public.licenses license using(id)
       where before.expires_at is distinct from license.expires_at) then
    raise exception 'TEST_FAILED: test payment contaminated real referrals';
  end if;
end $$;
rollback;

-- Eligible paid license receives days; trial/admin licenses do not.
begin;
create temporary table p0d_before_license on commit drop as
select id,user_id,expires_at,license_type from public.licenses
where id in (':eligible_license_id'::uuid,':trial_license_id'::uuid,':admin_license_id'::uuid);
select app_private.p0d_apply_earned_rewards(':project_id'::uuid,':eligible_referrer_id'::uuid);
select app_private.p0d_apply_earned_rewards(':project_id'::uuid,':trial_referrer_id'::uuid);
select app_private.p0d_apply_earned_rewards(':project_id'::uuid,':admin_referrer_id'::uuid);
do $$ begin
  if not exists(select 1 from p0d_before_license before join public.licenses license using(id)
    where license.id=':eligible_license_id'::uuid and license.expires_at>before.expires_at) then
    raise exception 'TEST_FAILED: eligible paid license not extended';
  end if;
  if exists(select 1 from p0d_before_license before join public.licenses license using(id)
    where license.id in (':trial_license_id'::uuid,':admin_license_id'::uuid)
      and license.expires_at is distinct from before.expires_at) then
    raise exception 'TEST_FAILED: trial/admin license extended';
  end if;
  if not exists(select 1 from public.referral_reward_ledger where referrer_user_id=':trial_referrer_id'::uuid and status='earned') then
    raise exception 'TEST_FAILED: trial reward did not remain earned';
  end if;
end $$;
rollback;

-- A later paid conversion applies all accumulated earned rewards.
begin;
update public.licenses set license_type='standard',status='active',expires_at=now()+interval '30 days'
where id=':trial_license_id'::uuid;
do $$
declare expected_days integer; before_expiry timestamptz; after_expiry timestamptz;
begin
  select sum(reward_days) into expected_days from public.referral_reward_ledger
  where project_id=':project_id'::uuid and referrer_user_id=':trial_referrer_id'::uuid and status='applied' and not is_test;
  select expires_at into after_expiry from public.licenses where id=':trial_license_id'::uuid;
  select min(previous_expires_at) into before_expiry from public.referral_reward_ledger
  where project_id=':project_id'::uuid and referrer_user_id=':trial_referrer_id'::uuid and status='applied' and not is_test;
  if expected_days is null or after_expiry<>before_expiry+make_interval(days=>expected_days) then
    raise exception 'TEST_FAILED: accumulated earned rewards not applied';
  end if;
end $$;
rollback;

-- Refunding/cancelling the qualifying payment reverts ledger and expiry safely.
begin;
update public.payments set status='refunded' where id=':qualifying_payment_id'::uuid;
do $$ begin
  if not exists(select 1 from public.referral_reward_ledger
    where qualifying_payment_id=':qualifying_payment_id'::uuid and status='reverted' and reverted_at is not null) then
    raise exception 'TEST_FAILED: qualifying payment reversal not reconciled';
  end if;
end $$;
rollback;

-- Read overview excludes test relationships/rewards and unauthorized users.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
do $$
declare overview jsonb;
begin
  overview:=public.admin_get_referral_overview(':project_id'::uuid);
  if (overview->>'relationships')::integer<>(select count(*) from public.referral_relationships where project_id=':project_id'::uuid and not is_test)
     or (overview->>'delivered_days')::integer<>(select coalesce(sum(reward_days),0) from public.referral_reward_ledger where project_id=':project_id'::uuid and status='applied' and not is_test) then
    raise exception 'TEST_FAILED: overview includes test data';
  end if;
end $$;
rollback;

begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_get_referral_overview(':project_id'::uuid)$$,
  'PERMISSION_DENIED:commercial.view'
);
rollback;
