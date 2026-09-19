do $$
declare fn text;
begin
  if to_regprocedure('public.get_marketplace_customer_job_media(uuid,text,uuid)') is not null then raise exception 'SQL media signing RPC remains'; end if;
  foreach fn in array array[
    'public.start_marketplace_customer_session(text,text,text,uuid)',
    'public.get_marketplace_customer_job(uuid,text,uuid)',
    'public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid)',
    'public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid)',
    'public.list_marketplace_customer_services()'
  ] loop
    if has_function_privilege('anon',fn,'execute') then raise exception 'legacy anon RPC exposed: %',fn; end if;
    if not has_function_privilege('service_role',fn,'execute') then raise exception 'gateway service RPC missing: %',fn; end if;
  end loop;
  if has_function_privilege('anon','public.marketplace_customer_gateway_rate_limit(text,text)','execute') then raise exception 'gateway limiter exposed'; end if;
  if not has_function_privilege('service_role','public.marketplace_customer_gateway_rate_limit(text,text)','execute') then raise exception 'gateway limiter unavailable'; end if;
end $$;
