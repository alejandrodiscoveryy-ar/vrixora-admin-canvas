begin;

do $$
declare d text;
begin
  if to_regclass('public.marketplace_work_trials') is null then raise exception 'TEST_FAILED: trial table missing'; end if;
  if not (select relrowsecurity from pg_class where oid='public.marketplace_work_trials'::regclass) then raise exception 'TEST_FAILED: trial RLS missing'; end if;
  if has_table_privilege('authenticated','public.marketplace_work_trials','select') or has_table_privilege('authenticated','public.marketplace_work_trials','insert') or has_table_privilege('authenticated','public.marketplace_work_trials','update') or has_table_privilege('authenticated','public.marketplace_work_trials','delete') then raise exception 'TEST_FAILED: direct trial access'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_work_trials'::regclass and contype='p' and pg_get_constraintdef(oid) like '%project_id, user_id%') then raise exception 'TEST_FAILED: one trial per user/project missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_work_trials'::regclass and contype='c' and pg_get_constraintdef(oid) like '%30 days%') then raise exception 'TEST_FAILED: exact 30 days missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.marketplace_work_trials'::regclass and tgname='marketplace_work_trials_immutable') then raise exception 'TEST_FAILED: immutable trial guard missing'; end if;
  foreach d in array array['app_private.marketplace_onboarding_requirements_complete(uuid,text)','app_private.has_active_marketplace_work_trial(uuid)','public.start_my_marketplace_work_trial(text,uuid)'] loop if to_regprocedure(d) is null then raise exception 'TEST_FAILED: function missing %',d; end if; end loop;
  if has_function_privilege('anon','public.start_my_marketplace_work_trial(text,uuid)','execute') then raise exception 'TEST_FAILED: trial RPC exposed to anon'; end if;
  select lower(pg_get_functiondef('public.start_my_marketplace_work_trial(text,uuid)'::regprocedure)) into d;
  if d not like '%auth.uid()%' or d not like '%for update%' or d not like '%now()%' or d not like '%work_trial_already_started%' then raise exception 'TEST_FAILED: start trial auth/server-time/idempotency incomplete'; end if;
  select lower(pg_get_functiondef('app_private.has_active_marketplace_suite(uuid)'::regprocedure)) into d;
  if d not like '%has_active_marketplace_work_trial%' or d not like '%has_confirmed_marketplace_initial_deposit%' then raise exception 'TEST_FAILED: suite entitlement incorrect'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='job_assignments' and column_name='billing_mode') then raise exception 'TEST_FAILED: frozen billing mode missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.job_assignments'::regclass and conname='job_assignments_billing_mode_check') then raise exception 'TEST_FAILED: billing mode check missing'; end if;
  select lower(pg_get_functiondef('public.accept_job(uuid,text,uuid)'::regprocedure)) into d;
  if d not like '%trial_free%' or d not like '%wallet_commission%' or d not like '%marketplace_initial_deposit_required_after_trial%' or d not like '%commission_reservations%' then raise exception 'TEST_FAILED: accept branches incomplete'; end if;
  select lower(pg_get_functiondef('public.advance_my_marketplace_job(uuid,text,uuid)'::regprocedure)) into d;
  if d not like '%trial_free%' or d not like '%commission_reservation_not_found%' or d not like '%job_commission%' then raise exception 'TEST_FAILED: settlement branches incomplete'; end if;
  select lower(pg_get_functiondef('public.cancel_my_marketplace_job(uuid,text,uuid)'::regprocedure)) into d;
  if d not like '%trial_free%' or d not like '%wallet_commission%' then raise exception 'TEST_FAILED: cancellation branches incomplete'; end if;
  foreach d in array array['public.accept_job(uuid,text,uuid)','public.advance_my_marketplace_job(uuid,text,uuid)','public.cancel_my_marketplace_job(uuid,text,uuid)'] loop if has_function_privilege('anon',d,'execute') then raise exception 'TEST_FAILED: anon RPC %',d; end if; end loop;
end $$;

-- Dynamic tests pending (no remote Supabase): incomplete onboarding; exact 30 days;
-- same-key retry; second-key/recreated profile rejection; walletless trial acceptance;
-- zero reservation/debit after expiry; post-trial deposit gate; payments.manage topup;
-- early topup preservation; wallet reserve/single debit; no double or deferred trial fee.

rollback;
