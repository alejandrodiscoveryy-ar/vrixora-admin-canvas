alter table public.license_plans
  add column license_type text references public.license_types(code) on update cascade on delete restrict,
  add column duration_days integer,
  add column price numeric(14,2) not null default 0,
  add column currency text not null default 'CUP',
  add column description text,
  add column is_featured boolean not null default false;

update public.license_plans
set license_type = case when code = 'admin' then 'admin' else 'monthly' end,
    duration_days = case when code = 'admin' then null else 30 end;

alter table public.license_plans
  alter column license_type set not null,
  add constraint license_plans_duration_days_check check (duration_days is null or duration_days > 0),
  add constraint license_plans_price_check check (price >= 0),
  add constraint license_plans_currency_check check (currency in ('CUP','USD','EUR'));

alter table public.payments drop constraint payments_amount_check;
alter table public.payments
  add column plan text references public.license_plans(code) on update cascade on delete restrict,
  add column list_price numeric(14,2),
  add column discount numeric(14,2) not null default 0,
  add column status text not null default 'paid',
  add column notes text;

update public.payments p
set plan = l.plan, list_price = p.amount
from public.licenses l
where l.id = p.license_id;

alter table public.payments
  alter column plan set not null,
  alter column list_price set not null,
  add constraint payments_amount_check check (amount >= 0),
  add constraint payments_list_price_check check (list_price >= 0),
  add constraint payments_discount_check check (discount >= 0 and discount <= list_price),
  add constraint payments_status_check check (status in ('pending','paid','cancelled','refunded','complimentary')),
  add constraint payments_complimentary_amount_check check (status <> 'complimentary' or amount = 0);

create index payments_project_created_idx on public.payments(project_id, created_at desc);
create index payments_project_status_idx on public.payments(project_id, status);

create or replace function app_private.apply_license_configuration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  type_config public.license_types%rowtype;
  plan_config public.license_plans%rowtype;
  effective_days integer;
begin
  select * into type_config from public.license_types
  where code = new.license_type and active;
  if not found then raise exception 'License type is missing or inactive'; end if;

  select * into plan_config from public.license_plans
  where code = new.plan and active;
  if not found then raise exception 'License plan is missing or inactive'; end if;
  if plan_config.license_type <> new.license_type then
    raise exception 'PLAN_LICENSE_TYPE_MISMATCH';
  end if;

  new.max_devices := coalesce(new.max_devices, plan_config.max_devices, type_config.default_max_devices);
  new.features := type_config.default_features || plan_config.features || coalesce(new.features, '{}'::jsonb);
  if type_config.never_expires then
    new.duration_days := null;
    new.expires_at := null;
  elsif tg_op = 'INSERT' or new.plan is distinct from old.plan
        or new.license_type is distinct from old.license_type then
    effective_days := plan_config.duration_days;
    if effective_days is null or effective_days <= 0 then
      raise exception 'PLAN_DURATION_REQUIRED';
    end if;
    new.duration_days := effective_days;
    new.expires_at := case when new.activated_at is null then null
      else new.activated_at + make_interval(days => effective_days) end;
  end if;
  if new.status = 'revoked' then new.revoked_at := coalesce(new.revoked_at, now());
  else new.revoked_at := null; end if;
  return new;
end;
$$;

create or replace function public.admin_list_license_plans(target_project_id uuid)
returns setof public.license_plans
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_project_owner(target_project_id);
  return query select * from public.license_plans order by is_featured desc, name;
end;
$$;

create or replace function public.admin_save_license_plan(
  target_project_id uuid, target_code text, target_name text, target_license_type text,
  target_duration_days integer, target_price numeric, target_currency text,
  target_max_devices integer, target_features jsonb, target_description text,
  target_is_active boolean, target_is_featured boolean
) returns public.license_plans
language plpgsql security definer set search_path = '' as $$
declare saved public.license_plans%rowtype;
begin
  perform app_private.require_project_owner(target_project_id);
  if nullif(btrim(target_code),'') is null or nullif(btrim(target_name),'') is null then
    raise exception 'PLAN_CODE_AND_NAME_REQUIRED';
  end if;
  insert into public.license_plans
    (code,name,license_type,duration_days,price,currency,max_devices,features,description,active,is_featured)
  values
    (lower(btrim(target_code)),btrim(target_name),target_license_type,target_duration_days,target_price,
     target_currency,target_max_devices,coalesce(target_features,'{}'),nullif(btrim(target_description),''),
     target_is_active,target_is_featured)
  on conflict (code) do update set
    name=excluded.name,license_type=excluded.license_type,duration_days=excluded.duration_days,
    price=excluded.price,currency=excluded.currency,max_devices=excluded.max_devices,
    features=excluded.features,description=excluded.description,active=excluded.active,
    is_featured=excluded.is_featured
  returning * into saved;
  return saved;
end;
$$;

create or replace function public.admin_assign_license_with_payment(
  target_project_id uuid, target_email text, target_plan text, target_started_at timestamptz,
  target_status text, target_method text, target_reference text, target_notes text,
  target_override_amount numeric default null, target_adjustment_reason text default null,
  target_payment_status text default 'paid'
) returns public.licenses
language plpgsql security definer set search_path = '' as $$
declare actor uuid; cfg public.license_plans%rowtype; created public.licenses%rowtype;
  paid numeric; discount numeric;
begin
  actor := app_private.require_project_owner(target_project_id);
  select * into cfg from public.license_plans where code=target_plan and active for share;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE'; end if;
  paid := coalesce(target_override_amount,cfg.price);
  if paid <> cfg.price and nullif(btrim(target_adjustment_reason),'') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED';
  end if;
  if paid < 0 or paid > cfg.price then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  discount := cfg.price-paid;
  created := public.admin_create_license(target_project_id,target_email,cfg.license_type,cfg.code,
    target_status,cfg.duration_days,target_started_at,cfg.max_devices,cfg.features,target_notes,null);
  insert into public.payments(project_id,user_id,license_id,plan,list_price,discount,amount,currency,
    method,reference,status,recorded_by,notes)
  values(target_project_id,created.user_id,created.id,cfg.code,cfg.price,discount,paid,cfg.currency,
    target_method,target_reference,target_payment_status,actor,
    concat_ws(' · ',nullif(btrim(target_notes),''),nullif(btrim(target_adjustment_reason),'')));
  return created;
end;
$$;

create or replace function public.admin_renew_license_with_payment(
  target_license_id uuid, target_plan text, target_method text, target_reference text,
  target_notes text, target_override_amount numeric default null,
  target_adjustment_reason text default null, target_payment_status text default 'paid'
) returns public.licenses
language plpgsql security definer set search_path = '' as $$
declare actor uuid; current_license public.licenses%rowtype; cfg public.license_plans%rowtype;
  renewed public.licenses%rowtype; paid numeric; discount numeric;
begin
  select * into current_license from public.licenses where id=target_license_id for update;
  if not found then raise exception 'LICENSE_NOT_FOUND'; end if;
  actor := app_private.require_project_owner(current_license.project_id);
  select * into cfg from public.license_plans where code=target_plan and active for share;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE'; end if;
  paid := coalesce(target_override_amount,cfg.price);
  if paid <> cfg.price and nullif(btrim(target_adjustment_reason),'') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED';
  end if;
  if paid < 0 or paid > cfg.price then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  discount := cfg.price-paid;
  renewed := public.admin_update_license(target_license_id,'plan',
    jsonb_build_object('plan',cfg.code,'license_type',cfg.license_type,
      'duration_days',cfg.duration_days,'reason',coalesce(target_notes,'Cambio de plan al renovar')));
  if cfg.duration_days is not null then
    update public.licenses set
      expires_at = greatest(now(),coalesce(current_license.expires_at,now()))
        + make_interval(days => cfg.duration_days),
      duration_days = cfg.duration_days,
      status = 'active'
    where id=target_license_id returning * into renewed;
  else
    update public.licenses set expires_at=null,duration_days=null,status='active'
    where id=target_license_id returning * into renewed;
  end if;
  insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata)
  values(current_license.project_id,current_license.id,'license_renewed',
    coalesce(nullif(btrim(target_notes),''),'Renovación con pago'),actor,
    jsonb_build_object('previous_expires_at',current_license.expires_at,
      'new_expires_at',renewed.expires_at,'plan',cfg.code));
  insert into public.payments(project_id,user_id,license_id,plan,list_price,discount,amount,currency,
    method,reference,status,recorded_by,notes)
  values(current_license.project_id,current_license.user_id,current_license.id,cfg.code,cfg.price,
    discount,paid,cfg.currency,target_method,target_reference,target_payment_status,actor,
    concat_ws(' · ',nullif(btrim(target_notes),''),nullif(btrim(target_adjustment_reason),'')));
  return renewed;
end;
$$;

create or replace function public.admin_list_license_payments(target_project_id uuid)
returns table(id uuid,user_email text,license_key text,plan text,list_price numeric,discount numeric,
  amount numeric,currency text,method text,reference text,paid_status text,recorded_by uuid,
  notes text,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_project_owner(target_project_id);
  return query select p.id,pr.email,l.license_key,p.plan,p.list_price,p.discount,p.amount,
    p.currency,p.method,p.reference,p.status,p.recorded_by,p.notes,p.created_at
  from public.payments p join public.profiles pr on pr.id=p.user_id
  left join public.licenses l on l.id=p.license_id
  where p.project_id=target_project_id order by p.created_at desc;
end;
$$;

drop policy if exists "Owners can view all project payments" on public.payments;
drop policy if exists "Employees can view their project payments" on public.payments;
drop policy if exists "Project members can record payments" on public.payments;
drop policy if exists "Project owners can update payments" on public.payments;
drop policy if exists "Project owners can delete payments" on public.payments;
revoke insert,update,delete on public.payments from authenticated;
revoke all on function public.admin_list_license_plans(uuid) from public,anon;
revoke all on function public.admin_save_license_plan(uuid,text,text,text,integer,numeric,text,integer,jsonb,text,boolean,boolean) from public,anon;
revoke all on function public.admin_assign_license_with_payment(uuid,text,text,timestamptz,text,text,text,text,numeric,text,text) from public,anon;
revoke all on function public.admin_renew_license_with_payment(uuid,text,text,text,text,numeric,text,text) from public,anon;
revoke all on function public.admin_list_license_payments(uuid) from public,anon;
grant execute on function public.admin_list_license_plans(uuid) to authenticated;
grant execute on function public.admin_save_license_plan(uuid,text,text,text,integer,numeric,text,integer,jsonb,text,boolean,boolean) to authenticated;
grant execute on function public.admin_assign_license_with_payment(uuid,text,text,timestamptz,text,text,text,text,numeric,text,text) to authenticated;
grant execute on function public.admin_renew_license_with_payment(uuid,text,text,text,text,numeric,text,text) to authenticated;
grant execute on function public.admin_list_license_payments(uuid) to authenticated;
