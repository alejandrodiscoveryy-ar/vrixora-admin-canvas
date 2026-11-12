\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture. Never execute against a linked Supabase project.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY, project_id uuid NOT NULL, details jsonb NOT NULL
);
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY, project_id uuid NOT NULL, service_request_id uuid NOT NULL,
  status text NOT NULL, driver_user_id uuid NOT NULL, created_at timestamptz NOT NULL,
  final_price numeric NOT NULL DEFAULT 1500, currency text NOT NULL DEFAULT 'CUP',
  FOREIGN KEY(service_request_id) REFERENCES public.service_requests(id)
);
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
INSERT INTO public.service_requests VALUES
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','{"ride_payment_method":"cash"}'),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','{"ride_payment_method":"transfer"}'),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','{}'),
  ('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000001','{"ride_payment_method":"transfer"}'),
  ('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000001','{"ride_payment_method":"cash"}');
INSERT INTO public.jobs (id,project_id,service_request_id,status,driver_user_id,created_at) VALUES
  ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','published','00000000-0000-0000-0000-000000000011','2026-01-01 00:00Z'),
  ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102','published','00000000-0000-0000-0000-000000000011','2026-01-02 00:00Z'),
  ('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000103','published','00000000-0000-0000-0000-000000000011','2026-01-03 00:00Z'),
  ('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000104','accepted','00000000-0000-0000-0000-000000000011','2026-01-04 00:00Z'),
  ('00000000-0000-0000-0000-000000000205','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000105','published','00000000-0000-0000-0000-000000000012','2026-01-05 00:00Z');

-- The existing RPCs are represented by exact public return contracts and
-- a small authorization fixture, not a duplicate of production dispatch.

CREATE FUNCTION public.list_my_marketplace_available_jobs(target_vehicle_id text, target_limit integer DEFAULT 50, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_job_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(job_id uuid, service_code text, origin_text text, destination_text text, scheduled_for timestamp with time zone, passenger_count integer, cargo_weight_kg numeric, cargo_volume_m3 numeric, cargo_length_cm numeric, cargo_width_cm numeric, cargo_height_cm numeric, required_body_type text, recommended_price numeric, final_price numeric, currency text, expires_at timestamp with time zone, created_at timestamp with time zone, billing_mode text, commission_rate numeric, commission_amount numeric, available_balance numeric, missing_balance numeric, can_accept boolean, is_test boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fixture$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT j.id, 'passenger'::text, NULL::text, NULL::text, NULL::timestamp with time zone, NULL::integer, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::text, NULL::numeric, j.final_price, j.currency, NULL::timestamp with time zone, j.created_at, NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, true, false
  FROM public.jobs j WHERE j.driver_user_id = auth.uid()
    AND j.status = 'published'
    AND (target_before_created_at IS NULL OR (j.created_at,j.id)<(target_before_created_at,target_before_job_id))
  ORDER BY j.created_at DESC,j.id DESC LIMIT target_limit;
END;
$fixture$;
REVOKE ALL ON FUNCTION public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid) TO authenticated;

CREATE FUNCTION public.list_my_marketplace_jobs(target_scope text, target_limit integer DEFAULT 50, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_job_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(job_id uuid, status text, service_code text, origin_text text, destination_text text, scheduled_for timestamp with time zone, passenger_count integer, cargo_weight_kg numeric, cargo_volume_m3 numeric, cargo_length_cm numeric, cargo_width_cm numeric, cargo_height_cm numeric, required_body_type text, final_price numeric, currency text, vehicle_id text, billing_mode text, commission_amount_snapshot numeric, trial_started_at_snapshot timestamp with time zone, trial_ends_at_snapshot timestamp with time zone, accepted_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, published_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, incident_from_status text, incident_opened_at timestamp with time zone, incident_reason text, incident_resolution text, incident_resolved_at timestamp with time zone, next_driver_action text, origin_lat numeric, origin_lon numeric, destination_lat numeric, destination_lon numeric, distance_km numeric, is_test boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fixture$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT j.id, j.status, 'passenger'::text, NULL::text, NULL::text, NULL::timestamp with time zone, NULL::integer, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::text, j.final_price, j.currency, NULL::text, NULL::text, NULL::numeric, NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::timestamp with time zone, j.created_at, NULL::timestamp with time zone, NULL::text, NULL::timestamp with time zone, NULL::text, NULL::text, NULL::timestamp with time zone, NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, false
  FROM public.jobs j WHERE j.driver_user_id = auth.uid()
    AND j.status <> 'published'
    AND (target_before_created_at IS NULL OR (j.created_at,j.id)<(target_before_created_at,target_before_job_id))
  ORDER BY j.created_at DESC,j.id DESC LIMIT target_limit;
END;
$fixture$;
REVOKE ALL ON FUNCTION public.list_my_marketplace_jobs(text,integer,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_marketplace_jobs(text,integer,timestamptz,uuid) TO authenticated;

\ir ../../docs/drafts/ride_payment_method_20261112.sql

DO $verify$
BEGIN
  IF has_function_privilege('anon','public.list_my_marketplace_available_jobs_with_payment(text,integer,timestamptz,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.list_my_marketplace_jobs_with_payment(text,integer,timestamptz,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anonymous RPC exposure';
  END IF;
  BEGIN
    INSERT INTO public.service_requests VALUES
      ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000001','{"ride_payment_method":"card"}');
    RAISE EXCEPTION 'invalid method accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.service_requests VALUES
      ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000001','{"ride_payment_method":null}');
    RAISE EXCEPTION 'null method accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.service_requests SET details='{"ride_payment_method":"transfer"}'
      WHERE id='00000000-0000-0000-0000-000000000101';
    RAISE EXCEPTION 'payment method changed';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'RIDE_PAYMENT_METHOD_IMMUTABLE' THEN RAISE; END IF;
  END;
  UPDATE public.service_requests SET details=details || '{"note":"allowed"}'
      WHERE id='00000000-0000-0000-0000-000000000101';
END;
$verify$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
DO $verify$
DECLARE old_rows jsonb; new_rows jsonb; methods text[]; assigned_method text;
BEGIN
  SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.job_id DESC)
    INTO old_rows FROM public.list_my_marketplace_available_jobs('vehicle') a;
  SELECT jsonb_agg(to_jsonb(a)-'ride_payment_method' ORDER BY a.created_at DESC,a.job_id DESC),
    array_agg(a.ride_payment_method ORDER BY a.created_at DESC,a.job_id DESC)
    INTO new_rows,methods FROM public.list_my_marketplace_available_jobs_with_payment('vehicle') a;
  IF old_rows IS DISTINCT FROM new_rows OR methods IS DISTINCT FROM ARRAY[NULL,'transfer','cash']::text[] THEN
    RAISE EXCEPTION 'available contract, visibility or ordering changed: %', methods;
  END IF;
  SELECT ride_payment_method INTO assigned_method FROM public.list_my_marketplace_jobs_with_payment('active');
  IF assigned_method IS DISTINCT FROM 'transfer' THEN RAISE EXCEPTION 'assigned payment lost'; END IF;
  IF (SELECT count(*) FROM public.list_my_marketplace_available_jobs_with_payment('vehicle',1)) <> 1 THEN
    RAISE EXCEPTION 'limit not preserved';
  END IF;
  IF (SELECT count(*) FROM public.list_my_marketplace_available_jobs_with_payment('vehicle',50,'2026-01-02 00:00Z','00000000-0000-0000-0000-000000000202')) <> 1 THEN
    RAISE EXCEPTION 'cursor not preserved';
  END IF;
END;
$verify$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.list_my_marketplace_jobs_with_payment('active')) <> 0
     OR (SELECT array_agg(ride_payment_method) FROM public.list_my_marketplace_available_jobs_with_payment('vehicle')) IS DISTINCT FROM ARRAY['cash']::text[] THEN
    RAISE EXCEPTION 'other driver saw unauthorized rows';
  END IF;
END;
$verify$;
SET LOCAL request.jwt.claim.sub = '';
DO $verify$
BEGIN
  BEGIN
    PERFORM public.list_my_marketplace_available_jobs_with_payment('vehicle');
    RAISE EXCEPTION 'missing actor accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$verify$;
RESET ROLE;
ROLLBACK;
SELECT 'RIDE_PAYMENT_CONTRACT_OK' AS result;
