begin;
-- Health events use the existing outbox and five-minute dispatcher. No new cron.
create or replace function public.system_health_push_recipient_v1(target_project_id uuid,target_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
select exists(
 select 1 from public.projects p where p.id=target_project_id and p.slug='tuktuk-control'
 and (p.owner_id=target_user_id or exists(
 select 1 from public.project_members m join public.project_role_permissions rp on rp.role_code=m.role
 where m.project_id=p.id and m.user_id=target_user_id and rp.permission_code='settings.manage'))
)
$$;
revoke all on function public.system_health_push_recipient_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.system_health_push_recipient_v1(uuid,uuid) to service_role;
create or replace function app_private.enqueue_system_health_push_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare stage text; subject text; pid uuid;
begin
 if tg_op='INSERT' then
  if new.resolved_at is not null then return new; end if;
  stage:='opened';
 elsif old.resolved_at is null and new.resolved_at is not null then
  stage:='recovered';
 elsif old.resolved_at is null and new.resolved_at is null and old.severity='warning' and new.severity='critical' then
  stage:='escalated';
 else return new;
 end if;
 select id into pid from public.projects where slug='tuktuk-control';
 if pid is null then return new; end if;
 subject:=case when stage='recovered' then 'TukTuk · incidencia recuperada' when new.severity='critical' then 'TukTuk · alerta crítica' else 'TukTuk · alerta preventiva' end;
 insert into public.notification_outbox(project_id,user_id,kind,notification_date,dedupe_key,title,body,data)
 select pid,t.user_id,'admin_system_health',current_date,
 'health:'||new.id||':'||stage,subject,
 left(case when stage='recovered' then 'Indicador recuperado. ' else '' end||new.detail,300),
 jsonb_build_object('kind','admin_system_health','target_audience','admin','target_platform','web','project_id',pid::text,'stage',stage,'incident_id',new.id::text,'url','/admin/proyectos/'||pid::text||'/salud')
 from (select distinct user_id from public.push_device_tokens where project_id=pid and app_scope='admin' and platform='web' and enabled) t
 where public.system_health_push_recipient_v1(pid,t.user_id)
 on conflict(project_id,user_id,kind,dedupe_key) do nothing;
 return new;
exception when others then
 -- Never interrupt health sampling because a notification could not be queued.
 raise warning 'Health notification enqueue failed (SQLSTATE %)',sqlstate;
 return new;
end $$;
revoke all on function app_private.enqueue_system_health_push_v1() from public,anon,authenticated;
create trigger system_health_incident_push_v1 after insert or update of severity,resolved_at on app_private.system_health_incidents_v2
for each row execute function app_private.enqueue_system_health_push_v1();
commit;
