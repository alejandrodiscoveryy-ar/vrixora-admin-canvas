-- Agency TukTuk: a driver who has continuously enabled Trabajando for more
-- than 12 hours must move to Descansando unless a service still needs closing.
--
-- Keep the existing 24-hour no-contact expiration in the very same scheduled
-- function. Only a verified working_since triggers the new duration cap:
-- legacy shifts without a reliable start stay covered by inactivity expiry,
-- never by a speculative date derived from a later profile edit.
--
-- No jobs, wallet entries, location history, or presence timestamps are deleted.
CREATE OR REPLACE FUNCTION app_private.expire_marketplace_driver_shifts_v2()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  candidate record;
  closed integer := 0;
  inactivity_threshold timestamptz;
  shift_threshold timestamptz := now() - interval '12 hours';
BEGIN
  SELECT now() - make_interval(hours => inactivity_hours)
    INTO inactivity_threshold
  FROM app_private.marketplace_presence_policy_v2
  WHERE singleton AND auto_expire_enabled;

  IF inactivity_threshold IS NULL THEN
    RETURN 0;
  END IF;

  FOR candidate IN
    SELECT a.project_id, a.driver_user_id, a.vehicle_id
    FROM public.driver_vehicle_assignments a
    JOIN public.projects p ON p.id = a.project_id AND p.slug = 'tuktuk-control'
    LEFT JOIN app_private.marketplace_driver_presence_v2 s
      ON s.project_id = a.project_id AND s.driver_user_id = a.driver_user_id
         AND s.vehicle_id = a.vehicle_id
    LEFT JOIN public.marketplace_driver_locations l
      ON l.project_id = a.project_id AND l.driver_user_id = a.driver_user_id
         AND l.vehicle_id = a.vehicle_id
    WHERE a.is_active AND a.accepting_jobs
      AND (
        (a.working_since IS NOT NULL AND a.working_since < shift_threshold)
        OR greatest(a.updated_at, s.last_contact_at, l.received_at) < inactivity_threshold
      )
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    -- Reevaluate eligibility under the assignment lock. Heartbeats and fresh
    -- GPS do not restart a continuous shift or bypass its 12-hour limit.
    UPDATE public.driver_vehicle_assignments a
       SET accepting_jobs = false,
           is_available = false,
           updated_at = now()
     WHERE a.project_id = candidate.project_id
       AND a.driver_user_id = candidate.driver_user_id
       AND a.vehicle_id = candidate.vehicle_id
       AND a.is_active AND a.accepting_jobs
       AND (
         (a.working_since IS NOT NULL AND a.working_since < shift_threshold)
         OR greatest(
             a.updated_at,
             (SELECT s.last_contact_at
                FROM app_private.marketplace_driver_presence_v2 s
               WHERE s.project_id = a.project_id
                 AND s.driver_user_id = a.driver_user_id
                 AND s.vehicle_id = a.vehicle_id),
             (SELECT l.received_at
                FROM public.marketplace_driver_locations l
               WHERE l.project_id = a.project_id
                 AND l.driver_user_id = a.driver_user_id
                 AND l.vehicle_id = a.vehicle_id)
           ) < inactivity_threshold
       )
       -- Do not interrupt accepted/ongoing rides, unresolved incidents or
       -- completed jobs pending closure/rating (existing protection).
       AND NOT EXISTS (
         SELECT 1
         FROM public.jobs j
         LEFT JOIN public.marketplace_incident_resolutions r
           ON r.project_id = j.project_id AND r.job_id = j.id
         WHERE j.project_id = a.project_id
           AND j.assigned_driver_user_id = a.driver_user_id
           AND j.test_deleted_at IS NULL
           AND (
             j.status IN ('accepted', 'en_route', 'pickup', 'in_progress', 'completed')
             OR (j.status = 'incident' AND r.id IS NULL)
           )
       );

    IF FOUND THEN
      closed := closed + 1;
    END IF;
  END LOOP;

  RETURN closed;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.expire_marketplace_driver_shifts_v2()
  FROM PUBLIC, anon, authenticated, service_role;

-- The already-enabled cron 'tuktuk-expire-inactive-shifts-v2' calls this
-- function every 15 minutes. Do not register a second background job.
