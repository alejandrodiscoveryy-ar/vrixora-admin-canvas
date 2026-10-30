-- TukTuk Lite: operational contact/hours, using the existing project support number.
-- Existing projects keep their behavior: schedule disabled by default.
alter table public.project_whatsapp_settings
  add column lite_enabled boolean not null default false,
  add column lite_hours_enabled boolean not null default false,
  add column lite_hours_days smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
  add column lite_hours_open time without time zone not null default time '08:00',
  add column lite_hours_close time without time zone not null default time '20:00';

-- Match the prior operational availability at migration time.
update public.project_whatsapp_settings as s
set lite_enabled=s.support_enabled
from public.projects as p
where p.id=s.project_id
  and p.slug='tuktuk-control';

alter table public.project_whatsapp_settings
  add constraint lite_hours_days_valid check (
    cardinality(lite_hours_days) between 1 and 7
    and lite_hours_days <@ array[1,2,3,4,5,6,7]::smallint[]
    and array_position(lite_hours_days, null) is null
  ),
  add constraint lite_hours_range_valid check (lite_hours_open < lite_hours_close);

-- Existing permission is owner-only and is checked on EVERY read/write.
create or replace function public.admin_get_marketplace_lite_contact(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'whatsapp_settings.manage');
  select jsonb_build_object(
    'project_id',p.id,
    'support_number',coalesce(s.support_number,p.whatsapp,''),
    'lite_enabled',s.lite_enabled,
    'hours_enabled',s.lite_hours_enabled,
    'days',to_jsonb(s.lite_hours_days),
    'open_time',to_char(s.lite_hours_open,'HH24:MI'),
    'close_time',to_char(s.lite_hours_close,'HH24:MI'),
    'timezone','America/Havana',
    'version',s.version,
    'updated_at',s.updated_at
  ) into result
  from public.projects p
  join public.project_whatsapp_settings s on s.project_id=p.id
  where p.id=target_project_id;
  if result is null then
    raise exception 'LITE_CONTACT_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;
  return result;
end $$;

create or replace function public.admin_update_marketplace_lite_contact(
  target_project_id uuid,
  target_support_number text,
  target_lite_enabled boolean,
  target_hours_enabled boolean,
  target_days smallint[],
  target_open_time text,
  target_close_time text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  actor uuid;
  clean_number text := nullif(btrim(target_support_number),'');
  clean_days smallint[];
  open_hour time without time zone;
  close_hour time without time zone;
begin
  actor := app_private.require_project_permission(target_project_id,'whatsapp_settings.manage');
  if clean_number is not null and clean_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_LITE_SUPPORT_NUMBER' using errcode='22023';
  end if;
  if coalesce(target_lite_enabled,false) and clean_number is null then
    raise exception 'LITE_SUPPORT_NUMBER_REQUIRED' using errcode='22023';
  end if;
  if target_open_time is null or target_open_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or target_close_time is null or target_close_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'INVALID_LITE_SUPPORT_TIME' using errcode='22023';
  end if;
  open_hour := target_open_time::time;
  close_hour := target_close_time::time;
  if open_hour >= close_hour then
    raise exception 'INVALID_LITE_SUPPORT_TIME_RANGE' using errcode='22023';
  end if;
  select array_agg(distinct d order by d) into clean_days
  from unnest(target_days) d where d between 1 and 7;
  if target_days is null or cardinality(target_days) != cardinality(clean_days)
     or clean_days is null or cardinality(clean_days) = 0 then
    raise exception 'INVALID_LITE_SUPPORT_DAYS' using errcode='22023';
  end if;
  update public.project_whatsapp_settings
     set support_number=clean_number,
         lite_enabled=coalesce(target_lite_enabled,false),
         lite_hours_enabled=coalesce(target_hours_enabled,false),
         lite_hours_days=clean_days,
         lite_hours_open=open_hour,
         lite_hours_close=close_hour,
         version=version+1,
         updated_at=now(),
         updated_by=actor
   where project_id=target_project_id;
  if not found then
    raise exception 'LITE_CONTACT_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;
  return public.admin_get_marketplace_lite_contact(target_project_id);
end $$;

-- Preserve payment projection and existing RPC signature. Availability of the
-- Lite-only schedule is calculated server-side at each read, not by the browser.
create or replace function public.get_public_whatsapp_settings(target_project_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
select jsonb_build_object(
  'project_id',p.id,'application',p.name,
  'support',jsonb_build_object(
    'enabled', s.support_enabled and coalesce(s.support_number,p.whatsapp) is not null,
    'lite_enabled',s.lite_enabled and coalesce(s.support_number,p.whatsapp) is not null,
    -- 'lite_open' is ONLY for the lightweight passenger channel; other clients
    -- retain the established support.enabled behavior.
    'lite_open', (not s.lite_hours_enabled or (
        extract(isodow from (now() at time zone 'America/Havana'))::smallint = any(s.lite_hours_days)
        and (now() at time zone 'America/Havana')::time >= s.lite_hours_open
        and (now() at time zone 'America/Havana')::time < s.lite_hours_close
      )),
    'number',coalesce(s.support_number,p.whatsapp),
    'button_text',s.support_button_text,'template',s.support_template,
    'hours',jsonb_build_object('enabled',s.lite_hours_enabled,
      'days',to_jsonb(s.lite_hours_days),'open',to_char(s.lite_hours_open,'HH24:MI'),
      'close',to_char(s.lite_hours_close,'HH24:MI'),'timezone','America/Havana')
  ),
  'payment',jsonb_build_object(
    'enabled',s.payment_enabled and coalesce(s.payment_number,p.whatsapp) is not null,
    'number',coalesce(s.payment_number,p.whatsapp),
    'button_text',s.payment_button_text,'template',s.payment_template,
    'allowed_variables',jsonb_build_array('nombre','correo','licencia','aplicacion','plan_actual',
      'plan_solicitado','fecha_vencimiento','tipo_solicitud')
  ),
  'version',s.version,'updated_at',s.updated_at
)
from public.projects p join public.project_whatsapp_settings s on s.project_id=p.id
where p.id=target_project_id and p.status='active';
$$;

revoke all on function public.admin_get_marketplace_lite_contact(uuid) from public,anon,authenticated;
revoke all on function public.admin_update_marketplace_lite_contact(uuid,text,boolean,boolean,smallint[],text,text) from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_lite_contact(uuid) to authenticated;
grant execute on function public.admin_update_marketplace_lite_contact(uuid,text,boolean,boolean,smallint[],text,text) to authenticated;
-- Public getter privileges intentionally preserved from the existing function.
