-- Consulta de verificacion de solo lectura. Exige nuevas olas en push,
-- pero nunca permite aceptar una carrera usando posicion antigua.
do $wake_verify$
declare
  strict_policy text;
  wake_policy text;
  queue_definition text;
  acceptance_definition text;
  list_definition text;
begin
  strict_policy := pg_get_functiondef('app_private.marketplace_dispatch_candidate_state(uuid,uuid,text,uuid)'::regprocedure);
  wake_policy := pg_get_functiondef('app_private.marketplace_dispatch_notification_candidate_state(uuid,uuid,text,uuid)'::regprocedure);
  queue_definition := pg_get_functiondef('app_private.enqueue_marketplace_job_offer_wave(uuid)'::regprocedure);
  acceptance_definition := pg_get_functiondef('app_private.marketplace_dispatch_policy_allows(uuid,uuid,text,uuid)'::regprocedure);
  list_definition := pg_get_functiondef('public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid)'::regprocedure);
  if position('7 days' in strict_policy) > 0 or
     position('300 seconds' in strict_policy) = 0 then
    raise exception 'WAKE_VERIFY: strict acceptance freshness altered';
  end if;
  if position('7 days' in wake_policy) = 0 or
     position('greatest(60' in wake_policy) = 0 or
     position('300 seconds' in wake_policy) = 0 then
    raise exception 'WAKE_VERIFY: notification two-stage rule missing';
  end if;
  if position('app_private.marketplace_dispatch_notification_candidate_state(' in queue_definition) = 0 then
    raise exception 'WAKE_VERIFY: notification queue not using wake policy';
  end if;
  if position('app_private.marketplace_dispatch_candidate_state(' in acceptance_definition) = 0 or
     position('marketplace_dispatch_policy_allows' in list_definition) = 0 then
    raise exception 'WAKE_VERIFY: acceptance/listing safeguards absent';
  end if;
  if has_function_privilege('anon', 'app_private.marketplace_dispatch_notification_candidate_state(uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'WAKE_VERIFY: anonymous access not revoked';
  end if;
end;
$wake_verify$;
