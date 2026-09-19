-- TukTuk Marketplace V1, Block 4: server-first driver wallets and topups.

create table public.project_marketplace_financial_settings (
  project_id uuid primary key references public.projects(id) on delete restrict,
  wallet_currency text not null default 'CUP' check (wallet_currency = 'CUP'),
  initial_minimum_deposit numeric(14,2) not null check (initial_minimum_deposit > 0),
  commission_rate numeric(8,6) not null check (commission_rate > 0 and commission_rate <= 1),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallets (
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null default 'CUP' check (currency = 'CUP'),
  initial_deposit_confirmed_at timestamptz,
  initial_deposit_topup_id uuid,
  initial_deposit_amount numeric(14,2),
  initial_minimum_snapshot numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id),
  check ((initial_deposit_confirmed_at is null and initial_deposit_topup_id is null
      and initial_deposit_amount is null and initial_minimum_snapshot is null)
    or (initial_deposit_confirmed_at is not null and initial_deposit_topup_id is not null
      and initial_deposit_amount is not null and initial_deposit_amount > 0
      and initial_minimum_snapshot is not null and initial_minimum_snapshot > 0
      and initial_deposit_amount >= initial_minimum_snapshot))
);

create table public.topups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'CUP' check (currency = 'CUP'),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'rejected', 'reconciled')),
  method text not null check (method in ('cash', 'transfer', 'other')),
  reference text,
  notes text,
  request_idempotency_key uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  initial_minimum_snapshot numeric(14,2),
  was_initial_candidate boolean not null default false,
  confirmation_idempotency_key uuid,
  ledger_transaction_id uuid,
  confirmed_by uuid references auth.users(id) on delete restrict,
  confirmed_at timestamptz,
  rejected_by uuid references auth.users(id) on delete restrict,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, request_idempotency_key),
  unique (project_id, confirmation_idempotency_key),
  unique (project_id, id),
  unique (project_id, user_id, id),
  foreign key (project_id, user_id) references public.wallets(project_id, user_id) on delete restrict,
  check ((status = 'requested' and confirmation_idempotency_key is null and ledger_transaction_id is null
      and confirmed_by is null and confirmed_at is null and rejected_by is null and rejected_at is null and rejection_reason is null)
    or (status in ('confirmed', 'reconciled') and confirmation_idempotency_key is not null and ledger_transaction_id is not null
      and confirmed_by is not null and confirmed_at is not null and rejected_by is null and rejected_at is null and rejection_reason is null)
    or (status = 'rejected' and confirmation_idempotency_key is null and ledger_transaction_id is null
      and confirmed_by is null and confirmed_at is null and rejected_by is not null and rejected_at is not null
      and nullif(btrim(rejection_reason), '') is not null)),
  check ((was_initial_candidate and initial_minimum_snapshot is not null and initial_minimum_snapshot > 0
      and amount >= initial_minimum_snapshot)
    or (not was_initial_candidate and initial_minimum_snapshot is null))
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  currency text not null default 'CUP' check (currency = 'CUP'),
  transaction_type text not null check (transaction_type in ('topup', 'commission', 'adjustment', 'reversal')),
  amount_delta numeric(14,2) not null check (amount_delta <> 0),
  balance_after numeric(14,2) not null check (balance_after >= 0),
  source_type text not null check (btrim(source_type) <> ''),
  source_id text not null check (btrim(source_id) <> ''),
  idempotency_key uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, user_id, id),
  unique (project_id, idempotency_key),
  unique (project_id, source_type, source_id, transaction_type),
  foreign key (project_id, user_id) references public.wallets(project_id, user_id) on delete restrict
);

alter table public.topups add constraint topups_ledger_transaction_fkey
  foreign key (project_id, user_id, ledger_transaction_id)
  references public.wallet_transactions(project_id, user_id, id) on delete restrict;

alter table public.wallets add constraint wallets_initial_deposit_topup_fkey
  foreign key (project_id, user_id, initial_deposit_topup_id)
  references public.topups(project_id, user_id, id) on delete restrict;

create index topups_project_user_status_idx on public.topups(project_id, user_id, status, requested_at desc);
create index wallet_transactions_wallet_created_idx on public.wallet_transactions(project_id, user_id, created_at, id);

create trigger project_marketplace_financial_settings_set_updated_at before update on public.project_marketplace_financial_settings
for each row execute function app_private.set_updated_at();
create trigger wallets_set_updated_at before update on public.wallets
for each row execute function app_private.set_updated_at();
create trigger topups_set_updated_at before update on public.topups
for each row execute function app_private.set_updated_at();

create or replace function app_private.protect_topup_provenance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id or new.user_id is distinct from old.user_id
    or new.amount is distinct from old.amount or new.currency is distinct from old.currency
    or new.method is distinct from old.method or new.reference is distinct from old.reference or new.notes is distinct from old.notes
    or new.request_idempotency_key is distinct from old.request_idempotency_key
    or new.requested_by is distinct from old.requested_by or new.requested_at is distinct from old.requested_at
    or new.initial_minimum_snapshot is distinct from old.initial_minimum_snapshot
    or new.was_initial_candidate is distinct from old.was_initial_candidate or new.created_at is distinct from old.created_at then
    raise exception 'TOPUP_REQUEST_PROVENANCE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.protect_topup_provenance() from public, anon, authenticated;
create trigger topups_protect_provenance before update on public.topups
for each row execute function app_private.protect_topup_provenance();

create or replace function app_private.prevent_wallet_transaction_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'WALLET_LEDGER_IMMUTABLE' using errcode = '42501';
end;
$$;
revoke all on function app_private.prevent_wallet_transaction_mutation() from public, anon, authenticated;
create trigger wallet_transactions_immutable before update or delete on public.wallet_transactions
for each row execute function app_private.prevent_wallet_transaction_mutation();

create or replace function app_private.marketplace_wallet_total_balance(target_project_id uuid, target_user_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(transaction.amount_delta), 0)::numeric
  from public.wallet_transactions transaction
  where transaction.project_id = target_project_id and transaction.user_id = target_user_id;
$$;
revoke all on function app_private.marketplace_wallet_total_balance(uuid, uuid) from public, anon, authenticated;

create or replace function app_private.has_confirmed_marketplace_initial_deposit(target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wallets wallet
    join public.projects project on project.id = wallet.project_id and project.slug = 'tuktuk-control'
    join public.topups topup on topup.project_id = wallet.project_id and topup.user_id = wallet.user_id
      and topup.id = wallet.initial_deposit_topup_id
    join public.wallet_transactions transaction on transaction.project_id = topup.project_id and transaction.user_id = topup.user_id
      and transaction.id = topup.ledger_transaction_id
    where wallet.user_id = target_user_id
      and wallet.initial_deposit_confirmed_at is not null
      and wallet.initial_deposit_amount is not null
      and wallet.initial_minimum_snapshot is not null
      and wallet.initial_deposit_amount >= wallet.initial_minimum_snapshot
      and topup.status in ('confirmed', 'reconciled')
      and topup.was_initial_candidate
      and topup.user_id = wallet.user_id
      and topup.confirmed_at = wallet.initial_deposit_confirmed_at
      and topup.amount = wallet.initial_deposit_amount
      and topup.initial_minimum_snapshot = wallet.initial_minimum_snapshot
      and topup.amount >= topup.initial_minimum_snapshot
      and transaction.transaction_type = 'topup'
      and transaction.source_type = 'topup'
      and transaction.source_id = topup.id::text
      and transaction.amount_delta = topup.amount
  );
$$;
revoke all on function app_private.has_confirmed_marketplace_initial_deposit(uuid) from public, anon, authenticated;

create or replace function app_private.create_marketplace_topup_request(
  target_project_id uuid, target_user_id uuid, target_amount numeric, target_method text,
  target_reference text, target_notes text, target_request_idempotency_key uuid, target_actor uuid
)
returns public.topups language plpgsql security definer set search_path = '' as $$
declare wallet_record public.wallets%rowtype; setting_record public.project_marketplace_financial_settings%rowtype; result public.topups%rowtype; normalized_reference text; normalized_notes text;
begin
  if target_amount is null or target_amount <= 0 then raise exception 'TOPUP_AMOUNT_MUST_BE_POSITIVE' using errcode = '22023'; end if;
  if target_method not in ('cash','transfer','other') then raise exception 'INVALID_TOPUP_METHOD' using errcode = '22023'; end if;
  if target_request_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023'; end if;
  normalized_reference := nullif(btrim(target_reference), '');
  normalized_notes := nullif(btrim(target_notes), '');
  if not exists (select 1 from public.profiles where id = target_user_id) then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into setting_record from public.project_marketplace_financial_settings where project_id = target_project_id;
  if not found then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.wallets(project_id, user_id, currency) values (target_project_id, target_user_id, setting_record.wallet_currency)
  on conflict (project_id, user_id) do nothing;
  select * into wallet_record from public.wallets where project_id = target_project_id and user_id = target_user_id for update;
  select * into result from public.topups where project_id = target_project_id and user_id = target_user_id and request_idempotency_key = target_request_idempotency_key;
  if found then
    if result.amount <> target_amount or result.method <> target_method
      or result.reference is distinct from normalized_reference or result.notes is distinct from normalized_notes then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode = '22023'; end if;
    return result;
  end if;
  if wallet_record.initial_deposit_confirmed_at is null and target_amount < setting_record.initial_minimum_deposit then raise exception 'INITIAL_MINIMUM_DEPOSIT_REQUIRED' using errcode = '22023'; end if;
  insert into public.topups(project_id,user_id,amount,currency,method,reference,notes,request_idempotency_key,requested_by,initial_minimum_snapshot,was_initial_candidate)
  values (target_project_id,target_user_id,target_amount,setting_record.wallet_currency,target_method,normalized_reference,normalized_notes,target_request_idempotency_key,target_actor,
    case when wallet_record.initial_deposit_confirmed_at is null then setting_record.initial_minimum_deposit end,
    wallet_record.initial_deposit_confirmed_at is null) returning * into result;
  return result;
end;
$$;
revoke all on function app_private.create_marketplace_topup_request(uuid,uuid,numeric,text,text,text,uuid,uuid) from public, anon, authenticated;

create or replace function public.request_my_marketplace_topup(target_amount numeric, target_method text, target_reference text, target_request_idempotency_key uuid)
returns public.topups language plpgsql security definer set search_path = '' as $$
declare project_id uuid; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select id into project_id from public.projects where slug = 'tuktuk-control';
  if project_id is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  return app_private.create_marketplace_topup_request(project_id, actor, target_amount, target_method, target_reference, null, target_request_idempotency_key, actor);
end;
$$;

create or replace function public.admin_create_marketplace_topup_request(target_project_id uuid, target_user_id uuid, target_amount numeric, target_method text, target_reference text, target_notes text, target_request_idempotency_key uuid)
returns public.topups language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin actor := app_private.require_project_permission(target_project_id, 'payments.manage');
  return app_private.create_marketplace_topup_request(target_project_id,target_user_id,target_amount,target_method,target_reference,target_notes,target_request_idempotency_key,actor); end;
$$;

create or replace function public.admin_confirm_marketplace_topup(target_project_id uuid, target_topup_id uuid, target_confirmation_idempotency_key uuid)
returns public.topups language plpgsql security definer set search_path = '' as $$
declare actor uuid; topup_record public.topups%rowtype; wallet_record public.wallets%rowtype; transaction_id uuid; prior_balance numeric;
begin
  actor := app_private.require_project_permission(target_project_id, 'payments.manage');
  if target_confirmation_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023'; end if;
  select * into topup_record from public.topups where id = target_topup_id and project_id = target_project_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into wallet_record from public.wallets where project_id = topup_record.project_id and user_id = topup_record.user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND' using errcode = 'P0002'; end if;
  if topup_record.status in ('confirmed','reconciled') then return topup_record; end if;
  if topup_record.status = 'rejected' then raise exception 'REJECTED_TOPUP_CANNOT_BE_CONFIRMED' using errcode = '22023'; end if;
  if wallet_record.initial_deposit_confirmed_at is null and (not topup_record.was_initial_candidate or topup_record.amount < topup_record.initial_minimum_snapshot) then raise exception 'INITIAL_MINIMUM_DEPOSIT_REQUIRED' using errcode = '22023'; end if;
  prior_balance := app_private.marketplace_wallet_total_balance(target_project_id, topup_record.user_id);
  insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata)
  values (target_project_id,topup_record.user_id,topup_record.currency,'topup',topup_record.amount,prior_balance + topup_record.amount,'topup',topup_record.id::text,target_confirmation_idempotency_key,actor,jsonb_build_object('topup_id',topup_record.id)) returning id into transaction_id;
  update public.topups set status='confirmed', confirmation_idempotency_key=target_confirmation_idempotency_key, ledger_transaction_id=transaction_id, confirmed_by=actor, confirmed_at=now()
  where id=topup_record.id and project_id=target_project_id returning * into topup_record;
  if wallet_record.initial_deposit_confirmed_at is null then
    update public.wallets set initial_deposit_confirmed_at=topup_record.confirmed_at, initial_deposit_topup_id=topup_record.id, initial_deposit_amount=topup_record.amount, initial_minimum_snapshot=topup_record.initial_minimum_snapshot
    where project_id=target_project_id and user_id=topup_record.user_id;
  end if;
  return topup_record;
end;
$$;

create or replace function public.admin_reject_marketplace_topup(target_project_id uuid, target_topup_id uuid, target_rejection_reason text)
returns public.topups language plpgsql security definer set search_path = '' as $$
declare actor uuid; result public.topups%rowtype;
begin
  actor := app_private.require_project_permission(target_project_id, 'payments.manage');
  if nullif(btrim(target_rejection_reason),'') is null then raise exception 'REJECTION_REASON_REQUIRED' using errcode = '22023'; end if;
  update public.topups set status='rejected', rejected_by=actor, rejected_at=now(), rejection_reason=btrim(target_rejection_reason)
  where id=target_topup_id and project_id=target_project_id and status='requested' returning * into result;
  if not found then raise exception 'TOPUP_NOT_REQUESTED_OR_NOT_FOUND' using errcode = '22023'; end if;
  return result;
end;
$$;

create or replace function public.admin_set_marketplace_financial_settings(target_project_id uuid, target_initial_minimum_deposit numeric, target_commission_rate numeric)
returns public.project_marketplace_financial_settings language plpgsql security definer set search_path = '' as $$
declare actor uuid; result public.project_marketplace_financial_settings%rowtype;
begin
  actor := app_private.require_project_permission(target_project_id, 'settings.manage');
  if target_initial_minimum_deposit is null or target_initial_minimum_deposit <= 0 then raise exception 'INVALID_INITIAL_MINIMUM_DEPOSIT' using errcode = '22023'; end if;
  if target_commission_rate is null or target_commission_rate <= 0 or target_commission_rate > 1 then raise exception 'INVALID_COMMISSION_RATE' using errcode = '22023'; end if;
  update public.project_marketplace_financial_settings set initial_minimum_deposit=target_initial_minimum_deposit, commission_rate=target_commission_rate, updated_by=actor
  where project_id=target_project_id returning * into result;
  if not found then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.get_my_marketplace_wallet()
returns table(currency text,total_balance numeric,initial_deposit_confirmed boolean,initial_deposit_confirmed_at timestamptz,initial_deposit_amount numeric,initial_minimum_snapshot numeric,current_initial_minimum_deposit numeric,commission_rate numeric)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); tuktuk_project_id uuid; configured_initial_minimum numeric; configured_commission_rate numeric;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select project.id, setting.initial_minimum_deposit, setting.commission_rate into tuktuk_project_id,configured_initial_minimum,configured_commission_rate
  from public.projects project join public.project_marketplace_financial_settings setting on setting.project_id=project.id where project.slug='tuktuk-control';
  if tuktuk_project_id is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  return query select coalesce(wallet.currency,'CUP'), app_private.marketplace_wallet_total_balance(tuktuk_project_id,actor), wallet.initial_deposit_confirmed_at is not null, wallet.initial_deposit_confirmed_at,wallet.initial_deposit_amount,wallet.initial_minimum_snapshot,configured_initial_minimum,configured_commission_rate
  from (select 1) singleton left join public.wallets wallet on wallet.project_id=tuktuk_project_id and wallet.user_id=actor;
end;
$$;

create trigger audit_marketplace_financial_settings after insert or update on public.project_marketplace_financial_settings for each row execute function app_private.capture_audit_event();
create trigger audit_marketplace_topups after insert or update on public.topups for each row execute function app_private.capture_audit_event();
create trigger audit_wallet_transactions after insert on public.wallet_transactions for each row execute function app_private.capture_audit_event();

insert into public.project_marketplace_financial_settings(project_id,wallet_currency,initial_minimum_deposit,commission_rate)
select id,'CUP',500.00,0.10 from public.projects where slug='tuktuk-control'
on conflict (project_id) do nothing;

alter table public.project_marketplace_financial_settings enable row level security;
alter table public.wallets enable row level security;
alter table public.topups enable row level security;
alter table public.wallet_transactions enable row level security;
revoke all on public.project_marketplace_financial_settings, public.wallets, public.topups, public.wallet_transactions from public, anon, authenticated;
revoke all on function public.request_my_marketplace_topup(numeric,text,text,uuid), public.admin_create_marketplace_topup_request(uuid,uuid,numeric,text,text,text,uuid), public.admin_confirm_marketplace_topup(uuid,uuid,uuid), public.admin_reject_marketplace_topup(uuid,uuid,text), public.admin_set_marketplace_financial_settings(uuid,numeric,numeric), public.get_my_marketplace_wallet() from public, anon;
grant execute on function public.request_my_marketplace_topup(numeric,text,text,uuid), public.admin_create_marketplace_topup_request(uuid,uuid,numeric,text,text,text,uuid), public.admin_confirm_marketplace_topup(uuid,uuid,uuid), public.admin_reject_marketplace_topup(uuid,uuid,text), public.admin_set_marketplace_financial_settings(uuid,numeric,numeric), public.get_my_marketplace_wallet() to authenticated;
