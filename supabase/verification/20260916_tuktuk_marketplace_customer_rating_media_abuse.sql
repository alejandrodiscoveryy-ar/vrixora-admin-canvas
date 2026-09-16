do $$
declare fn text; definition text;
begin
  foreach fn in array array[
    'public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid)',
    'public.get_marketplace_customer_rating(uuid,text,uuid)',
    'public.get_marketplace_customer_job_media(uuid,text,uuid)',
    'public.start_marketplace_customer_session_protected(text,text,text,uuid,text)'
  ] loop
    if to_regprocedure(fn) is null then raise exception 'missing RPC %',fn; end if;
    if not has_function_privilege('anon',fn,'execute') then raise exception 'anon RPC grant missing %',fn; end if;
    select lower(pg_get_functiondef(fn::regprocedure)) into definition;
    if definition not like '%set search_path = ''''%' then raise exception 'search_path missing %',fn; end if;
  end loop;
  if has_function_privilege('anon','public.start_marketplace_customer_session(text,text,text,uuid)','execute') then raise exception 'legacy anonymous session RPC remains exposed'; end if;
  if has_table_privilege('anon','public.marketplace_customer_ratings','select') then raise exception 'rating table exposed'; end if;
  select lower(pg_get_functiondef('public.get_marketplace_customer_job_media(uuid,text,uuid)'::regprocedure)) into definition;
  if definition not like '%assigned_media_not_available%' or definition not like '%storage.create_signed_url%' then raise exception 'media authorization/signing incomplete'; end if;
  select lower(pg_get_functiondef('public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid)'::regprocedure)) into definition;
  if definition not like '%status<>''settled''%' or definition not like '%access_denied%' or definition not like '%idempotency%' then raise exception 'rating authorization incomplete'; end if;
end $$;
