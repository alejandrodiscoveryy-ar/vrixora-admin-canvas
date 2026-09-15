-- Static Block 9 verification. Run against a disposable local database; dynamic RLS tests remain Block 12 debt.
do $$
declare required_functions text[]:=array['get_my_marketplace_onboarding','save_my_marketplace_driver_onboarding','save_my_marketplace_vehicle_onboarding','prepare_my_marketplace_media_upload','finalize_my_marketplace_media_upload','list_my_marketplace_jobs']; fn text;
begin
 foreach fn in array required_functions loop
   if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=fn) then raise exception 'missing RPC %',fn; end if;
 end loop;
 if not exists(select 1 from storage.buckets where id='marketplace-media' and public=false) then raise exception 'marketplace-media must be private'; end if;
 if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('driver_profiles','vehicles','driver_vehicle_assignments','vehicle_services','media_assets','jobs','job_assignments') and grantee='authenticated' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) then raise exception 'direct Marketplace grant detected'; end if;
end $$;

-- Dynamic Block 12 debt (not executed here): cross-user vehicle/photo denial; prepared upload/finalize and retry;
-- missing object rejection; complete/incomplete trial gates; assigned-job isolation and PII absence; wallet referral
-- claim without days; configured reward 100 -> 150 reflected in mobile contracts.
