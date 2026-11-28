begin;
-- Additional operational observations, one sample per existing v2 sample.
-- No new scheduled jobs, external requests, device IDs or private payloads.
create table app_private.system_health_operations_v4 (
 sampled_at timestamptz primary key,
 metrics jsonb not null
);
alter table app_private.system_health_operations_v4 enable row level security;
revoke all on table app_private.system_health_operations_v4 from public,anon,authenticated;

create or replace function app_private.sample_system_health_operations_v4(p_at timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
with project as (select id from public.projects where slug='tuktuk-control'),
queue as (
 select
 count(*) filter(where o.delivery_status='pending' and o.created_at<=p_at-interval '10 minutes' and coalesce(o.next_attempt_at,o.created_at)<=p_at) as due_10m,
 count(*) filter(where o.delivery_status='processing' and o.claimed_at<=p_at-interval '10 minutes') as processing_10m,
 count(*) filter(where o.delivery_status='failed' and o.created_at>=p_at-interval '1 hour') as failed_created_1h,
 count(*) filter(where o.delivery_status='sent' and o.created_at>=p_at-interval '1 hour') as sent_created_1h
 from public.notification_outbox o join project p on p.id=o.project_id
 where (o.delivery_status in ('pending','processing') or (o.delivery_status in ('sent','failed') and o.created_at>=p_at-interval '1 hour'))
), jobs as (
 select count(*) filter(where j.status='published' and (j.expires_at is null or j.expires_at>p_at)) as published,
 count(*) filter(where j.status='published' and (j.expires_at is null or j.expires_at>p_at) and j.published_at<=p_at-interval '2 minutes' and t.last_evaluation_at is null) as published_no_trace_2m,
 count(*) filter(where j.status='incident') as in_incident
 from public.jobs j join project p on p.id=j.project_id
 left join public.marketplace_job_radar_trace t on t.project_id=j.project_id and t.job_id=j.id
 where not j.is_test and j.test_deleted_at is null and j.status in ('published','incident')
), gps as (
 select count(*) as stored,count(*) filter(where l.received_at>=p_at-interval '5 minutes' and l.received_at<=p_at) as recent
 from public.marketplace_driver_locations l join project p on p.id=l.project_id
), topups as (
 select count(*) filter(where t.status='requested') as pending,
 count(*) filter(where t.status='confirmed' and t.confirmed_at>=p_at-interval '24 hours' and w.id is null) as no_ledger_24h
 from public.topups t join project p on p.id=t.project_id
 left join public.wallet_transactions w on w.id=t.ledger_transaction_id and w.project_id=t.project_id and w.user_id=t.user_id
 where t.status in ('requested','confirmed')
), impulsa as (
 select count(*) as pending from app_private.marketplace_impulsa_applications a join project p on p.id=a.project_id where a.status='pending'
)
select case when not exists(select 1 from project) then null else jsonb_build_object(
 'push_due_10m',q.due_10m,'push_processing_10m',q.processing_10m,'push_failed_created_1h',q.failed_created_1h,'push_sent_created_1h',q.sent_created_1h,
 'published_jobs',j.published,'published_no_trace_2m',j.published_no_trace_2m,'jobs_in_incident',j.in_incident,
 'gps_stored',g.stored,'gps_recent_5m',g.recent,
 'topups_pending',t.pending,'topups_no_ledger_24h',t.no_ledger_24h,'impulsa_pending',i.pending
) end from queue q cross join jobs j cross join gps g cross join topups t cross join impulsa i
$$;
revoke all on function app_private.sample_system_health_operations_v4(timestamptz) from public,anon,authenticated;

create or replace function app_private.collect_system_health_operations_v4()
returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb;
begin
 m:=app_private.sample_system_health_operations_v4(new.sampled_at);
 if m is not null then
 insert into app_private.system_health_operations_v4(sampled_at,metrics) values(new.sampled_at,m) on conflict(sampled_at) do nothing;
 delete from app_private.system_health_operations_v4 where sampled_at<new.sampled_at-interval '7 days';
 end if;
 return new;
exception when others then
 raise warning 'Health operations sample failed (SQLSTATE %)',sqlstate;
 return new;
end $$;
revoke all on function app_private.collect_system_health_operations_v4() from public,anon,authenticated;
create trigger system_health_operations_v4 after insert on app_private.system_health_samples_v2
for each row execute function app_private.collect_system_health_operations_v4();

create or replace function public.admin_get_system_health_v4(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; ops jsonb;
begin
 base:=public.admin_get_system_health_v3(target_project_id);
 select metrics||jsonb_build_object('sampled_at',sampled_at) into ops from app_private.system_health_operations_v4 order by sampled_at desc limit 1;
 return base||jsonb_build_object('operations',ops);
end $$;
revoke all on function public.admin_get_system_health_v4(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_system_health_v4(uuid) to authenticated;
insert into app_private.system_health_operations_v4(sampled_at,metrics)
select t,m from (select statement_timestamp() as t)s cross join lateral (select app_private.sample_system_health_operations_v4(s.t) as m)x where m is not null;
commit;
