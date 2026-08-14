-- P0-D: project-scoped referral codes, automatic rewards and secure admin reads.

create table public.project_referral_codes (
  project_id uuid not null references public.projects(id) on update cascade on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9]{3,8}-[A-F0-9]{7}$'),
  created_at timestamptz not null default now(),
  primary key(project_id,user_id),
  unique(project_id,code)
);

alter table public.project_referral_codes enable row level security;
revoke all on public.project_referral_codes from public,anon,authenticated;

alter table public.referral_relationships
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.referral_reward_ledger
  add column if not exists applied_license_id uuid references public.licenses(id) on delete restrict,
  add column if not exists previous_expires_at timestamptz,
  add column if not exists new_expires_at timestamptz,
  add column if not exists application_note text;

alter table public.referral_relationships
  drop constraint if exists referral_relationships_project_id_referred_user_id_key;
alter table public.referral_reward_ledger
  drop constraint if exists referral_reward_ledger_project_id_referred_user_id_key;
create unique index referral_relationships_real_referred_uidx
  on public.referral_relationships(project_id,referred_user_id) where not is_test;
create unique index referral_relationships_test_referred_uidx
  on public.referral_relationships(project_id,referred_user_id) where is_test;
create unique index referral_reward_ledger_real_referred_uidx
  on public.referral_reward_ledger(project_id,referred_user_id) where not is_test;
create unique index referral_reward_ledger_test_referred_uidx
  on public.referral_reward_ledger(project_id,referred_user_id) where is_test;

create index if not exists referral_reward_ledger_referrer_status_idx
  on public.referral_reward_ledger(project_id,referrer_user_id,status,created_at);

create or replace function app_private.p0d_ensure_referral_code(target_project_id uuid,target_user_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare existing_code text; project_prefix text; candidate text; attempt integer:=0;
begin
  select code into existing_code from public.project_referral_codes
  where project_id=target_project_id and user_id=target_user_id;
  if found then return existing_code; end if;
  if not exists(select 1 from public.projects project where project.id=target_project_id)
     or not exists(select 1 from public.profiles profile where profile.id=target_user_id) then
    raise exception 'REFERRAL_CODE_SUBJECT_NOT_FOUND' using errcode='P0002';
  end if;
  select left(regexp_replace(upper(project.name),'[^A-Z0-9]','','g'),8)
    into project_prefix from public.projects project where project.id=target_project_id;
  if length(project_prefix)<3 then project_prefix:='REF'; end if;
  loop
    candidate:=project_prefix||'-'||upper(substr(md5(target_project_id::text||':'||target_user_id::text||':'||attempt::text),1,7));
    begin
      insert into public.project_referral_codes(project_id,user_id,code)
      values(target_project_id,target_user_id,candidate)
      on conflict(project_id,user_id) do nothing;
      select code into existing_code from public.project_referral_codes
      where project_id=target_project_id and user_id=target_user_id;
      if found then return existing_code; end if;
    exception when unique_violation then null;
    end;
    attempt:=attempt+1;
    if attempt>20 then raise exception 'REFERRAL_CODE_GENERATION_FAILED'; end if;
  end loop;
end;
$$;

create or replace function app_private.p0d_guard_referral_code_immutable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'REFERRAL_CODE_IMMUTABLE' using errcode='22023';
end;
$$;

create trigger p0d_referral_code_immutable before update or delete on public.project_referral_codes
for each row execute function app_private.p0d_guard_referral_code_immutable();

create or replace function app_private.p0d_license_referral_code()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.p0d_ensure_referral_code(new.project_id,new.user_id);
  return new;
end;
$$;

create trigger p0d_license_referral_code after insert on public.licenses
for each row execute function app_private.p0d_license_referral_code();

do $$ declare subject record;
begin
  for subject in
    select distinct linked.project_id,linked.user_id from (
      select license.project_id,license.user_id from public.licenses license
      union select payment.project_id,payment.user_id from public.payments payment
      union select lead.project_id,lead.user_id from public.commercial_leads lead
        where lead.user_id is not null and lead.archived_at is null
      union select relationship.project_id,relationship.referrer_user_id from public.referral_relationships relationship
      union select relationship.project_id,relationship.referred_user_id from public.referral_relationships relationship
    ) linked
  loop perform app_private.p0d_ensure_referral_code(subject.project_id,subject.user_id); end loop;
end $$;

create or replace function app_private.p0d_apply_earned_rewards(target_project_id uuid,target_referrer_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare target_license public.licenses%rowtype; reward public.referral_reward_ledger%rowtype;
  actor uuid; previous_expiry timestamptz; next_expiry timestamptz; applied_count integer:=0;
begin
  select license.* into target_license from public.licenses license
  where license.project_id=target_project_id and license.user_id=target_referrer_id
    and license.status='active' and license.license_type not in ('trial','admin')
    and license.expires_at is not null and license.expires_at>now()
  order by license.expires_at desc,license.updated_at desc,license.id
  limit 1
  for update;
  if not found then return 0; end if;
  select coalesce(payment.recorded_by,project.owner_id) into actor
  from public.projects project left join public.payments payment on payment.id=target_license.last_payment_id
  where project.id=target_project_id;
  for reward in select ledger.* from public.referral_reward_ledger ledger
    join public.referral_relationships relationship on relationship.id=ledger.relationship_id
    where ledger.project_id=target_project_id and ledger.referrer_user_id=target_referrer_id
      and ledger.status='earned' and not ledger.is_test and not relationship.is_test
    order by ledger.created_at,ledger.id for update of ledger
  loop
    previous_expiry:=target_license.expires_at;
    next_expiry:=previous_expiry+make_interval(days=>reward.reward_days);
    update public.referral_reward_ledger set status='applied',applied_license_id=target_license.id,
      previous_expires_at=previous_expiry,new_expires_at=next_expiry,applied_at=now(),
      application_note='Aplicada automáticamente a licencia pagada activa',updated_at=now()
    where id=reward.id;
    update public.licenses set expires_at=next_expiry,updated_at=now() where id=target_license.id;
    insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata)
    values(target_project_id,target_license.id,'referral_reward_applied','Días de referido aplicados',actor,
      jsonb_build_object('reward_id',reward.id,'referred_user_id',reward.referred_user_id,
        'reward_days',reward.reward_days,'previous_expires_at',previous_expiry,'new_expires_at',next_expiry));
    target_license.expires_at:=next_expiry; applied_count:=applied_count+1;
  end loop;
  return applied_count;
end;
$$;

create or replace function app_private.p0d_revert_reward_for_payment(payment_record public.payments)
returns void language plpgsql security definer set search_path='' as $$
declare reward public.referral_reward_ledger%rowtype; target_license public.licenses%rowtype;
  restored_expiry timestamptz; safe_reversal boolean:=false; license_found boolean:=false; note text;
begin
  select * into reward from public.referral_reward_ledger
  where qualifying_payment_id=payment_record.id and not is_test for update;
  if not found or reward.status='reverted' then return; end if;
  if reward.status='earned' then
    update public.referral_reward_ledger set status='reverted',reverted_at=now(),
      application_note='Pago calificante dejó de estar confirmado antes de aplicar la recompensa',updated_at=now()
    where id=reward.id;
    return;
  end if;
  if reward.status='applied' and reward.applied_license_id is not null then
    select * into target_license from public.licenses where id=reward.applied_license_id for update;
    license_found:=found;
    update public.referral_reward_ledger set status='reverted',reverted_at=now(),updated_at=now()
    where id=reward.id;
    if license_found and target_license.expires_at=reward.new_expires_at then
      restored_expiry:=reward.previous_expires_at; safe_reversal:=true;
    elsif license_found and target_license.expires_at>reward.new_expires_at then
      restored_expiry:=target_license.expires_at-make_interval(days=>reward.reward_days); safe_reversal:=true;
    end if;
    if safe_reversal then
      update public.licenses set expires_at=restored_expiry,updated_at=now() where id=target_license.id;
      note:='Recompensa revertida y vigencia restaurada de forma segura';
    else note:='Recompensa revertida; vigencia requiere revisión manual'; end if;
    update public.referral_reward_ledger set application_note=note where id=reward.id;
    if target_license.id is not null then
      insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata)
      values(payment_record.project_id,target_license.id,'referral_reward_reverted',note,payment_record.recorded_by,
        jsonb_build_object('reward_id',reward.id,'payment_id',payment_record.id,'reward_days',reward.reward_days,
          'snapshot_previous_expires_at',reward.previous_expires_at,'snapshot_new_expires_at',reward.new_expires_at,
          'license_expiry_before_reversal',target_license.expires_at,'license_expiry_after_reversal',restored_expiry,
          'safe_reversal',safe_reversal));
    end if;
  end if;
end;
$$;

create or replace function app_private.p0d_reconcile_payment_reward()
returns trigger language plpgsql security definer set search_path='' as $$
declare payment_record public.payments%rowtype; relationship public.referral_relationships%rowtype;
  first_payment uuid; configured_days integer;
begin
  payment_record:=case when tg_op='DELETE' then old else new end;
  if tg_op<>'DELETE' and new.status='paid' and not new.is_test then
    select * into relationship from public.referral_relationships
    where project_id=new.project_id and referred_user_id=new.user_id and not is_test for update;
    if found then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(relationship.id::text,0));
      select payment.id into first_payment from public.payments payment
      where payment.project_id=new.project_id and payment.user_id=new.user_id
        and payment.status='paid' and not payment.is_test
      order by payment.charged_at,payment.created_at,payment.id limit 1;
      if first_payment=new.id then
        select settings.reward_days into configured_days from public.project_referral_settings settings
        where settings.project_id=new.project_id;
        insert into public.referral_reward_ledger(project_id,relationship_id,referrer_user_id,referred_user_id,
          qualifying_payment_id,reward_days,status,is_test,created_by)
        values(new.project_id,relationship.id,relationship.referrer_user_id,relationship.referred_user_id,
          new.id,configured_days,'earned',false,new.recorded_by)
        on conflict(project_id,referred_user_id) where not is_test do nothing;
        perform app_private.p0d_apply_earned_rewards(new.project_id,relationship.referrer_user_id);
      end if;
    end if;
  elsif (tg_op='DELETE' and old.status='paid' and not old.is_test)
     or (tg_op='UPDATE' and old.status='paid' and not old.is_test and new.status<>'paid') then
    perform app_private.p0d_revert_reward_for_payment(payment_record);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger p0d_reconcile_payment_reward after insert or delete or update of status on public.payments
for each row execute function app_private.p0d_reconcile_payment_reward();

create or replace function app_private.p0d_apply_rewards_after_license_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT'
     and current_setting('app.p0c_frozen_plan_snapshot',true)='on' then
    return new;
  end if;
  if pg_catalog.pg_trigger_depth()>1 then return new; end if;
  if new.status='active' and new.license_type not in ('trial','admin')
     and new.expires_at is not null and new.expires_at>now() then
    perform app_private.p0d_apply_earned_rewards(new.project_id,new.user_id);
  end if;
  return new;
end;
$$;

create trigger p0d_apply_rewards_after_license_change
after insert or update of status,license_type,expires_at on public.licenses
for each row execute function app_private.p0d_apply_rewards_after_license_change();

create or replace function public.admin_link_client_referrer_code(
  target_project_id uuid,target_client_id uuid,target_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; referrer_id uuid; existing public.referral_relationships%rowtype; relationship_id uuid;
begin
  actor:=app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists(select 1 from public.profiles profile where profile.id=target_client_id)
     or not exists(
       select 1 from public.licenses license where license.project_id=target_project_id and license.user_id=target_client_id
       union all select 1 from public.payments payment where payment.project_id=target_project_id and payment.user_id=target_client_id
       union all select 1 from public.commercial_leads lead where lead.project_id=target_project_id
         and lead.user_id=target_client_id and lead.archived_at is null
     ) then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;
  select code.user_id into referrer_id from public.project_referral_codes code
  where code.project_id=target_project_id and code.code=upper(btrim(target_code));
  if not found then raise exception 'REFERRAL_CODE_NOT_FOUND' using errcode='P0002'; end if;
  if referrer_id=target_client_id then raise exception 'SELF_REFERRAL_NOT_ALLOWED' using errcode='22023'; end if;
  select * into existing from public.referral_relationships
  where project_id=target_project_id and referred_user_id=target_client_id and not is_test for update;
  if found and existing.referrer_user_id=referrer_id then return existing.id; end if;
  if not found and exists(select 1 from public.payments payment
    where payment.project_id=target_project_id and payment.user_id=target_client_id
      and payment.status='paid' and not payment.is_test) then
    raise exception 'REFERRAL_RELATIONSHIP_LOCKED' using errcode='22023';
  end if;
  if found then
    if exists(select 1 from public.referral_reward_ledger reward where reward.relationship_id=existing.id)
       or exists(select 1 from public.payments payment where payment.project_id=target_project_id
         and payment.user_id=target_client_id and payment.status='paid' and not payment.is_test) then
      raise exception 'REFERRAL_RELATIONSHIP_LOCKED' using errcode='22023';
    end if;
    update public.referral_relationships set referrer_user_id=referrer_id,
      referral_code=upper(btrim(target_code)),source='administrative_correction',updated_at=now(),updated_by=actor
    where id=existing.id returning id into relationship_id;
  else
    insert into public.referral_relationships(project_id,referrer_user_id,referred_user_id,
      referral_code,source,is_test,created_by,updated_by)
    values(target_project_id,referrer_id,target_client_id,upper(btrim(target_code)),
      'administrative',false,actor,actor) returning id into relationship_id;
  end if;
  return relationship_id;
end;
$$;

create or replace function public.admin_register_referral_relationship(
  target_project_id uuid,target_referrer_user_id uuid,target_referred_user_id uuid,
  target_referral_code text default null,target_is_test boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; relation_id uuid; test_mode boolean; stable_referrer_id uuid;
begin
  actor:=app_private.require_project_permission(target_project_id,'commercial.manage');
  if target_referrer_user_id=target_referred_user_id then
    raise exception 'SELF_REFERRAL_NOT_ALLOWED' using errcode='22023';
  end if;
  if not coalesce(target_is_test,false) then
    select code.user_id into stable_referrer_id from public.project_referral_codes code
    where code.project_id=target_project_id and code.code=upper(btrim(target_referral_code));
    if not found then raise exception 'REFERRAL_CODE_NOT_FOUND' using errcode='P0002'; end if;
    if stable_referrer_id<>target_referrer_user_id then
      raise exception 'REFERRAL_CODE_OWNER_MISMATCH' using errcode='22023';
    end if;
    return public.admin_link_client_referrer_code(
      target_project_id,target_referred_user_id,upper(btrim(target_referral_code))
    );
  end if;
  if not exists(select 1 from public.licenses license
      where license.project_id=target_project_id and license.user_id=target_referrer_user_id)
     or not exists(select 1 from public.licenses license
      where license.project_id=target_project_id and license.user_id=target_referred_user_id) then
    raise exception 'REFERRAL_USER_NOT_FOUND' using errcode='P0002';
  end if;
  select settings.enabled into test_mode from public.project_test_settings settings
  where settings.project_id=target_project_id;
  if not coalesce(test_mode,false) then
    raise exception 'TEST_MODE_DISABLED' using errcode='42501';
  end if;
  insert into public.referral_relationships(project_id,referrer_user_id,referred_user_id,
    referral_code,is_test,created_by,updated_by)
  values(target_project_id,target_referrer_user_id,target_referred_user_id,
    nullif(btrim(target_referral_code),''),true,actor,actor)
  returning id into relation_id;
  return relation_id;
exception when unique_violation then
  raise exception 'REFERRED_USER_ALREADY_REGISTERED' using errcode='23505';
end;
$$;

create or replace function public.admin_get_client_referral_summary(target_project_id uuid,target_client_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare own_code text; website text;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  if not exists(select 1 from public.profiles profile where profile.id=target_client_id)
     or not exists(
       select 1 from public.licenses license where license.project_id=target_project_id and license.user_id=target_client_id
       union all select 1 from public.payments payment where payment.project_id=target_project_id and payment.user_id=target_client_id
       union all select 1 from public.commercial_leads lead where lead.project_id=target_project_id
         and lead.user_id=target_client_id and lead.archived_at is null
       union all select 1 from public.referral_relationships relationship where relationship.project_id=target_project_id
         and not relationship.is_test
         and (relationship.referrer_user_id=target_client_id or relationship.referred_user_id=target_client_id)
     ) then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;
  own_code:=app_private.p0d_ensure_referral_code(target_project_id,target_client_id);
  select project.website_url into website from public.projects project where project.id=target_project_id;
  return jsonb_build_object(
    'code',own_code,
    'link',case when website is null then null else website||case when position('?' in website)>0 then '&' else '?' end||'ref='||own_code end,
    'referred_by',(select jsonb_build_object('relationship_id',relationship.id,'user_id',relationship.referrer_user_id,
      'name',coalesce(profile.display_name,profile.email),'code',code.code,'created_at',relationship.created_at)
      from public.referral_relationships relationship join public.profiles profile on profile.id=relationship.referrer_user_id
      left join public.project_referral_codes code on code.project_id=relationship.project_id and code.user_id=relationship.referrer_user_id
      where relationship.project_id=target_project_id and relationship.referred_user_id=target_client_id and not relationship.is_test),
    'can_link_referrer',not exists(select 1 from public.referral_relationships relationship
      where relationship.project_id=target_project_id and relationship.referred_user_id=target_client_id and not relationship.is_test)
      and not exists(select 1 from public.payments payment where payment.project_id=target_project_id
        and payment.user_id=target_client_id and payment.status='paid' and not payment.is_test),
    'referred_count',(select count(*) from public.referral_relationships relationship
      where relationship.project_id=target_project_id and relationship.referrer_user_id=target_client_id and not relationship.is_test),
    'earned_rewards',(select count(*) from public.referral_reward_ledger reward
      where reward.project_id=target_project_id and reward.referrer_user_id=target_client_id
        and reward.status='earned' and not reward.is_test),
    'applied_rewards',(select count(*) from public.referral_reward_ledger reward
      where reward.project_id=target_project_id and reward.referrer_user_id=target_client_id
        and reward.status='applied' and not reward.is_test),
    'pending_days',(select coalesce(sum(reward.reward_days),0) from public.referral_reward_ledger reward
      where reward.project_id=target_project_id and reward.referrer_user_id=target_client_id
        and reward.status='earned' and not reward.is_test),
    'applied_days',(select coalesce(sum(reward.reward_days),0) from public.referral_reward_ledger reward
      where reward.project_id=target_project_id and reward.referrer_user_id=target_client_id
        and reward.status='applied' and not reward.is_test)
  );
end;
$$;

create or replace function public.admin_get_referral_overview(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  return jsonb_build_object(
    'relationships',(select count(*) from public.referral_relationships relationship
      where relationship.project_id=target_project_id and not relationship.is_test),
    'converted',(select count(*) from public.referral_reward_ledger reward
      where reward.project_id=target_project_id and reward.status in ('earned','applied') and not reward.is_test),
    'applied_rewards',(select count(*) from public.referral_reward_ledger reward
      where reward.project_id=target_project_id and reward.status='applied' and not reward.is_test),
    'delivered_days',(select coalesce(sum(reward.reward_days),0) from public.referral_reward_ledger reward
      where reward.project_id=target_project_id and reward.status='applied' and not reward.is_test),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'relationship_id',relationship.id,'referrer_name',coalesce(referrer.display_name,referrer.email),
      'referred_name',coalesce(referred.display_name,referred.email),'code',code.code,
      'status',coalesce(reward.status,'pending'),'days',reward.reward_days,
      'created_at',coalesce(reward.created_at,relationship.created_at)
    ) order by coalesce(reward.created_at,relationship.created_at) desc)
      from public.referral_relationships relationship
      join public.profiles referrer on referrer.id=relationship.referrer_user_id
      join public.profiles referred on referred.id=relationship.referred_user_id
      left join public.project_referral_codes code on code.project_id=relationship.project_id and code.user_id=relationship.referrer_user_id
      left join public.referral_reward_ledger reward on reward.relationship_id=relationship.id and not reward.is_test
      where relationship.project_id=target_project_id and not relationship.is_test),'[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_create_referral_reward(
  target_project_id uuid,target_relationship_id uuid,target_payment_id uuid,target_is_test boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; relation public.referral_relationships%rowtype; payment public.payments%rowtype;
  configured_days integer; reward_id uuid; first_payment uuid; test_enabled boolean;
begin
  actor:=app_private.require_project_permission(target_project_id,'payments.manage');
  select * into relation from public.referral_relationships where id=target_relationship_id and project_id=target_project_id;
  if not found then raise exception 'REFERRAL_RELATIONSHIP_NOT_FOUND' using errcode='P0002'; end if;
  select * into payment from public.payments where id=target_payment_id and project_id=target_project_id
    and user_id=relation.referred_user_id and status='paid';
  if not found then raise exception 'QUALIFYING_PAYMENT_REQUIRED' using errcode='22023'; end if;
  if target_is_test then
    select enabled into test_enabled from public.project_test_settings where project_id=target_project_id;
    if not coalesce(test_enabled,false) or not relation.is_test or not payment.is_test then
      raise exception 'TEST_REFERRAL_CONTEXT_REQUIRED' using errcode='22023';
    end if;
  else
    if relation.is_test or payment.is_test then raise exception 'REAL_REFERRAL_CONTEXT_REQUIRED' using errcode='22023'; end if;
    select candidate.id into first_payment from public.payments candidate
    where candidate.project_id=target_project_id and candidate.user_id=relation.referred_user_id
      and candidate.status='paid' and not candidate.is_test
    order by candidate.charged_at,candidate.created_at,candidate.id limit 1;
    if first_payment<>payment.id then raise exception 'FIRST_CONFIRMED_PAYMENT_REQUIRED' using errcode='22023'; end if;
  end if;
  select reward_days into configured_days from public.project_referral_settings where project_id=target_project_id;
  insert into public.referral_reward_ledger(project_id,relationship_id,referrer_user_id,referred_user_id,
    qualifying_payment_id,reward_days,status,is_test,created_by)
  values(target_project_id,relation.id,relation.referrer_user_id,relation.referred_user_id,
    payment.id,configured_days,'earned',target_is_test,actor)
  on conflict do nothing returning id into reward_id;
  if reward_id is null then
    select reward.id into reward_id from public.referral_reward_ledger reward
    where reward.project_id=target_project_id and reward.referred_user_id=relation.referred_user_id
      and reward.is_test=target_is_test;
  end if;
  if not target_is_test then perform app_private.p0d_apply_earned_rewards(target_project_id,relation.referrer_user_id); end if;
  return reward_id;
end;
$$;

revoke all on function app_private.p0d_ensure_referral_code(uuid,uuid),
  app_private.p0d_guard_referral_code_immutable(),app_private.p0d_license_referral_code(),
  app_private.p0d_apply_earned_rewards(uuid,uuid),app_private.p0d_revert_reward_for_payment(public.payments),
  app_private.p0d_reconcile_payment_reward(),app_private.p0d_apply_rewards_after_license_change()
from public,anon,authenticated;
revoke all on function public.admin_link_client_referrer_code(uuid,uuid,text),
  public.admin_register_referral_relationship(uuid,uuid,uuid,text,boolean),
  public.admin_get_client_referral_summary(uuid,uuid),public.admin_get_referral_overview(uuid),
  public.admin_create_referral_reward(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.admin_link_client_referrer_code(uuid,uuid,text),
  public.admin_register_referral_relationship(uuid,uuid,uuid,text,boolean),
  public.admin_get_client_referral_summary(uuid,uuid),public.admin_get_referral_overview(uuid),
  public.admin_create_referral_reward(uuid,uuid,uuid,boolean) to authenticated;
