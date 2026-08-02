create or replace function app_private.billing_plan_preview(
  target_license_id uuid,
  target_plan text,
  target_rule text,
  target_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_license public.licenses%rowtype;
  config public.license_plans%rowtype;
  effective_rule text;
  new_start timestamptz;
  new_expiry timestamptz;
begin
  select * into current_license
  from public.licenses
  where id = target_license_id;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_license.license_type = 'admin' then
    raise exception 'SPECIAL_LICENSE_PROTECTED' using errcode = '42501';
  end if;

  select * into config
  from public.license_plans
  where project_id = current_license.project_id
    and code = target_plan
    and active;

  if not found then
    raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002';
  end if;
  if target_rule not in ('apply_now', 'after_expiry') then
    raise exception 'INVALID_APPLICATION_RULE' using errcode = '22023';
  end if;

  effective_rule := case
    when current_license.license_type = 'trial' then 'apply_now'
    when current_license.status <> 'active'
      or current_license.expires_at is null
      or current_license.expires_at <= target_at then 'apply_now'
    when current_license.plan = config.code then 'after_expiry'
    else target_rule
  end;

  new_start := case
    when effective_rule = 'after_expiry' then current_license.expires_at
    else target_at
  end;
  new_expiry := case
    when config.duration_days is null then null
    else new_start + make_interval(days => config.duration_days)
  end;

  return jsonb_build_object(
    'license_id', current_license.id,
    'previous_plan', current_license.plan,
    'new_plan', config.code,
    'license_type', config.license_type,
    'previous_expires_at', current_license.expires_at,
    'new_started_at', new_start,
    'new_expires_at', new_expiry,
    'duration_days', config.duration_days,
    'max_devices', config.max_devices,
    'price', config.price,
    'currency', config.currency,
    'application_rule', effective_rule,
    'is_trial_conversion', current_license.license_type = 'trial'
  );
end;
$$;

revoke all on function app_private.billing_plan_preview(uuid, text, text, timestamptz)
  from public, anon, authenticated;
