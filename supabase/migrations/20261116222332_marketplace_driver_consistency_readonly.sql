-- TukTuk / Vrixora Admin: consistencia de jornada para la agenda del Mapa.
-- Solo lectura de auditoria EXISTENTE. Sin tablas, triggers, cron, FCM ni cobros.
-- IMPORTANTE: "horas" = tiempo estimado de jornada declarada, NO GPS continuo
-- ni horas libres de servicio. Cada tramo se limita a un máximo de 12 horas.
-- El tramo todavía abierto solo cuenta si el conductor realmente sigue en
-- Trabajando, disponible y con posición GPS actualizada hace <= 5 minutos.
CREATE OR REPLACE FUNCTION public.admin_get_marketplace_driver_consistency(
  target_project_id uuid,
  target_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  PERFORM app_private.require_project_permission(target_project_id, 'marketplace.view');
  IF target_days NOT IN (7, 30) THEN
    RAISE EXCEPTION 'CONSISTENCY_PERIOD_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  WITH params AS (
    SELECT now() AS current_at,
           now() - make_interval(days => target_days) AS period_start
  ),
  ordered_events AS (
    SELECT
      a.actor_id AS driver_user_id,
      a.created_at,
      a.id,
      (a.metadata->>'accepting_jobs')::boolean AS accepting,
      lag((a.metadata->>'accepting_jobs')::boolean)
        OVER (PARTITION BY a.actor_id ORDER BY a.created_at, a.id) AS previous_state
    FROM public.audit_events a
    CROSS JOIN params p
    WHERE a.project_id = target_project_id
      AND a.actor_id IS NOT NULL
      AND a.action = 'marketplace_accepting_jobs_changed'
      AND a.entity_type = 'driver_vehicle_assignments'
      AND a.metadata->>'accepting_jobs' IN ('true','false')
      -- A prior session can overlap the start of the period, with a
      -- 12-hour cap: 2 additional days safely cover that carry-over.
      AND a.created_at >= p.period_start - interval '2 days'
      AND a.created_at <= p.current_at
  ),
  transitions AS (
    -- Do not count repeated "Trabajando" events as multiple new sessions.
    SELECT driver_user_id, created_at, id, accepting
    FROM ordered_events
    WHERE previous_state IS DISTINCT FROM accepting
  ),
  intervals AS (
    SELECT driver_user_id, created_at AS started_at, accepting,
           lead(created_at) OVER (
             PARTITION BY driver_user_id ORDER BY created_at, id
           ) AS ended_at
    FROM transitions
  ),
  current_fresh AS (
    SELECT a.driver_user_id,
           bool_or(
             a.is_active AND a.accepting_jobs AND a.is_available
             AND l.captured_at >= now() - interval '5 minutes'
             AND l.captured_at <= now() + interval '1 minute'
           ) AS has_fresh_available_gps
    FROM public.driver_vehicle_assignments a
    LEFT JOIN public.marketplace_driver_locations l
      ON l.project_id = a.project_id
     AND l.driver_user_id = a.driver_user_id
     AND l.vehicle_id = a.vehicle_id
    WHERE a.project_id = target_project_id
    GROUP BY a.driver_user_id
  ),
  measured AS (
    SELECT
      t.driver_user_id, t.started_at, t.ended_at,
      t.accepting,
      CASE
        WHEN NOT t.accepting THEN 0::numeric
        WHEN t.ended_at IS NULL
          AND NOT coalesce(f.has_fresh_available_gps,false) THEN 0::numeric
        WHEN t.ended_at IS NOT NULL AND t.ended_at <= t.started_at
          THEN 0::numeric
        ELSE greatest(0::numeric,
          extract(epoch FROM (
            least(
              coalesce(t.ended_at, p.current_at),
              t.started_at + interval '12 hours',
              p.current_at
            ) - greatest(t.started_at, p.period_start)
          ))::numeric
        )
      END AS counted_seconds
    FROM intervals t
    CROSS JOIN params p
    LEFT JOIN current_fresh f ON f.driver_user_id = t.driver_user_id
  ),
  summary AS (
    SELECT
      m.driver_user_id,
      count(DISTINCT (m.started_at AT TIME ZONE 'America/Havana')::date)
        FILTER (WHERE m.accepting AND m.started_at >= p.period_start) AS active_days,
      count(*) FILTER (
        WHERE m.accepting AND m.ended_at IS NOT NULL
          AND m.started_at >= p.period_start
      ) AS completed_sessions,
      round((coalesce(sum(m.counted_seconds),0) / 3600)::numeric,1) AS estimated_hours,
      max(m.started_at) FILTER (WHERE m.accepting) AS last_started_at
    FROM measured m
    CROSS JOIN params p
    GROUP BY m.driver_user_id
  ),
  leaders AS (
    SELECT
      d.user_id AS driver_user_id,
      coalesce(nullif(btrim(pr.display_name),''),'Conductor') AS driver_name,
      coalesce(s.active_days,0) AS active_days,
      coalesce(s.completed_sessions,0) AS completed_sessions,
      coalesce(s.estimated_hours,0) AS estimated_hours,
      s.last_started_at,
      v.category_code AS vehicle_category_code,
      v.name AS vehicle_name
    FROM summary s
    JOIN public.driver_profiles d
      ON d.project_id = target_project_id
     AND d.user_id = s.driver_user_id
     AND d.status = 'active'
     AND d.activated_at IS NOT NULL
     AND d.suspended_at IS NULL
    LEFT JOIN public.profiles pr ON pr.id = d.user_id
    LEFT JOIN LATERAL (
      SELECT ve.category_code,ve.name
      FROM public.driver_vehicle_assignments a
      JOIN public.vehicles ve
        ON ve.project_id=a.project_id AND ve.id=a.vehicle_id
      WHERE a.project_id=target_project_id AND a.driver_user_id=d.user_id
      ORDER BY a.is_active DESC,a.updated_at DESC,a.vehicle_id
      LIMIT 1
    ) v ON true
    WHERE s.active_days > 0 OR s.estimated_hours > 0
    ORDER BY s.active_days DESC, s.estimated_hours DESC, driver_name, d.user_id
    LIMIT 100
  )
  SELECT jsonb_build_object(
      'period_days',target_days,
      'server_time',now(),
      'source','audit_events.marketplace_accepting_jobs_changed',
      'is_estimate',true,
      'items',coalesce(jsonb_agg(
        jsonb_build_object(
          'driver_user_id',l.driver_user_id,
          'driver_name',l.driver_name,
          'active_days',l.active_days,
          'completed_sessions',l.completed_sessions,
          'estimated_hours',l.estimated_hours,
          'last_started_at',l.last_started_at,
          'vehicle_category_code',l.vehicle_category_code,
          'vehicle_name',l.vehicle_name
        ) ORDER BY l.active_days DESC,l.estimated_hours DESC,l.driver_name
      ),'[]'::jsonb)
    ) INTO result
  FROM leaders l;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_marketplace_driver_consistency(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_marketplace_driver_consistency(uuid, integer)
  TO authenticated;
