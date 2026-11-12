-- SQL preparado para revisión: NO aplicado a Supabase.
-- La forma de pago de la carrera es distinta del método de recarga del monedero.
-- Las solicitudes anteriores y los clientes antiguos omiten esta clave (NULL).
-- No modifica tarifas, comisiones, reservas ni la máquina de estados.
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_ride_payment_method_valid
  CHECK (
    NOT (details ? 'ride_payment_method')
    OR (
      jsonb_typeof(details->'ride_payment_method') = 'string'
      AND details->>'ride_payment_method' IN ('cash', 'transfer')
    ) IS TRUE
  ) NOT VALID;

ALTER TABLE public.service_requests
  VALIDATE CONSTRAINT service_requests_ride_payment_method_valid;

-- Congelar el acuerdo desde la creación: un reintento conserva el mismo
-- contenido idempotente y una carrera publicada no puede cambiar de método.
CREATE FUNCTION app_private.protect_marketplace_ride_payment_method()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF (OLD.details->'ride_payment_method') IS DISTINCT FROM
     (NEW.details->'ride_payment_method') THEN
    RAISE EXCEPTION 'RIDE_PAYMENT_METHOD_IMMUTABLE' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.protect_marketplace_ride_payment_method() FROM PUBLIC;
CREATE TRIGGER protect_marketplace_ride_payment_method
BEFORE UPDATE OF details ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION app_private.protect_marketplace_ride_payment_method();

-- Las RPC originales autorizan y limitan las ofertas y las carreras asignadas.
-- Estas versiones agregan únicamente la forma de pago de las filas autorizadas.
-- Se preservan las firmas de las RPC originales para APK y WebApp anteriores.

CREATE FUNCTION public.list_my_marketplace_available_jobs_with_payment(target_vehicle_id text, target_limit integer DEFAULT 50, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_job_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(job_id uuid, service_code text, origin_text text, destination_text text, scheduled_for timestamp with time zone, passenger_count integer, cargo_weight_kg numeric, cargo_volume_m3 numeric, cargo_length_cm numeric, cargo_width_cm numeric, cargo_height_cm numeric, required_body_type text, recommended_price numeric, final_price numeric, currency text, expires_at timestamp with time zone, created_at timestamp with time zone, billing_mode text, commission_rate numeric, commission_amount numeric, available_balance numeric, missing_balance numeric, can_accept boolean, is_test boolean, ride_payment_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.*,
    CASE WHEN r.details->>'ride_payment_method' IN ('cash', 'transfer')
      THEN r.details->>'ride_payment_method' ELSE NULL::text END
  FROM public.list_my_marketplace_available_jobs(
    target_vehicle_id, target_limit, target_before_created_at, target_before_job_id
  ) a
  LEFT JOIN public.jobs j ON j.id = a.job_id
  LEFT JOIN public.service_requests r
    ON r.id = j.service_request_id AND r.project_id = j.project_id
  ORDER BY a.created_at DESC, a.job_id DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_my_marketplace_available_jobs_with_payment(text,integer,timestamptz,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_marketplace_available_jobs_with_payment(text,integer,timestamptz,uuid) TO authenticated;

CREATE FUNCTION public.list_my_marketplace_jobs_with_payment(target_scope text, target_limit integer DEFAULT 50, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_job_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(job_id uuid, status text, service_code text, origin_text text, destination_text text, scheduled_for timestamp with time zone, passenger_count integer, cargo_weight_kg numeric, cargo_volume_m3 numeric, cargo_length_cm numeric, cargo_width_cm numeric, cargo_height_cm numeric, required_body_type text, final_price numeric, currency text, vehicle_id text, billing_mode text, commission_amount_snapshot numeric, trial_started_at_snapshot timestamp with time zone, trial_ends_at_snapshot timestamp with time zone, accepted_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, published_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, incident_from_status text, incident_opened_at timestamp with time zone, incident_reason text, incident_resolution text, incident_resolved_at timestamp with time zone, next_driver_action text, origin_lat numeric, origin_lon numeric, destination_lat numeric, destination_lon numeric, distance_km numeric, is_test boolean, ride_payment_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.*,
    CASE WHEN r.details->>'ride_payment_method' IN ('cash', 'transfer')
      THEN r.details->>'ride_payment_method' ELSE NULL::text END
  FROM public.list_my_marketplace_jobs(
    target_scope, target_limit, target_before_created_at, target_before_job_id
  ) a
  LEFT JOIN public.jobs j ON j.id = a.job_id
  LEFT JOIN public.service_requests r
    ON r.id = j.service_request_id AND r.project_id = j.project_id
  ORDER BY a.created_at DESC, a.job_id DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_my_marketplace_jobs_with_payment(text,integer,timestamptz,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_marketplace_jobs_with_payment(text,integer,timestamptz,uuid) TO authenticated;
