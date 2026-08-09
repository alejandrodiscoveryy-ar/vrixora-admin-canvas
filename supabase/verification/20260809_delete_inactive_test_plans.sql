-- Run in an isolated database after applying all migrations.
-- Required variables: :project_id, :owner_user_id, :accounting_user_id,
-- :inactive_empty_plan, :inactive_trial_plan, :inactive_paid_plan.

-- Owner can delete an inactive plan without dependencies.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_delete_inactive_license_plan(':project_id'::uuid, ':inactive_empty_plan');
rollback;

-- Trial licenses without payments are retained and reassigned to the active default trial plan.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
do $$
declare result jsonb; license_count bigint;
begin
  result := public.admin_delete_inactive_license_plan(':project_id'::uuid, ':inactive_trial_plan');
  if (result->>'reassigned_licenses')::integer < 1 then
    raise exception 'TEST_FAILED: trial licenses were not reassigned';
  end if;
  select count(*) into license_count
  from public.licenses license
  where license.project_id = ':project_id'::uuid
    and license.plan = (
      select project.default_trial_plan from public.projects project
      where project.id = ':project_id'::uuid
    );
  if license_count < 1 then raise exception 'TEST_FAILED: reassigned license missing'; end if;
end;
$$;
rollback;

-- Financial dependencies always block physical deletion.
do $$
begin
  perform set_config('request.jwt.claim.sub', ':owner_user_id', true);
  perform public.admin_delete_inactive_license_plan(':project_id'::uuid, ':inactive_paid_plan');
  raise exception 'TEST_FAILED: financially referenced plan was deleted';
exception when foreign_key_violation then
  if sqlerrm <> 'PLAN_HAS_FINANCIAL_DEPENDENCIES' then raise; end if;
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
