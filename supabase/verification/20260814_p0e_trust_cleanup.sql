-- P0-E verification. Run after the migration in an isolated database.
begin;

do $$
declare
  preview_definition text;
  cancel_definition text;
  update_definition text;
  referral_trigger_definition text;
begin
  select pg_get_functiondef('public.admin_preview_payment_cancellation(uuid)'::regprocedure)
    into preview_definition;
  select pg_get_functiondef('public.admin_cancel_payment_safe(uuid,text)'::regprocedure)
    into cancel_definition;
  select pg_get_functiondef('public.admin_update_payment_record(uuid,numeric,text,text,text,text,text,text)'::regprocedure)
    into update_definition;
  select pg_get_functiondef('app_private.p0d_apply_rewards_after_license_change()'::regprocedure)
    into referral_trigger_definition;

  if to_regprocedure('app_private.void_billing_receipt_for_payment(uuid,uuid,text,text)') is null then
    raise exception 'receipt void helper signature missing';
  end if;
  if preview_definition not like '%payments.correct%' then raise exception 'preview permission missing'; end if;
  if cancel_definition not like '%payments.correct%' then raise exception 'cancel permission missing'; end if;
  if cancel_definition not like '%for update%' then raise exception 'payment is not locked'; end if;
  if cancel_definition not like '%CANCELLATION_REASON_REQUIRED%' then raise exception 'reason guard missing'; end if;
  if cancel_definition not like '%PENDING_PAYMENT_MUST_BE_DELETED%' then raise exception 'pending guard missing'; end if;
  if cancel_definition not like '%void_billing_receipt_for_payment(payment_record.id%' then
    raise exception 'receipt helper is not called with payment id';
  end if;
  if cancel_definition like '%void_billing_receipt_for_payment(payment_record,%' then
    raise exception 'receipt helper receives payment row instead of uuid';
  end if;
  if cancel_definition like '%paid_payment_id=null%' then raise exception 'preinvoice payment trace is erased'; end if;
  if cancel_definition not like '%status=''cancelled''%' then raise exception 'cancelled status missing'; end if;
  if cancel_definition like '%voided%' then raise exception 'obsolete voided status reintroduced'; end if;
  if cancel_definition not like '%payment_cancelled_safe%' then raise exception 'semantic audit missing'; end if;
  if cancel_definition not like '%renewal_days_removed%' then raise exception 'additive renewal reversal missing'; end if;
  if cancel_definition not like '%first_license_suspended%' then raise exception 'first license protection missing'; end if;
  if cancel_definition not like '%trial_restored%' then raise exception 'trial restoration missing'; end if;
  if cancel_definition not like '%license_requires_review%' then raise exception 'legacy review path missing'; end if;
  if cancel_definition not like '%status=''earned''%' then raise exception 'payer referral rewards are not returned'; end if;
  if cancel_definition not like '%app.p0e_cancellation_reconcile%' then
    raise exception 'P0-E reconciliation guard is not enabled by cancellation';
  end if;
  if cancel_definition not like '%payment.status=''paid''%' then
    raise exception 'paid-only customer check missing';
  end if;
  if cancel_definition like '%payment.id<>payment_record.id and payment.status in (''paid'',''complimentary'')%' then
    raise exception 'complimentary incorrectly keeps paid-customer condition';
  end if;
  if referral_trigger_definition not like '%app.p0e_cancellation_reconcile%' then
    raise exception 'P0-D trigger lacks P0-E reconciliation guard';
  end if;
  if referral_trigger_definition not like '%app.p0c_frozen_plan_snapshot%' then
    raise exception 'existing P0-C referral guard was lost';
  end if;
  if update_definition not like '%P0C_PAYMENT_SNAPSHOT_IMMUTABLE%' then raise exception 'P0-C snapshot guard missing'; end if;
  if update_definition not like '%USE_SAFE_PAYMENT_CANCELLATION%' then raise exception 'unsafe cancellation remains'; end if;
end $$;

do $$
begin
  if has_function_privilege('anon','public.admin_cancel_payment_safe(uuid,text)','execute') then
    raise exception 'anon can cancel payments';
  end if;
  if has_function_privilege('anon','public.admin_preview_payment_cancellation(uuid)','execute') then
    raise exception 'anon can preview cancellations';
  end if;
  if not has_function_privilege('authenticated','public.admin_cancel_payment_safe(uuid,text)','execute') then
    raise exception 'authenticated RPC grant missing';
  end if;
end $$;

rollback;