-- P0-A administrative foundations: pre-invoices, exchange rates, test mode,
-- referral accounting and immutable document identity snapshots.

create table public.project_exchange_settings (
  project_id uuid primary key references public.projects(id) on update cascade on delete restrict,
  base_currency text not null check (base_currency in ('CUP', 'USD', 'EUR')),
  charge_currency text not null check (charge_currency in ('CUP', 'USD', 'EUR')),
  rate_mode text not null default 'manual' check (rate_mode in ('manual', 'automatic')),
  current_rate numeric(20, 8) not null default 1 check (current_rate > 0),
  rate_source text not null default 'manual' check (btrim(rate_source) <> ''),
  rate_updated_at timestamptz not null default now(),
  manual_updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.project_exchange_settings(project_id, base_currency, charge_currency)
select project.id, project.currency, project.currency
from public.projects project
on conflict(project_id) do nothing;

create table public.project_exchange_rate_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on update cascade on delete restrict,
  base_currency text not null check (base_currency in ('CUP', 'USD', 'EUR')),
  charge_currency text not null check (charge_currency in ('CUP', 'USD', 'EUR')),
  rate numeric(20, 8) not null check (rate > 0),
  rate_mode text not null check (rate_mode in ('manual', 'automatic')),
  rate_source text not null check (btrim(rate_source) <> ''),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index project_exchange_rate_history_project_created_idx
  on public.project_exchange_rate_history(project_id, created_at desc);

create table public.project_test_settings (
  project_id uuid primary key references public.projects(id) on update cascade on delete restrict,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.project_test_settings(project_id)
select id from public.projects
on conflict(project_id) do nothing;

create table public.project_referral_settings (
  project_id uuid primary key references public.projects(id) on update cascade on delete restrict,
  reward_days integer not null default 15 check (reward_days between 1 and 365),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.project_referral_settings(project_id)
select id from public.projects
on conflict(project_id) do nothing;

create table public.referral_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on update cascade on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  referral_code text,
  source text not null default 'administrative' check (btrim(source) <> ''),
  is_test boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id, referred_user_id),
  check (referrer_user_id <> referred_user_id)
);

create index referral_relationships_project_referrer_idx
  on public.referral_relationships(project_id, referrer_user_id);

insert into public.referral_relationships(
  project_id, referrer_user_id, referred_user_id, referral_code, source, created_by
)
select lead.project_id, lead.referred_by_user_id, lead.user_id, lead.referral_code,
       'commercial_lead', lead.created_by
from public.commercial_leads lead
where lead.referred_by_user_id is not null
  and lead.user_id is not null
  and lead.referred_by_user_id <> lead.user_id
on conflict(project_id, referred_user_id) do nothing;

create table public.referral_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on update cascade on delete restrict,
  relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  qualifying_payment_id uuid references public.payments(id) on delete restrict,
  reward_days integer not null check (reward_days > 0),
  status text not null default 'pending' check (status in ('pending', 'earned', 'applied', 'reverted')),
  is_test boolean not null default false,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  reverted_at timestamptz,
  unique(project_id, referred_user_id),
  check (referrer_user_id <> referred_user_id)
);

create index referral_reward_ledger_project_status_idx
  on public.referral_reward_ledger(project_id, status, created_at desc);

create table public.preinvoices (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  project_id uuid not null references public.projects(id) on update cascade on delete restrict,
  client_id uuid not null references public.profiles(id) on delete restrict,
  plan_code text not null,
  base_price numeric(14, 2) not null check (base_price > 0),
  base_currency text not null check (base_currency in ('CUP', 'USD', 'EUR')),
  exchange_rate numeric(20, 8) not null check (exchange_rate > 0),
  exchange_rate_source text not null check (btrim(exchange_rate_source) <> ''),
  charge_currency text not null check (charge_currency in ('CUP', 'USD', 'EUR')),
  charge_amount numeric(14, 2) not null check (charge_amount > 0),
  status text not null default 'prepared'
    check (status in ('prepared', 'sent', 'pending', 'paid', 'expired', 'cancelled')),
  is_test boolean not null default false,
  identity_snapshot jsonb not null check (jsonb_typeof(identity_snapshot) = 'object'),
  plan_snapshot jsonb not null check (jsonb_typeof(plan_snapshot) = 'object'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_payment_id uuid references public.payments(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at = issued_at + interval '48 hours'),
  check ((status = 'paid') = (paid_payment_id is not null))
);

create index preinvoices_project_issued_idx on public.preinvoices(project_id, issued_at desc);
create index preinvoices_project_client_idx on public.preinvoices(project_id, client_id);
create index preinvoices_open_expiry_idx on public.preinvoices(project_id, expires_at)
  where status in ('prepared', 'sent', 'pending');

alter table public.project_exchange_settings enable row level security;
alter table public.project_exchange_rate_history enable row level security;
alter table public.project_test_settings enable row level security;
alter table public.project_referral_settings enable row level security;
alter table public.referral_relationships enable row level security;
alter table public.referral_reward_ledger enable row level security;
alter table public.preinvoices enable row level security;

revoke all on public.project_exchange_settings, public.project_exchange_rate_history,
  public.project_test_settings, public.project_referral_settings, public.referral_relationships,
  public.referral_reward_ledger, public.preinvoices from public, anon, authenticated;

create or replace function app_private.p0a_document_identity_snapshot(target_project_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project_id', project.id,
    'name', project.name,
    'description', project.description,
    'logo_url', project.logo_url,
    'icon_url', project.icon_url,
    'primary_color', project.primary_color,
    'secondary_color', project.secondary_color,
    'whatsapp', project.whatsapp,
    'support_email', project.support_email,
    'website_url', project.website_url,
    'privacy_url', project.privacy_url,
    'terms_url', project.terms_url,
    'captured_at', now()
  ) from public.projects project where project.id = target_project_id;
$$;

create or replace function app_private.p0a_initialize_project_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_exchange_settings(project_id,base_currency,charge_currency)
  values(new.id,new.currency,new.currency) on conflict(project_id) do nothing;
  insert into public.project_test_settings(project_id) values(new.id) on conflict(project_id) do nothing;
  insert into public.project_referral_settings(project_id) values(new.id) on conflict(project_id) do nothing;
  return new;
end;
$$;

create trigger p0a_initialize_project_settings after insert on public.projects
for each row execute function app_private.p0a_initialize_project_settings();

create or replace function app_private.p0a_guard_preinvoice_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is distinct from old.project_id
     or new.client_id is distinct from old.client_id
     or new.plan_code is distinct from old.plan_code
     or new.base_price is distinct from old.base_price
     or new.base_currency is distinct from old.base_currency
     or new.exchange_rate is distinct from old.exchange_rate
     or new.exchange_rate_source is distinct from old.exchange_rate_source
     or new.charge_currency is distinct from old.charge_currency
     or new.charge_amount is distinct from old.charge_amount
     or new.is_test is distinct from old.is_test
     or new.identity_snapshot is distinct from old.identity_snapshot
     or new.plan_snapshot is distinct from old.plan_snapshot
     or new.issued_at is distinct from old.issued_at
     or new.expires_at is distinct from old.expires_at
     or new.created_by is distinct from old.created_by then
    raise exception 'PREINVOICE_SNAPSHOT_IMMUTABLE' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger p0a_guard_preinvoice_snapshot
before update on public.preinvoices for each row execute function app_private.p0a_guard_preinvoice_snapshot();

create trigger audit_project_exchange_settings after insert or update or delete on public.project_exchange_settings
for each row execute function app_private.capture_audit_event();
create trigger audit_project_test_settings after insert or update or delete on public.project_test_settings
for each row execute function app_private.capture_audit_event();
create trigger audit_project_referral_settings after insert or update or delete on public.project_referral_settings
for each row execute function app_private.capture_audit_event();
create trigger audit_referral_relationships after insert or update or delete on public.referral_relationships
for each row execute function app_private.capture_audit_event();
create trigger audit_referral_reward_ledger after insert or update or delete on public.referral_reward_ledger
for each row execute function app_private.capture_audit_event();
create trigger audit_preinvoices after insert or update or delete on public.preinvoices
for each row execute function app_private.capture_audit_event();

create or replace function public.admin_get_p0a_settings(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');
  select jsonb_build_object(
    'project_id', target_project_id,
    'base_currency', exchange.base_currency,
    'charge_currency', exchange.charge_currency,
    'rate_mode', exchange.rate_mode,
    'current_rate', exchange.current_rate,
    'rate_source', exchange.rate_source,
    'rate_updated_at', exchange.rate_updated_at,
    'test_mode_enabled', test.enabled,
    'referral_reward_days', referral.reward_days
  ) into result
  from public.project_exchange_settings exchange
  join public.project_test_settings test using(project_id)
  join public.project_referral_settings referral using(project_id)
  where exchange.project_id = target_project_id;
  if result is null then raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_set_exchange_settings(
  target_project_id uuid, target_base_currency text, target_charge_currency text,
  target_rate_mode text, target_rate numeric, target_rate_source text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; result jsonb;
begin
  actor := app_private.require_project_permission(target_project_id, 'settings.manage');
  if target_base_currency not in ('CUP','USD','EUR') or target_charge_currency not in ('CUP','USD','EUR')
     or target_rate_mode not in ('manual','automatic') or target_rate <= 0
     or nullif(btrim(target_rate_source),'') is null then
    raise exception 'INVALID_EXCHANGE_SETTINGS' using errcode = '22023';
  end if;
  update public.project_exchange_settings set
    base_currency=target_base_currency, charge_currency=target_charge_currency,
    rate_mode=target_rate_mode, current_rate=target_rate, rate_source=btrim(target_rate_source),
    rate_updated_at=now(), manual_updated_by=case when target_rate_mode='manual' then actor else null end,
    updated_at=now()
  where project_id=target_project_id;
  if not found then raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.project_exchange_rate_history(project_id,base_currency,charge_currency,rate,rate_mode,rate_source,changed_by)
  values(target_project_id,target_base_currency,target_charge_currency,target_rate,target_rate_mode,btrim(target_rate_source),case when target_rate_mode='manual' then actor else null end);
  result := public.admin_get_p0a_settings(target_project_id);
  return result;
end;
$$;

create or replace function public.admin_set_test_mode(target_project_id uuid, target_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := app_private.require_project_permission(target_project_id, 'settings.manage');
  update public.project_test_settings set enabled=target_enabled,updated_by=actor,updated_at=now()
  where project_id=target_project_id;
  if not found then raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  return target_enabled;
end;
$$;

create or replace function public.admin_set_referral_reward_days(target_project_id uuid, target_reward_days integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := app_private.require_project_permission(target_project_id, 'settings.manage');
  if target_reward_days not between 1 and 365 then raise exception 'INVALID_REWARD_DAYS' using errcode='22023'; end if;
  update public.project_referral_settings set reward_days=target_reward_days,updated_by=actor,updated_at=now()
  where project_id=target_project_id;
  if not found then raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  return target_reward_days;
end;
$$;

create or replace function public.admin_list_exchange_rate_history(target_project_id uuid, target_limit integer default 100)
returns table(id bigint,base_currency text,charge_currency text,rate numeric,rate_mode text,rate_source text,changed_by uuid,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');
  return query select history.id,history.base_currency,history.charge_currency,history.rate,history.rate_mode,
    history.rate_source,history.changed_by,history.created_at
  from public.project_exchange_rate_history history where history.project_id=target_project_id
  order by history.created_at desc limit greatest(1,least(coalesce(target_limit,100),500));
end;
$$;

create or replace function public.admin_create_preinvoice(
  target_project_id uuid, target_client_id uuid, target_plan_code text,
  target_charge_currency text default null, target_exchange_rate numeric default null,
  target_rate_source text default null, target_is_test boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid; plan public.license_plans%rowtype; exchange public.project_exchange_settings%rowtype;
  test_mode boolean; issued timestamptz := now(); created_id uuid; applied_rate numeric; applied_currency text;
begin
  actor := app_private.require_project_permission(target_project_id, 'payments.manage');
  if not exists(select 1 from public.licenses license
      where license.project_id=target_project_id and license.user_id=target_client_id) then
    raise exception 'CLIENT_NOT_FOUND' using errcode='P0002';
  end if;
  select * into plan from public.license_plans where project_id=target_project_id and code=target_plan_code and active;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode='P0002'; end if;
  select * into exchange from public.project_exchange_settings where project_id=target_project_id;
  if not found then raise exception 'EXCHANGE_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  select enabled into test_mode from public.project_test_settings where project_id=target_project_id;
  if coalesce(target_is_test,false) and not coalesce(test_mode,false) then
    raise exception 'TEST_MODE_DISABLED' using errcode='42501';
  end if;
  applied_currency := coalesce(target_charge_currency,exchange.charge_currency);
  applied_rate := coalesce(target_exchange_rate,exchange.current_rate);
  if applied_currency not in ('CUP','USD','EUR') or applied_rate <= 0 then
    raise exception 'INVALID_EXCHANGE_RATE' using errcode='22023';
  end if;
  if plan.currency<>exchange.base_currency
     or applied_currency<>exchange.charge_currency
     or applied_rate<>exchange.current_rate
     or (target_rate_source is not null and btrim(target_rate_source)<>exchange.rate_source) then
    raise exception 'STALE_OR_MISMATCHED_EXCHANGE_SETTINGS' using errcode='22023';
  end if;
  insert into public.preinvoices(project_id,client_id,plan_code,base_price,base_currency,exchange_rate,
    exchange_rate_source,charge_currency,charge_amount,is_test,identity_snapshot,plan_snapshot,
    issued_at,expires_at,created_by)
  values(target_project_id,target_client_id,plan.code,plan.price,plan.currency,applied_rate,
    coalesce(nullif(btrim(target_rate_source),''),exchange.rate_source),applied_currency,
    round(plan.price*applied_rate,2),coalesce(target_is_test,false),
    app_private.p0a_document_identity_snapshot(target_project_id),
    jsonb_build_object('code',plan.code,'name',plan.name,'license_type',plan.license_type,
      'duration_days',plan.duration_days,'max_devices',plan.max_devices,'features',plan.features),
    issued,issued+interval '48 hours',actor)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.admin_list_preinvoices(target_project_id uuid, target_include_test boolean default false)
returns table(id uuid,number bigint,client_id uuid,plan_code text,base_price numeric,base_currency text,
  exchange_rate numeric,exchange_rate_source text,charge_currency text,charge_amount numeric,status text,
  is_test boolean,identity_snapshot jsonb,plan_snapshot jsonb,issued_at timestamptz,expires_at timestamptz,
  paid_payment_id uuid,created_by uuid,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_project_permission(target_project_id, 'payments.view');
  update public.preinvoices invoice set status='expired',updated_at=now()
  where invoice.project_id=target_project_id and invoice.status in ('prepared','sent','pending') and invoice.expires_at<=now();
  return query select invoice.id,invoice.number,invoice.client_id,invoice.plan_code,invoice.base_price,
    invoice.base_currency,invoice.exchange_rate,invoice.exchange_rate_source,invoice.charge_currency,
    invoice.charge_amount,invoice.status,invoice.is_test,invoice.identity_snapshot,invoice.plan_snapshot,
    invoice.issued_at,invoice.expires_at,invoice.paid_payment_id,invoice.created_by,invoice.created_at
  from public.preinvoices invoice where invoice.project_id=target_project_id
    and (target_include_test or not invoice.is_test) order by invoice.issued_at desc;
end;
$$;

create or replace function public.admin_set_preinvoice_status(
  target_project_id uuid, target_preinvoice_id uuid, target_status text, target_payment_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare current_invoice public.preinvoices%rowtype; matched_payment public.payments%rowtype;
begin
  perform app_private.require_project_permission(target_project_id, 'payments.manage');
  select * into current_invoice from public.preinvoices invoice
  where invoice.id=target_preinvoice_id and invoice.project_id=target_project_id for update;
  if not found then raise exception 'PREINVOICE_NOT_FOUND' using errcode='P0002'; end if;
  if target_status not in ('sent','pending','paid','cancelled') then raise exception 'INVALID_PREINVOICE_STATUS' using errcode='22023'; end if;
  if target_status='paid' then
    if current_invoice.status in ('paid','cancelled') then raise exception 'PREINVOICE_FINAL' using errcode='22023'; end if;
    select * into matched_payment from public.payments payment where payment.id=target_payment_id
      and payment.project_id=target_project_id and payment.user_id=current_invoice.client_id
      and payment.plan=current_invoice.plan_code and payment.status='paid';
    if not found then
      if current_invoice.expires_at<=now() then
        update public.preinvoices set status='expired',paid_payment_id=null,updated_at=now() where id=target_preinvoice_id;
        return;
      end if;
      raise exception 'CONFIRMED_PAYMENT_REQUIRED' using errcode='22023';
    end if;
    if matched_payment.currency<>current_invoice.charge_currency
       or matched_payment.amount<>current_invoice.charge_amount then
      raise exception 'PREINVOICE_PAYMENT_MISMATCH' using errcode='22023';
    end if;
    if matched_payment.charged_at<current_invoice.issued_at
       or matched_payment.charged_at>current_invoice.expires_at then
      update public.preinvoices set status='expired',paid_payment_id=null,updated_at=now() where id=target_preinvoice_id;
      return;
    end if;
    update public.preinvoices set status='paid',paid_payment_id=target_payment_id,updated_at=now()
    where id=target_preinvoice_id;
    return;
  end if;
  if current_invoice.status in ('paid','expired','cancelled') then raise exception 'PREINVOICE_FINAL' using errcode='22023'; end if;
  if current_invoice.expires_at<=now() then
    update public.preinvoices set status='expired',updated_at=now() where id=target_preinvoice_id;
    return;
  end if;
  update public.preinvoices set status=target_status,
    paid_payment_id=null,updated_at=now()
  where id=target_preinvoice_id;
end;
$$;

create or replace function public.admin_register_referral_relationship(
  target_project_id uuid,target_referrer_user_id uuid,target_referred_user_id uuid,
  target_referral_code text default null,target_is_test boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid; relation_id uuid; test_mode boolean;
begin
  actor := app_private.require_project_permission(target_project_id,'commercial.manage');
  if target_referrer_user_id=target_referred_user_id then raise exception 'SELF_REFERRAL_NOT_ALLOWED' using errcode='22023'; end if;
  if not exists(select 1 from public.licenses where project_id=target_project_id and user_id=target_referrer_user_id)
     or not exists(select 1 from public.licenses where project_id=target_project_id and user_id=target_referred_user_id) then
    raise exception 'REFERRAL_USER_NOT_FOUND' using errcode='P0002';
  end if;
  select enabled into test_mode from public.project_test_settings where project_id=target_project_id;
  if coalesce(target_is_test,false) and not coalesce(test_mode,false) then raise exception 'TEST_MODE_DISABLED' using errcode='42501'; end if;
  insert into public.referral_relationships(project_id,referrer_user_id,referred_user_id,referral_code,is_test,created_by)
  values(target_project_id,target_referrer_user_id,target_referred_user_id,nullif(btrim(target_referral_code),''),coalesce(target_is_test,false),actor)
  returning id into relation_id;
  return relation_id;
exception when unique_violation then
  raise exception 'REFERRED_USER_ALREADY_REGISTERED' using errcode='23505';
end;
$$;

create or replace function public.admin_create_referral_reward(
  target_project_id uuid,target_relationship_id uuid,target_payment_id uuid,target_is_test boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid; relation public.referral_relationships%rowtype; days integer; reward_id uuid; test_mode boolean;
begin
  actor := app_private.require_project_permission(target_project_id,'payments.manage');
  select * into relation from public.referral_relationships where id=target_relationship_id and project_id=target_project_id;
  if not found then raise exception 'REFERRAL_RELATIONSHIP_NOT_FOUND' using errcode='P0002'; end if;
  if not exists(select 1 from public.payments payment where payment.id=target_payment_id
      and payment.project_id=target_project_id and payment.user_id=relation.referred_user_id and payment.status='paid') then
    raise exception 'QUALIFYING_PAYMENT_REQUIRED' using errcode='22023';
  end if;
  if target_payment_id<>(select payment.id from public.payments payment
      where payment.project_id=target_project_id and payment.user_id=relation.referred_user_id
        and payment.status='paid'
      order by payment.charged_at,payment.created_at,payment.id limit 1) then
    raise exception 'FIRST_CONFIRMED_PAYMENT_REQUIRED' using errcode='22023';
  end if;
  select enabled into test_mode from public.project_test_settings where project_id=target_project_id;
  if coalesce(target_is_test,false) and not coalesce(test_mode,false) then raise exception 'TEST_MODE_DISABLED' using errcode='42501'; end if;
  select reward_days into days from public.project_referral_settings where project_id=target_project_id;
  insert into public.referral_reward_ledger(project_id,relationship_id,referrer_user_id,referred_user_id,
    qualifying_payment_id,reward_days,is_test,created_by)
  values(target_project_id,relation.id,relation.referrer_user_id,relation.referred_user_id,target_payment_id,days,
    coalesce(target_is_test,false),actor) returning id into reward_id;
  return reward_id;
exception when unique_violation then
  raise exception 'REFERRAL_REWARD_ALREADY_EXISTS' using errcode='23505';
end;
$$;

create or replace function public.admin_delete_p0a_test_data(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare deleted_preinvoices bigint; deleted_rewards bigint; deleted_relationships bigint;
begin
  perform app_private.require_project_permission(target_project_id,'settings.manage');
  delete from public.preinvoices where project_id=target_project_id and is_test; get diagnostics deleted_preinvoices=row_count;
  delete from public.referral_reward_ledger where project_id=target_project_id and is_test; get diagnostics deleted_rewards=row_count;
  delete from public.referral_relationships relation where relation.project_id=target_project_id and relation.is_test
    and not exists(select 1 from public.referral_reward_ledger reward where reward.relationship_id=relation.id);
  get diagnostics deleted_relationships=row_count;
  return jsonb_build_object('preinvoices',deleted_preinvoices,'referral_rewards',deleted_rewards,
    'referral_relationships',deleted_relationships);
end;
$$;

revoke all on function app_private.p0a_document_identity_snapshot(uuid),
  app_private.p0a_initialize_project_settings(), app_private.p0a_guard_preinvoice_snapshot()
  from public,anon,authenticated;
revoke all on function public.admin_get_p0a_settings(uuid),
  public.admin_set_exchange_settings(uuid,text,text,text,numeric,text),
  public.admin_set_test_mode(uuid,boolean), public.admin_set_referral_reward_days(uuid,integer),
  public.admin_list_exchange_rate_history(uuid,integer),
  public.admin_create_preinvoice(uuid,uuid,text,text,numeric,text,boolean),
  public.admin_list_preinvoices(uuid,boolean), public.admin_set_preinvoice_status(uuid,uuid,text,uuid),
  public.admin_register_referral_relationship(uuid,uuid,uuid,text,boolean),
  public.admin_create_referral_reward(uuid,uuid,uuid,boolean),
  public.admin_delete_p0a_test_data(uuid) from public,anon;

grant execute on function public.admin_get_p0a_settings(uuid),
  public.admin_set_exchange_settings(uuid,text,text,text,numeric,text),
  public.admin_set_test_mode(uuid,boolean), public.admin_set_referral_reward_days(uuid,integer),
  public.admin_list_exchange_rate_history(uuid,integer),
  public.admin_create_preinvoice(uuid,uuid,text,text,numeric,text,boolean),
  public.admin_list_preinvoices(uuid,boolean), public.admin_set_preinvoice_status(uuid,uuid,text,uuid),
  public.admin_register_referral_relationship(uuid,uuid,uuid,text,boolean),
  public.admin_create_referral_reward(uuid,uuid,uuid,boolean),
  public.admin_delete_p0a_test_data(uuid) to authenticated;
