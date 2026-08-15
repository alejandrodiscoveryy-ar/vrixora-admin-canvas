-- P0-E: safe payment cancellation, consequence preview and trust cleanup.

do $$
declare constraint_name text;
begin
  select candidate_constraint.conname into constraint_name
  from pg_catalog.pg_constraint candidate_constraint
  where candidate_constraint.conrelid='public.preinvoices'::regclass
    and candidate_constraint.contype='c'
    and pg_catalog.pg_get_constraintdef(candidate_constraint.oid) like '%paid_payment_id%'
    and pg_catalog.pg_get_constraintdef(candidate_constraint.oid) like '%status%';
  if constraint_name is not null then
    execute format('alter table public.preinvoices drop constraint %I',constraint_name);
  end if;
end $$;

alter table public.preinvoices
  add constraint preinvoices_payment_status_trace_check check (
    (status='paid' and paid_payment_id is not null)
    or status='cancelled'
    or (status not in ('paid','cancelled') and paid_payment_id is null)
  );
-- P0-E guard: avoid reapplying earned referral rewards during cancellation reconciliation.
create or replace function app_private.p0d_apply_rewards_after_license_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if current_setting('app.p0e_cancellation_reconcile',true)='on' then
    return new;
  end if;
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

revoke all on function app_private.p0d_apply_rewards_after_license_change()
  from public,anon,authenticated;

create or replace function app_private.p0e_payment_cancellation_preview(target_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  license_record public.licenses%rowtype;
  effect_record public.license_audit_log%rowtype;
  receipt_record public.billing_receipts%rowtype;
  preinvoice_number bigint;
  client_email text;
  client_name text;
  effect_days integer;
  other_paid_count integer;
  generated_reward jsonb;
  applied_reward_count integer;
  applied_reward_days integer;
  can_revert boolean := false;
  requires_review boolean := false;
begin
  select payment.* into payment_record from public.payments payment
  where payment.id=target_payment_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode='P0002'; end if;

  select profile.email,coalesce(nullif(btrim(profile.display_name),''),profile.email)
  into client_email,client_name from public.profiles profile where profile.id=payment_record.user_id;
  select license.* into license_record from public.licenses license where license.id=payment_record.license_id;
  select receipt.* into receipt_record from public.billing_receipts receipt where receipt.payment_id=payment_record.id;
  select preinvoice.number into preinvoice_number from public.preinvoices preinvoice
  where preinvoice.id=payment_record.preinvoice_id;
  select audit.* into effect_record from public.license_audit_log audit
  where audit.project_id=payment_record.project_id
    and audit.metadata->>'payment_id'=payment_record.id::text
    and audit.action in ('license_created_from_preinvoice','trial_converted','license_renewed')
  order by audit.created_at desc,audit.id desc limit 1;

  select count(*) into other_paid_count from public.payments payment
  where payment.project_id=payment_record.project_id and payment.user_id=payment_record.user_id
    and payment.id<>payment_record.id and payment.status='paid' and not payment.is_test;

  if effect_record.action='license_renewed'
     and nullif(effect_record.metadata->>'previous_expires_at','') is not null
     and nullif(effect_record.metadata->>'new_expires_at','') is not null then
    effect_days:=greatest(0,extract(epoch from (
      (effect_record.metadata->>'new_expires_at')::timestamptz-
      (effect_record.metadata->>'previous_expires_at')::timestamptz))/86400)::integer;
  else
    effect_days:=nullif(payment_record.billing_snapshot->'plan_snapshot'->>'duration_days','')::integer;
  end if;

  if payment_record.is_test then
    can_revert:=true;
  elsif effect_record.action='license_renewed' then
    can_revert:=license_record.id is not null and effect_days>0 and license_record.expires_at is not null
      and license_record.expires_at>=coalesce((effect_record.metadata->>'new_expires_at')::timestamptz,license_record.expires_at);
  elsif effect_record.action='license_created_from_preinvoice' then
    can_revert:=license_record.id is not null and other_paid_count=0;
  elsif effect_record.action='trial_converted' then
    can_revert:=license_record.id is not null and other_paid_count=0
      and nullif(effect_record.metadata->>'previous_expires_at','') is not null
      and exists(select 1 from public.license_plans plan
        where plan.project_id=payment_record.project_id
          and plan.code=receipt_record.snapshot->>'previous_plan' and plan.license_type='trial');
  end if;
  requires_review:=not payment_record.is_test and payment_record.status in ('paid','complimentary') and not can_revert;

  select jsonb_build_object('id',reward.id,'status',reward.status,'days',reward.reward_days)
  into generated_reward from public.referral_reward_ledger reward
  where reward.qualifying_payment_id=payment_record.id and not reward.is_test;
  select count(*),coalesce(sum(reward.reward_days),0) into applied_reward_count,applied_reward_days
  from public.referral_reward_ledger reward
  where reward.project_id=payment_record.project_id and reward.referrer_user_id=payment_record.user_id
    and reward.status='applied' and not reward.is_test and reward.applied_license_id=payment_record.license_id;

  return jsonb_build_object(
    'payment_id',payment_record.id,'status',payment_record.status,'client_name',client_name,
    'client_email',client_email,'amount',payment_record.amount,'currency',payment_record.currency,
    'plan_name',coalesce(payment_record.billing_snapshot->'plan_snapshot'->>'name',payment_record.plan),
    'preinvoice_number',preinvoice_number,'receipt_number',receipt_record.receipt_number,
    'license_key',license_record.license_key,'current_expires_at',license_record.expires_at,
    'license_effect',effect_record.action,'effect_days',effect_days,
    'generated_reward',generated_reward,'applied_referral_rewards',applied_reward_count,
    'applied_referral_days',applied_reward_days,'license_can_revert_automatically',can_revert,
    'license_requires_review',requires_review,'already_cancelled',payment_record.status='cancelled'
  );
end;
$$;

revoke all on function app_private.p0e_payment_cancellation_preview(uuid) from public,anon,authenticated;

create or replace function public.admin_preview_payment_cancellation(target_payment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payment_record public.payments%rowtype;
begin
  select * into payment_record from public.payments where id=target_payment_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  perform app_private.require_project_permission(payment_record.project_id,'payments.correct');
  if payment_record.status='pending' then raise exception 'PENDING_PAYMENT_MUST_BE_DELETED' using errcode='22023'; end if;
  if payment_record.status not in ('paid','complimentary','cancelled') then
    raise exception 'PAYMENT_CANCELLATION_NOT_ALLOWED' using errcode='22023';
  end if;
  return app_private.p0e_payment_cancellation_preview(target_payment_id);
end; $$;

create or replace function public.admin_cancel_payment_safe(target_payment_id uuid,target_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid; reason text:=nullif(btrim(target_reason),''); payment_record public.payments%rowtype;
  license_record public.licenses%rowtype; effect_record public.license_audit_log%rowtype;
  receipt_record public.billing_receipts%rowtype; trial_plan public.license_plans%rowtype;
  preview jsonb; other_paid_count integer; reward public.referral_reward_ledger%rowtype;
  effect_days integer; review_required boolean:=false; license_action text:='none';
begin
  select * into payment_record from public.payments where id=target_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  actor:=app_private.require_project_permission(payment_record.project_id,'payments.correct');
  if reason is null then raise exception 'CANCELLATION_REASON_REQUIRED' using errcode='22023'; end if;
  if payment_record.status='pending' then raise exception 'PENDING_PAYMENT_MUST_BE_DELETED' using errcode='22023'; end if;
  if payment_record.status='cancelled' then
    return app_private.p0e_payment_cancellation_preview(payment_record.id)||jsonb_build_object('result','already_cancelled');
  end if;
  if payment_record.status not in ('paid','complimentary') then
    raise exception 'PAYMENT_CANCELLATION_NOT_ALLOWED' using errcode='22023';
  end if;
  preview:=app_private.p0e_payment_cancellation_preview(payment_record.id);
  perform app_private.void_billing_receipt_for_payment(payment_record.id,actor,reason,'cancelled');
  update public.payments set status='cancelled',notes=concat_ws(E'\n',notes,'Cancelado: '||reason)
  where id=payment_record.id;
  if payment_record.preinvoice_id is not null then
    update public.preinvoices set status='cancelled',updated_at=now()
    where id=payment_record.preinvoice_id and status='paid';
  end if;

  if not payment_record.is_test then
    select count(*) into other_paid_count from public.payments payment
    where payment.project_id=payment_record.project_id and payment.user_id=payment_record.user_id
      and payment.id<>payment_record.id and payment.status='paid' and not payment.is_test;
    select * into effect_record from public.license_audit_log audit
    where audit.project_id=payment_record.project_id and audit.metadata->>'payment_id'=payment_record.id::text
      and audit.action in ('license_created_from_preinvoice','trial_converted','license_renewed')
    order by audit.created_at desc,audit.id desc limit 1;
    select * into license_record from public.licenses where id=payment_record.license_id for update;
    perform set_config('app.p0e_cancellation_reconcile','on',true);
    perform set_config('app.p0c_frozen_plan_snapshot','on',true);

    if other_paid_count=0 and license_record.id is not null then
      for reward in select * from public.referral_reward_ledger ledger
        where ledger.project_id=payment_record.project_id and ledger.referrer_user_id=payment_record.user_id
          and ledger.status='applied' and not ledger.is_test and ledger.applied_license_id=license_record.id
        order by ledger.applied_at desc,ledger.id for update
      loop
        if license_record.expires_at is not null and reward.previous_expires_at is not null
           and license_record.expires_at>=reward.previous_expires_at then
          update public.licenses set expires_at=expires_at-make_interval(days=>reward.reward_days),updated_at=now()
          where id=license_record.id returning * into license_record;
          update public.referral_reward_ledger set status='earned',applied_license_id=null,
            previous_expires_at=null,new_expires_at=null,applied_at=null,application_note='Devuelta a pendiente por cancelación segura',updated_at=now()
          where id=reward.id;
        else review_required:=true; end if;
      end loop;
    end if;

    if effect_record.action='license_renewed' and license_record.id is not null then
      effect_days:=greatest(0,extract(epoch from (((effect_record.metadata->>'new_expires_at')::timestamptz)-
        ((effect_record.metadata->>'previous_expires_at')::timestamptz)))/86400)::integer;
      if effect_days>0 and license_record.expires_at is not null
         and license_record.expires_at>=(effect_record.metadata->>'new_expires_at')::timestamptz then
        update public.licenses set expires_at=expires_at-make_interval(days=>effect_days),updated_at=now()
        where id=license_record.id;
        license_action:='renewal_days_removed';
      else review_required:=true; end if;
    elsif effect_record.action='license_created_from_preinvoice' and license_record.id is not null and other_paid_count=0 then
      update public.licenses set status='suspended',updated_at=now() where id=license_record.id;
      license_action:='first_license_suspended';
    elsif effect_record.action='trial_converted' and license_record.id is not null and other_paid_count=0 then
      select plan.* into trial_plan from public.billing_receipts receipt
      join public.license_plans plan on plan.project_id=payment_record.project_id
        and plan.code=receipt.snapshot->>'previous_plan' and plan.license_type='trial'
      where receipt.payment_id=payment_record.id;
      if found and nullif(effect_record.metadata->>'previous_expires_at','') is not null then
        update public.licenses set plan=trial_plan.code,license_type=trial_plan.license_type,
          duration_days=trial_plan.duration_days,max_devices=trial_plan.max_devices,features=trial_plan.features,
          expires_at=(effect_record.metadata->>'previous_expires_at')::timestamptz,
          status=case when (effect_record.metadata->>'previous_expires_at')::timestamptz>now() then 'active' else 'expired' end,
          updated_at=now() where id=license_record.id;
        license_action:='trial_restored';
      else review_required:=true; end if;
    elsif effect_record.id is null then review_required:=true;
    elsif effect_record.action in ('license_created_from_preinvoice','trial_converted') and other_paid_count>0 then
      review_required:=true;
    end if;
    perform set_config('app.p0e_cancellation_reconcile','off',true);
    perform set_config('app.p0c_frozen_plan_snapshot','off',true);
  end if;

  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
  values(payment_record.project_id,actor,'payment_cancelled_safe','payment',payment_record.id::text,
    jsonb_build_object('reason',reason,'payment',to_jsonb(payment_record)-'recorded_by',
      'license_action',license_action,'license_requires_review',review_required,'preview',preview));
  return app_private.p0e_payment_cancellation_preview(payment_record.id)||jsonb_build_object(
    'result','cancelled','license_action',license_action,'license_requires_review',review_required);
end; $$;

-- Confirmed P0-C documents retain their frozen commercial values. Corrections remain
-- available only for operational fields (method, reference and notes).
create or replace function public.admin_update_payment_record(
  target_payment_id uuid,target_amount numeric,target_currency text,target_method text,
  target_reference text,target_status text,target_notes text,target_adjustment_reason text
) returns public.payments language plpgsql security definer set search_path='' as $$
declare actor uuid; previous_payment public.payments%rowtype; updated_payment public.payments%rowtype;
  reason text:=nullif(btrim(target_adjustment_reason),'');
begin
  select * into previous_payment from public.payments where id=target_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  actor:=app_private.require_project_permission(previous_payment.project_id,'payments.correct');
  if reason is null then raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode='22023'; end if;
  if previous_payment.preinvoice_id is not null and previous_payment.status<>'pending' and
    (target_amount is distinct from previous_payment.amount or target_currency is distinct from previous_payment.currency
      or target_status is distinct from previous_payment.status) then
    raise exception 'P0C_PAYMENT_SNAPSHOT_IMMUTABLE' using errcode='22023';
  end if;
  if target_status='cancelled' and previous_payment.status in ('paid','complimentary') then
    raise exception 'USE_SAFE_PAYMENT_CANCELLATION' using errcode='22023';
  end if;
  if target_status not in ('pending','paid','cancelled','refunded','complimentary') then raise exception 'INVALID_PAYMENT_STATUS' using errcode='22023'; end if;
  if target_currency not in ('CUP','USD','EUR') then raise exception 'INVALID_CURRENCY' using errcode='22023'; end if;
  if target_method not in ('card','transfer','cash','paypal','other') then raise exception 'INVALID_PAYMENT_METHOD' using errcode='22023'; end if;
  if target_amount<0 or target_amount>previous_payment.list_price then raise exception 'INVALID_PAYMENT_AMOUNT' using errcode='22023'; end if;
  if target_status='complimentary' and target_amount<>0 then raise exception 'COMPLIMENTARY_PAYMENT_MUST_BE_ZERO' using errcode='22023'; end if;
  if nullif(btrim(target_reference),'') is null then raise exception 'PAYMENT_REFERENCE_REQUIRED' using errcode='22023'; end if;
  update public.payments set amount=target_amount,discount=list_price-target_amount,currency=target_currency,
    method=target_method,reference=btrim(target_reference),notes=nullif(btrim(target_notes),'')
  where id=target_payment_id returning * into updated_payment;
  if previous_payment.status is distinct from target_status then
    select * into updated_payment from public.admin_update_payment_status(target_payment_id,target_status,coalesce(nullif(btrim(target_notes),''),reason));
  end if;
  insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata)
  values(updated_payment.project_id,updated_payment.license_id,'payment_updated','Pago corregido por operador autorizado',actor,
    jsonb_build_object('payment_id',updated_payment.id,'reason',reason,'before',to_jsonb(previous_payment)-'recorded_by','after',to_jsonb(updated_payment)-'recorded_by'));
  return updated_payment;
end; $$;

revoke all on function public.admin_preview_payment_cancellation(uuid) from public,anon;
revoke all on function public.admin_cancel_payment_safe(uuid,text) from public,anon;
grant execute on function public.admin_preview_payment_cancellation(uuid) to authenticated;
grant execute on function public.admin_cancel_payment_safe(uuid,text) to authenticated;
