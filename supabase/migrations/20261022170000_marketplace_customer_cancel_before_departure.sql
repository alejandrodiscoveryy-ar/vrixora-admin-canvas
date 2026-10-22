-- Restrict ordinary customer cancellations after the driver starts heading to pickup.
-- No change to driver/admin cancellation, ratings, settlement, or billing rules.
-- Review-only until this migration is explicitly authorized for production.
do $customer_cancel_before_departure$
declare
  definition text;
  old_fragment text := $old$
 if j.status in ('in_progress','completed','settled','incident') then raise exception 'CUSTOMER_CANCELLATION_REQUIRES_SUPPORT' using errcode='42501'; end if;
$old$;
  new_fragment text := $new$
 if j.status in ('en_route','pickup','in_progress','completed','settled','incident') then raise exception 'CUSTOMER_CANCELLATION_REQUIRES_SUPPORT' using errcode='42501'; end if;
$new$;
begin
  select pg_get_functiondef(
    to_regprocedure('public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)')
  ) into definition;
  if definition is null then
    raise exception 'CUSTOMER_CANCEL_FUNCTION_MISSING';
  end if;
  if (length(definition) - length(replace(definition, old_fragment, ''))) <> length(old_fragment) then
    raise exception 'CUSTOMER_CANCEL_EXPECTED_FRAGMENT_MISSING_OR_DUPLICATED';
  end if;
  -- Preserve all other function code and grants, including financial mode fixes.
  execute replace(definition, old_fragment, new_fragment);
end;
$customer_cancel_before_departure$;
