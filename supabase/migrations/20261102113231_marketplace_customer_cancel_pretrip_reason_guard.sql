-- TUKTUK Cliente: cancelacion con causa antes de IN_PROGRESS.
-- SOLO PARA REVISION. No ejecutarlo directamente ni en produccion desde este script.
-- Conserva la funcion instalada, modalidades de cobro, locks, auditoria e idempotencia.
-- Los cambios se aplicaran unicamente tras aprobar la migracion en una etapa futura.
do $customer_cancel_pretrip_guard$
declare
  definition text;
  blocking_before text := $old_block$
 if j.status in ('en_route','pickup','in_progress','completed','settled','incident') then raise exception 'CUSTOMER_CANCELLATION_REQUIRES_SUPPORT' using errcode='42501'; end if;
$old_block$;
  blocking_after text := $new_block$
 if j.status in ('in_progress','completed','settled','incident') then raise exception 'CUSTOMER_CANCELLATION_REQUIRES_SUPPORT' using errcode='42501'; end if;
$new_block$;
  ownership_check text := $old_owner$
 if not exists(select 1 from public.service_requests sr where sr.project_id=pid and sr.id=j.service_request_id and sr.customer_id=cid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
$old_owner$;
  protected_ownership text := $new_owner$
 if not exists(select 1 from public.service_requests sr where sr.project_id=pid and sr.id=j.service_request_id and sr.customer_id=cid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 -- El motivo tecnico sin conductor nunca se acepta despues de la asignacion,
 -- aunque un cliente desactualizado lo envie justo cuando alguien acepta.
 if (j.status in ('accepted','en_route','pickup')
     or j.assigned_driver_user_id is not null
     or j.assigned_vehicle_id is not null)
    and reason = 'Cancelación antes de asignar conductor' then
   raise exception 'CUSTOMER_CANCELLATION_REASON_REQUIRED_AFTER_ASSIGNMENT'
     using errcode='22023';
 end if;
$new_owner$;
begin
  select pg_get_functiondef(
    to_regprocedure('public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)')
  ) into definition;
  if definition is null then
    raise exception 'CUSTOMER_CANCEL_FUNCTION_MISSING';
  end if;
  if (length(definition)-length(replace(definition,blocking_before,''))) <> length(blocking_before) then
    raise exception 'CUSTOMER_CANCEL_BLOCKING_POLICY_CHANGED';
  end if;
  if (length(definition)-length(replace(definition,ownership_check,''))) <> length(ownership_check) then
    raise exception 'CUSTOMER_CANCEL_OWNERSHIP_POLICY_CHANGED';
  end if;
  if position('CUSTOMER_CANCELLATION_REASON_REQUIRED_AFTER_ASSIGNMENT' in definition) > 0 then
    raise exception 'CUSTOMER_CANCEL_REASON_GUARD_ALREADY_INSTALLED';
  end if;
  definition := replace(definition,blocking_before,blocking_after);
  definition := replace(definition,ownership_check,protected_ownership);
  -- CREATE OR REPLACE conserva firma, propietario, ACL y reglas financieras.
  execute definition;
end;
$customer_cancel_pretrip_guard$;
