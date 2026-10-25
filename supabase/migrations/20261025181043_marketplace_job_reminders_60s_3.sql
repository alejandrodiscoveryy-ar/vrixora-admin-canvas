-- TUKTUK: recordatorios de carreras sin conductor (60/120/180 s).
-- Preparacion para PR; NO EJECUTAR en produccion sin autorizacion explicita.
-- La configuracion se inicia desactivada y solamente afecta carreras notificadas
-- despues de activarse. Los envios originales no se modifican.

create table if not exists public.project_marketplace_job_reminder_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  interval_seconds integer not null default 60 check (interval_seconds between 30 and 300),
  max_reminders integer not null default 3 check (max_reminders between 1 and 5),
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.project_marketplace_job_reminder_settings enable row level security;
-- Consulta periódica de avisos iniciales; evita escanear historiales de otros eventos.
create index if not exists notification_outbox_marketplace_initial_sent_idx
  on public.notification_outbox (project_id, sent_at desc)
  where kind='marketplace_job_available' and delivery_status='sent';
revoke all on table public.project_marketplace_job_reminder_settings from PUBLIC, anon, authenticated;

-- Parametros predeterminados, sin activacion automatica.
insert into public.project_marketplace_job_reminder_settings
  (project_id, enabled, interval_seconds, max_reminders)
values ('dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid, false, 60, 3)
on conflict (project_id) do nothing;

create or replace function public.admin_get_marketplace_job_reminder_settings(target_project_id uuid)
returns table(enabled boolean, interval_seconds integer, max_reminders integer, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $function$
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');
  return query
  select s.enabled, s.interval_seconds, s.max_reminders, s.updated_at
  from public.project_marketplace_job_reminder_settings s
  where s.project_id=target_project_id;
end;
$function$;

create or replace function public.admin_set_marketplace_job_reminder_settings(
  target_project_id uuid, target_enabled boolean,
  target_interval_seconds integer, target_max_reminders integer
)
returns void
language plpgsql security definer set search_path = '' as $function$
begin
  perform app_private.require_project_permission(target_project_id, 'settings.manage');
  if target_enabled is null or target_interval_seconds is null or
     target_interval_seconds not between 30 and 300 or target_max_reminders is null or
     target_max_reminders not between 1 and 5 then
    raise exception 'INVALID_JOB_REMINDER_SETTINGS' using errcode='22023';
  end if;

  insert into public.project_marketplace_job_reminder_settings as settings
    (project_id, enabled, interval_seconds, max_reminders, activated_at, updated_at, updated_by)
  values (
    target_project_id, target_enabled, target_interval_seconds, target_max_reminders,
    case when target_enabled then clock_timestamp() else null end,
    clock_timestamp(), auth.uid()
  )
  on conflict (project_id) do update set
    enabled=excluded.enabled,
    interval_seconds=excluded.interval_seconds,
    max_reminders=excluded.max_reminders,
    activated_at=case
      when not excluded.enabled then null
      when not settings.enabled then clock_timestamp()
      else settings.activated_at
    end,
    updated_at=clock_timestamp(), updated_by=auth.uid();
end;
$function$;

revoke all on function public.admin_get_marketplace_job_reminder_settings(uuid),
  public.admin_set_marketplace_job_reminder_settings(uuid,boolean,integer,integer)
  from PUBLIC, anon, authenticated;
grant execute on function public.admin_get_marketplace_job_reminder_settings(uuid),
  public.admin_set_marketplace_job_reminder_settings(uuid,boolean,integer,integer)
  to authenticated;

-- Solo se recuerda a conductores que recibieron el aviso inicial, que siguen
-- habilitados y para carreras reales aun PUBLICADAS, sin conductor y vigentes.
-- Una ventana de 45 s evita recuperar masivamente avisos viejos tras una caida.
create or replace function app_private.enqueue_marketplace_job_reminders()
returns integer
language plpgsql security invoker set search_path = '' as $function$
declare
  inserted_rows integer := 0;
  dispatch_secret text;
begin
  insert into public.notification_outbox
    (project_id, user_id, kind, notification_date, dedupe_key, title, body, data)
  select j.project_id, initial.user_id, 'marketplace_job_available', current_date,
    'marketplace-job:' || j.id::text || ':reminder:' || stage.n::text,
    'Carrera disponible - recordatorio',
    case when stage.n=1 then 'La carrera sigue disponible. Abre Trabajos para aceptarla.'
         when stage.n=2 then 'Todavia tienes una carrera disponible en Trabajos.'
         else 'Ultimo recordatorio: hay una carrera disponible.' end,
    jsonb_build_object(
      'event_type','marketplace_job_available', 'job_id',j.id,
      'reminder_index',stage.n,
      'reminder_expires_at', initial.sent_at + make_interval(
        secs=>stage.n*cfg.interval_seconds + least(45,cfg.interval_seconds - 1)
      )
    )
  from public.notification_outbox initial
  join public.jobs j
    on j.project_id=initial.project_id
   and j.id::text=(initial.data->>'job_id')
  join public.project_marketplace_job_reminder_settings cfg
    on cfg.project_id=j.project_id and cfg.enabled
  cross join lateral generate_series(1,cfg.max_reminders) stage(n)
  where initial.kind='marketplace_job_available'
    and initial.delivery_status='sent' and initial.sent_at is not null
    and initial.dedupe_key='marketplace-job:' || j.id::text
    and cfg.activated_at is not null and initial.sent_at >= cfg.activated_at
    and initial.sent_at >= clock_timestamp() - make_interval(
      secs=>cfg.max_reminders*cfg.interval_seconds + 45
    )
    and j.status='published' and j.assigned_driver_user_id is null
    and not exists (
      select 1 from public.job_assignments ja
      where ja.project_id=j.project_id and ja.job_id=j.id
    )
    and not j.is_test and j.test_deleted_at is null
    and (j.expires_at is null or j.expires_at > clock_timestamp())
    and clock_timestamp() >= initial.sent_at + make_interval(secs=>stage.n*cfg.interval_seconds)
    and clock_timestamp() < initial.sent_at + make_interval(secs=>stage.n*cfg.interval_seconds + least(45, cfg.interval_seconds - 1))
    and exists (
      select 1 from public.driver_vehicle_assignments a
      where a.project_id=j.project_id and a.driver_user_id=initial.user_id
        and app_private.marketplace_driver_can_receive_job(
          j.project_id, a.driver_user_id, a.vehicle_id, j.id
        )
        and exists (
          select 1 from app_private.marketplace_dispatch_candidate_state(
            j.project_id,a.driver_user_id,a.vehicle_id,j.id
          ) c where c.allowed
        )
    )
    and not exists (
      select 1 from public.notification_outbox active_notice
      where active_notice.project_id=j.project_id
        and active_notice.user_id=initial.user_id
        and active_notice.kind='marketplace_job_available'
        and active_notice.dedupe_key like 'marketplace-job:' || j.id::text || ':reminder:%'
        and active_notice.delivery_status in ('pending','processing')
    )
  on conflict (project_id,user_id,kind,dedupe_key) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows > 0 then
    -- Reutilizar FCM existente: el cron general cada 5 min es solo respaldo.
    select decrypted_secret into dispatch_secret
    from vault.decrypted_secrets
    where name='tuktuk_push_dispatch_secret' limit 1;
    if nullif(dispatch_secret,'') is not null then
      begin
        perform net.http_post(
          url:='https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-tuktuk-dispatch-secret',dispatch_secret
          ),
          body:='{"limit":100,"max_batches":5,"concurrency":8,"time_budget_ms":30000}'::jsonb,
          timeout_milliseconds:=5000
        );
      exception when others then
        raise warning 'TUKTUK_JOB_REMINDER_PUSH_DISPATCH_FAILED';
      end;
    else
      raise warning 'TUKTUK_JOB_REMINDER_PUSH_SECRET_MISSING';
    end if;
  end if;
  return inserted_rows;
end;
$function$;

-- Verificación de elegibilidad en el momento REAL del envío.
-- Sólo el worker service_role puede invocar esta comprobación.
create or replace function public.marketplace_reminder_recipient_eligible(
  target_project_id uuid, target_job_id uuid, target_driver_user_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1
    from public.jobs j
    join public.driver_vehicle_assignments a on a.project_id=j.project_id
      and a.driver_user_id=target_driver_user_id
    where j.project_id=target_project_id
      and j.id=target_job_id
      and j.status='published'
      and j.assigned_driver_user_id is null
      and not j.is_test
      and j.test_deleted_at is null
      and (j.expires_at is null or j.expires_at>clock_timestamp())
      and not exists (
        select 1 from public.job_assignments ja
        where ja.project_id=j.project_id and ja.job_id=j.id
      )
      and app_private.marketplace_driver_can_receive_job(
        j.project_id,a.driver_user_id,a.vehicle_id,j.id
      )
      and exists (
        select 1 from app_private.marketplace_dispatch_candidate_state(
          j.project_id,a.driver_user_id,a.vehicle_id,j.id
        ) c where c.allowed
      )
  );
$function$;
revoke all on function public.marketplace_reminder_recipient_eligible(uuid,uuid,uuid)
  from PUBLIC, anon, authenticated;
grant execute on function public.marketplace_reminder_recipient_eligible(uuid,uuid,uuid)
  to service_role;

revoke all on function app_private.enqueue_marketplace_job_reminders() from PUBLIC, anon, authenticated;

-- Cadencia de examen ~15 s; las notificaciones solo se generan en 60/120/180 s
-- y unicamente cuando la configuracion del proyecto esta habilitada.
select cron.schedule(
  'tuktuk-job-reminders-v1',
  '15 seconds',
  $$select app_private.enqueue_marketplace_job_reminders();$$
);
