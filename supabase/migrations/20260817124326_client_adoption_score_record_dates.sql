-- Client adoption score
-- Measures observable adoption from data already synchronized by TukTuk Control.
-- It does not measure app opens, sessions or screen time.

create or replace function public.admin_get_client_adoption(
  target_project_id uuid,
  target_client_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  active_days_30 integer := 0;
  records_30 integer := 0;
  entity_types_30 integer := 0;
  active_weeks_30 integer := 0;

  last_activity_at timestamptz;
  days_since_activity integer;

  frequency_score integer := 0;
  recency_score integer := 0;
  consistency_score integer := 0;
  depth_score integer := 0;
  adoption_score integer := 0;

  adoption_level text := 'Sin actividad';
  usage_profile text := 'Sin actividad';

  has_daily_records boolean := false;
  has_financial_data boolean := false;
  has_operational_data boolean := false;
  has_settings boolean := false;
  has_vehicle boolean := false;
  has_maintenance boolean := false;
begin
  perform app_private.require_project_permission(
    target_project_id,
    'customers.view'
  );

  -- Ensure that the requested client belongs to the requested project.
  if not exists (
    select 1
    from public.licenses license
    where license.project_id = target_project_id
      and license.user_id = target_client_id

    union all

    select 1
    from public.payments payment
    where payment.project_id = target_project_id
      and payment.user_id = target_client_id

    union all

    select 1
    from public.commercial_leads lead
    where lead.project_id = target_project_id
      and lead.user_id = target_client_id
      and lead.archived_at is null
  ) then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    max(entity.updated_at) filter (
      where entity.deleted_at is null
        and entity.entity_type = 'dailyRecord'
    ),

    count(
      distinct (entity.payload ->> 'date')::date
    ) filter (
      where entity.deleted_at is null
        and entity.entity_type = 'dailyRecord'
        and (entity.payload ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$'
        and (entity.payload ->> 'date')::date >= current_date - 29
        and (entity.payload ->> 'date')::date <= current_date
    ),

    count(*) filter (
      where entity.deleted_at is null
        and entity.entity_type = 'dailyRecord'
        and (entity.payload ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$'
        and (entity.payload ->> 'date')::date >= current_date - 29
        and (entity.payload ->> 'date')::date <= current_date
    ),

    count(distinct entity.entity_type) filter (
      where entity.deleted_at is null
        and entity.updated_at >= now() - interval '30 days'
    ),

    count(
      distinct date_trunc(
        'week',
        (entity.payload ->> 'date')::date
      )
    ) filter (
      where entity.deleted_at is null
        and entity.entity_type = 'dailyRecord'
        and (entity.payload ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$'
        and (entity.payload ->> 'date')::date >= current_date - 29
        and (entity.payload ->> 'date')::date <= current_date
    ),

    bool_or(
      entity.deleted_at is null
      and entity.entity_type = 'dailyRecord'
    ),

    bool_or(
      entity.deleted_at is null
      and entity.entity_type = 'dailyRecord'
      and (
        coalesce(nullif(entity.payload ->> 'earnings', ''), '0') <> '0'
        or coalesce(nullif(entity.payload ->> 'expense', ''), '0') <> '0'
      )
    ),

    bool_or(
      entity.deleted_at is null
      and entity.entity_type = 'dailyRecord'
      and (
        coalesce(nullif(entity.payload ->> 'odometer', ''), '0') <> '0'
        or coalesce(nullif(entity.payload ->> 'batteryVoltage', ''), '0') <> '0'
      )
    ),

    bool_or(
      entity.deleted_at is null
      and entity.entity_type = 'settings'
    ),

    bool_or(
      entity.deleted_at is null
      and entity.entity_type = 'vehicle'
    ),

    bool_or(
      entity.deleted_at is null
      and entity.entity_type = 'maintenance'
    )
  into
    last_activity_at,
    active_days_30,
    records_30,
    entity_types_30,
    active_weeks_30,
    has_daily_records,
    has_financial_data,
    has_operational_data,
    has_settings,
    has_vehicle,
    has_maintenance
  from public.sync_entities entity
  where entity.user_id = target_client_id;

  active_days_30 := coalesce(active_days_30, 0);
  records_30 := coalesce(records_30, 0);
  entity_types_30 := coalesce(entity_types_30, 0);
  active_weeks_30 := coalesce(active_weeks_30, 0);

  has_daily_records := coalesce(has_daily_records, false);
  has_financial_data := coalesce(has_financial_data, false);
  has_operational_data := coalesce(has_operational_data, false);
  has_settings := coalesce(has_settings, false);
  has_vehicle := coalesce(has_vehicle, false);
  has_maintenance := coalesce(has_maintenance, false);

  if last_activity_at is not null then
    days_since_activity :=
      greatest(
        0,
        floor(
          extract(
            epoch from (now() - last_activity_at)
          ) / 86400
        )
      )::integer;
  end if;

  /*
   * The adoption score represents ongoing observable use.
   * Configuration alone does not generate adoption points.
   */
  if records_30 > 0 then

    -- Frequency: maximum 40 points.
    frequency_score :=
      least(
        40,
        round(
          (
            least(active_days_30, 20)::numeric / 20
          ) * 40
        )
      )::integer;

    -- Recency: maximum 25 points.
    recency_score :=
      case
        when days_since_activity <= 1 then 25
        when days_since_activity <= 3 then 22
        when days_since_activity <= 7 then 18
        when days_since_activity <= 14 then 12
        when days_since_activity <= 21 then 6
        when days_since_activity <= 30 then 3
        else 0
      end;

    -- Consistency: maximum 20 points.
    consistency_score :=
      case
        when active_weeks_30 >= 4 then 20
        when active_weeks_30 = 3 then 15
        when active_weeks_30 = 2 then 10
        when active_weeks_30 = 1 then 5
        else 0
      end;

    -- Depth: maximum 15 points.
    -- Monetary amounts never increase the score.
    depth_score :=
      least(
        15,
        (case when has_financial_data then 5 else 0 end) +
        (case when has_operational_data then 5 else 0 end) +
        (case when has_maintenance then 3 else 0 end) +
        (case when has_vehicle or has_settings then 2 else 0 end)
      );

    adoption_score :=
      least(
        100,
        frequency_score +
        recency_score +
        consistency_score +
        depth_score
      );

  else
    frequency_score := 0;
    recency_score := 0;
    consistency_score := 0;
    depth_score := 0;
    adoption_score := 0;
  end if;

  adoption_level :=
    case
      when adoption_score >= 70 then 'Alta'
      when adoption_score >= 40 then 'Media'
      when adoption_score >= 1 then 'Baja'
      else 'Sin actividad'
    end;

  usage_profile :=
    case
      when
        has_financial_data
        and has_operational_data
        and (
          has_maintenance
          or (has_vehicle and has_settings)
        )
      then 'Completo'

      when has_financial_data
        and not has_operational_data
      then 'Finanzas'

      when has_operational_data
        and not has_financial_data
      then 'Operación'

      when has_daily_records
      then 'Básico'

      when has_vehicle or has_settings
      then 'Solo configuración'

      else 'Sin actividad'
    end;

  return jsonb_build_object(
    'score', adoption_score,
    'level', adoption_level,
    'usage_profile', usage_profile,
    'last_activity_at', last_activity_at,
    'days_since_activity', days_since_activity,
    'active_days_30', active_days_30,
    'records_30', records_30,
    'active_weeks_30', active_weeks_30,
    'entity_types_30', entity_types_30,
    'breakdown', jsonb_build_object(
      'frequency', frequency_score,
      'recency', recency_score,
      'consistency', consistency_score,
      'depth', depth_score
    )
  );
end;
$$;

revoke all
on function public.admin_get_client_adoption(uuid, uuid)
from public, anon;

grant execute
on function public.admin_get_client_adoption(uuid, uuid)
to authenticated;