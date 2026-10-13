-- Comercial V3: interruptor global de cobro de comisiones.
-- Con TRUE se conserva EXACTAMENTE el comportamiento anterior. No altera carreras ni pruebas existentes.
-- Con FALSE, la aceptación genera asignación platform_free sin reservar ni descontar billetera.
-- El modo se fija al aceptar; cambios posteriores NO reescriben carreras abiertas.
-- Los beneficios de bienvenida continúan separados y se respetan sus vencimientos.

alter table public.project_marketplace_financial_settings
 add column if not exists commission_enabled boolean not null default true;

create table if not exists public.marketplace_commission_policy_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 actor uuid not null references auth.users(id) on delete restrict,
 previous_enabled boolean not null,
 new_enabled boolean not null,
 rate_snapshot numeric not null check (rate_snapshot > 0 and rate_snapshot <= 1),
 changed_at timestamptz not null default now()
);
create index if not exists marketplace_commission_policy_events_lookup_idx
  on public.marketplace_commission_policy_events(project_id,changed_at desc);
alter table public.marketplace_commission_policy_events enable row level security;
revoke all on public.marketplace_commission_policy_events from public,anon,authenticated;

create or replace function public.admin_get_marketplace_commission_policy(target_project_id uuid)
returns table(enabled boolean, rate numeric, updated_at timestamptz)
language plpgsql stable security definer set search_path=''
as $f$
begin
  perform app_private.require_project_permission(target_project_id,'settings.view');
  return query select s.commission_enabled,s.commission_rate,s.updated_at
    from public.project_marketplace_financial_settings s where s.project_id=target_project_id;
end;
$f$;

create or replace function public.admin_set_marketplace_commission_enabled(
 target_project_id uuid, target_enabled boolean)
returns void
language plpgsql security definer set search_path=''
as $f$
declare actor uuid; s public.project_marketplace_financial_settings%rowtype;
begin
  actor:=app_private.require_project_permission(target_project_id,'settings.manage');
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if target_enabled is null then raise exception 'COMMISSION_POLICY_REQUIRED' using errcode='22023'; end if;
  select * into s from public.project_marketplace_financial_settings
    where project_id=target_project_id for update;
  if not found then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  if s.commission_enabled is distinct from target_enabled then
    update public.project_marketplace_financial_settings
      set commission_enabled=target_enabled,updated_by=actor,updated_at=now()
    where project_id=target_project_id;
    insert into public.marketplace_commission_policy_events
     (project_id,actor,previous_enabled,new_enabled,rate_snapshot)
     values(target_project_id,actor,s.commission_enabled,target_enabled,s.commission_rate);
  end if;
end;
$f$;

create or replace function public.admin_list_marketplace_commission_policy_events(target_project_id uuid)
returns table(changed_at timestamptz,actor uuid,previous_enabled boolean,new_enabled boolean,rate_snapshot numeric)
language plpgsql stable security definer set search_path=''
as $f$
begin
  perform app_private.require_project_permission(target_project_id,'settings.view');
  return query select e.changed_at,e.actor,e.previous_enabled,e.new_enabled,e.rate_snapshot
    from public.marketplace_commission_policy_events e
    where e.project_id=target_project_id order by e.changed_at desc limit 50;
end;
$f$;

revoke all on function public.admin_get_marketplace_commission_policy(uuid) from public,anon;
revoke all on function public.admin_set_marketplace_commission_enabled(uuid,boolean) from public,anon;
revoke all on function public.admin_list_marketplace_commission_policy_events(uuid) from public,anon;
grant execute on function public.admin_get_marketplace_commission_policy(uuid) to authenticated;
grant execute on function public.admin_set_marketplace_commission_enabled(uuid,boolean) to authenticated;
grant execute on function public.admin_list_marketplace_commission_policy_events(uuid) to authenticated;

-- Solo se expande la constraint de asignación, sin tocar filas históricas.
alter table public.job_assignments drop constraint if exists job_assignments_billing_mode_check;
alter table public.job_assignments add constraint job_assignments_billing_mode_check check (
 ((billing_mode='wallet_commission') and commission_amount_snapshot>0
    and trial_started_at_snapshot is null and trial_ends_at_snapshot is null)
 or ((billing_mode='trial_free') and commission_amount_snapshot=0
    and trial_started_at_snapshot is not null and trial_ends_at_snapshot is not null
    and trial_ends_at_snapshot>trial_started_at_snapshot
    and accepted_at>=trial_started_at_snapshot and accepted_at<trial_ends_at_snapshot)
 or ((billing_mode='platform_free') and commission_amount_snapshot=0
    and trial_started_at_snapshot is null and trial_ends_at_snapshot is null)
);

-- Parche de funciones instaladas, exigiendo UNA única coincidencia por ancla.
-- Si producción difiere de la versión auditada, aborta toda la migración sin tocar las funciones.
do $patch0$
declare code text;
begin
  select pg_get_functiondef('public.accept_job(uuid,text,uuid)'::regprocedure) into code;
  if code is null then raise exception 'COMMISSION_V3_MISSING_FUNCTION: public.accept_job(uuid,text,uuid)'; end if;
  if (length(code)-length(replace(code,$old0_0$  force_test_commission boolean;$old0_0$,''))) <> length($old0_0$  force_test_commission boolean;$old0_0$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.accept_job(uuid,text,uuid) anchor 0';
  end if;
  code:=replace(code,$old0_0$  force_test_commission boolean;$old0_0$,$new0_0$  force_test_commission boolean;
  commission_charge_enabled boolean;$new0_0$);
  if (length(code)-length(replace(code,$old0_1$  select id into pid from public.projects where slug='tuktuk-control';$old0_1$,''))) <> length($old0_1$  select id into pid from public.projects where slug='tuktuk-control';$old0_1$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.accept_job(uuid,text,uuid) anchor 1';
  end if;
  code:=replace(code,$old0_1$  select id into pid from public.projects where slug='tuktuk-control';$old0_1$,$new0_1$  select id into pid from public.projects where slug='tuktuk-control';
  select s.commission_enabled into commission_charge_enabled
    from public.project_marketplace_financial_settings s
    where s.project_id=pid for share;
  if commission_charge_enabled is null then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; end if;$new0_1$);
  if (length(code)-length(replace(code,$old0_2$         (e.metadata->>'billing_mode'='wallet_commission'$old0_2$,''))) <> length($old0_2$         (e.metadata->>'billing_mode'='wallet_commission'$old0_2$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.accept_job(uuid,text,uuid) anchor 2';
  end if;
  code:=replace(code,$old0_2$         (e.metadata->>'billing_mode'='wallet_commission'$old0_2$,$new0_2$         (e.metadata->>'billing_mode'='platform_free'
          and exists(select 1 from public.job_assignments x
            where x.project_id=pid and x.job_id=j.id and x.driver_user_id=actor
              and x.vehicle_id=target_vehicle_id
              and x.acceptance_idempotency_key=target_idempotency_key
              and x.billing_mode='platform_free' and x.commission_amount_snapshot=0)
          and not exists(select 1 from public.commission_reservations r
            where r.project_id=pid and r.job_id=j.id))
         or
         (e.metadata->>'billing_mode'='wallet_commission'$new0_2$);
  if (length(code)-length(replace(code,$old0_3$  else
    select f.wallet_currency into wallet_currency$old0_3$,''))) <> length($old0_3$  else
    select f.wallet_currency into wallet_currency$old0_3$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.accept_job(uuid,text,uuid) anchor 3';
  end if;
  code:=replace(code,$old0_3$  else
    select f.wallet_currency into wallet_currency$old0_3$,$new0_3$  elsif commission_charge_enabled is false then
    insert into public.job_assignments(
      project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,
      billing_mode,commission_amount_snapshot
    ) values(pid,j.id,actor,target_vehicle_id,target_idempotency_key,'platform_free',0);
  else
    select f.wallet_currency into wallet_currency$new0_3$);
  if (length(code)-length(replace(code,$old0_4$'billing_mode',case when trial_active then 'trial_free' else 'wallet_commission' end$old0_4$,''))) <> length($old0_4$'billing_mode',case when trial_active then 'trial_free' else 'wallet_commission' end$old0_4$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.accept_job(uuid,text,uuid) anchor 4';
  end if;
  code:=replace(code,$old0_4$'billing_mode',case when trial_active then 'trial_free' else 'wallet_commission' end$old0_4$,$new0_4$'billing_mode',case when trial_active then 'trial_free'
                          when not commission_charge_enabled then 'platform_free'
                          else 'wallet_commission' end$new0_4$);
  execute code;
end;
$patch0$;

do $patch1$
declare code text;
begin
  select pg_get_functiondef('app_private.finish_marketplace_job_core(uuid,text,uuid,uuid,text,uuid)'::regprocedure) into code;
  if code is null then raise exception 'COMMISSION_V3_MISSING_FUNCTION: app_private.finish_marketplace_job_core(uuid,text,uuid,uuid,text,uuid)'; end if;
  if (length(code)-length(replace(code,$old1_0$  if a.billing_mode='trial_free' then$old1_0$,''))) <> length($old1_0$  if a.billing_mode='trial_free' then$old1_0$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: app_private.finish_marketplace_job_core(uuid,text,uuid,uuid,text,uuid) anchor 0';
  end if;
  code:=replace(code,$old1_0$  if a.billing_mode='trial_free' then$old1_0$,$new1_0$  if a.billing_mode in ('trial_free','platform_free') then$new1_0$);
  execute code;
end;
$patch1$;

do $patch2$
declare code text;
begin
  select pg_get_functiondef('public.admin_resolve_marketplace_incident(uuid,uuid,text,text,uuid)'::regprocedure) into code;
  if code is null then raise exception 'COMMISSION_V3_MISSING_FUNCTION: public.admin_resolve_marketplace_incident(uuid,uuid,text,text,uuid)'; end if;
  if (length(code)-length(replace(code,$old2_0$if a.billing_mode='trial_free' then$old2_0$,''))) <> length($old2_0$if a.billing_mode='trial_free' then$old2_0$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.admin_resolve_marketplace_incident(uuid,uuid,text,text,uuid) anchor 0';
  end if;
  code:=replace(code,$old2_0$if a.billing_mode='trial_free' then$old2_0$,$new2_0$if a.billing_mode in ('trial_free','platform_free') then$new2_0$);
  execute code;
end;
$patch2$;

do $patch3$
declare code text;
begin
  select pg_get_functiondef('public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)'::regprocedure) into code;
  if code is null then raise exception 'COMMISSION_V3_MISSING_FUNCTION: public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)'; end if;
  if (length(code)-length(replace(code,$old3_0$elsif a.billing_mode<>'trial_free' or a.commission_amount_snapshot<>0$old3_0$,''))) <> length($old3_0$elsif a.billing_mode<>'trial_free' or a.commission_amount_snapshot<>0$old3_0$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid) anchor 0';
  end if;
  code:=replace(code,$old3_0$elsif a.billing_mode<>'trial_free' or a.commission_amount_snapshot<>0$old3_0$,$new3_0$elsif a.billing_mode not in ('trial_free','platform_free') or a.commission_amount_snapshot<>0$new3_0$);
  execute code;
end;
$patch3$;

do $patch4$
declare code text;
begin
  select pg_get_functiondef('public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid)'::regprocedure) into code;
  if code is null then raise exception 'COMMISSION_V3_MISSING_FUNCTION: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid)'; end if;
  if (length(code)-length(replace(code,$old4_0$  balance numeric;$old4_0$,''))) <> length($old4_0$  balance numeric;$old4_0$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 0';
  end if;
  code:=replace(code,$old4_0$  balance numeric;$old4_0$,$new4_0$  balance numeric;
  commission_charge_enabled boolean;$new4_0$);
  if (length(code)-length(replace(code,$old4_1$  balance:=coalesce(app_private.marketplace_wallet_available_balance(pid,actor),0);$old4_1$,''))) <> length($old4_1$  balance:=coalesce(app_private.marketplace_wallet_available_balance(pid,actor),0);$old4_1$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 1';
  end if;
  code:=replace(code,$old4_1$  balance:=coalesce(app_private.marketplace_wallet_available_balance(pid,actor),0);$old4_1$,$new4_1$  select s.commission_enabled into commission_charge_enabled from public.project_marketplace_financial_settings s where s.project_id=pid;
  if commission_charge_enabled is null then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; end if;
  balance:=coalesce(app_private.marketplace_wallet_available_balance(pid,actor),0);$new4_1$);
  if (length(code)-length(replace(code,$old4_2$      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'$old4_2$,''))) <> length($old4_2$      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'$old4_2$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 2';
  end if;
  code:=replace(code,$old4_2$      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'$old4_2$,$new4_2$      when not commission_charge_enabled
       and not (j.is_test and j.test_force_wallet_commission)
       and app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when not commission_charge_enabled then 'platform_free'
      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'$new4_2$);
  if (length(code)-length(replace(code,$old4_3$      when j.is_test and j.test_force_wallet_commission then j.commission_rate_snapshot$old4_3$,''))) <> length($old4_3$      when j.is_test and j.test_force_wallet_commission then j.commission_rate_snapshot$old4_3$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 3';
  end if;
  code:=replace(code,$old4_3$      when j.is_test and j.test_force_wallet_commission then j.commission_rate_snapshot$old4_3$,$new4_3$      when not commission_charge_enabled then 0::numeric
      when j.is_test and j.test_force_wallet_commission then j.commission_rate_snapshot$new4_3$);
  if (length(code)-length(replace(code,$old4_4$    case
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$old4_4$,''))) <> length($old4_4$    case
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$old4_4$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 4';
  end if;
  code:=replace(code,$old4_4$    case
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$old4_4$,$new4_4$    case
      when not commission_charge_enabled then 0::numeric
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$new4_4$);
  if (length(code)-length(replace(code,$old4_5$(case
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$old4_5$,''))) <> length($old4_5$(case
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$old4_5$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 5';
  end if;
  code:=replace(code,$old4_5$(case
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$old4_5$,$new4_5$(case
        when not commission_charge_enabled then 0::numeric
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)$new4_5$);
  if (length(code)-length(replace(code,$old4_6$      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)$old4_6$,''))) <> length($old4_6$      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)$old4_6$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 6';
  end if;
  code:=replace(code,$old4_6$      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)$old4_6$,$new4_6$      when not commission_charge_enabled then true
      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)$new4_6$);
  if (length(code)-length(replace(code,$old4_7$      app_private.has_active_marketplace_work_trial(actor)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)$old4_7$,''))) <> length($old4_7$      app_private.has_active_marketplace_work_trial(actor)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)$old4_7$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid) anchor 7';
  end if;
  code:=replace(code,$old4_7$      app_private.has_active_marketplace_work_trial(actor)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)$old4_7$,$new4_7$      not commission_charge_enabled
      or app_private.has_active_marketplace_work_trial(actor)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)$new4_7$);
  execute code;
end;
$patch4$;

do $patch5$
declare code text;
begin
  select pg_get_functiondef('public.get_my_marketplace_work_access(text)'::regprocedure) into code;
  if code is null then raise exception 'COMMISSION_V3_MISSING_FUNCTION: public.get_my_marketplace_work_access(text)'; end if;
  if (length(code)-length(replace(code,$old5_0$  legacy_deposit boolean;$old5_0$,''))) <> length($old5_0$  legacy_deposit boolean;$old5_0$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.get_my_marketplace_work_access(text) anchor 0';
  end if;
  code:=replace(code,$old5_0$  legacy_deposit boolean;$old5_0$,$new5_0$  legacy_deposit boolean;
  commission_charge_enabled boolean;$new5_0$);
  if (length(code)-length(replace(code,$old5_1$  select p.id into pid
  from public.projects p
  where p.slug='tuktuk-control';$old5_1$,''))) <> length($old5_1$  select p.id into pid
  from public.projects p
  where p.slug='tuktuk-control';$old5_1$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.get_my_marketplace_work_access(text) anchor 1';
  end if;
  code:=replace(code,$old5_1$  select p.id into pid
  from public.projects p
  where p.slug='tuktuk-control';$old5_1$,$new5_1$  select p.id into pid
  from public.projects p
  where p.slug='tuktuk-control';

  select s.commission_enabled into commission_charge_enabled
  from public.project_marketplace_financial_settings s where s.project_id=pid;$new5_1$);
  if (length(code)-length(replace(code,$old5_2$      when test_force then 'wallet_commission'$old5_2$,''))) <> length($old5_2$      when test_force then 'wallet_commission'$old5_2$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.get_my_marketplace_work_access(text) anchor 2';
  end if;
  code:=replace(code,$old5_2$      when test_force then 'wallet_commission'$old5_2$,$new5_2$      when not commission_charge_enabled and not test_force
         and promo.user_id is not null
         and promo.started_at<=now() and now()<promo.ends_at
         and active then 'trial_free'
      when not commission_charge_enabled then 'platform_free'
      when test_force then 'wallet_commission'$new5_2$);
  execute code;
end;
$patch5$;

do $patch6$
declare code text;
begin
  select pg_get_functiondef('public.get_my_marketplace_wallet()'::regprocedure) into code;
  if code is null then raise exception 'COMMISSION_V3_MISSING_FUNCTION: public.get_my_marketplace_wallet()'; end if;
  if (length(code)-length(replace(code,$old6_0$setting.commission_rate$old6_0$,''))) <> length($old6_0$setting.commission_rate$old6_0$) then
    raise exception 'COMMISSION_V3_FUNCTION_CHANGED: public.get_my_marketplace_wallet() anchor 0';
  end if;
  code:=replace(code,$old6_0$setting.commission_rate$old6_0$,$new6_0$case when setting.commission_enabled then setting.commission_rate else 0::numeric end$new6_0$);
  execute code;
end;
$patch6$;

-- No jobs, wallets, historical trials, campaigns, or existing reservations are modified.
-- Commission rates remain >0 in settings/jobs snapshots; disabled policy waives billing at acceptance.
