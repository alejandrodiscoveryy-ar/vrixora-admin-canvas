do $$
declare fn text; definition text;
begin
  foreach fn in array array[
    'public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid)',
    'public.get_marketplace_customer_rating(uuid,text,uuid)'
  ] loop
    if to_regprocedure(fn) is null then raise exception 'missing RPC %',fn; end if;
    if has_function_privilege('anon',fn,'execute') then raise exception 'customer RPC bypasses gateway: %',fn; end if;
    if not has_function_privilege('service_role',fn,'execute') then raise exception 'gateway RPC grant missing %',fn; end if;
    select lower(pg_get_functiondef(fn::regprocedure)) into definition;
    if definition not like '%set search_path = ''''%' then raise exception 'search_path missing %',fn; end if;
  end loop;
  if has_function_privilege('anon','public.start_marketplace_customer_session(text,text,text,uuid)','execute') then raise exception 'legacy anonymous session RPC remains exposed'; end if;
  if has_table_privilege('anon','public.marketplace_customer_ratings','select') then raise exception 'rating table exposed'; end if;
  if to_regprocedure('public.get_marketplace_customer_job_media(uuid,text,uuid)') is not null then raise exception 'SQL media signing RPC must not exist'; end if;
  select lower(pg_get_functiondef('public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid)'::regprocedure)) into definition;
  if definition not like '%status<>''settled''%' or definition not like '%access_denied%' or definition not like '%idempotency%' then raise exception 'rating authorization incomplete'; end if;
end $$;
