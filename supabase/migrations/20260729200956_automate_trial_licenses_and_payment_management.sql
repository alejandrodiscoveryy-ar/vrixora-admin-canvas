alter table public.projects
  add column default_trial_plan text
  references public.license_plans(code)
  on update cascade
  on delete restrict;

comment on column public.projects.default_trial_plan is
  'Active plan automatically assigned when a new profile is registered. NULL disables automatic licensing.';

update public.projects
set default_trial_plan = 'trial'
where slug = 'tuktuk-control'
  and exists (
    select 1
    from public.license_plans
    where code = 'trial'
      and active
  );

create or replace function app_private.provision_initial_licenses(target_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if target_profile_id is null then
    return 0;
  end if;

  insert into public.licenses (
    project_id,
    user_id,
    license_key,
    license_type,
    plan,
    status,
    activated_at,
    created_by,
    notes
  )
  select
    project.id,
    profile.id,
    app_private.generate_license_key(),
    plan.license_type,
    plan.code,
    case
      when plan.duration_days is null
        or profile.created_at + make_interval(days => plan.duration_days) > now()
        then 'active'
      else 'expired'
    end,
    profile.created_at,
    project.owner_id,
    'Licencia inicial generada automáticamente al registrar el usuario'
  from public.profiles as profile
  join public.projects as project
    on project.status = 'active'
   and project.default_trial_plan is not null
  join public.license_plans as plan
    on plan.code = project.default_trial_plan
   and plan.active
  where profile.id = target_profile_id
  on conflict (project_id, user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function app_private.on_profile_created_provision_license()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.provision_initial_licenses(new.id);
  return new;
end;
$$;

revoke all on function app_private.provision_initial_licenses(uuid)
  from public, anon, authenticated;
revoke all on function app_private.on_profile_created_provision_license()
  from public, anon, authenticated;

drop trigger if exists provision_initial_license_after_profile_insert
  on public.profiles;
create trigger provision_initial_license_after_profile_insert
after insert on public.profiles
for each row
execute function app_private.on_profile_created_provision_license();

do $$
declare
  profile_id uuid;
begin
  for profile_id in
    select id
    from public.profiles
  loop
    perform app_private.provision_initial_licenses(profile_id);
  end loop;
end;
$$;

create or replace function public.admin_record_license_payment(
  target_license_id uuid,
  target_plan text,
  target_method text,
  target_reference text,
  target_notes text default null,
  target_override_amount numeric default null,
  target_adjustment_reason text default null,
  target_payment_status text default 'paid'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  current_license public.licenses%rowtype;
  plan_config public.license_plans%rowtype;
  recorded_payment public.payments%rowtype;
  paid_amount numeric;
  discount_amount numeric;
begin
  select *
  into current_license
  from public.licenses
  where id = target_license_id
  for share;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_owner(current_license.project_id);

  select *
  into plan_config
  from public.license_plans
  where code = target_plan
    and active
  for share;

  if not found then
    raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002';
  end if;

  if target_payment_status not in (
    'pending',
    'paid',
    'cancelled',
    'refunded',
    'complimentary'
  ) then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;

  paid_amount := case
    when target_payment_status = 'complimentary' then 0
    else coalesce(target_override_amount, plan_config.price)
  end;

  if paid_amount <> plan_config.price
     and nullif(btrim(target_adjustment_reason), '') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  if paid_amount < 0 or paid_amount > plan_config.price then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;

  discount_amount := plan_config.price - paid_amount;

  insert into public.payments (
    project_id,
    user_id,
    license_id,
    plan,
    list_price,
    discount,
    amount,
    currency,
    method,
    reference,
    status,
    recorded_by,
    notes
  )
  values (
    current_license.project_id,
    current_license.user_id,
    current_license.id,
    plan_config.code,
    plan_config.price,
    discount_amount,
    paid_amount,
    plan_config.currency,
    target_method,
    btrim(target_reference),
    target_payment_status,
    actor,
    concat_ws(
      ' · ',
      nullif(btrim(target_notes), ''),
      nullif(btrim(target_adjustment_reason), '')
    )
  )
  returning * into recorded_payment;

  insert into public.license_audit_log (
    project_id,
    license_id,
    action,
    detail,
    actor_id,
    metadata
  )
  values (
    current_license.project_id,
    current_license.id,
    'payment_recorded',
    'Pago registrado desde el panel administrativo',
    actor,
    jsonb_build_object(
      'payment_id', recorded_payment.id,
      'status', recorded_payment.status,
      'amount', recorded_payment.amount,
      'currency', recorded_payment.currency,
      'plan', recorded_payment.plan
    )
  );

  return recorded_payment;
end;
$$;

create or replace function public.admin_update_payment_status(
  target_payment_id uuid,
  target_status text,
  target_notes text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  previous_payment public.payments%rowtype;
  updated_payment public.payments%rowtype;
begin
  select *
  into previous_payment
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_owner(previous_payment.project_id);

  if target_status not in (
    'pending',
    'paid',
    'cancelled',
    'refunded',
    'complimentary'
  ) then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;

  if target_status = 'complimentary' and previous_payment.amount <> 0 then
    raise exception 'COMPLIMENTARY_PAYMENT_MUST_BE_ZERO' using errcode = '22023';
  end if;

  update public.payments
  set
    status = target_status,
    notes = coalesce(nullif(btrim(target_notes), ''), notes)
  where id = target_payment_id
  returning * into updated_payment;

  insert into public.license_audit_log (
    project_id,
    license_id,
    action,
    detail,
    actor_id,
    metadata
  )
  values (
    updated_payment.project_id,
    updated_payment.license_id,
    'payment_status_updated',
    'Estado del pago actualizado desde el panel administrativo',
    actor,
    jsonb_build_object(
      'payment_id', updated_payment.id,
      'previous_status', previous_payment.status,
      'new_status', updated_payment.status
    )
  );

  return updated_payment;
end;
$$;

revoke all on function public.admin_record_license_payment(
  uuid, text, text, text, text, numeric, text, text
) from public, anon;
revoke all on function public.admin_update_payment_status(uuid, text, text)
  from public, anon;

grant execute on function public.admin_record_license_payment(
  uuid, text, text, text, text, numeric, text, text
) to authenticated;
grant execute on function public.admin_update_payment_status(uuid, text, text)
  to authenticated;
