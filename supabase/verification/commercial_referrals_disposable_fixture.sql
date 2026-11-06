\set ON_ERROR_STOP on
-- Solo para PostgreSQL 17 efímero en CI; NUNCA ejecutar en producción.
create schema app_private;
create or replace function app_private.require_project_permission(target_project_id uuid, target_permission text)
returns uuid language plpgsql as $$
begin
  if target_permission <> 'commercial.view'
     or current_setting('tuktuk.fixture_commercial', true) is distinct from 'on' then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  return '90000000-0000-0000-0000-000000000001'::uuid;
end; $$;
create or replace function app_private.has_project_permission(target_project_id uuid, target_permission text)
returns boolean language sql as $$
  select target_permission = 'payments.view'
     and current_setting('tuktuk.fixture_financial', true) = 'on'
$$;

create table public.profiles(id uuid primary key, display_name text);
create table public.referral_relationships(
 id uuid primary key,project_id uuid,referrer_user_id uuid,referred_user_id uuid,referral_code text,
 created_at timestamptz,is_test boolean
);
create table public.driver_profiles(project_id uuid,user_id uuid,status text);
create table public.jobs(
 id uuid primary key,project_id uuid,assigned_driver_user_id uuid,currency text,
 final_price numeric,is_test boolean,test_deleted_at timestamptz,status text
);
create table public.commission_reservations(
 id uuid primary key,project_id uuid,job_id uuid,currency text,status text,
 real_reserved_amount numeric,promotional_reserved_amount numeric
);
create table public.marketplace_referral_rewards(
 relationship_id uuid,project_id uuid,referrer_user_id uuid,wallet_transaction_id uuid
);
create table public.wallet_transactions(
 id uuid primary key,project_id uuid,user_id uuid,transaction_type text,currency text,promotional_delta numeric
);

insert into public.profiles(id,display_name) values
 ('10000000-0000-0000-0000-000000000001','Referente con 57'),
 ('10000000-0000-0000-0000-000000000002','Referente con 2'),
 ('10000000-0000-0000-0000-000000000003','Referente con 1');
insert into public.profiles(id,display_name)
select ('30000000-0000-0000-0000-'||lpad(gs::text,12,'0'))::uuid,'Referido '||gs
from generate_series(1,61) gs;

insert into public.referral_relationships(
 id,project_id,referrer_user_id,referred_user_id,referral_code,created_at,is_test
)
select
 ('40000000-0000-0000-0000-'||lpad(gs::text,12,'0'))::uuid,
 '20000000-0000-0000-0000-000000000001'::uuid,
 case when gs <= 57 then '10000000-0000-0000-0000-000000000001'::uuid
      when gs <= 59 then '10000000-0000-0000-0000-000000000002'::uuid
      else '10000000-0000-0000-0000-000000000003'::uuid end,
 ('30000000-0000-0000-0000-'||lpad(gs::text,12,'0'))::uuid,
 'REF-'||gs,now()-gs*interval '1 day',gs=61
from generate_series(1,61) gs;

insert into public.driver_profiles values
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','active');

insert into public.jobs values
 ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','CUP',250,false,null,'settled'),
 ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','CUP',450,false,null,'settled'),
 ('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','CUP',9999,true,null,'settled'),
 ('50000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','CUP',9999,false,null,'cancelled_by_driver');

insert into public.commission_reservations values
 ('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','CUP','consumed',90,10),
 ('60000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','CUP','consumed',40,0),
 ('60000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','CUP','consumed',999,0),
 ('60000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','CUP','consumed',999,0);

insert into public.wallet_transactions values
 ('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','referral_credit','CUP',100);
insert into public.marketplace_referral_rewards values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001');

select set_config('tuktuk.fixture_commercial','on',false);
select set_config('tuktuk.fixture_financial','on',false);

do $$
declare
  report jsonb;
  high_referrer jsonb;
begin
  report := public.admin_get_commercial_referral_network_v1('20000000-0000-0000-0000-000000000001');
  if (report->'summary'->>'referrers')::integer <> 3 then raise exception 'expected 3 referrers'; end if;
  if (report->'summary'->>'referred')::integer <> 60 then raise exception 'expected 60 real relationships'; end if;
  if (report->'summary'->>'settled_jobs')::integer <> 2 then raise exception 'test jobs were counted'; end if;
  if (report->'summary'->>'fare_cup')::numeric <> 700 then raise exception 'gross fares wrong'; end if;
  if (report->'summary'->>'real_commissions_cup')::numeric <> 130 then raise exception 'real commissions wrong'; end if;
  if (report->'summary'->>'promotional_commissions_cup')::numeric <> 10 then raise exception 'promo commissions wrong'; end if;
  if (report->'summary'->>'referral_credit_cup')::numeric <> 100 then raise exception 'referral credits wrong'; end if;
  select item into high_referrer
  from jsonb_array_elements(report->'referrers') item
  where item->>'referrer_name'='Referente con 57';
  if (high_referrer->>'referred_count')::integer <> 57 then raise exception 'lost referred people'; end if;
  if jsonb_array_length(high_referrer->'people') <> 57 then raise exception 'detail list is truncated'; end if;
end;
$$;

select set_config('tuktuk.fixture_financial','off',false);
do $$
declare report jsonb;
begin
  report := public.admin_get_commercial_referral_network_v1('20000000-0000-0000-0000-000000000001');
  if report->'summary'->>'real_commissions_cup' is not null then raise exception 'finance data leaked'; end if;
  if report->'referrers'->0->'people'->0->>'referral_credit_cup' is not null then raise exception 'credit leaked'; end if;
end;
$$;

select set_config('tuktuk.fixture_commercial','off',false);
do $$
begin
  begin
    perform public.admin_get_commercial_referral_network_v1('20000000-0000-0000-0000-000000000001');
    raise exception 'commercial permission bypassed';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;
