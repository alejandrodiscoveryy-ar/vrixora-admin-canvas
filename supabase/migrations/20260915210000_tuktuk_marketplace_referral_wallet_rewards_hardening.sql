-- R1.1: immutable historical cutover and legacy-days hardening for TukTuk.

create table public.marketplace_legacy_referral_reward_transitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  legacy_reward_id uuid not null references public.referral_reward_ledger(id) on delete restrict,
  relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  legacy_status_snapshot text not null check (legacy_status_snapshot in ('earned','applied')),
  legacy_reward_days_snapshot integer not null check (legacy_reward_days_snapshot > 0),
  reward_amount_snapshot numeric(14,2) not null check (reward_amount_snapshot > 0),
  reward_currency_snapshot text not null check (reward_currency_snapshot='CUP'),
  reward_rule_version_snapshot integer not null check (reward_rule_version_snapshot>=1),
  wallet_transaction_id uuid not null,
  migrated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique(project_id,legacy_reward_id), unique(project_id,wallet_transaction_id),
  foreign key(project_id,referrer_user_id,wallet_transaction_id) references public.wallet_transactions(project_id,user_id,id) on delete restrict,
  check(referrer_user_id<>referred_user_id)
);
alter table public.marketplace_legacy_referral_reward_transitions enable row level security;
revoke all on public.marketplace_legacy_referral_reward_transitions from public,anon,authenticated;
create or replace function app_private.prevent_marketplace_legacy_referral_transition_mutation() returns trigger language plpgsql security definer set search_path='' as $$ begin raise exception 'MARKETPLACE_LEGACY_REFERRAL_TRANSITIONS_IMMUTABLE' using errcode='42501'; end; $$;
revoke all on function app_private.prevent_marketplace_legacy_referral_transition_mutation() from public,anon,authenticated;
create trigger marketplace_legacy_referral_transitions_immutable before update or delete on public.marketplace_legacy_referral_reward_transitions for each row execute function app_private.prevent_marketplace_legacy_referral_transition_mutation();
create trigger audit_marketplace_legacy_referral_transitions after insert on public.marketplace_legacy_referral_reward_transitions for each row execute function app_private.capture_audit_event();

-- A cutover is idempotent: each eligible legacy reward owns exactly one ledger transaction.
create or replace function app_private.transition_legacy_marketplace_referral_rewards(target_project_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.project_referral_settings%rowtype; l public.referral_reward_ledger%rowtype; w public.wallets%rowtype; prior numeric; tx uuid; count_added integer:=0;
begin
 select * into s from public.project_referral_settings where project_id=target_project_id for update;
 if not found or s.reward_mode<>'marketplace_wallet_credit' or s.reward_amount is null or s.reward_currency<>'CUP' then raise exception 'MARKETPLACE_REFERRAL_REWARD_SETTINGS_REQUIRED' using errcode='22023'; end if;
 for l in select l.* from public.referral_reward_ledger l join public.referral_relationships r on r.id=l.relationship_id
   where l.project_id=target_project_id and not l.is_test and l.status in ('earned','applied') and r.referrer_user_id<>r.referred_user_id
   order by l.created_at,l.id for update of l loop
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('legacy-referral:'||target_project_id::text||':'||l.id::text,0));
   if exists(select 1 from public.marketplace_legacy_referral_reward_transitions t where t.project_id=target_project_id and t.legacy_reward_id=l.id) then continue; end if;
   insert into public.wallets(project_id,user_id,currency) select target_project_id,l.referrer_user_id,f.wallet_currency from public.project_marketplace_financial_settings f where f.project_id=target_project_id on conflict do nothing;
   select * into w from public.wallets where project_id=target_project_id and user_id=l.referrer_user_id for update;
   if not found or w.currency<>s.reward_currency then raise exception 'MARKETPLACE_REFERRAL_WALLET_CURRENCY_MISMATCH' using errcode='22023'; end if;
   prior:=app_private.marketplace_wallet_total_balance(target_project_id,l.referrer_user_id);
   insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata)
   values(target_project_id,l.referrer_user_id,s.reward_currency,'referral_credit',s.reward_amount,prior+s.reward_amount,'legacy_referral_transition',l.id::text,gen_random_uuid(),jsonb_build_object('legacy_reward_id',l.id,'relationship_id',l.relationship_id,'referrer_user_id',l.referrer_user_id,'referred_user_id',l.referred_user_id,'legacy_status',l.status,'legacy_reward_days',l.reward_days,'reward_amount',s.reward_amount,'reward_currency',s.reward_currency,'reward_rule_version',s.reward_rule_version,'transition_type','legacy_referral_cutover')) returning id into tx;
   insert into public.marketplace_legacy_referral_reward_transitions(project_id,legacy_reward_id,relationship_id,referrer_user_id,referred_user_id,legacy_status_snapshot,legacy_reward_days_snapshot,reward_amount_snapshot,reward_currency_snapshot,reward_rule_version_snapshot,wallet_transaction_id)
   values(target_project_id,l.id,l.relationship_id,l.referrer_user_id,l.referred_user_id,l.status,l.reward_days,s.reward_amount,s.reward_currency,s.reward_rule_version,tx);
   count_added:=count_added+1;
 end loop; return count_added;
end;
$$;

-- Execute the one-time cutover as part of this migration; no legacy row or licence is mutated.
do $$ declare pid uuid; begin select id into pid from public.projects where slug='tuktuk-control'; if pid is not null then perform app_private.transition_legacy_marketplace_referral_rewards(pid); end if; end $$;

-- Correct normal settlement sequencing: the settled event is the qualification hook.
drop trigger if exists marketplace_referral_after_settlement on public.jobs;
create or replace function app_private.marketplace_referral_after_settle_event() returns trigger language plpgsql security definer set search_path='' as $$
declare driver_id uuid;
begin
 if new.action='settle' and new.to_status='settled' then select assigned_driver_user_id into driver_id from public.jobs where project_id=new.project_id and id=new.job_id; if driver_id is not null then perform app_private.maybe_award_marketplace_referral_reward(new.project_id,driver_id,new.job_id); end if; end if; return new;
end;
$$;
create trigger marketplace_referral_after_settle_event after insert on public.job_events for each row execute function app_private.marketplace_referral_after_settle_event();

-- Historical valid rewards block a new reward; reverted, pending and test records do not.
create or replace function app_private.maybe_award_marketplace_referral_reward(target_project_id uuid,target_referred_user_id uuid,target_job_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.project_referral_settings%rowtype; rel public.referral_relationships%rowtype; first_q record; w public.wallets%rowtype; prior numeric; tx uuid; reward uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketplace-referral:'||target_project_id::text||':'||target_referred_user_id::text,0));
 select * into s from public.project_referral_settings where project_id=target_project_id for update; if not found or s.reward_mode<>'marketplace_wallet_credit' or not s.reward_enabled then return null; end if;
 select * into first_q from app_private.marketplace_referral_first_qualification(target_project_id,target_referred_user_id); if not found or first_q.job_id<>target_job_id or first_q.qualified_at<s.reward_effective_at then return null; end if;
 select * into rel from public.referral_relationships where project_id=target_project_id and referred_user_id=target_referred_user_id and not is_test for update; if not found or rel.referrer_user_id=rel.referred_user_id or rel.created_at>first_q.qualified_at then return null; end if;
 if not exists(select 1 from public.marketplace_work_trials t where t.project_id=target_project_id and t.user_id=target_referred_user_id and t.started_at<=first_q.qualified_at) then return null; end if;
 if exists(select 1 from public.referral_reward_ledger l where l.project_id=target_project_id and l.referred_user_id=target_referred_user_id and not l.is_test and l.status in ('earned','applied')) or exists(select 1 from public.marketplace_legacy_referral_reward_transitions t where t.project_id=target_project_id and t.referred_user_id=target_referred_user_id) or exists(select 1 from public.marketplace_referral_rewards r where r.project_id=target_project_id and r.referred_user_id=target_referred_user_id) then return null; end if;
 insert into public.wallets(project_id,user_id,currency) select target_project_id,rel.referrer_user_id,f.wallet_currency from public.project_marketplace_financial_settings f where f.project_id=target_project_id on conflict do nothing; select * into w from public.wallets where project_id=target_project_id and user_id=rel.referrer_user_id for update; prior:=app_private.marketplace_wallet_total_balance(target_project_id,rel.referrer_user_id);
 insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata) values(target_project_id,rel.referrer_user_id,s.reward_currency,'referral_credit',s.reward_amount,prior+s.reward_amount,'referral_reward',target_job_id::text,gen_random_uuid(),jsonb_build_object('relationship_id',rel.id,'referrer_user_id',rel.referrer_user_id,'referred_user_id',target_referred_user_id,'qualification_job_id',target_job_id,'reward_amount',s.reward_amount,'reward_currency',s.reward_currency,'reward_rule_version',s.reward_rule_version)) returning id into tx;
 insert into public.marketplace_referral_rewards(project_id,relationship_id,referrer_user_id,referred_user_id,qualification_job_id,reward_amount_snapshot,reward_currency_snapshot,reward_rule_version_snapshot,wallet_transaction_id,qualified_at) values(target_project_id,rel.id,rel.referrer_user_id,target_referred_user_id,target_job_id,s.reward_amount,s.reward_currency,s.reward_rule_version,tx,first_q.qualified_at) returning id into reward; return reward;
end;
$$;

-- Freeze every future legacy mutation for wallet mode, including reversals; legacy projects retain their existing implementation.
create or replace function app_private.p0d_reconcile_payment_reward() returns trigger language plpgsql security definer set search_path='' as $$
declare payment_record public.payments%rowtype; relationship public.referral_relationships%rowtype; first_payment uuid; configured_days integer;
begin
 payment_record:=case when tg_op='DELETE' then old else new end;
 if exists(select 1 from public.project_referral_settings s where s.project_id=payment_record.project_id and s.reward_mode='marketplace_wallet_credit') then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op<>'DELETE' and new.status='paid' and not new.is_test then
   select * into relationship from public.referral_relationships where project_id=new.project_id and referred_user_id=new.user_id and not is_test for update;
   if found then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(relationship.id::text,0)); select p.id into first_payment from public.payments p where p.project_id=new.project_id and p.user_id=new.user_id and p.status='paid' and not p.is_test order by p.charged_at,p.created_at,p.id limit 1;
     if first_payment=new.id then select reward_days into configured_days from public.project_referral_settings where project_id=new.project_id;
       insert into public.referral_reward_ledger(project_id,relationship_id,referrer_user_id,referred_user_id,qualifying_payment_id,reward_days,status,is_test,created_by) values(new.project_id,relationship.id,relationship.referrer_user_id,relationship.referred_user_id,new.id,configured_days,'earned',false,new.recorded_by) on conflict(project_id,referred_user_id) where not is_test do nothing;
       perform app_private.p0d_apply_earned_rewards(new.project_id,relationship.referrer_user_id);
     end if;
   end if;
 elsif (tg_op='DELETE' and old.status='paid' and not old.is_test) or (tg_op='UPDATE' and old.status='paid' and not old.is_test and new.status<>'paid') then perform app_private.p0d_revert_reward_for_payment(payment_record); end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create or replace function app_private.prevent_wallet_mode_legacy_reward() returns trigger language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.project_referral_settings s where s.project_id=new.project_id and s.reward_mode='marketplace_wallet_credit') then raise exception 'LEGACY_REFERRAL_REWARD_MODE_DISABLED' using errcode='22023'; end if; return new; end;
$$;
revoke all on function app_private.prevent_wallet_mode_legacy_reward() from public,anon,authenticated;
create trigger prevent_wallet_mode_legacy_reward before insert on public.referral_reward_ledger for each row execute function app_private.prevent_wallet_mode_legacy_reward();

create or replace function app_private.marketplace_referral_relationship_locked(target_project_id uuid,target_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.marketplace_referral_first_qualification(target_project_id,target_user_id))
   or exists(select 1 from public.marketplace_referral_rewards r where r.project_id=target_project_id and r.referred_user_id=target_user_id)
   or exists(select 1 from public.marketplace_legacy_referral_reward_transitions t where t.project_id=target_project_id and t.referred_user_id=target_user_id)
   or exists(select 1 from public.referral_reward_ledger l where l.project_id=target_project_id and l.referred_user_id=target_user_id and not l.is_test and l.status in ('earned','applied'));
$$;
create or replace function public.admin_link_client_referrer_code(target_project_id uuid,target_client_id uuid,target_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; referrer_id uuid; existing public.referral_relationships%rowtype; relationship_id uuid; wallet_mode boolean;
begin
 actor:=app_private.require_project_permission(target_project_id,'commercial.manage');
 select reward_mode='marketplace_wallet_credit' into wallet_mode from public.project_referral_settings where project_id=target_project_id;
 if not exists(select 1 from public.profiles where id=target_client_id) then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;
 if coalesce(wallet_mode,false) and not exists(select 1 from public.driver_profiles d where d.project_id=target_project_id and d.user_id=target_client_id) then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;
 select c.user_id into referrer_id from public.project_referral_codes c where c.project_id=target_project_id and c.code=upper(btrim(target_code)); if not found then raise exception 'REFERRAL_CODE_NOT_FOUND' using errcode='P0002'; end if;
 if referrer_id=target_client_id then raise exception 'SELF_REFERRAL_NOT_ALLOWED' using errcode='22023'; end if;
 select * into existing from public.referral_relationships where project_id=target_project_id and referred_user_id=target_client_id and not is_test for update;
 if found and existing.referrer_user_id=referrer_id and existing.referral_code=upper(btrim(target_code)) then return existing.id; end if;
 if coalesce(wallet_mode,false) then
   if app_private.marketplace_referral_relationship_locked(target_project_id,target_client_id) then raise exception 'REFERRAL_RELATIONSHIP_LOCKED' using errcode='22023'; end if;
 else
   if not found and exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=target_client_id and p.status='paid' and not p.is_test) then raise exception 'REFERRAL_RELATIONSHIP_LOCKED' using errcode='22023'; end if;
   if found and (exists(select 1 from public.referral_reward_ledger l where l.relationship_id=existing.id) or exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=target_client_id and p.status='paid' and not p.is_test)) then raise exception 'REFERRAL_RELATIONSHIP_LOCKED' using errcode='22023'; end if;
 end if;
 if found then update public.referral_relationships set referrer_user_id=referrer_id,referral_code=upper(btrim(target_code)),source='administrative_correction',updated_at=now(),updated_by=actor where id=existing.id returning id into relationship_id;
 else insert into public.referral_relationships(project_id,referrer_user_id,referred_user_id,referral_code,source,is_test,created_by,updated_by) values(target_project_id,referrer_id,target_client_id,upper(btrim(target_code)),'administrative',false,actor,actor) returning id into relationship_id; end if;
 return relationship_id;
end;
$$;
create or replace function public.admin_get_client_referral_summary(target_project_id uuid,target_client_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare own_code text; website text; wallet_mode boolean; can_link boolean;
begin
 perform app_private.require_project_permission(target_project_id,'commercial.view');
 select reward_mode='marketplace_wallet_credit' into wallet_mode from public.project_referral_settings where project_id=target_project_id;
 if not exists(select 1 from public.profiles where id=target_client_id) then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;
 own_code:=app_private.p0d_ensure_referral_code(target_project_id,target_client_id); select website_url into website from public.projects where id=target_project_id;
 can_link:=case when coalesce(wallet_mode,false) then not app_private.marketplace_referral_relationship_locked(target_project_id,target_client_id) and not exists(select 1 from public.referral_relationships r where r.project_id=target_project_id and r.referred_user_id=target_client_id and not r.is_test)
 else not exists(select 1 from public.referral_relationships r where r.project_id=target_project_id and r.referred_user_id=target_client_id and not r.is_test) and not exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=target_client_id and p.status='paid' and not p.is_test) end;
 return jsonb_build_object('code',own_code,'link',case when website is null then null else website||case when position('?' in website)>0 then '&' else '?' end||'ref='||own_code end,
 'referred_by',(select jsonb_build_object('relationship_id',r.id,'user_id',r.referrer_user_id,'name',coalesce(p.display_name,p.email),'code',c.code,'created_at',r.created_at) from public.referral_relationships r join public.profiles p on p.id=r.referrer_user_id left join public.project_referral_codes c on c.project_id=r.project_id and c.user_id=r.referrer_user_id where r.project_id=target_project_id and r.referred_user_id=target_client_id and not r.is_test),
 'can_link_referrer',can_link,
 'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=target_client_id and not r.is_test),
 'earned_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=target_client_id and l.status='earned' and not l.is_test),
 'applied_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=target_client_id and l.status='applied' and not l.is_test),
 'pending_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=target_client_id and l.status='earned' and not l.is_test),
 'applied_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=target_client_id and l.status='applied' and not l.is_test));
end;
$$;

-- Every existing Marketplace driver gets a stable code without changing existing values.
do $$ declare r record; begin for r in select d.project_id,d.user_id from public.driver_profiles d join public.projects p on p.id=d.project_id where p.slug='tuktuk-control' loop perform app_private.p0d_ensure_referral_code(r.project_id,r.user_id); end loop; end $$;
revoke all on function app_private.transition_legacy_marketplace_referral_rewards(uuid),app_private.marketplace_referral_after_settle_event(),app_private.prevent_marketplace_legacy_referral_transition_mutation() from public,anon,authenticated;
