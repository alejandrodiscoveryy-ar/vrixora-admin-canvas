-- TukTuk: notificar a conductores en reposo GPS desde su ultima ubicacion,
-- sin autorizar aceptacion con coordenadas antiguas.
-- Primera ola: GPS reciente (regla actual).
-- Segunda ola: ultima posicion <= 7 dias, desde >= max(60s, 2*expansion_seconds).
-- Conserva radio, puntuaciones, requisitos de vehiculo, licencias y unicidad push.
-- Unicamente la cola push usa la politica extendida; aceptar/listar sigue exigiendo GPS reciente.

do $wake_migration$
declare
  current_state regprocedure := to_regprocedure('app_private.marketplace_dispatch_candidate_state(uuid,uuid,text,uuid)');
  current_queue regprocedure := to_regprocedure('app_private.enqueue_marketplace_job_offer_wave(uuid)');
  ddl text;
  needle text;
  extension text;
begin
  if current_state is null or current_queue is null then
    raise exception 'WAKE_ABORT: missing dispatcher functions';
  end if;

  ddl := pg_get_functiondef(current_state);
  needle := 'FUNCTION app_private.marketplace_dispatch_candidate_state(';
  if length(ddl)-length(replace(ddl,needle,'')) <> length(needle) then
    raise exception 'WAKE_ABORT: unexpected dispatcher signature';
  end if;
  ddl := replace(ddl, needle, 'FUNCTION app_private.marketplace_dispatch_notification_candidate_state(');

  needle := 'l.captured_at >= now() - interval ''300 seconds''';
  if length(ddl)-length(replace(ddl,needle,'')) <> length(needle) then
    raise exception 'WAKE_ABORT: unexpected freshness rule';
  end if;

  extension := $condition$(
        l.captured_at >= now() - interval '300 seconds'
        or (
          l.captured_at >= now() - interval '7 days'
          and l.captured_at <= now() + interval '5 minutes'
          and now() >= v_base_time + make_interval(
            secs => greatest(60, 2 * coalesce(v_settings.expansion_seconds,30))
          )
        )
      )$condition$;

  ddl := replace(ddl,needle,extension);
  execute ddl;
  revoke all on function app_private.marketplace_dispatch_notification_candidate_state(uuid,uuid,text,uuid)
    from public,anon,authenticated;

  -- Solo se modifica el criterio de SELECCION PARA NOTIFICACIONES.
  -- No se cambia marketplace_dispatch_policy_allows: la aceptacion sigue requiriendo GPS fresco.
  ddl := pg_get_functiondef(current_queue);
  needle := 'app_private.marketplace_dispatch_candidate_state(';
  if length(ddl)-length(replace(ddl,needle,'')) <> length(needle) then
    raise exception 'WAKE_ABORT: unexpected notification queue';
  end if;
  ddl := replace(ddl,needle,'app_private.marketplace_dispatch_notification_candidate_state(');
  execute ddl;

  if position('app_private.marketplace_dispatch_candidate_state(' in
      pg_get_functiondef('app_private.marketplace_dispatch_policy_allows(uuid,uuid,text,uuid)'::regprocedure)) = 0 then
    raise exception 'WAKE_ABORT: acceptance policy changed unexpectedly';
  end if;
end;
$wake_migration$;
