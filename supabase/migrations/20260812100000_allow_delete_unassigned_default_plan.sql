-- Allow deleting an inactive plan with no licenses when it is still configured
-- as the project's default trial plan. The default is moved atomically to an
-- active trial fallback before the plan is deleted.

create or replace function public.admin_delete_inactive_license_plan(
  target_project_id uuid,
  target_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  target_plan public.license_plans%rowtype;
  fallback_plan public.license_plans%rowtype;
  reassigned_count integer := 0;
  payment_count bigint;
  receipt_count bigint;
  paid_license_count bigint;
  non_trial_license_count bigint;
  has_licenses boolean;
  is_default_trial_plan boolean;
begin
  actor := app_private.require_project_permission(target_project_id, 'plans.manage');

  select plan.* into target_plan
  from public.license_plans plan
  where plan.project_id = target_project_id
    and plan.code = target_plan_code
  for update;

  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_plan.active then
    raise exception 'PLAN_MUST_BE_INACTIVE' using errcode = '22023';
  end if;

  perform 1
  from public.licenses license
  where license.project_id = target_project_id and license.plan = target_plan.code
  for update;

  select exists (
    select 1
    from public.licenses license
    where license.project_id = target_project_id
      and license.plan = target_plan.code
  ) into has_licenses;

  select exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.default_trial_plan = target_plan.code
  ) into is_default_trial_plan;

  select count(*) into payment_count
  from public.payments payment
  where payment.project_id = target_project_id
    and payment.plan = target_plan.code;

  select count(*) into paid_license_count
  from public.licenses license
  where license.project_id = target_project_id
    and license.plan = target_plan.code
    and exists (
      select 1 from public.payments payment
      where payment.project_id = license.project_id
        and payment.license_id = license.id
    );

  select count(*) into receipt_count
  from public.billing_receipts receipt
  join public.payments payment on payment.id = receipt.payment_id
  where receipt.project_id = target_project_id
    and (payment.plan = target_plan.code or exists (
      select 1 from public.licenses license
      where license.id = receipt.license_id
        and license.project_id = target_project_id
        and license.plan = target_plan.code
    ));

  if payment_count > 0 or receipt_count > 0 or paid_license_count > 0 then
    raise exception 'PLAN_HAS_FINANCIAL_DEPENDENCIES' using errcode = '23503';
  end if;

  select count(*) into non_trial_license_count
  from public.licenses license
  where license.project_id = target_project_id
    and license.plan = target_plan.code
    and license.license_type <> 'trial';

  if non_trial_license_count > 0 then
    raise exception 'PLAN_HAS_NON_TRIAL_LICENSES' using errcode = '23503';
  end if;

  if has_licenses or is_default_trial_plan then
    select plan.* into fallback_plan
    from public.license_plans plan
    where plan.project_id = target_project_id
      and plan.code <> target_plan.code
      and plan.active
      and plan.license_type = 'trial'
    order by plan.is_featured desc, plan.code
    limit 1
    for share;

    if not found then
      raise exception 'DEFAULT_TRIAL_PLAN_REQUIRED' using errcode = '23503';
    end if;
  end if;

  if is_default_trial_plan then
    update public.projects
    set default_trial_plan = fallback_plan.code
    where id = target_project_id
      and default_trial_plan = target_plan.code;
  end if;

  if has_licenses then
    lock table public.licenses in access exclusive mode;
    alter table public.licenses disable trigger licenses_apply_configuration;

    update public.licenses
    set plan = fallback_plan.code,
        license_type = fallback_plan.license_type,
        duration_days = fallback_plan.duration_days,
        max_devices = fallback_plan.max_devices,
        features = fallback_plan.features
    where project_id = target_project_id and plan = target_plan.code;
    get diagnostics reassigned_count = row_count;

    alter table public.licenses enable trigger licenses_apply_configuration;
  end if;

  insert into public.audit_events(
    project_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    target_project_id,
    actor,
    'delete_inactive_plan',
    'license_plans',
    target_plan.code,
    jsonb_build_object(
      'deleted_plan', to_jsonb(target_plan),
      'trial_licenses_reassigned', reassigned_count,
      'fallback_plan', case
        when reassigned_count > 0 or is_default_trial_plan then fallback_plan.code
        else null
      end,
      'default_trial_plan_reassigned', is_default_trial_plan,
      'deleted_at', now()
    )
  );

  delete from public.license_plans
  where project_id = target_project_id and code = target_plan.code;

  return jsonb_build_object(
    'deleted_plan_code', target_plan.code,
    'reassigned_licenses', reassigned_count,
    'default_trial_plan_reassigned', is_default_trial_plan
  );
end;
$$;

revoke all on function public.admin_delete_inactive_license_plan(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_delete_inactive_license_plan(uuid, text)
  to authenticated;

comment on function public.admin_delete_inactive_license_plan(uuid, text) is
  'Owner-only transactional deletion of an inactive plan; preserves financial history, reassigns unpaid trials, and moves a stale default trial reference to an active fallback.';
