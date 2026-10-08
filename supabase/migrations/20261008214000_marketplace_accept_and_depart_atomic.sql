-- Preparacion: NO aplicar a la base de datos todavia.
-- Aceptacion y salida dentro de una sola transaccion.
-- Las carreras programadas conservan su estado de aceptacion.

create or replace function public.accept_and_start_my_marketplace_job(
    target_job_id uuid,
    target_vehicle_id text,
    target_idempotency_key uuid
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
    accepted_job public.jobs%rowtype;
    requested_at timestamptz;
    route_key uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTHENTICATION_REQUIRED'
            using errcode = '42501';
    end if;

    if target_idempotency_key is null then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED'
            using errcode = '22023';
    end if;

    accepted_job := public.accept_job(
        target_job_id,
        target_vehicle_id,
        target_idempotency_key
    );

    select r.scheduled_for
      into requested_at
      from public.service_requests r
     where r.project_id = accepted_job.project_id
       and r.id = accepted_job.service_request_id;

    if not found then
        raise exception 'SERVICE_REQUEST_NOT_FOUND'
            using errcode = 'P0002';
    end if;

    if accepted_job.status = 'accepted'
       and (requested_at is null or requested_at <= now()) then

        route_key := md5(
            target_idempotency_key::text || ':start_en_route'
        )::uuid;

        accepted_job := public.advance_my_marketplace_job(
            target_job_id,
            'start_en_route',
            route_key
        );
    end if;

    return accepted_job;
end;
$function$;

revoke all on function
    public.accept_and_start_my_marketplace_job(uuid,text,uuid)
from public, anon;

grant execute on function
    public.accept_and_start_my_marketplace_job(uuid,text,uuid)
to authenticated;