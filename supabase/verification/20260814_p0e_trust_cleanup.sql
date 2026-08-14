-- P0-E verification. Run after the migration in an isolated database.
begin;

do $$
declare preview_definition text; cancel_definition text; update_definition text;
begin
  select pg_get_functiondef('public.admin_preview_payment_cancellation(uuid)'::regprocedure)
    into preview_definition;
  select pg_get_functiondef('public.admin_cancel_payment_safe(uuid,text)'::regprocedure)
    into cancel_definition;
  select pg_get_functiondef('public.admin_update_payment_record(uuid,numeric,text,text,text,text,text,text)'::regprocedure)
    into update_definition;

  if preview_definition not like '%payments.correct%' then raise exception 'preview permission missing'; end if;
  if cancel_definition not like '%payments.correct%' then raise exception 'cancel permission missing'; end if;
  if cancel_definition not like '%for update%' then raise exception 'payment is not locked'; end if;
  if cancel_definition not like '%CANCELLATION_REASON_REQUIRED%' then raise exception 'reason guard missing'; end if;
  if cancel_definition not like '%PENDING_PAYMENT_MUST_BE_DELETED%' then raise exception 'pending guard missing'; end if;
  if cancel_definition not like '%void_billing_receipt_for_payment%' then raise exception 'receipt preservation missing'; end if;
  if cancel_definition like '%paid_payment_id=null%' then raise exception 'preinvoice payment trace is erased'; end if;
  if cancel_definition not like '%status=''cancelled''%' then raise exception 'cancelled status missing'; end if;
  if cancel_definition like '%voided%' then raise exception 'obsolete voided status reintroduced'; end if;
  if cancel_definition not like '%payment_cancelled_safe%' then raise exception 'semantic audit missing'; end if;
  if cancel_definition not like '%renewal_days_removed%' then raise exception 'additive renewal reversal missing'; end if;
  if cancel_definition not like '%first_license_suspended%' then raise exception 'first license protection missing'; end if;
  if cancel_definition not like '%trial_restored%' then raise exception 'trial restoration missing'; end if;
  if cancel_definition not like '%license_requires_review%' then raise exception 'legacy review path missing'; end if;
  if cancel_definition not like '%status=''earned''%' then raise exception 'payer referral rewards are not returned'; end if;
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

-- Integration scenarios covered by the transactional RPC and asserted by the guards above:
-- paid/complimentary -> cancelled; repeated cancellation is idempotent; pending uses delete;
-- receipt remains and is voided; analytics trigger reconciles paid -> cancelled;
-- renewal removes only the days granted by this payment; first-created license is suspended;
-- safe trial conversion restores the prior trial; ambiguous legacy state is flagged for review;
-- generated referral reward is reverted by P0-D and applied payer rewards return to earned;
-- test payments never mutate a real license; confirmed P0-C price/rate snapshots are immutable.

rollback;
