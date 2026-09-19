begin;

do $$
declare definition text; function_name text;
begin
  if to_regclass('public.marketplace_customer_sessions') is null then raise exception 'TEST_FAILED: customer session table missing'; end if;
  if not (select relrowsecurity from pg_class where oid='public.marketplace_customer_sessions'::regclass) then raise exception 'TEST_FAILED: customer session RLS missing'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_customer_sessions' and column_name='raw_token') then raise exception 'TEST_FAILED: raw token column exists'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_customer_sessions'::regclass and pg_get_constraintdef(oid) like '%token_hash ~%64%') then raise exception 'TEST_FAILED: SHA256 token contract missing'; end if;
  foreach function_name in array array['public.marketplace_customer_sessions','public.customers','public.service_requests','public.jobs','public.job_events','public.job_assignments','public.commission_reservations','public.wallets','public.wallet_transactions'] loop
    if has_table_privilege('anon',function_name,'select') or has_table_privilege('anon',function_name,'insert') or has_table_privilege('anon',function_name,'update') or has_table_privilege('anon',function_name,'delete')
      or has_table_privilege('authenticated',function_name,'select') or has_table_privilege('authenticated',function_name,'insert') or has_table_privilege('authenticated',function_name,'update') or has_table_privilege('authenticated',function_name,'delete') then raise exception 'TEST_FAILED: direct access exposed for %',function_name; end if;
  end loop;
  if to_regprocedure('app_private.resolve_marketplace_customer_session(uuid,text)') is null or has_function_privilege('anon','app_private.resolve_marketplace_customer_session(uuid,text)','execute') or has_function_privilege('authenticated','app_private.resolve_marketplace_customer_session(uuid,text)','execute') then raise exception 'TEST_FAILED: resolver protection incorrect'; end if;
  foreach function_name in array array['public.start_marketplace_customer_session(text,text,text,uuid)','public.get_marketplace_customer_job(uuid,text,uuid)','public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)'] loop
    if not has_function_privilege('anon',function_name,'execute') or not has_function_privilege('authenticated',function_name,'execute') then raise exception 'TEST_FAILED: customer RPC grant incorrect for %',function_name; end if;
  end loop;
  foreach function_name in array array['public.get_my_marketplace_work_access(text)','public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid)','public.get_my_marketplace_customer_contact(uuid)'] loop
    if has_function_privilege('anon',function_name,'execute') or not has_function_privilege('authenticated',function_name,'execute') then raise exception 'TEST_FAILED: driver RPC grant incorrect for %',function_name; end if;
  end loop;
  select lower(pg_get_functiondef('public.start_marketplace_customer_session(text,text,text,uuid)'::regprocedure)) into definition;
  if definition not like '%extensions.digest%' or definition not like '%^[+][1-9][0-9]{7,14}$%' or definition not like '%idempotency_key%' or definition not like '%pg_advisory_xact_lock%' or definition not like '%customer-session:idempotency:%' or definition not like '%customer-session:token:%' or definition not like '%char_length(target_session_token) < 32%' or definition not like '%char_length(target_session_token) > 512%' or definition like '%raw_token%' then raise exception 'TEST_FAILED: start session privacy or concurrency contract incomplete'; end if;
  select lower(pg_get_functiondef('public.get_my_marketplace_work_access(text)'::regprocedure)) into definition;
  if definition not like '%server_time%' or definition not like '%marketplace_onboarding_requirements_complete%' or definition not like '%has_active_marketplace_work_trial%' or definition not like '%has_confirmed_marketplace_initial_deposit%' then raise exception 'TEST_FAILED: work access contract incomplete'; end if;
  select lower(pg_get_functiondef('public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid)'::regprocedure)) into definition;
  if definition like '%whatsapp_phone%' or definition like '%customer_id%' or definition like '%notes%' or definition like '%details%' or definition not like '%j.status=''published''%' or definition not like '%vehicle_services%' or definition not like '%marketplace_onboarding_requirements_complete%' then raise exception 'TEST_FAILED: available jobs projection or access incomplete'; end if;
  select lower(pg_get_functiondef('public.get_my_marketplace_customer_contact(uuid)'::regprocedure)) into definition;
  if definition not like '%assigned_driver_user_id=actor%' or definition not like '%access_denied%' then raise exception 'TEST_FAILED: contact authorization incomplete'; end if;
  select lower(pg_get_functiondef('public.get_marketplace_customer_job(uuid,text,uuid)'::regprocedure)) into definition;
  if definition not like '%resolve_marketplace_customer_session%' or definition not like '%r.customer_id=cid%' or definition not like '%case when j.assigned_driver_user_id is not null%' or definition like '%storage_path%' or definition like '%storage_bucket%' then raise exception 'TEST_FAILED: customer tracking privacy incomplete'; end if;
  select lower(pg_get_functiondef('public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)'::regprocedure)) into definition;
  if definition like '%returns public.jobs%' or definition not like '%returns table(job_id uuid,status text,server_time timestamptz)%' or definition not like '%return query select j.id,j.status,now()%' or definition not like '%for update%' or definition not like '%wallet_commission%' or definition not like '%trial_free%' or definition not like '%customer_cancellation_requires_support%' or definition not like '%is_available=is_active%' then raise exception 'TEST_FAILED: customer cancellation projection or implementation incomplete'; end if;
  select lower(pg_get_functiondef('public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid)'::regprocedure)) into definition;
  if definition not like '%invalid_pagination_cursor%' or definition not like '%(target_before_created_at is null) <> (target_before_job_id is null)%' then raise exception 'TEST_FAILED: incomplete cursor validation missing'; end if;
  foreach function_name in array array['app_private.resolve_marketplace_customer_session(uuid,text)','public.start_marketplace_customer_session(text,text,text,uuid)','public.get_my_marketplace_work_access(text)','public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid)','public.get_my_marketplace_customer_contact(uuid)','public.get_marketplace_customer_job(uuid,text,uuid)','public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)'] loop
    select lower(pg_get_functiondef(function_name::regprocedure)) into definition;
    if definition not like '%set search_path = ''''%' then raise exception 'TEST_FAILED: search_path missing for %',function_name; end if;
  end loop;
  if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('set_job_status','update_job')) then raise exception 'TEST_FAILED: generic job mutation RPC exists'; end if;
end $$;

-- Dynamic tests pending (no remote Supabase): invalid/expired/cross-customer session;
-- invalid WhatsApp; concurrent same-key/same-payload, same-key/different-payload and
-- same-token/different-key session creation; token over 512; expired token rotation;
-- cancellation projection has no internal columns; incomplete cursor rejection; driver IDOR contact;
-- tracking before/after assignment; customer cancellations for requested, published, trial and wallet jobs;
-- in-progress support rejection; cursor pagination; expired/incompatible/suspended/trial-expired access;
-- RLS/grants and EXPLAIN for the opportunity listing. Block 10 owns endpoint IP rate limits,
-- CAPTCHA, anti-bot, reputation and global throttling.

rollback;
