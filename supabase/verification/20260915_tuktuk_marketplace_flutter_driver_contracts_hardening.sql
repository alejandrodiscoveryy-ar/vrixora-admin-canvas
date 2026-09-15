-- Static B9.1 checks. Dynamic cross-user/storage tests remain Block 12 debt.
do $$
declare driver_fn text; policy_expr text; program_fn text;
begin
 select pg_get_functiondef(p.oid) into driver_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_my_marketplace_driver_onboarding';
 if driver_fn !~ 'driver_exists:=found' or driver_fn !~ 'if not driver_exists then' or driver_fn !~ 'insert into public.driver_profiles' or driver_fn !~ 'DRIVER_SUSPENDED' then raise exception 'driver onboarding hardening missing'; end if;
 select pg_get_expr(pol.polqual,pol.polrelid) into policy_expr from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and pol.polname='marketplace media owner reads owned assets';
 if policy_expr !~ 'marketplace_media_path_is_owned' then raise exception 'owner read policy missing'; end if;
 if not exists(select 1 from storage.buckets where id='marketplace-media' and public=false) then raise exception 'bucket is not private'; end if;
 if exists(select 1 from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and pol.polcmd in ('w','d') and pol.polname like 'marketplace media%') then raise exception 'unexpected storage update/delete policy'; end if;
 if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('driver_profiles','vehicles','driver_vehicle_assignments','vehicle_services','media_assets','jobs','job_assignments') and grantee='authenticated' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) then raise exception 'direct Marketplace grant detected'; end if;
 select pg_get_functiondef(p.oid) into program_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_my_referral_program';
 if program_fn !~ 'marketplace_legacy_referral_reward_transitions' or program_fn !~ 'count\(distinct reward.referred_user_id\)' or program_fn !~ "'reward_days',0" then raise exception 'wallet referral contract incomplete'; end if;
end $$;

-- Block 12 dynamic debt: first save creates one driver profile; pending->available and retry; another owner denied;
-- finalize without object fails; available owner reads; empty services saves but remains incomplete; referral 100->150.
