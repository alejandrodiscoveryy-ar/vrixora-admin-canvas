-- Additive versioned RPCs: preserve the existing payment endpoints for older clients.
-- The existing offer list applies vehicle ownership, dispatch/radar, Impulsa and eligibility rules.
-- The existing assigned list scopes every returned job to the authenticated driver.
create or replace function public.list_my_marketplace_available_jobs_with_details(
 target_vehicle_id text, target_limit integer default 50,
 target_before_created_at timestamptz default null, target_before_job_id uuid default null
) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 return query select to_jsonb(a) || jsonb_build_object(
   -- Before acceptance, remove common phone/email strings from free-text notes.
   'customer_notes',nullif(btrim(regexp_replace(regexp_replace(coalesce(r.notes,''),
       '[[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[contacto reservado]', 'gi'),
       '(\+?[0-9][0-9 ().-]{6,}[0-9])', '[contacto reservado]', 'g')),''),
   'load_help',case when r.details->'load_help'='true'::jsonb then true else false end,
   'unload_help',case when r.details->'unload_help'='true'::jsonb then true else false end,
   'urgent',case when r.details->'urgent'='true'::jsonb then true else false end,
   'stop_count',case when r.details->>'stop_count' ~ '^[0-9]{1,3}$' then (r.details->>'stop_count')::integer end
 )
 from public.list_my_marketplace_available_jobs_with_payment(
   target_vehicle_id,target_limit,target_before_created_at,target_before_job_id
 ) a
 join public.jobs j on j.id=a.job_id
 join public.service_requests r on r.id=j.service_request_id and r.project_id=j.project_id
 order by a.created_at desc,a.job_id desc;
end $$;
revoke all on function public.list_my_marketplace_available_jobs_with_details(text,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.list_my_marketplace_available_jobs_with_details(text,integer,timestamptz,uuid) to authenticated;

create or replace function public.list_my_marketplace_jobs_with_details(
 target_scope text, target_limit integer default 50,
 target_before_created_at timestamptz default null,target_before_job_id uuid default null
) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 return query select to_jsonb(a) || jsonb_build_object(
   'customer_notes',nullif(btrim(r.notes),''),
   'load_help',case when r.details->'load_help'='true'::jsonb then true else false end,
   'unload_help',case when r.details->'unload_help'='true'::jsonb then true else false end,
   'urgent',case when r.details->'urgent'='true'::jsonb then true else false end,
   'stop_count',case when r.details->>'stop_count' ~ '^[0-9]{1,3}$' then (r.details->>'stop_count')::integer end
 )
 from public.list_my_marketplace_jobs_with_payment(
   target_scope,target_limit,target_before_created_at,target_before_job_id
 ) a
 join public.jobs j on j.id=a.job_id
 join public.service_requests r on r.id=j.service_request_id and r.project_id=j.project_id
 -- Defense in depth: only the assigned driver's own historical/active rows.
 where exists(select 1 from public.job_assignments x where x.project_id=j.project_id
   and x.job_id=j.id and x.driver_user_id=auth.uid())
 order by a.created_at desc,a.job_id desc;
end $$;
revoke all on function public.list_my_marketplace_jobs_with_details(text,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.list_my_marketplace_jobs_with_details(text,integer,timestamptz,uuid) to authenticated;
