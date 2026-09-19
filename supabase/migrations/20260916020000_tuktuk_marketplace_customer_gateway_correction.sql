-- Block 10 correction: Edge Function is the only anonymous customer gateway.
-- Signing URLs in SQL is deliberately unsupported; Storage API signing happens
-- in supabase/functions/marketplace-customer-gateway with server-only keys.

create or replace function public.marketplace_customer_gateway_rate_limit(
  target_operation text, target_derived_identity text
) returns void language plpgsql security definer set search_path='' as $$
declare operation_limit integer; operation_window interval;
begin
  if target_operation not in ('session','request','publish','read','cancel','rating','media') then
    raise exception 'CUSTOMER_GATEWAY_OPERATION_INVALID' using errcode='22023';
  end if;
  if target_derived_identity is null or target_derived_identity !~ '^[0-9a-f]{64}$' then
    raise exception 'CUSTOMER_GATEWAY_IDENTITY_INVALID' using errcode='22023';
  end if;
  select case target_operation when 'session' then 8 when 'read' then 120 when 'media' then 24 when 'rating' then 8 else 16 end,
    case when target_operation in ('session','read','media') then interval '10 minutes' else interval '1 hour' end
  into operation_limit,operation_window;
  perform app_private.marketplace_customer_abuse_check(target_operation,target_derived_identity,operation_limit,operation_window);
end; $$;

revoke all on function public.marketplace_customer_gateway_rate_limit(text,text) from public,anon,authenticated;
grant execute on function public.marketplace_customer_gateway_rate_limit(text,text) to service_role;

-- The function gateway authenticates each session through these existing
-- SECURITY DEFINER contracts. They must never remain callable by anon.
revoke all on function
  public.start_marketplace_customer_session(text,text,text,uuid),
  public.get_marketplace_customer_job(uuid,text,uuid),
  public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid),
  public.create_marketplace_customer_request(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,uuid),
  public.publish_marketplace_customer_job(uuid,text,uuid,numeric,boolean,uuid),
  public.get_marketplace_customer_rating(uuid,text,uuid),
  public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid),
  public.list_marketplace_customer_services(),
  public.start_marketplace_customer_session_protected(text,text,text,uuid,text),
  public.get_marketplace_customer_job_protected(uuid,text,uuid),
  public.cancel_marketplace_customer_job_protected(uuid,text,uuid,text,uuid),
  public.create_marketplace_customer_request_protected(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,uuid),
  public.publish_marketplace_customer_job_protected(uuid,text,uuid,numeric,boolean,uuid)
from public,anon,authenticated;

grant execute on function
  public.start_marketplace_customer_session(text,text,text,uuid),
  public.get_marketplace_customer_job(uuid,text,uuid),
  public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid),
  public.create_marketplace_customer_request(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,uuid),
  public.publish_marketplace_customer_job(uuid,text,uuid,numeric,boolean,uuid),
  public.get_marketplace_customer_rating(uuid,text,uuid),
  public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid),
  public.list_marketplace_customer_services()
to service_role;
