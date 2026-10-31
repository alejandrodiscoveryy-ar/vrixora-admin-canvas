-- Centro de atencion: operaciones administrativas autenticas, atomicas y auditables.
-- Este script no crea carreras ni modifica clientes al instalarse.
create table if not exists public.marketplace_admin_care_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  customer_id uuid not null,
  job_id uuid not null,
  actor_user_id uuid not null,
  idempotency_key uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint marketplace_admin_care_jobs_customer_fk foreign key(project_id,customer_id)
    references public.customers(project_id,id),
  constraint marketplace_admin_care_jobs_job_fk foreign key(project_id,job_id)
    references public.jobs(project_id,id),
  constraint marketplace_admin_care_jobs_idempotency unique(project_id,idempotency_key),
  constraint marketplace_admin_care_jobs_job_unique unique(project_id,job_id)
);
alter table public.marketplace_admin_care_jobs enable row level security;
revoke all on public.marketplace_admin_care_jobs from public,anon,authenticated;

create or replace function public.admin_lookup_marketplace_care_customer(
  target_project_id uuid,target_phone text
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_phone text;
  v_customer public.customers%rowtype;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view');
  perform app_private.require_project_permission(target_project_id,'customers.view');
  v_phone := regexp_replace(btrim(coalesce(target_phone,'')),'[[:space:]()-]','','g');
  if v_phone ~ '^5[0-9]{7}$' then v_phone:='+53'||v_phone;
  elsif v_phone ~ '^535[0-9]{7}$' then v_phone:='+'||v_phone;
  end if;
  if v_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'CUSTOMER_PHONE_INVALID' using errcode='22023';
  end if;
  select * into v_customer from public.customers c
  where c.project_id=target_project_id and c.whatsapp_phone=v_phone
    and not exists (select 1 from public.marketplace_admin_test_customers tc
      where tc.project_id=c.project_id and tc.customer_id=c.id);
  if not found then return jsonb_build_object('found',false,'phone',v_phone); end if;
  return jsonb_build_object('found',true,'phone',v_phone,
    'customer',jsonb_build_object('id',v_customer.id,
      'display_name',v_customer.display_name,'whatsapp_phone',v_customer.whatsapp_phone,
      'created_at',v_customer.created_at));
end;
$fn$;

create or replace function public.admin_register_marketplace_care_customer(
  target_project_id uuid,target_phone text,target_display_name text
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_phone text;
  v_name text:=nullif(btrim(coalesce(target_display_name,'')),'');
  v_id uuid;
  v_created boolean:=false;
  v_customer public.customers%rowtype;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'customers.manage');
  if v_name is null or char_length(v_name)>100 then
    raise exception 'CUSTOMER_NAME_INVALID' using errcode='22023';
  end if;
  v_phone:=regexp_replace(btrim(coalesce(target_phone,'')),'[[:space:]()-]','','g');
  if v_phone ~ '^5[0-9]{7}$' then v_phone:='+53'||v_phone;
  elsif v_phone ~ '^535[0-9]{7}$' then v_phone:='+'||v_phone;
  end if;
  if v_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'CUSTOMER_PHONE_INVALID' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tuktuk:customer:phone:'||target_project_id::text||':'||v_phone,0));
  select * into v_customer from public.customers c
    where c.project_id=target_project_id and c.whatsapp_phone=v_phone for update;
  if not found then
    insert into public.customers(project_id,display_name,whatsapp_phone)
      values(target_project_id,v_name,v_phone) returning * into v_customer;
    v_created:=true;
  end if;
  if exists(select 1 from public.marketplace_admin_test_customers tc
      where tc.project_id=target_project_id and tc.customer_id=v_customer.id) then
    raise exception 'CUSTOMER_IS_TEST_ONLY' using errcode='42501';
  end if;
  return jsonb_build_object('found',true,'created',v_created,'phone',v_phone,
    'customer',jsonb_build_object('id',v_customer.id,'display_name',v_customer.display_name,
      'whatsapp_phone',v_customer.whatsapp_phone,'created_at',v_customer.created_at));
end;
$fn$;

create or replace function public.admin_publish_marketplace_care_job(
  target_project_id uuid,
  target_customer_id uuid,
  target_idempotency_key uuid,
  target_service_code text,
  target_vehicle_category_code text,
  target_origin_text text,
  target_destination_text text,
  target_origin_point jsonb,
  target_destination_point jsonb,
  target_distance_km numeric,
  target_route_duration_seconds integer,
  target_expected_price numeric,
  target_notes text default null,
  target_cargo_weight_kg numeric default null,
  target_contact_preference text default 'phone'
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_actor uuid;
  v_customer public.customers%rowtype;
  v_details jsonb;
  v_payload jsonb;
  v_digest text;
  v_previous public.marketplace_admin_care_jobs%rowtype;
  v_token text;
  v_token_hash text;
  v_session_id uuid;
  v_create record;
  v_publish record;
  v_service text:=nullif(btrim(target_service_code),'');
  v_category text:=nullif(btrim(target_vehicle_category_code),'');
  v_origin text:=nullif(btrim(target_origin_text),'');
  v_destination text:=nullif(btrim(target_destination_text),'');
  v_notes text:=nullif(btrim(target_notes),'');
  v_origin_lat numeric;
  v_origin_lon numeric;
  v_dest_lat numeric;
  v_dest_lon numeric;
begin
  v_actor:=app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'customers.view');
  if target_idempotency_key is null or target_customer_id is null then
    raise exception 'CARE_IDEMPOTENCY_OR_CUSTOMER_REQUIRED' using errcode='22023';
  end if;
  if not exists(select 1 from public.projects p where p.id=target_project_id and p.slug='tuktuk-control') then
    raise exception 'CARE_PROJECT_INVALID' using errcode='22023';
  end if;
  if v_service not in ('passenger','courier','cargo') or v_category is null then
    raise exception 'CARE_SERVICE_INVALID' using errcode='22023';
  end if;
  if v_origin is null or v_destination is null or char_length(v_origin)>240 or char_length(v_destination)>240 then
    raise exception 'CARE_ROUTE_TEXT_INVALID' using errcode='22023';
  end if;
  if target_contact_preference not in ('phone','whatsapp','sms') then
    raise exception 'CARE_CONTACT_PREFERENCE_INVALID' using errcode='22023';
  end if;
  if v_notes is not null and char_length(v_notes)>500 then
    raise exception 'CARE_NOTES_TOO_LONG' using errcode='22023';
  end if;
  if target_distance_km is null or target_distance_km<=0 or target_distance_km>500
    or target_route_duration_seconds is null or target_route_duration_seconds<=0 or target_route_duration_seconds>86400
    or target_expected_price is null or target_expected_price<=0 or target_expected_price>100000 then
    raise exception 'CARE_ROUTE_PRICE_INVALID' using errcode='22023';
  end if;
  if target_origin_point is null or jsonb_typeof(target_origin_point)<>'object'
    or target_destination_point is null or jsonb_typeof(target_destination_point)<>'object'
    or coalesce(target_origin_point->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
    or coalesce(target_origin_point->>'lon','') !~ '^-?[0-9]+([.][0-9]+)?$'
    or coalesce(target_destination_point->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
    or coalesce(target_destination_point->>'lon','') !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'CARE_COORDINATES_INVALID' using errcode='22023';
  end if;
  v_origin_lat:=(target_origin_point->>'lat')::numeric;
  v_origin_lon:=(target_origin_point->>'lon')::numeric;
  v_dest_lat:=(target_destination_point->>'lat')::numeric;
  v_dest_lon:=(target_destination_point->>'lon')::numeric;
  if v_origin_lat not between 18 and 24.5 or v_dest_lat not between 18 and 24.5
    or v_origin_lon not between -85.5 and -73 or v_dest_lon not between -85.5 and -73
    or (v_origin_lat=v_dest_lat and v_origin_lon=v_dest_lon) then
    raise exception 'CARE_COORDINATES_OUTSIDE_CUBA' using errcode='22023';
  end if;
  if v_service='cargo' and (target_cargo_weight_kg is null or target_cargo_weight_kg<=0 or target_cargo_weight_kg>10000) then
    raise exception 'CARE_CARGO_WEIGHT_REQUIRED' using errcode='22023';
  end if;
  if target_cargo_weight_kg is not null and (target_cargo_weight_kg<0 or target_cargo_weight_kg>10000) then
    raise exception 'CARE_CARGO_WEIGHT_INVALID' using errcode='22023';
  end if;
  select * into v_customer from public.customers c
    where c.project_id=target_project_id and c.id=target_customer_id;
  if not found or exists(select 1 from public.marketplace_admin_test_customers tc
    where tc.project_id=target_project_id and tc.customer_id=target_customer_id) then
    raise exception 'CARE_CUSTOMER_NOT_FOUND' using errcode='P0002';
  end if;
  v_details:=jsonb_build_object(
    'estimated_distance_km',target_distance_km,
    'distance_source','provider',
    'stop_count',0,
    'route_origin',jsonb_build_object('lat',v_origin_lat,'lon',v_origin_lon),
    'route_destination',jsonb_build_object('lat',v_dest_lat,'lon',v_dest_lon),
    'route_duration_seconds',target_route_duration_seconds,
    'booking_channel','admin_customer_care',
    'contact_preference',target_contact_preference,
    'booked_by_user_id',v_actor
  );
  v_payload:=jsonb_build_object(
    'customer',target_customer_id,'service',v_service,'vehicle',v_category,
    'origin',v_origin,'destination',v_destination,
    'origin_point',target_origin_point,'destination_point',target_destination_point,
    'distance_km',target_distance_km,'duration_seconds',target_route_duration_seconds,
    'expected_price',target_expected_price,'notes',v_notes,'cargo_weight_kg',target_cargo_weight_kg,
    'contact_preference',target_contact_preference
  );
  v_digest:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('care:publish:'||target_project_id::text||':'||target_idempotency_key::text,0));
  select * into v_previous from public.marketplace_admin_care_jobs c
    where c.project_id=target_project_id and c.idempotency_key=target_idempotency_key;
  if found then
    if v_previous.payload_hash<>v_digest or v_previous.actor_user_id<>v_actor then
      raise exception 'CARE_IDEMPOTENCY_REUSED' using errcode='22023';
    end if;
    return jsonb_build_object('job_id',v_previous.job_id,'customer_id',v_previous.customer_id,
      'status',(select status from public.jobs where id=v_previous.job_id and project_id=target_project_id),
      'repeated',true);
  end if;
  -- Credencial transitoria generada en el servidor, nunca entregada al operador.
  -- Se revoca en la misma transaccion tras reutilizar los contratos de Cliente.
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash:=encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');
  insert into public.marketplace_customer_sessions(project_id,customer_id,token_hash,start_idempotency_key,expires_at)
  values(target_project_id,target_customer_id,v_token_hash,gen_random_uuid(),now()+interval '2 minutes')
  returning id into v_session_id;
  select * into v_create from public.create_marketplace_customer_request_v2(
    v_session_id,v_token,v_service,v_origin,v_destination,null::timestamptz,
    case when v_service='passenger' then 1 else null end,
    case when v_service='cargo' then target_cargo_weight_kg else null end,
    null::numeric,null::numeric,null::numeric,null::numeric,
    null::text,v_notes,v_details,v_category,gen_random_uuid());
  if not found or v_create.job_id is null then
    raise exception 'CARE_REQUEST_CREATION_FAILED';
  end if;
  if round(v_create.recommended_price,2)<>round(target_expected_price,2) then
    raise exception 'CARE_PRICE_CHANGED' using errcode='22023';
  end if;
  select * into v_publish from public.publish_marketplace_customer_job_v2(
    v_session_id,v_token,v_create.job_id,target_expected_price,false,gen_random_uuid());
  if not found or v_publish.status<>'published' then
    raise exception 'CARE_PUBLICATION_FAILED';
  end if;
  update public.marketplace_customer_sessions set status='revoked' where id=v_session_id and project_id=target_project_id;
  insert into public.marketplace_admin_care_jobs(project_id,customer_id,job_id,actor_user_id,idempotency_key,payload_hash)
  values(target_project_id,target_customer_id,v_create.job_id,v_actor,target_idempotency_key,v_digest);
  return jsonb_build_object('job_id',v_create.job_id,'customer_id',target_customer_id,
    'status',v_publish.status,'recommended_price',v_publish.recommended_price,
    'final_price',v_publish.final_price,'expires_at',v_publish.expires_at,
    'repeated',false);
end;
$fn$;

revoke all on function public.admin_lookup_marketplace_care_customer(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_register_marketplace_care_customer(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_publish_marketplace_care_job(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,integer,numeric,text,numeric,text) from public,anon,authenticated;
grant execute on function public.admin_lookup_marketplace_care_customer(uuid,text) to authenticated;
grant execute on function public.admin_register_marketplace_care_customer(uuid,text,text) to authenticated;
grant execute on function public.admin_publish_marketplace_care_job(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,integer,numeric,text,numeric,text) to authenticated;
