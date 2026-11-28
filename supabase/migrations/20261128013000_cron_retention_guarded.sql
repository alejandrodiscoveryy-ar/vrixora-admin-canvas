-- P0 / issue #419: retain seven days of completed technical cron history.
-- Deliberately inactive until an operator verifies recovery of DB and Disk IO.
-- No application data, auth tokens, wallet ledger or cron task definitions are deleted.
CREATE OR REPLACE FUNCTION app_private.prune_cron_history_batch_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
SET lock_timeout TO '250ms'
AS $function$
DECLARE
  cutoff timestamptz := now() - interval '7 days';
  removed integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('tuktuk-cron-history-retention-v1', 0)) THEN
    RETURN jsonb_build_object('status', 'skipped_concurrent', 'deleted', 0);
  END IF;
  -- Read a bounded recent slice through the existing runid primary key.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT status, start_time FROM cron.job_run_details ORDER BY runid DESC LIMIT 200
    ) recent
    WHERE recent.status = 'failed' AND recent.start_time >= now() - interval '10 minutes'
  ) THEN
    RETURN jsonb_build_object('status', 'skipped_recent_cron_failure', 'deleted', 0);
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_stat_activity
      WHERE backend_type='client backend' AND pid<>pg_backend_pid() AND state='active') >= 5
     OR (SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend')
        >= current_setting('max_connections')::integer * 0.7 THEN
    RETURN jsonb_build_object('status', 'skipped_load', 'deleted', 0);
  END IF;

  -- Read at most 1000 oldest rows by primary key, then filter by timestamps.
  -- When no old terminal entries remain, this never scans the entire table.
  WITH oldest AS MATERIALIZED (
    SELECT runid, status, start_time, end_time
    FROM cron.job_run_details ORDER BY runid LIMIT 1000
  )
  DELETE FROM cron.job_run_details d
  USING oldest o
  WHERE d.runid=o.runid
    AND o.status IN ('succeeded','failed')
    AND o.start_time < cutoff AND o.end_time < cutoff
    AND d.status IN ('succeeded','failed')
    AND d.start_time < cutoff AND d.end_time < cutoff;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN jsonb_build_object('status', 'ok', 'deleted', removed);
END;
$function$;

REVOKE ALL ON FUNCTION app_private.prune_cron_history_batch_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.prune_cron_history_batch_v1() TO postgres;

-- Create inactive schedule; activation requires a separate explicit operation
-- after health verification and a measured pilot. No automatic VACUUM FULL.
DO $schedule$
DECLARE maintenance_job bigint;
BEGIN
  maintenance_job := cron.schedule(
    'tuktuk-cron-history-retention-v1',
    '7,17,27,37,47,57 * * * *',
    'SET statement_timeout = ''3s''; SET lock_timeout = ''250ms''; SELECT app_private.prune_cron_history_batch_v1();'
  );
  PERFORM cron.alter_job(maintenance_job, active := false);
END;
$schedule$;
