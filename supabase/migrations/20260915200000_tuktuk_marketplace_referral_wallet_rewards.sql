-- TukTuk Marketplace: replaces future referral licence-days with immutable wallet credit.

alter table public.project_referral_settings
  add column if not exists reward_mode text not null default 'legacy_days'
    check (reward_mode in ('legacy_days','marketplace_wallet_credit')),
  add column if not exists reward_enabled boolean not null default true,
  add column if not exists reward_amount numeric(14,2),
  add column if not exists reward_currency text,
  add column if not exists reward_rule_version integer not null default 1 check (reward_rule_version >= 1),
  add column if not exists reward_effective_at timestamptz;

alter table public.project_referral_settings
  add constraint project_referral_settings_wallet_reward_check check
  (reward_mode <> 'marketplace_wallet_credit' or (reward_amount > 0 and reward_currency = 'CUP' and reward_effective_at is not null));

update public.project_referral_settings s
set reward_mode='marketplace_wallet_credit', reward_enabled=true, reward_amount=100.00,
    reward_currency='CUP', reward_rule_version=1, reward_effective_at=now()
from public.projects p where p.id=s.project_id and p.slug='tuktuk-control';

alter table public.wallet_transactions drop constraint if exists wallet_transactions_transaction_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_transaction_type_check
  check (transaction_type in ('topup','commission','adjustment','reversal','referral_credit'));

create table public.marketplace_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  qualification_job_id uuid not null,
  reward_amount_snapshot numeric(14,2) not null check (reward_amount_snapshot > 0),
  reward_currency_snapshot text not null check (reward_currency_snapshot = 'CUP'),
  reward_rule_version_snapshot integer not null check (reward_rule_version_snapshot >= 1),
  wallet_transaction_id uuid not null,
  qualified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(project_id,referred_user_id), unique(project_id,qualification_job_id),
  unique(project_id,wallet_transaction_id),
  foreign key(project_id,qualification_job_id) references public.jobs(project_id,id) on delete restrict,
  foreign key(project_id,referrer_user_id,wallet_transaction_id) references public.wallet_transactions(project_id,user_id,id) on delete restrict,
  check (referrer_user_id <> referred_user_id)
);
create index marketplace_referral_rewards_referrer_idx on public.marketplace_referral_rewards(project_id,referrer_user_id,qualified_at desc);
alter table public.marketplace_referral_rewards enable row level security;
revoke all on public.marketplace_referral_rewards from public, anon, authenticated;

create or replace function app_private.prevent_marketplace_referral_reward_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'MARKETPLACE_REFERRAL_REWARDS_IMMUTABLE' using errcode='42501'; end;
$$;
revoke all on function app_private.prevent_marketplace_referral_reward_mutation() from public,anon,authenticated;
create trigger marketplace_referral_rewards_immutable before update or delete on public.marketplace_referral_rewards
for each row execute function app_private.prevent_marketplace_referral_reward_mutation();
create trigger audit_marketplace_referral_rewards after insert on public.marketplace_referral_rewards
for each row execute function app_private.capture_audit_event();

create or replace function app_private.marketplace_referral_first_qualification(target_project_id uuid,target_user_id uuid)
returns table(job_id uuid, qualified_at timestamptz) language sql stable security definer set search_path='' as $$
  select q.job_id,q.qualified_at from (
    select j.id as job_id,e.created_at as qualified_at from public.jobs j
    join public.job_events e on e.project_id=j.project_id and e.job_id=j.id and e.to_status='settled' and e.action='settle'
    where j.project_id=target_project_id and j.assigned_driver_user_id=target_user_id
    union all
    select j.id,r.resolved_at from public.jobs j join public.marketplace_incident_resolutions r on r.project_id=j.project_id and r.job_id=j.id
    where j.project_id=target_project_id and j.assigned_driver_user_id=target_user_id and r.resolution='completed'
  ) q order by q.qualified_at,q.job_id limit 1;
$$;

create or replace function app_private.maybe_award_marketplace_referral_reward(target_project_id uuid,target_referred_user_id uuid,target_job_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.project_referral_settings%rowtype; rel public.referral_relationships%rowtype; first_q record;
  w public.wallets%rowtype; prior numeric; tx uuid; reward uuid; key uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketplace-referral:'||target_project_id::text||':'||target_referred_user_id::text,0));
  select * into s from public.project_referral_settings where project_id=target_project_id for update;
  if not found or s.reward_mode<>'marketplace_wallet_credit' or not s.reward_enabled then return null; end if;
  select * into first_q from app_private.marketplace_referral_first_qualification(target_project_id,target_referred_user_id);
  if not found or first_q.job_id<>target_job_id or first_q.qualified_at<s.reward_effective_at then return null; end if;
  select * into rel from public.referral_relationships where project_id=target_project_id and referred_user_id=target_referred_user_id and not is_test for update;
  if not found or rel.referrer_user_id=rel.referred_user_id or rel.created_at>first_q.qualified_at then return null; end if;
  if not exists(select 1 from public.marketplace_work_trials t where t.project_id=target_project_id and t.user_id=target_referred_user_id and t.started_at<=first_q.qualified_at) then return null; end if;
  if exists(select 1 from public.referral_reward_ledger l where l.project_id=target_project_id and l.referred_user_id=target_referred_user_id and not l.is_test)
     or exists(select 1 from public.marketplace_referral_rewards r where r.project_id=target_project_id and r.referred_user_id=target_referred_user_id) then return null; end if;
  insert into public.wallets(project_id,user_id,currency) select target_project_id,rel.referrer_user_id,f.wallet_currency from public.project_marketplace_financial_settings f where f.project_id=target_project_id on conflict do nothing;
  select * into w from public.wallets where project_id=target_project_id and user_id=rel.referrer_user_id for update;
  if not found or w.currency<>s.reward_currency then raise exception 'MARKETPLACE_REFERRAL_WALLET_CURRENCY_MISMATCH' using errcode='22023'; end if;
  prior:=app_private.marketplace_wallet_total_balance(target_project_id,rel.referrer_user_id); key:=gen_random_uuid();
  insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata)
  values(target_project_id,rel.referrer_user_id,s.reward_currency,'referral_credit',s.reward_amount,prior+s.reward_amount,'referral_reward',target_job_id::text,key,
    jsonb_build_object('relationship_id',rel.id,'referrer_user_id',rel.referrer_user_id,'referred_user_id',target_referred_user_id,'qualification_job_id',target_job_id,'reward_amount',s.reward_amount,'reward_currency',s.reward_currency,'reward_rule_version',s.reward_rule_version)) returning id into tx;
  insert into public.marketplace_referral_rewards(project_id,relationship_id,referrer_user_id,referred_user_id,qualification_job_id,reward_amount_snapshot,reward_currency_snapshot,reward_rule_version_snapshot,wallet_transaction_id,qualified_at)
  values(target_project_id,rel.id,rel.referrer_user_id,target_referred_user_id,target_job_id,s.reward_amount,s.reward_currency,s.reward_rule_version,tx,first_q.qualified_at) returning id into reward;
  return reward;
end;
$$;

create or replace function app_private.marketplace_referral_after_settlement()
returns trigger language plpgsql security definer set search_path='' as $$
begin if new.status='settled' and old.status is distinct from 'settled' and new.assigned_driver_user_id is not null then perform app_private.maybe_award_marketplace_referral_reward(new.project_id,new.assigned_driver_user_id,new.id); end if; return new; end;
$$;
create trigger marketplace_referral_after_settlement after update of status on public.jobs for each row execute function app_private.marketplace_referral_after_settlement();
create or replace function app_private.marketplace_referral_after_incident_resolution()
returns trigger language plpgsql security definer set search_path='' as $$
begin if new.resolution='completed' then perform app_private.maybe_award_marketplace_referral_reward(new.project_id,new.driver_user_id,new.job_id); end if; return new; end;
$$;
create trigger marketplace_referral_after_incident_resolution after insert on public.marketplace_incident_resolutions for each row execute function app_private.marketplace_referral_after_incident_resolution();

create or replace function public.admin_set_marketplace_referral_reward_settings(target_project_id uuid,target_enabled boolean,target_amount numeric,target_currency text)
returns public.project_referral_settings language plpgsql security definer set search_path='' as $$
declare actor uuid; result public.project_referral_settings%rowtype; changed boolean;
begin
 actor:=app_private.require_project_permission(target_project_id,'settings.manage');
 if target_amount is null or target_amount<=0 or target_currency<>'CUP' then raise exception 'INVALID_MARKETPLACE_REFERRAL_REWARD' using errcode='22023'; end if;
 select * into result from public.project_referral_settings where project_id=target_project_id for update; if not found then raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
 if not exists(select 1 from public.projects where id=target_project_id and slug='tuktuk-control') or result.reward_mode<>'marketplace_wallet_credit' then raise exception 'LEGACY_REFERRAL_REWARD_MODE_DISABLED' using errcode='22023'; end if;
 if target_currency<>(select wallet_currency from public.project_marketplace_financial_settings where project_id=target_project_id) then raise exception 'MARKETPLACE_REFERRAL_CURRENCY_MISMATCH' using errcode='22023'; end if;
 changed:=result.reward_enabled is distinct from target_enabled or result.reward_amount is distinct from target_amount or result.reward_currency is distinct from target_currency;
 update public.project_referral_settings set reward_enabled=target_enabled,reward_amount=target_amount,reward_currency=target_currency,reward_rule_version=case when changed then result.reward_rule_version+1 else result.reward_rule_version end,updated_by=actor,updated_at=now() where project_id=target_project_id returning * into result;
 return result;
end;
$$;

create or replace function public.admin_set_referral_reward_days(target_project_id uuid,target_reward_days integer)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin actor:=app_private.require_project_permission(target_project_id,'settings.manage');
 if exists(select 1 from public.projects p join public.project_referral_settings s on s.project_id=p.id where p.id=target_project_id and p.slug='tuktuk-control' and s.reward_mode='marketplace_wallet_credit') then raise exception 'LEGACY_REFERRAL_REWARD_MODE_DISABLED' using errcode='22023'; end if;
 if target_reward_days not between 1 and 365 then raise exception 'INVALID_REWARD_DAYS' using errcode='22023'; end if;
 update public.project_referral_settings set reward_days=target_reward_days,updated_by=actor,updated_at=now() where project_id=target_project_id; if not found then raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode='P0002'; end if; return target_reward_days;
end;
$$;

create or replace function public.admin_get_marketplace_referral_reward_settings(target_project_id uuid)
returns table(reward_mode text,reward_enabled boolean,reward_amount numeric,reward_currency text,reward_rule_version integer,reward_effective_at timestamptz) language plpgsql security definer set search_path='' as $$
begin perform app_private.require_project_permission(target_project_id,'settings.view'); return query select s.reward_mode,s.reward_enabled,s.reward_amount,s.reward_currency,s.reward_rule_version,s.reward_effective_at from public.project_referral_settings s where s.project_id=target_project_id; end;
$$;

create or replace function app_private.marketplace_driver_referral_code()
returns trigger language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.projects p where p.id=new.project_id and p.slug='tuktuk-control') then perform app_private.p0d_ensure_referral_code(new.project_id,new.user_id); end if; return new; end;
$$;
create trigger marketplace_driver_referral_code after insert on public.driver_profiles for each row execute function app_private.marketplace_driver_referral_code();

revoke all on function app_private.marketplace_referral_first_qualification(uuid,uuid),app_private.maybe_award_marketplace_referral_reward(uuid,uuid,uuid),app_private.marketplace_referral_after_settlement(),app_private.marketplace_referral_after_incident_resolution(),app_private.marketplace_driver_referral_code() from public,anon,authenticated;
revoke all on function public.admin_set_marketplace_referral_reward_settings(uuid,boolean,numeric,text),public.admin_get_marketplace_referral_reward_settings(uuid) from public,anon;
grant execute on function public.admin_set_marketplace_referral_reward_settings(uuid,boolean,numeric,text),public.admin_get_marketplace_referral_reward_settings(uuid) to authenticated;

-- Keep the legacy engine intact for other projects, but it must never create or apply days for TukTuk after cutover.
create or replace function app_private.p0d_reconcile_payment_reward()
returns trigger language plpgsql security definer set search_path='' as $$
declare payment_record public.payments%rowtype; relationship public.referral_relationships%rowtype; first_payment uuid; configured_days integer;
begin
 payment_record:=case when tg_op='DELETE' then old else new end;
 if tg_op<>'DELETE' and new.status='paid' and not new.is_test then
   if exists(select 1 from public.project_referral_settings s where s.project_id=new.project_id and s.reward_mode='marketplace_wallet_credit') then return new; end if;
   select * into relationship from public.referral_relationships where project_id=new.project_id and referred_user_id=new.user_id and not is_test for update;
   if found then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(relationship.id::text,0));
     select p.id into first_payment from public.payments p where p.project_id=new.project_id and p.user_id=new.user_id and p.status='paid' and not p.is_test order by p.charged_at,p.created_at,p.id limit 1;
     if first_payment=new.id then select reward_days into configured_days from public.project_referral_settings where project_id=new.project_id;
       insert into public.referral_reward_ledger(project_id,relationship_id,referrer_user_id,referred_user_id,qualifying_payment_id,reward_days,status,is_test,created_by)
       values(new.project_id,relationship.id,relationship.referrer_user_id,relationship.referred_user_id,new.id,configured_days,'earned',false,new.recorded_by)
       on conflict(project_id,referred_user_id) where not is_test do nothing;
       perform app_private.p0d_apply_earned_rewards(new.project_id,relationship.referrer_user_id);
     end if;
   end if;
 elsif (tg_op='DELETE' and old.status='paid' and not old.is_test) or (tg_op='UPDATE' and old.status='paid' and not old.is_test and new.status<>'paid') then
   perform app_private.p0d_revert_reward_for_payment(payment_record);
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function app_private.p0d_apply_earned_rewards(target_project_id uuid,target_referrer_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare target_license public.licenses%rowtype; reward public.referral_reward_ledger%rowtype; actor uuid; previous_expiry timestamptz; next_expiry timestamptz; applied_count integer:=0;
begin
 -- En modo saldo, solo pueden aplicarse los dias historicos ya ganados antes del corte; nunca se generan premios nuevos en dias.
 select l.* into target_license from public.licenses l where l.project_id=target_project_id and l.user_id=target_referrer_id and l.status='active' and l.license_type not in ('trial','admin') and l.expires_at is not null and l.expires_at>now() order by l.expires_at desc,l.updated_at desc,l.id limit 1 for update;
 if not found then return 0; end if;
 select coalesce(p.recorded_by,pr.owner_id) into actor from public.projects pr left join public.payments p on p.id=target_license.last_payment_id where pr.id=target_project_id;
 for reward in select l.* from public.referral_reward_ledger l join public.referral_relationships r on r.id=l.relationship_id join public.project_referral_settings s on s.project_id=l.project_id where l.project_id=target_project_id and l.referrer_user_id=target_referrer_id and l.status='earned' and not l.is_test and not r.is_test and (s.reward_mode<>'marketplace_wallet_credit' or l.created_at<s.reward_effective_at) order by l.created_at,l.id for update of l loop
   previous_expiry:=target_license.expires_at; next_expiry:=previous_expiry+make_interval(days=>reward.reward_days);
   update public.referral_reward_ledger set status='applied',applied_license_id=target_license.id,previous_expires_at=previous_expiry,new_expires_at=next_expiry,applied_at=now(),application_note='Aplicada automáticamente a licencia pagada activa',updated_at=now() where id=reward.id;
   update public.licenses set expires_at=next_expiry,updated_at=now() where id=target_license.id;
   insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata) values(target_project_id,target_license.id,'referral_reward_applied','Días de referido aplicados',actor,jsonb_build_object('reward_id',reward.id,'referred_user_id',reward.referred_user_id,'reward_days',reward.reward_days,'previous_expires_at',previous_expiry,'new_expires_at',next_expiry));
   target_license.expires_at:=next_expiry; applied_count:=applied_count+1;
 end loop; return applied_count;
end;
$$;
