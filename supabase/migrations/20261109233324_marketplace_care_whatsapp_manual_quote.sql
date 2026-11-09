-- TUKTUK Centro de Atención: cotización manual WhatsApp con aceptación previa.
-- NO conecta ni lee WhatsApp. NO crea ni publica carreras al aplicar la migración.
-- El operador prepara la cotización, confirma envío y registra evidencia de aceptación.
-- El servidor valida la tarifa mediante una prueba de ruta existente antes de guardar
-- y de nuevo antes de despachar. Los datos permanecen privados (RLS + revoke).
create table if not exists public.marketplace_admin_whatsapp_quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  customer_id uuid not null,
  request_key uuid not null,
  prepared_by uuid not null,
  service_code text not null check(service_code in ('passenger','courier','cargo')),
  vehicle_category_code text not null,
  origin_text text not null,
  destination_text text not null,
  origin_point jsonb not null,
  destination_point jsonb not null,
  distance_km numeric not null check(distance_km>0 and distance_km<=500),
  duration_seconds integer not null check(duration_seconds>0 and duration_seconds<=86400),
  expected_price numeric not null check(expected_price>0 and expected_price<=100000),
  cargo_weight_kg numeric,
  notes text,
  status text not null default 'quoted'
    check(status in ('quoted','sent','accepted','published')),
  created_at timestamptz not null default now(),
  quote_expires_at timestamptz not null default (now()+interval '2 hours'),
  sent_at timestamptz,
  sent_by uuid,
  accepted_at timestamptz,
  accepted_by uuid,
  acceptance_excerpt text,
  published_at timestamptz,
  job_id uuid,
  constraint marketplace_admin_whatsapp_quotes_customer_fk
    foreign key(project_id,customer_id) references public.customers(project_id,id),
  constraint marketplace_admin_whatsapp_quotes_job_fk
    foreign key(project_id,job_id) references public.jobs(project_id,id),
  constraint marketplace_admin_whatsapp_quotes_request_unique unique(project_id,request_key),
  constraint marketplace_admin_whatsapp_quotes_sent_consistent
    check(status<>'sent' or (sent_at is not null and sent_by is not null)),
  constraint marketplace_admin_whatsapp_quotes_acceptance_consistent
    check(status<>'accepted' or (sent_at is not null and sent_by is not null and accepted_at is not null)),
  constraint marketplace_admin_whatsapp_quotes_published_consistent
    check(status<>'published' or job_id is not null)
);
create index if not exists marketplace_admin_whatsapp_quotes_open_idx
  on public.marketplace_admin_whatsapp_quotes(project_id,created_at desc)
  where status in ('quoted','sent','accepted');
alter table public.marketplace_admin_whatsapp_quotes enable row level security;
revoke all on public.marketplace_admin_whatsapp_quotes from public,anon,authenticated;

create or replace function public.admin_prepare_marketplace_whatsapp_quote(
  target_project_id uuid,
  target_customer_id uuid,
  target_request_key uuid,
  target_verified_route_id uuid,
  target_expected_price numeric,
  target_origin_text text,
  target_destination_text text,
  target_notes text default null
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_actor uuid;
  v_proof public.marketplace_admin_care_verified_routes%rowtype;
  v_customer public.customers%rowtype;
  v_previous public.marketplace_admin_whatsapp_quotes%rowtype;
  v_quote public.marketplace_admin_whatsapp_quotes%rowtype;
  v_origin text := nullif(btrim(target_origin_text),'');
  v_destination text := nullif(btrim(target_destination_text),'');
  v_notes text := nullif(btrim(target_notes),'');
begin
  v_actor := app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'customers.view');
  if not exists(select 1 from public.projects p
    where p.id=target_project_id and p.slug='tuktuk-control') then
    raise exception 'CARE_PROJECT_INVALID' using errcode='22023';
  end if;
  if target_customer_id is null or target_request_key is null
    or target_verified_route_id is null then
    raise exception 'WHATSAPP_QUOTE_FIELDS_REQUIRED' using errcode='22023';
  end if;
  if v_origin is null or v_destination is null
    or char_length(v_origin)>240 or char_length(v_destination)>240
    or (v_notes is not null and char_length(v_notes)>500) then
    raise exception 'WHATSAPP_QUOTE_TEXT_INVALID' using errcode='22023';
  end if;
  if target_expected_price is null or target_expected_price<=0
    or target_expected_price>100000 then
    raise exception 'WHATSAPP_QUOTE_PRICE_INVALID' using errcode='22023';
  end if;
  select * into v_customer from public.customers c
    where c.project_id=target_project_id and c.id=target_customer_id;
  if not found or exists(select 1 from public.marketplace_admin_test_customers tc
    where tc.project_id=target_project_id and tc.customer_id=target_customer_id) then
    raise exception 'CARE_CUSTOMER_NOT_FOUND' using errcode='P0002';
  end if;
  select * into v_proof from public.marketplace_admin_care_verified_routes r
    where r.id=target_verified_route_id and r.project_id=target_project_id for update;
  if not found or v_proof.actor_user_id<>v_actor
    or v_proof.consumed_at is not null or v_proof.expires_at<=now()
    or round(v_proof.recommended_price,2)<>round(target_expected_price,2) then
    raise exception 'WHATSAPP_QUOTE_ROUTE_OR_PRICE_CHANGED' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'care:whatsapp:quote:'||target_project_id::text||':'||target_request_key::text,0));
  select * into v_previous from public.marketplace_admin_whatsapp_quotes q
    where q.project_id=target_project_id and q.request_key=target_request_key for update;
  if found then
    if v_previous.prepared_by<>v_actor or v_previous.customer_id<>target_customer_id
      or v_previous.origin_text<>v_origin or v_previous.destination_text<>v_destination
      or v_previous.expected_price<>v_proof.recommended_price
      or v_previous.origin_point<>v_proof.origin_point
      or v_previous.destination_point<>v_proof.destination_point
      or v_previous.service_code<>v_proof.service_code
      or v_previous.vehicle_category_code<>v_proof.vehicle_category_code
      or v_previous.notes is distinct from v_notes
      or v_previous.cargo_weight_kg is distinct from v_proof.cargo_weight_kg then
      raise exception 'WHATSAPP_QUOTE_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return to_jsonb(v_previous);
  end if;
  insert into public.marketplace_admin_whatsapp_quotes(
    project_id,customer_id,request_key,prepared_by,
    service_code,vehicle_category_code,origin_text,destination_text,
    origin_point,destination_point,distance_km,duration_seconds,
    expected_price,cargo_weight_kg,notes
  ) values(
    target_project_id,target_customer_id,target_request_key,v_actor,
    v_proof.service_code,v_proof.vehicle_category_code,v_origin,v_destination,
    v_proof.origin_point,v_proof.destination_point,v_proof.distance_km,
    v_proof.duration_seconds,v_proof.recommended_price,v_proof.cargo_weight_kg,v_notes
  ) returning * into v_quote;
  return to_jsonb(v_quote);
end;
$fn$;

create or replace function public.admin_mark_marketplace_whatsapp_quote_sent(
  target_project_id uuid,target_quote_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_actor uuid;
  v_quote public.marketplace_admin_whatsapp_quotes%rowtype;
begin
  v_actor := app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'customers.view');
  select * into v_quote from public.marketplace_admin_whatsapp_quotes q
    where q.project_id=target_project_id and q.id=target_quote_id for update;
  if not found then raise exception 'WHATSAPP_QUOTE_NOT_FOUND' using errcode='P0002'; end if;
  if v_quote.quote_expires_at<=now() then
    raise exception 'WHATSAPP_QUOTE_EXPIRED' using errcode='22023';
  end if;
  if v_quote.status='sent' then return to_jsonb(v_quote); end if;
  if v_quote.status<>'quoted' then
    raise exception 'WHATSAPP_QUOTE_INVALID_TRANSITION' using errcode='22023';
  end if;
  update public.marketplace_admin_whatsapp_quotes q
    set status='sent',sent_at=now(),sent_by=v_actor
    where q.id=target_quote_id and q.project_id=target_project_id
    returning * into v_quote;
  return to_jsonb(v_quote);
end;
$fn$;

create or replace function public.admin_confirm_marketplace_whatsapp_quote(
  target_project_id uuid,target_quote_id uuid,target_acceptance_excerpt text
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_actor uuid;
  v_quote public.marketplace_admin_whatsapp_quotes%rowtype;
  v_excerpt text := nullif(btrim(target_acceptance_excerpt),'');
begin
  v_actor := app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'customers.view');
  if v_excerpt is null or char_length(v_excerpt)<2 or char_length(v_excerpt)>240 then
    raise exception 'WHATSAPP_QUOTE_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select * into v_quote from public.marketplace_admin_whatsapp_quotes q
    where q.project_id=target_project_id and q.id=target_quote_id for update;
  if not found then raise exception 'WHATSAPP_QUOTE_NOT_FOUND' using errcode='P0002'; end if;
  if v_quote.quote_expires_at<=now() then
    raise exception 'WHATSAPP_QUOTE_EXPIRED' using errcode='22023';
  end if;
  if v_quote.status<>'sent' then
    raise exception 'WHATSAPP_QUOTE_MUST_BE_SENT_FIRST' using errcode='22023';
  end if;
  update public.marketplace_admin_whatsapp_quotes q
    set status='accepted',accepted_at=now(),accepted_by=v_actor,
      acceptance_excerpt=v_excerpt
    where q.id=target_quote_id and q.project_id=target_project_id
    returning * into v_quote;
  return to_jsonb(v_quote);
end;
$fn$;

create or replace function public.admin_publish_marketplace_whatsapp_accepted_job(
  target_project_id uuid,target_quote_id uuid,target_verified_route_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_actor uuid;
  v_quote public.marketplace_admin_whatsapp_quotes%rowtype;
  v_proof public.marketplace_admin_care_verified_routes%rowtype;
  v_result jsonb;
begin
  v_actor := app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'customers.view');
  select * into v_quote from public.marketplace_admin_whatsapp_quotes q
    where q.project_id=target_project_id and q.id=target_quote_id for update;
  if not found then raise exception 'WHATSAPP_QUOTE_NOT_FOUND' using errcode='P0002'; end if;
  if v_quote.status='published' and v_quote.job_id is not null then
    return jsonb_build_object('job_id',v_quote.job_id,'customer_id',v_quote.customer_id,
      'status','published','repeated',true);
  end if;
  if v_quote.status<>'accepted' or v_quote.accepted_at is null
    or v_quote.sent_at is null or v_quote.sent_by is null
    or v_quote.acceptance_excerpt is null then
    raise exception 'WHATSAPP_QUOTE_NOT_ACCEPTED' using errcode='42501';
  end if;
  if v_quote.quote_expires_at<=now() then
    raise exception 'WHATSAPP_QUOTE_EXPIRED' using errcode='22023';
  end if;
  select * into v_proof from public.marketplace_admin_care_verified_routes p
    where p.project_id=target_project_id and p.id=target_verified_route_id for update;
  if not found or v_proof.actor_user_id<>v_actor
    or v_proof.expires_at<=now() or v_proof.consumed_at is not null
    or v_proof.service_code<>v_quote.service_code
    or v_proof.vehicle_category_code<>v_quote.vehicle_category_code
    or v_proof.origin_point<>v_quote.origin_point
    or v_proof.destination_point<>v_quote.destination_point
    or v_proof.cargo_weight_kg is distinct from v_quote.cargo_weight_kg
    or round(v_proof.recommended_price,2)<>round(v_quote.expected_price,2) then
    raise exception 'WHATSAPP_QUOTE_ROUTE_OR_PRICE_CHANGED' using errcode='42501';
  end if;
  v_result := public.admin_publish_marketplace_care_job(
    target_project_id,
    v_quote.customer_id,
    v_quote.request_key,
    v_quote.service_code,
    v_quote.vehicle_category_code,
    v_quote.origin_text,
    v_quote.destination_text,
    v_quote.origin_point,
    v_quote.destination_point,
    v_proof.distance_km,
    v_proof.duration_seconds,
    v_proof.recommended_price,
    v_quote.notes,
    v_quote.cargo_weight_kg,
    'whatsapp',
    target_verified_route_id
  );
  update public.marketplace_admin_whatsapp_quotes q
    set status='published',published_at=now(),
      job_id=(v_result->>'job_id')::uuid
    where q.project_id=target_project_id and q.id=target_quote_id;
  return v_result||jsonb_build_object('quote_id',target_quote_id);
end;
$fn$;

-- Recuperación de borradores; nunca se almacenan mensajes completos.
create or replace function public.admin_list_marketplace_whatsapp_quotes(
  target_project_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_rows jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'customers.view');
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select q.*,c.display_name as customer_name,c.whatsapp_phone
    from public.marketplace_admin_whatsapp_quotes q
    join public.customers c on c.project_id=q.project_id and c.id=q.customer_id
    where q.project_id=target_project_id and q.quote_expires_at>now()
      and q.status in ('quoted','sent','accepted')
    order by q.created_at desc
    limit 30
  ) q;
  return v_rows;
end;
$fn$;

revoke all on function public.admin_prepare_marketplace_whatsapp_quote(uuid,uuid,uuid,uuid,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.admin_mark_marketplace_whatsapp_quote_sent(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_confirm_marketplace_whatsapp_quote(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_publish_marketplace_whatsapp_accepted_job(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_list_marketplace_whatsapp_quotes(uuid) from public,anon,authenticated;
grant execute on function public.admin_prepare_marketplace_whatsapp_quote(uuid,uuid,uuid,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.admin_mark_marketplace_whatsapp_quote_sent(uuid,uuid) to authenticated;
grant execute on function public.admin_confirm_marketplace_whatsapp_quote(uuid,uuid,text) to authenticated;
grant execute on function public.admin_publish_marketplace_whatsapp_accepted_job(uuid,uuid,uuid) to authenticated;
grant execute on function public.admin_list_marketplace_whatsapp_quotes(uuid) to authenticated;
