-- VRIXORA Admin: reliable, permission-scoped operational alerts using the existing
-- notification_outbox, push_device_tokens, FCM worker and dispatch schedule.
-- Stage in a PR first. Apply remotely ONLY after audit + owner-approved release.
-- No new tables, secrets, cron jobs, or changes to Conductor or Cliente.

-- SECURITY: only owner and project members with marketplace.view receive alerts.
-- Use only enabled ADMIN-scoped devices. Do not send customer contact/route PII.
create or replace function app_private.enqueue_admin_marketplace_event(
  target_project_id uuid, target_kind text, target_entity_id uuid,
  target_title text, target_body text, target_stage text default 'initial'
)
returns integer
language plpgsql security definer set search_path = ''
as $function$
declare total_inserted int := 0;
begin
  if target_project_id is null or target_entity_id is null
    or target_kind not in ('admin_marketplace_new_job', 'admin_marketplace_new_driver', 'admin_marketplace_pending_job')
    or target_stage not in ('initial','pending_2m','pending_10m') then
    raise exception 'INVALID_ADMIN_OPERATIONAL_EVENT' using errcode = '22023';
  end if;

  insert into public.notification_outbox (
    project_id,user_id,kind,notification_date,dedupe_key,title,body,data
  )
  select target_project_id, recipient.user_id, target_kind, current_date,
    'admin-op:' || target_kind || ':' || target_entity_id::text || ':' || target_stage,
    left(target_title,140), left(target_body,300),
    jsonb_build_object(
      'kind',target_kind,'event_type',target_kind,'target_audience','admin',
      'project_id',target_project_id,'url','/admin/proyectos/' || target_project_id::text || '/trabajos',
      'job_id',case when target_kind <> 'admin_marketplace_new_driver' then target_entity_id::text else null end,
      'driver_id',case when target_kind = 'admin_marketplace_new_driver' then target_entity_id::text else null end,
      'stage',target_stage
    )
  from (
    select p.owner_id as user_id from public.projects p where p.id=target_project_id
    union
    select m.user_id
    from public.project_members m
    join public.project_role_permissions rp on rp.role_code=m.role
    where m.project_id=target_project_id and rp.permission_code='marketplace.view'
  ) recipient
  where exists (
    select 1 from public.push_device_tokens t
    where t.project_id=target_project_id and t.user_id=recipient.user_id
      and t.app_scope='admin' and t.platform='web' and t.enabled
  )
  on conflict (project_id,user_id,kind,dedupe_key) do nothing;

  get diagnostics total_inserted = row_count;
  return total_inserted;
end;
$function$;

create or replace function app_private.kick_admin_operational_push()
returns void language plpgsql security definer set search_path = '' as $function$
declare secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name='tuktuk_push_dispatch_secret' limit 1;
  if nullif(secret,'') is null then return; end if;
  begin
    perform net.http_post(
      url:='https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
      headers:=jsonb_build_object('Content-Type','application/json','x-tuktuk-dispatch-secret',secret),
      body:='{"limit":40,"max_batches":2,"concurrency":5,"time_budget_ms":20000}'::jsonb,
      timeout_milliseconds:=5000
    );
  exception when others then
    -- The existing 5-minute dispatch cron remains the retry mechanism.
    null;
  end;
end;
$function$;

create or replace function app_private.admin_operational_job_published()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare queued int;
begin
  if new.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid then return new; end if;
  if new.is_test or new.test_deleted_at is not null
    or new.status <> 'published' or new.published_at is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' then return new; end if;
  end if;

  queued := app_private.enqueue_admin_marketplace_event(
    new.project_id, 'admin_marketplace_new_job',new.id,
    'Nueva carrera publicada','Nueva solicitud real. Abre Administración para supervisarla.'
  );
  if queued>0 then perform app_private.kick_admin_operational_push(); end if;
  return new;
end;
$function$;

drop trigger if exists admin_operational_job_published on public.jobs;
create trigger admin_operational_job_published
  after insert or update of status,published_at on public.jobs
  for each row execute function app_private.admin_operational_job_published();

create or replace function app_private.admin_operational_driver_registered()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare queued int;
begin
  if new.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid then return new; end if;
  queued := app_private.enqueue_admin_marketplace_event(
    new.project_id,'admin_marketplace_new_driver',new.user_id,
    'Nuevo conductor registrado','Nuevo perfil de conductor en TukTuk. Revisa su incorporación.'
  );
  if queued>0 then perform app_private.kick_admin_operational_push(); end if;
  return new;
end;
$function$;

drop trigger if exists admin_operational_driver_registered on public.driver_profiles;
create trigger admin_operational_driver_registered
  after insert on public.driver_profiles
  for each row execute function app_private.admin_operational_driver_registered();

-- Invoked by the EXISTING FCM dispatcher every 5 minutes; creates at most
-- one warning per job/recipient/threshold. No additional cron or worker.
create or replace function public.enqueue_admin_marketplace_pending_alerts(target_project_id uuid)
returns integer
language plpgsql security invoker set search_path = '' as $function$
declare job record; queued int := 0;
begin
  for job in
    select j.id,j.project_id,j.published_at
    from public.jobs j
    where j.project_id=target_project_id and j.status='published'
      and not j.is_test and j.test_deleted_at is null
      and j.published_at <= now() - interval '2 minutes'
      and (j.expires_at is null or j.expires_at>now())
      and not exists (
        select 1 from public.job_assignments a
        where a.project_id=j.project_id and a.job_id=j.id
      )
    order by j.published_at desc limit 200
  loop
    queued := queued + app_private.enqueue_admin_marketplace_event(
      job.project_id, 'admin_marketplace_pending_job',job.id,
      'Carrera sin conductor','Esta carrera lleva más de 2 minutos sin asignación.', 'pending_2m'
    );
    if job.published_at <= now() - interval '10 minutes' then
      queued := queued + app_private.enqueue_admin_marketplace_event(
        job.project_id,'admin_marketplace_pending_job',job.id,
        'Atención: carrera sin asignar','La carrera sigue sin conductor después de 10 minutos.', 'pending_10m'
      );
    end if;
  end loop;
  return queued;
end;
$function$;

-- Do not expand the database API attack surface. This RPC runs exclusively
-- from the existing FCM Edge worker with the service_role credentials.
grant usage on schema app_private to service_role;
grant execute on function app_private.enqueue_admin_marketplace_event(uuid,text,uuid,text,text,text) to service_role;
revoke all on function app_private.enqueue_admin_marketplace_event(uuid,text,uuid,text,text,text),
  app_private.kick_admin_operational_push(),
  app_private.admin_operational_job_published(),
  app_private.admin_operational_driver_registered()
  from PUBLIC, anon, authenticated;
revoke all on function public.enqueue_admin_marketplace_pending_alerts(uuid)
  from PUBLIC, anon, authenticated;
grant execute on function public.enqueue_admin_marketplace_pending_alerts(uuid) to service_role;
