begin;
do $$
declare f text; relation_name text;
begin
  if not exists(select 1 from public.project_permissions where code='marketplace.view' and name='Ver operación de Trabajos' and category='marketplace') or not exists(select 1 from public.project_permissions where code='marketplace.manage' and name='Gestionar operación de Trabajos' and category='marketplace') then raise exception 'TEST_FAILED: marketplace permissions missing'; end if;
  if (select count(*) from public.project_role_permissions where permission_code='marketplace.view' and role_code in ('owner','admin','support','accounting'))<>4 or (select count(*) from public.project_role_permissions where permission_code='marketplace.manage' and role_code in ('owner','admin','support'))<>3 or exists(select 1 from public.project_role_permissions where permission_code like 'marketplace.%' and role_code='marketing') then raise exception 'TEST_FAILED: marketplace role matrix incorrect'; end if;
  if not exists(select 1 from pg_class where oid='public.marketplace_incident_resolutions'::regclass and relrowsecurity) or not exists(select 1 from pg_trigger where tgrelid='public.marketplace_incident_resolutions'::regclass and tgname='marketplace_incident_resolutions_immutable' and not tgisinternal) or not exists(select 1 from pg_trigger where tgrelid='public.marketplace_incident_resolutions'::regclass and tgname='audit_marketplace_incident_resolutions' and not tgisinternal) then raise exception 'TEST_FAILED: incident resolution security missing'; end if;
  foreach f in array array['public.admin_get_marketplace_overview(uuid)','public.admin_list_marketplace_drivers(uuid,integer,timestamptz,uuid)','public.admin_list_marketplace_jobs(uuid,text,text,integer,timestamptz,uuid)','public.admin_get_marketplace_job_detail(uuid,uuid)','public.admin_list_marketplace_customers(uuid,integer,timestamptz,uuid)','public.admin_list_marketplace_topups(uuid,text,integer,timestamptz,uuid)','public.admin_list_marketplace_wallets(uuid,integer,timestamptz,uuid)','public.admin_get_marketplace_financial_settings(uuid)','public.admin_list_marketplace_incidents(uuid,boolean,integer,timestamptz,uuid)','public.admin_resolve_marketplace_incident(uuid,uuid,text,text,uuid)','public.admin_set_marketplace_driver_suspension(uuid,uuid,boolean,text)'] loop
    if to_regprocedure(f) is null then raise exception 'TEST_FAILED: missing %',f; end if;
    if has_function_privilege('anon',f,'execute') or not has_function_privilege('authenticated',f,'execute') then raise exception 'TEST_FAILED: grants invalid for %',f; end if;
    select lower(pg_get_functiondef(f::regprocedure)) into relation_name; if relation_name not like '%security definer%' or relation_name not like '%set search_path = ''''%' then raise exception 'TEST_FAILED: hardening missing for %',f; end if;
  end loop;
  select lower(pg_get_functiondef('public.admin_resolve_marketplace_incident(uuid,uuid,text,text,uuid)'::regprocedure)) into f;
  if f not like '%pg_advisory_xact_lock%' or f not like '%tuktuk:incident-resolution:%' or position('from public.jobs' in f)>position('from public.job_assignments' in f) or position('from public.job_assignments' in f)>position('from public.wallets' in f) or position('from public.wallets' in f)>position('from public.commission_reservations' in f) or f not like '%trial_free%' or f not like '%job_commission_reversal%' or f not like '%incident_resolved%' or f not like '%status<>''incident''%' or f like '%update public.wallet_transactions%' or f like '%delete from public.wallet_transactions%' then raise exception 'TEST_FAILED: incident resolution contract incomplete'; end if;
  if position('elsif a.completed_at is null' in f)=0 then raise exception 'TEST_FAILED: cancellation must preserve historical completion'; end if;
  select lower(pg_get_functiondef('public.admin_get_marketplace_overview(uuid)'::regprocedure)) into f;
  if f not like '%has_confirmed_marketplace_initial_deposit%' then raise exception 'TEST_FAILED: post-trial overview is not deposit-gated'; end if;
  select lower(pg_get_functiondef('public.admin_get_marketplace_job_detail(uuid,uuid)'::regprocedure)) into f;
  if f like '%to_jsonb(sr)%' or f like '%to_jsonb(a)%' or f like '%to_jsonb(e)%' or f like '%resolution_idempotency_key%' or f like '%token_hash%' or f like '%session_token%' or f not like '%case when can_customers then sr.customer_id%' or f not like '%case when can_customers then sr.notes%' or f not like '%case when can_pay then%' then raise exception 'TEST_FAILED: job detail privacy projection incomplete'; end if;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('driver_profiles','vehicles','customers','service_requests','jobs','job_events','job_assignments','wallets','topups','wallet_transactions','commission_reservations','marketplace_work_trials','marketplace_customer_sessions','marketplace_incident_resolutions') and grantee in ('anon','authenticated') and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) then raise exception 'TEST_FAILED: direct sensitive table CRUD grant'; end if;
  if to_regprocedure('public.approve_driver(uuid)') is not null or to_regprocedure('public.activate_driver(uuid)') is not null or to_regprocedure('public.approve_marketplace_driver(uuid)') is not null then raise exception 'TEST_FAILED: prohibited driver approval RPC exists'; end if;
  select lower(pg_get_functiondef('public.admin_confirm_marketplace_topup(uuid,uuid,uuid)'::regprocedure)) into f;
  if f not like '%require_project_permission(target_project_id, ''payments.manage'')%' then raise exception 'TEST_FAILED: topup confirm permission regressed'; end if;
  select lower(pg_get_functiondef('public.admin_reject_marketplace_topup(uuid,uuid,text)'::regprocedure)) into f;
  if f not like '%require_project_permission(target_project_id, ''payments.manage'')%' then raise exception 'TEST_FAILED: topup rejection permission regressed'; end if;
  select lower(pg_get_functiondef('public.admin_set_marketplace_financial_settings(uuid,numeric,numeric)'::regprocedure)) into f;
  if f not like '%require_project_permission(target_project_id, ''settings.manage'')%' then raise exception 'TEST_FAILED: financial settings permission regressed'; end if;
end $$;
-- Dynamic scenarios pending: RBAC role matrix; lists with/without secondary permissions; cursors;
-- suspend/reactivate; active trial during suspension; trial/wallet incident paths; retries/concurrency;
-- incident completed/settled -> cancelled with exactly one reversal and completed_at preserved;
-- concurrent same-key and same-job/different-key resolutions; overview trial-expired/no-deposit and
-- confirmed-deposit/no-trial cases; availability restoration; and permission-gated PII/financial
-- disclosure must be exercised against an isolated fixture database.
rollback;
