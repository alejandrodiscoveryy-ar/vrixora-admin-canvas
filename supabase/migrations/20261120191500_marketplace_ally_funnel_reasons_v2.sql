-- Aliados: guardar motivos y tramos de precio; exponer embudo agregado.
-- Contrato aditivo: conserva RPC v1, RLS, atribuciones y toda la lógica financiera.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table app_private.marketplace_ally_events
  add column if not exists reason text,
  add column if not exists price_band text;

alter table app_private.marketplace_ally_events
  add constraint marketplace_ally_event_reason_v2_check
    check (reason is null or
      (event_type='survey_answer' and reason in
        ('price','comparing','no_driver','difficult','later','other'))),
  add constraint marketplace_ally_event_price_band_v2_check
    check (price_band is null or
      (event_type='quote_ready' and price_band in
        ('under_500','500_1500','1500_3000','3000_5000','over_5000')));

-- Sólo service_role puede invocar la función; el gateway público ya verifica
-- origen, límite de consultas y UUID antes de llamarla.
create or replace function public.record_public_marketplace_ally_event_v2(
  target_event text,target_session_id uuid,target_slug text,
  target_channel text default 'unknown',
  target_reason text default null,
  target_price_cup numeric default null
) returns boolean language plpgsql security definer set search_path to '' as $$
declare partner record; band text;
begin
  if target_event not in ('link_open','app_open','origin_selected','destination_selected',
      'quote_ready','request_started','request_created','survey_answer')
    or target_session_id is null
    or target_slug is null or target_slug !~ '^[a-z0-9][a-z0-9-]{1,23}$'
    or right(target_slug,1)='-'
    or target_channel not in ('unknown','direct','whatsapp_private','whatsapp_groups',
      'whatsapp_status','facebook','instagram','qr','other')
    or (target_event='survey_answer' and target_reason is null)
    or (target_reason is not null and
      (target_event<>'survey_answer' or
       target_reason not in ('price','comparing','no_driver','difficult','later','other')))
    or (target_price_cup is not null and
      (target_event<>'quote_ready' or target_price_cup<0 or target_price_cup>1000000))
  then return false; end if;

  select id,project_id into partner from app_private.marketplace_allies
    where slug=target_slug and status='active'
      and project_id=(select id from public.projects where slug='tuktuk-control');
  if not found then return false; end if;

  if target_price_cup is not null then
    band := case
      when target_price_cup<500 then 'under_500'
      when target_price_cup<1500 then '500_1500'
      when target_price_cup<3000 then '1500_3000'
      when target_price_cup<5000 then '3000_5000'
      else 'over_5000' end;
  end if;
  insert into app_private.marketplace_ally_events
    (project_id,ally_id,event_type,session_id,channel,reason,price_band)
  values(partner.project_id,partner.id,target_event,target_session_id,
    target_channel,target_reason,band)
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.record_public_marketplace_ally_event_v2(text,uuid,text,text,text,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.record_public_marketplace_ally_event_v2(text,uuid,text,text,text,numeric)
  to service_role;

-- Ampliar el reporte Admin sin cambiar claves existentes ni mezclar eventos
-- con viajes reales; los motivos son sólo categorías agregadas.
create or replace function public.admin_list_marketplace_allies_v1(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare response jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
    into response from (
    select a.id,a.name,a.slug,a.rate,a.status,a.created_at,a.report_expires_at,
      (select count(*) from app_private.marketplace_ally_events e where e.ally_id=a.id and e.event_type='link_open') as clicks,
      (select count(*) from app_private.marketplace_ally_events e where e.ally_id=a.id and e.event_type='app_open') as app_opens,
      (select count(*) from app_private.marketplace_ally_events e where e.ally_id=a.id and e.event_type='origin_selected') as origins,
      (select count(*) from app_private.marketplace_ally_events e where e.ally_id=a.id and e.event_type='destination_selected') as destinations,
      (select count(*) from app_private.marketplace_ally_events e where e.ally_id=a.id and e.event_type='quote_ready') as quotes,
      (select count(*) from app_private.marketplace_ally_events e where e.ally_id=a.id and e.event_type='request_created') as requests,
      (select coalesce(jsonb_agg(to_jsonb(s) order by s.total desc),'[]'::jsonb)
       from (select e.reason,count(*) as total from app_private.marketplace_ally_events e
             where e.ally_id=a.id and e.event_type='survey_answer'
               and e.reason is not null group by e.reason) s) as reasons,
      (select coalesce(jsonb_agg(to_jsonb(s) order by s.price_band),'[]'::jsonb)
       from (select e.price_band,count(*) as total from app_private.marketplace_ally_events e
             where e.ally_id=a.id and e.event_type='quote_ready'
               and e.price_band is not null group by e.price_band) s) as price_segments,
      (select count(*) from app_private.marketplace_ally_attributions x where x.ally_id=a.id) as attributed,
      (select count(*) from app_private.marketplace_ally_attributions x join public.jobs j on j.id=x.job_id
       where x.ally_id=a.id and j.status='settled' and not coalesce(j.is_test,false) and j.test_deleted_at is null
         and not exists(select 1 from app_private.marketplace_driver_promo_attribution d where d.job_id=j.id)) as completed,
      app_private.marketplace_ally_earned_v1(a.id) as earned,
      (select coalesce(sum(amount),0) from app_private.marketplace_ally_payments p where p.ally_id=a.id) as paid
    from app_private.marketplace_allies a
    where a.project_id=target_project_id
  ) t;
  return response;
end $$;
revoke all on function public.admin_list_marketplace_allies_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_marketplace_allies_v1(uuid) to authenticated;

commit;
