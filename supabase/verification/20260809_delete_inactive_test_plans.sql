-- Run in an isolated database after applying all migrations.
-- Required variables: :project_id, :owner_user_id, :accounting_user_id,
-- :inactive_empty_plan, :inactive_trial_plan, :inactive_paid_plan,
-- :trial_license_id.

-- Owner can delete an inactive plan without dependencies.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_delete_inactive_license_plan(':project_id'::uuid, ':inactive_empty_plan');
rollback;

-- An inactive plan with no licenses can also be deleted when a stale project
-- default still references it; the project is moved to an active trial plan.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
do $$
declare
  fallback_code text;
  result jsonb;
begin
  select plan.code into fallback_code
  from public.license_plans plan
  where plan.project_id = ':project_id'::uuid
    and plan.code <> ':inactive_empty_plan'
    and plan.active
    and plan.license_type = 'trial'
  order by plan.is_featured desc, plan.code
  limit 1;
  if fallback_code is null then
    raise exception 'TEST_SETUP_FAILED: active trial fallback missing';
  end if;

  if exists (
    select 1 from public.licenses license
    where license.project_id = ':project_id'::uuid
      and license.plan = ':inactive_empty_plan'
  ) then
    raise exception 'TEST_SETUP_FAILED: inactive empty plan has licenses';
  end if;

  update public.projects
  set default_trial_plan = ':inactive_empty_plan'
  where id = ':project_id'::uuid;

  result := public.admin_delete_inactive_license_plan(
    ':project_id'::uuid,
    ':inactive_empty_plan'
  );

  if exists (
    select 1 from public.license_plans plan
    where plan.project_id = ':project_id'::uuid
      and plan.code = ':inactive_empty_plan'
  ) then
    raise exception 'TEST_FAILED: unassigned default plan still exists';
  end if;
  if (select default_trial_plan from public.projects where id = ':project_id'::uuid)
       is distinct from fallback_code then
    raise exception 'TEST_FAILED: project default was not reassigned';
  end if;
  if coalesce((result->>'default_trial_plan_reassigned')::boolean, false) is not true then
    raise exception 'TEST_FAILED: result did not report default reassignment';
  end if;
end;
$$;
rollback;

-- Trial licenses without payments are retained and reassigned to the active default trial plan.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
do $$
declare
  result jsonb;
  previous_license public.licenses%rowtype;
  reassigned_license public.licenses%rowtype;
  fallback_plan public.license_plans%rowtype;
  payment_count_before bigint;
  payment_count_after bigint;
  receipt_count_before bigint;
  receipt_count_after bigint;
begin
  select * into previous_license
  from public.licenses license
  where license.id = ':trial_license_id'::uuid
    and license.project_id = ':project_id'::uuid
    and license.plan = ':inactive_trial_plan';
  if not found then raise exception 'TEST_SETUP_FAILED: trial license missing'; end if;

  select plan.* into fallback_plan
  from public.projects project
  join public.license_plans plan
    on plan.project_id = project.id and plan.code = project.default_trial_plan
  where project.id = ':project_id'::uuid;
  if not found then raise exception 'TEST_SETUP_FAILED: fallback plan missing'; end if;

  select count(*) into payment_count_before
  from public.payments where project_id = ':project_id'::uuid;
  select count(*) into receipt_count_before
  from public.billing_receipts where project_id = ':project_id'::uuid;

  result := public.admin_delete_inactive_license_plan(':project_id'::uuid, ':inactive_trial_plan');
  if (result->>'reassigned_licenses')::integer < 1 then
    raise exception 'TEST_FAILED: trial licenses were not reassigned';
  end if;

  if exists (
    select 1 from public.license_plans
    where project_id = ':project_id'::uuid and code = ':inactive_trial_plan'
  ) then raise exception 'TEST_FAILED: old plan still exists'; end if;

  select * into reassigned_license
  from public.licenses license
  where license.id = previous_license.id;
  if not found then raise exception 'TEST_FAILED: trial license was deleted'; end if;
  if reassigned_license.plan is distinct from fallback_plan.code
    then raise exception 'TEST_FAILED: fallback plan mismatch'; end if;
  if reassigned_license.license_type is distinct from fallback_plan.license_type
    then raise exception 'TEST_FAILED: fallback license type mismatch'; end if;
  if reassigned_license.duration_days is distinct from fallback_plan.duration_days
    then raise exception 'TEST_FAILED: fallback duration mismatch'; end if;
  if reassigned_license.max_devices is distinct from fallback_plan.max_devices
    then raise exception 'TEST_FAILED: fallback device limit mismatch'; end if;
  if reassigned_license.features is distinct from fallback_plan.features
    then raise exception 'TEST_FAILED: fallback features mismatch'; end if;
  if reassigned_license.activated_at is distinct from previous_license.activated_at
    then raise exception 'TEST_FAILED: activation date changed'; end if;
  if reassigned_license.expires_at is distinct from previous_license.expires_at
    then raise exception 'TEST_FAILED: expiration date changed'; end if;

  select count(*) into payment_count_after
  from public.payments where project_id = ':project_id'::uuid;
  select count(*) into receipt_count_after
  from public.billing_receipts where project_id = ':project_id'::uuid;
  if payment_count_after is distinct from payment_count_before
    then raise exception 'TEST_FAILED: payments changed'; end if;
  if receipt_count_after is distinct from receipt_count_before
    then raise exception 'TEST_FAILED: receipts changed'; end if;
end;
$$;
rollback;

-- Financial dependencies always block physical deletion.
do $$
declare
  payment_count_before bigint;
  receipt_count_before bigint;
begin
  perform set_config('request.jwt.claim.sub', ':owner_user_id', true);
  select count(*) into payment_count_before
  from public.payments where project_id = ':project_id'::uuid;
  select count(*) into receipt_count_before
  from public.billing_receipts where project_id = ':project_id'::uuid;
  begin
    perform public.admin_delete_inactive_license_plan(':project_id'::uuid, ':inactive_paid_plan');
    raise exception 'TEST_FAILED: financially referenced plan was deleted';
  exception when foreign_key_violation then
    if sqlerrm <> 'PLAN_HAS_FINANCIAL_DEPENDENCIES' then raise; end if;
  end;
  if not exists (
    select 1 from public.license_plans
    where project_id = ':project_id'::uuid and code = ':inactive_paid_plan'
  ) then raise exception 'TEST_FAILED: blocked plan was deleted'; end if;
  if (select count(*) from public.payments where project_id = ':project_id'::uuid)
       is distinct from payment_count_before
    then raise exception 'TEST_FAILED: blocked deletion changed payments'; end if;
  if (select count(*) from public.billing_receipts where project_id = ':project_id'::uuid)
       is distinct from receipt_count_before
    then raise exception 'TEST_FAILED: blocked deletion changed receipts'; end if;
end;
$$;

-- Accounting cannot delete plans even when they are inactive and empty.
do $$
begin
  perform set_config('request.jwt.claim.sub', ':accounting_user_id', true);
  perform public.admin_delete_inactive_license_plan(':project_id'::uuid, ':inactive_empty_plan');
  raise exception 'TEST_FAILED: accounting deleted a plan';
exception when insufficient_privilege then null;
end;
$$;

-- Active plans cannot be deleted.
do $$
begin
  perform set_config('request.jwt.claim.sub', ':owner_user_id', true);
  perform public.admin_delete_inactive_license_plan(
    ':project_id'::uuid,
    (select code from public.license_plans where project_id=':project_id'::uuid and active limit 1)
  );
  raise exception 'TEST_FAILED: active plan was deleted';
exception when invalid_parameter_value then
  if sqlerrm <> 'PLAN_MUST_BE_INACTIVE' then raise; end if;
end;
$$;
