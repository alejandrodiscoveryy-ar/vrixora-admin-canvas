-- Only for a disposable PostgreSQL 17 runner. A narrow schema fixture, not
-- an exact replacement for the real Supabase schema or production triggers.
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists app_private;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('app.test_actor',true),'')::uuid
$$;
create table public.projects(id uuid primary key,slug text not null unique);
create table public.service_requests(project_id uuid not null,id uuid primary key,
 customer_id uuid not null, origin_text text not null default 'Origen ficticio',
 destination_text text not null default 'Destino ficticio');
create table public.jobs(project_id uuid not null,id uuid primary key,
 service_request_id uuid not null,status text not null,
 assigned_driver_user_id uuid,assigned_vehicle_id text,
 commission_rate_snapshot numeric(14,4) not null default 0,
 final_price numeric(14,2) not null default 0,currency text not null default 'CUP',
 state_version integer not null default 1,test_deleted_at timestamptz,
 is_test boolean not null default false,pricing_breakdown jsonb not null default '{}'::jsonb,
 service_code text not null default 'ride',created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
create table public.job_assignments(id uuid primary key default gen_random_uuid(),
 project_id uuid not null,job_id uuid not null,driver_user_id uuid not null,
 vehicle_id text not null,billing_mode text not null,
 commission_amount_snapshot numeric(14,2) not null,completed_at timestamptz,
 cancelled_at timestamptz);
create table public.wallets(project_id uuid not null,user_id uuid not null,
 currency text not null default 'CUP',balance numeric(14,2) not null default 0,
 primary key(project_id,user_id));
create table public.commission_reservations(id uuid primary key default gen_random_uuid(),
 project_id uuid not null,job_id uuid not null,user_id uuid not null,
 status text not null default 'open',amount numeric(14,2) not null,
 final_price_snapshot numeric(14,2) not null,
 commission_rate_snapshot numeric(14,4) not null,currency text not null default 'CUP',
 ledger_transaction_id uuid,consumed_at timestamptz,unique(project_id,job_id));
create table public.wallet_transactions(id uuid primary key default gen_random_uuid(),
 project_id uuid not null,user_id uuid not null,currency text not null,
 transaction_type text not null,amount_delta numeric(14,2) not null,
 balance_after numeric(14,2) not null,source_type text not null,source_id text not null,
 idempotency_key uuid not null,actor_id uuid,metadata jsonb not null default '{}'::jsonb,
 unique(project_id,source_type,source_id),unique(project_id,user_id,idempotency_key));
create or replace function app_private.wallet_apply_debit() returns trigger
 language plpgsql as $$ declare prior numeric; begin
 select balance into prior from public.wallets
  where project_id=new.project_id and user_id=new.user_id for update;
 if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND'; end if;
 if new.transaction_type='commission' then
  if new.balance_after<>prior+new.amount_delta or new.balance_after<0 then
   raise exception 'WALLET_BALANCE_MISMATCH'; end if;
  update public.wallets set balance=new.balance_after
   where project_id=new.project_id and user_id=new.user_id;
 end if;
 return new;
end $$;
create trigger test_wallet_apply_debit after insert on public.wallet_transactions
 for each row execute function app_private.wallet_apply_debit();
create table public.job_events(id uuid primary key default gen_random_uuid(),
 project_id uuid not null,job_id uuid not null,from_status text,to_status text,
 action text not null,actor_kind text not null,actor_user_id uuid,customer_id uuid,
 operation_idempotency_key uuid not null,reason text,
 metadata jsonb not null default '{}'::jsonb,
 unique(project_id,operation_idempotency_key));
create table public.driver_vehicle_assignments(project_id uuid not null,
 driver_user_id uuid not null,vehicle_id text not null,
 is_active boolean not null default true,is_available boolean not null default false,
 primary key(project_id,driver_user_id,vehicle_id));
create table public.driver_profiles(project_id uuid not null,user_id uuid not null,
 status text not null default 'active',activated_at timestamptz,suspended_at timestamptz,
 primary key(project_id,user_id));
create table public.vehicles(project_id uuid not null,id text not null,
 name text not null default 'Vehiculo ficticio',registration text,
 marketplace_status text not null default 'active',deleted_at timestamptz,
 primary key(project_id,id));
create table public.marketplace_incident_resolutions(project_id uuid not null,
 job_id uuid not null,id uuid primary key default gen_random_uuid());
create table public.marketplace_driver_customer_ratings(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,
 job_id uuid not null,customer_id uuid not null,driver_user_id uuid not null,
 stars smallint not null check(stars between 1 and 5),internal_note text,
 idempotency_key uuid not null,created_at timestamptz not null default now(),
 unique(project_id,job_id),unique(project_id,driver_user_id,idempotency_key));
create table public.marketplace_customer_ratings(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,
 job_id uuid not null,customer_id uuid not null,driver_user_id uuid not null,
 stars smallint not null check(stars between 1 and 5),comment text,
 idempotency_key uuid not null,created_at timestamptz not null default now(),
 unique(project_id,job_id),unique(project_id,customer_id,idempotency_key));
create or replace function app_private.marketplace_wallet_total_balance(
 target_project_id uuid,target_user_id uuid) returns numeric language sql stable as $$
 select balance from public.wallets
 where project_id=target_project_id and user_id=target_user_id $$;
create or replace function app_private.marketplace_customer_project_id()
 returns uuid language sql stable as $$
 select id from public.projects where slug='tuktuk-control' $$;
create or replace function app_private.resolve_marketplace_customer_session(
 session_id uuid,session_token text) returns uuid language plpgsql stable as $$ begin
 if session_id<>'00000000-0000-4000-8000-000000000010'::uuid
    or session_token<>'test-only-customer-token' then
  raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 return '00000000-0000-4000-8000-000000000003'::uuid;
end $$;
create or replace function app_private.marketplace_customer_abuse_check(
 target_action text,target_identity text,target_limit integer,target_window interval)
 returns void language plpgsql as $$ begin return; end $$;
create or replace function app_private.require_project_permission(
 target_project_id uuid,target_permission text)
 returns uuid language plpgsql stable as $$ declare actor uuid:=auth.uid(); begin
 if actor is distinct from '00000000-0000-4000-8000-000000000004'::uuid then
  raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 return actor;
end $$;
create or replace function app_private.marketplace_job_transition_allowed(
 previous_state text,next_state text,target_actor_kind text)
 returns boolean language sql immutable as $$
 select (previous_state,next_state,target_actor_kind) in (
  ('accepted','en_route','driver'),('en_route','pickup','driver'),
  ('pickup','in_progress','driver')) $$;
insert into public.projects(id,slug)
 values('00000000-0000-4000-8000-000000000001','tuktuk-control');
insert into public.wallets(project_id,user_id,currency,balance)
 values('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002','CUP',1000);
insert into public.vehicles(project_id,id,name,registration)
 values('00000000-0000-4000-8000-000000000001','veh-1','Vehiculo ficticio','ABC001');
insert into public.driver_profiles(project_id,user_id,status,activated_at)
 values('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002','active',now());
insert into public.driver_vehicle_assignments(project_id,driver_user_id,vehicle_id)
 values('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002','veh-1');
