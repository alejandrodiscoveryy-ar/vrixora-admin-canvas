-- R7 PREPARACION: congelacion explicita de derechos antiguos y estado visible.
-- NO otorga CUP, NO extiende licencias, NO ejecuta la transicion retroactiva.
-- Aplicar SOLO despues de las migraciones del 20260915 y tras una prueba SQL aislada.

-- Bloqueo conservador: si la fotografia real cambio desde la auditoria,
-- detener la migracion para reevaluar los derechos, sin asignaciones aproximadas.
do $$
declare pid uuid; total integer; applied_count integer; earned_count integer;
        applied_days integer; earned_days integer;
begin
  select id into strict pid from public.projects where slug='tuktuk-control';
  if not exists(select 1 from public.project_referral_settings s where s.project_id=pid and s.reward_mode='marketplace_wallet_credit' and s.reward_effective_at is not null) then
    raise exception 'REFERRAL_WALLET_MODE_NOT_READY';
  end if;
  select count(*)::integer,
    count(*) filter(where l.status='applied')::integer,
    count(*) filter(where l.status='earned')::integer,
    coalesce(sum(l.reward_days) filter(where l.status='applied'),0)::integer,
    coalesce(sum(l.reward_days) filter(where l.status='earned'),0)::integer
  into total,applied_count,earned_count,applied_days,earned_days
  from public.referral_reward_ledger l
  join public.referral_relationships r on r.id=l.relationship_id and r.project_id=l.project_id
  join public.project_referral_settings s on s.project_id=l.project_id
  where l.project_id=pid and l.status in ('earned','applied')
    and not l.is_test and not r.is_test and l.referrer_user_id=r.referrer_user_id
    and l.referred_user_id=r.referred_user_id and r.referrer_user_id<>r.referred_user_id
    and l.created_at<s.reward_effective_at;
  if (total,applied_count,earned_count,applied_days,earned_days) is distinct from (5,3,2,45,30) then
    raise exception 'LEGACY_REFERRAL_PREFLIGHT_CHANGED: %, %, %, %, %',total,applied_count,earned_count,applied_days,earned_days;
  end if;
end $$;

create table public.marketplace_legacy_referral_entitlements (
  project_id uuid not null references public.projects(id) on delete restrict,
  legacy_reward_id uuid not null references public.referral_reward_ledger(id) on delete restrict,
  relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  original_status text not null check(original_status in ('earned','applied')),
  reward_days_snapshot integer not null check(reward_days_snapshot>0),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key(project_id,legacy_reward_id),
  unique(project_id,relationship_id),unique(project_id,referred_user_id),
  check(referrer_user_id<>referred_user_id)
);
alter table public.marketplace_legacy_referral_entitlements enable row level security;
revoke all on public.marketplace_legacy_referral_entitlements from public,anon,authenticated;
create trigger marketplace_legacy_referral_entitlements_immutable
 before update or delete on public.marketplace_legacy_referral_entitlements
 for each row execute function app_private.prevent_marketplace_legacy_referral_transition_mutation();
create trigger audit_marketplace_legacy_referral_entitlements
 after insert on public.marketplace_legacy_referral_entitlements
 for each row execute function app_private.capture_audit_event();

insert into public.marketplace_legacy_referral_entitlements
(project_id,legacy_reward_id,relationship_id,referrer_user_id,referred_user_id,original_status,reward_days_snapshot)
select l.project_id,l.id,l.relationship_id,l.referrer_user_id,l.referred_user_id,l.status,l.reward_days
from public.referral_reward_ledger l
join public.referral_relationships r on r.id=l.relationship_id and r.project_id=l.project_id
join public.project_referral_settings s on s.project_id=l.project_id
join public.projects p on p.id=l.project_id and p.slug='tuktuk-control'
where s.reward_mode='marketplace_wallet_credit' and s.reward_effective_at is not null
 and l.created_at<s.reward_effective_at and l.status in ('earned','applied')
 and not l.is_test and not r.is_test and l.referrer_user_id=r.referrer_user_id
 and l.referred_user_id=r.referred_user_id and r.referrer_user_id<>r.referred_user_id;

do $$
declare pid uuid; total integer; applied_count integer; earned_count integer;
        applied_days integer; earned_days integer;
begin
  select id into strict pid from public.projects where slug='tuktuk-control';
  select count(*)::integer,
    count(*) filter(where original_status='applied')::integer,
    count(*) filter(where original_status='earned')::integer,
    coalesce(sum(reward_days_snapshot) filter(where original_status='applied'),0)::integer,
    coalesce(sum(reward_days_snapshot) filter(where original_status='earned'),0)::integer
  into total,applied_count,earned_count,applied_days,earned_days
  from public.marketplace_legacy_referral_entitlements where project_id=pid;
  if (total,applied_count,earned_count,applied_days,earned_days) is distinct from (5,3,2,45,30) then
    raise exception 'LEGACY_REFERRAL_SNAPSHOT_MISMATCH: %, %, %, %, %',total,applied_count,earned_count,applied_days,earned_days;
  end if;
end $$;

-- VOLATILE: los triggers AFTER INSERT deben ver el evento settle de la
-- misma sentencia. Una funcion STABLE puede no ver esa fila nueva.
create or replace function app_private.marketplace_referral_first_qualification(target_project_id uuid,target_user_id uuid)
returns table(job_id uuid, qualified_at timestamptz) language sql volatile security definer set search_path='' as $$
  select q.job_id,q.qualified_at from (
    select j.id as job_id,e.created_at as qualified_at from public.jobs j
    join public.job_events e on e.project_id=j.project_id and e.job_id=j.id and e.to_status='settled' and e.action='settle'
    where j.project_id=target_project_id and j.assigned_driver_user_id=target_user_id
    union all
    select j.id,r.resolved_at from public.jobs j join public.marketplace_incident_resolutions r on r.project_id=j.project_id and r.job_id=j.id
    where j.project_id=target_project_id and j.assigned_driver_user_id=target_user_id and r.resolution='completed'
  ) q order by q.qualified_at,q.job_id limit 1;
$$;


-- Limitar la rutina antigua de dias a derechos congelados, no a una fecha aproximada.
create or replace function app_private.p0d_apply_earned_rewards(target_project_id uuid,target_referrer_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare target_license public.licenses%rowtype; reward public.referral_reward_ledger%rowtype; actor uuid; previous_expiry timestamptz; next_expiry timestamptz; applied_count integer:=0;
begin
 -- En modo saldo, solo pueden aplicarse los dias historicos ya ganados antes del corte; nunca se generan premios nuevos en dias.
 select l.* into target_license from public.licenses l where l.project_id=target_project_id and l.user_id=target_referrer_id and l.status='active' and l.license_type not in ('trial','admin') and l.expires_at is not null and l.expires_at>now() order by l.expires_at desc,l.updated_at desc,l.id limit 1 for update;
 if not found then return 0; end if;
 select coalesce(p.recorded_by,pr.owner_id) into actor from public.projects pr left join public.payments p on p.id=target_license.last_payment_id where pr.id=target_project_id;
 for reward in select l.* from public.referral_reward_ledger l join public.referral_relationships r on r.id=l.relationship_id join public.project_referral_settings s on s.project_id=l.project_id left join public.marketplace_legacy_referral_entitlements entitlement on entitlement.project_id=l.project_id and entitlement.legacy_reward_id=l.id where l.project_id=target_project_id and l.referrer_user_id=target_referrer_id and l.status='earned' and not l.is_test and not r.is_test and (s.reward_mode<>'marketplace_wallet_credit' or entitlement.legacy_reward_id is not null) order by l.created_at,l.id for update of l loop
   previous_expiry:=target_license.expires_at; next_expiry:=previous_expiry+make_interval(days=>reward.reward_days);
   update public.referral_reward_ledger set status='applied',applied_license_id=target_license.id,previous_expires_at=previous_expiry,new_expires_at=next_expiry,applied_at=now(),application_note='Aplicada automáticamente a licencia pagada activa',updated_at=now() where id=reward.id;
   update public.licenses set expires_at=next_expiry,updated_at=now() where id=target_license.id;
   insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata) values(target_project_id,target_license.id,'referral_reward_applied','Días de referido aplicados',actor,jsonb_build_object('reward_id',reward.id,'referred_user_id',reward.referred_user_id,'reward_days',reward.reward_days,'previous_expires_at',previous_expiry,'new_expires_at',next_expiry));
   target_license.expires_at:=next_expiry; applied_count:=applied_count+1;
 end loop; return applied_count;
end;
$$;

-- La rutina optativa de conversion retroactiva solo puede operar
-- sobre el inventario congelado. NO se invoca desde esta migracion.
create or replace function app_private.transition_legacy_marketplace_referral_rewards(target_project_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.project_referral_settings%rowtype; l public.referral_reward_ledger%rowtype; w public.wallets%rowtype; prior numeric; tx uuid; count_added integer:=0;
begin
 select * into s from public.project_referral_settings where project_id=target_project_id for update;
 if not found or s.reward_mode<>'marketplace_wallet_credit' or s.reward_amount is null or s.reward_currency<>'CUP' then raise exception 'MARKETPLACE_REFERRAL_REWARD_SETTINGS_REQUIRED' using errcode='22023'; end if;
 for l in select l.* from public.referral_reward_ledger l join public.referral_relationships r on r.id=l.relationship_id join public.marketplace_legacy_referral_entitlements entitlement on entitlement.project_id=l.project_id and entitlement.legacy_reward_id=l.id
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

revoke all on function app_private.transition_legacy_marketplace_referral_rewards(uuid)
 from public,anon,authenticated;

-- Mostrar estado de derechos historicos y NO informar CUP como acreditados
-- hasta que existan sus asientos de billetera.
create or replace function public.get_my_referrals(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); wallet_mode boolean;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select reward_mode='marketplace_wallet_credit' into wallet_mode from public.project_referral_settings where project_id=target_project_id;
 if not coalesce(wallet_mode,false) then return coalesce((select jsonb_agg(jsonb_build_object('relationship_id',r.id,'name',coalesce(nullif(p.display_name,''),'Usuario'),'status',case when l.status='applied' then 'rewarded' when l.status='earned' then 'qualified' when r.qualified_at is not null then 'qualified' else 'registered' end,'reward_days',coalesce(l.reward_days,r.reward_days),'created_at',r.created_at,'qualified_at',r.qualified_at) order by r.created_at desc) from public.referral_relationships r join public.profiles p on p.id=r.referred_user_id left join public.referral_reward_ledger l on l.relationship_id=r.id and not l.is_test where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'[]'::jsonb); end if;
 return coalesce((select jsonb_agg(jsonb_build_object('relationship_id',r.id,'name',coalesce(nullif(p.display_name,''),'Usuario'),'status',case when mr.id is not null or lt.legacy_reward_id is not null then 'rewarded' when ll.status='applied' then 'rewarded' when ll.status='earned' then 'qualified' when r.qualified_at is not null then 'qualified' else 'registered' end,'reward_days',coalesce(ll.reward_days,0),'legacy_days_applied',coalesce(ll.status='applied',false),'legacy_reward_status',ll.status,'reward_amount',coalesce(mr.reward_amount_snapshot,lt.reward_amount_snapshot),'reward_currency',coalesce(mr.reward_currency_snapshot,lt.reward_currency_snapshot),'reward_source',case when mr.id is not null then 'marketplace_referral_reward' when lt.legacy_reward_id is not null then 'legacy_referral_transition' else null end,'qualification_job_id',mr.qualification_job_id,'rewarded_at',coalesce(mr.qualified_at,lt.migrated_at),'created_at',r.created_at,'qualified_at',r.qualified_at) order by r.created_at desc) from public.referral_relationships r join public.profiles p on p.id=r.referred_user_id left join public.marketplace_referral_rewards mr on mr.project_id=r.project_id and mr.relationship_id=r.id left join public.marketplace_legacy_referral_reward_transitions lt on lt.project_id=r.project_id and lt.relationship_id=r.id left join public.marketplace_legacy_referral_entitlements entitlement on entitlement.project_id=r.project_id and entitlement.relationship_id=r.id left join public.referral_reward_ledger ll on ll.id=entitlement.legacy_reward_id and not ll.is_test where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'[]'::jsonb);
end;
$$;

create or replace function public.get_my_referral_program(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); settings public.project_referral_settings%rowtype; code text; base text; campaign public.referral_campaigns%rowtype;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select * into settings from public.project_referral_settings where project_id=target_project_id;
 if settings.reward_mode is distinct from 'marketplace_wallet_credit' then
   code:=app_private.p0d_ensure_referral_code(target_project_id,actor); campaign:=app_private.p1_current_referral_campaign(target_project_id);
   return jsonb_build_object('enabled',campaign.id is not null,'campaign_id',campaign.id,'campaign_name',campaign.name,'qualification_mode',campaign.qualification_mode,'reward_days',campaign.reward_days,'code',code,'link',case when settings.share_base_url is null then null else settings.share_base_url||case when position('?' in settings.share_base_url)>0 then '&' else '?' end||'ref='||code end,'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'qualified_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and r.qualified_at is not null and not r.is_test),'earned_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test),'earned_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test));
 end if;
 code:=app_private.p0d_ensure_referral_code(target_project_id,actor); select share_base_url into base from public.project_referral_settings where project_id=target_project_id;
 return jsonb_build_object('enabled',settings.reward_enabled,'reward_mode','marketplace_wallet_credit','reward_enabled',settings.reward_enabled,'reward_amount',settings.reward_amount,'reward_currency',settings.reward_currency,'reward_rule_version',settings.reward_rule_version,'qualification_mode','first_valid_job','reward_days',0,'code',code,'link',case when base is null then null else base||case when position('?' in base)>0 then '&' else '?' end||'ref='||code end,'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'qualified_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and r.qualified_at is not null and not r.is_test),'rewarded_count',(select count(*) from (select r.referred_user_id from public.marketplace_referral_rewards r where r.project_id=target_project_id and r.referrer_user_id=actor union select t.referred_user_id from public.marketplace_legacy_referral_reward_transitions t where t.project_id=target_project_id and t.referrer_user_id=actor) paid_users),'earned_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l join public.marketplace_legacy_referral_entitlements e on e.project_id=l.project_id and e.legacy_reward_id=l.id where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l join public.marketplace_legacy_referral_entitlements e on e.project_id=l.project_id and e.legacy_reward_id=l.id where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test));
end;
$$;

revoke all on function public.get_my_referrals(uuid),public.get_my_referral_program(uuid) from public,anon;
grant execute on function public.get_my_referrals(uuid),public.get_my_referral_program(uuid) to authenticated;
