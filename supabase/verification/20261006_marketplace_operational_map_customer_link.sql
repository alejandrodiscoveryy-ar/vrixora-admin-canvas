do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.admin_get_marketplace_operational_map(uuid)'::regprocedure
  )
  into definition;

  if definition not like '%when can_customers then c.id%'
     or definition not like '%''customer_id'', j.customer_id%'
  then
    raise exception 'TEST_FAILED: operational map customer link missing';
  end if;

  if definition like '%whatsapp_phone%'
     or definition like '%customer_phone%'
     or definition like '%c.email%'
  then
    raise exception 'TEST_FAILED: operational map leaks customer contact data';
  end if;
end
$$;