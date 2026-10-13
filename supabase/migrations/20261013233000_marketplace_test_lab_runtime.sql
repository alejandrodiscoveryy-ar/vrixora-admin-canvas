-- Marketplace Test Lab V2: runtime compatible con fundamento de la fase anterior.
-- PREPARADA / SIN APLICAR. Requiere la migración 20261013230000.
-- No afecta a carreras reales existentes ni habilita DML directo a clientes.

-- Identidad de cliente sintético y único por proyecto; nunca se reutiliza una identidad real.
create table if not exists public.marketplace_admin_test_customers (
  project_id uuid not null references public.projects(id) on delete restrict,
  customer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(project_id),
  unique(project_id,customer_id),
  foreign key(project_id,customer_id)
    references public.customers(project_id,id) on delete restrict
);
alter table public.marketplace_admin_test_customers enable row level security;
revoke all on public.marketplace_admin_test_customers from public,anon,authenticated;

-- El mismo idempotency_key no puede reutilizarse con un formulario distinto.
alter table public.marketplace_admin_test_jobs
  add column if not exists payload_hash text;

-- Modo real: etiquetar como prueba SOLO una carrera creada explícitamente por Admin.
-- El antiguo interruptor queda como control del laboratorio, no como clasificación
-- automática de las carreras publicadas desde la aplicación Cliente.
create or replace function app_private.mark_marketplace_test_job_on_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status='requested' and new.status='published' then
    if old.is_test or new.is_test then
      new.is_test := true;
      -- Destinatarios ya capturados en marketplace_test_job_recipients.
      -- Para pruebas legado se conserva test_driver_user_id.
    else
      new.is_test := false;
      new.test_driver_user_id := null;
      new.test_force_wallet_commission := false;
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function app_private.mark_marketplace_test_job_on_publish()
from public,anon,authenticated;

-- Compatibilidad con la lista de conductores de prueba (solamente acceso a la UI):
-- incluye el selector individual legado y el grupo V2 configurado.
create or replace function app_private.marketplace_test_mode_for_driver(
  target_project_id uuid, target_driver_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.marketplace_test_mode m
    where m.project_id=target_project_id and m.enabled
      and (
        m.target_driver_user_id=target_driver_user_id
        or exists (
          select 1 from public.marketplace_test_audience a
          where a.project_id=m.project_id
            and a.driver_user_id=target_driver_user_id
        )
      )
  );
$function$;
revoke all on function app_private.marketplace_test_mode_for_driver(uuid,uuid)
from public,anon,authenticated;

-- Actualización controlada y atómica de los cuatro puntos de elegibilidad:
-- (1) push/gateway, (2) listado del Conductor, (3) aceptación, (4) política financiera.
-- Se exige encontrar EXACTAMENTE una firma conocida, o falla toda la migración.
do $patch$
declare
  fn text;
  old_part text;
  new_part text;
  n integer;
begin
  fn := pg_catalog.pg_get_functiondef(
    'app_private.marketplace_driver_can_receive_job(uuid,uuid,text,uuid)'::regprocedure
  );
  old_part := '(not j.is_test or j.test_driver_user_id=target_driver_user_id)';
  new_part := '(not j.is_test or app_private.marketplace_test_job_targets_driver(j.project_id,j.id,target_driver_user_id))';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_DRIVERS_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := 'or (j.is_test and j.test_driver_user_id=d.user_id and j.test_force_wallet_commission)';
  new_part := 'or (j.is_test and not j.test_force_wallet_commission)
          or (j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,d.user_id) and j.test_force_wallet_commission)';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_DRIVERS_BILLING_CHANGED'; end if;
  execute replace(fn,old_part,new_part);

  fn := pg_catalog.pg_get_functiondef(
    'public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid)'::regprocedure
  );
  old_part := '(not j.is_test or j.test_driver_user_id=actor)';
  new_part := '(not j.is_test or app_private.marketplace_test_job_targets_driver(j.project_id,j.id,actor))';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_LIST_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := '(j.is_test and j.test_driver_user_id=actor and j.test_force_wallet_commission)';
  new_part := '(j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,actor) and j.test_force_wallet_commission)';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_LIST_BILLING_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  -- Comisión: los ensayos sin cargo siempre se ofrecen en modalidad gratuita.
  old_part := 'case
      when not commission_charge_enabled
       and not (j.is_test and j.test_force_wallet_commission)';
  new_part := 'case
      when j.is_test and not j.test_force_wallet_commission then ''platform_free''
      when not commission_charge_enabled
       and not (j.is_test and j.test_force_wallet_commission)';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_LIST_PLATFORM_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := 'when not commission_charge_enabled then 0::numeric';
  new_part := 'when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not commission_charge_enabled then 0::numeric';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>3 then raise exception 'TEST_LAB_CONTRACT_LIST_ZERO_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := 'when not commission_charge_enabled then true';
  new_part := 'when j.is_test and not j.test_force_wallet_commission then true
      when not commission_charge_enabled then true';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_LIST_CAN_ACCEPT_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  -- Cambio adicional para el greatest(missing balance) - usa una copia de 'when ... 0' ya cubierta.
  old_part := 'not commission_charge_enabled
      or app_private.has_active_marketplace_work_trial(actor)';
  new_part := 'not commission_charge_enabled
      or (j.is_test and not j.test_force_wallet_commission)
      or app_private.has_active_marketplace_work_trial(actor)';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_LIST_ACCESS_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  execute fn;

  fn := pg_catalog.pg_get_functiondef('public.accept_job(uuid,text,uuid)'::regprocedure);
  old_part := 'if j.is_test and j.test_driver_user_id is distinct from actor then raise exception ''JOB_NOT_AVAILABLE''; end if;';
  new_part := 'if j.is_test and not app_private.marketplace_test_job_targets_driver(pid,j.id,actor) then raise exception ''JOB_NOT_AVAILABLE''; end if;';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_ACCEPT_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := 'and j.test_driver_user_id=actor;';
  new_part := 'and app_private.marketplace_test_job_targets_driver(pid,j.id,actor);';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_ACCEPT_BILLING_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := 'trial_active:=app_private.has_active_marketplace_work_trial(actor) and not force_test_commission;';
  new_part := 'trial_active:=app_private.has_active_marketplace_work_trial(actor) and not force_test_commission and not (j.is_test and not j.test_force_wallet_commission);';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_ACCEPT_TRIAL_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := 'if trial_active then
    select * into t';
  new_part := 'if j.is_test and not j.test_force_wallet_commission then
    insert into public.job_assignments(
      project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,
      billing_mode,commission_amount_snapshot
    ) values(pid,j.id,actor,target_vehicle_id,target_idempotency_key,''platform_free'',0);
  elsif trial_active then
    select * into t';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_ACCEPT_FREE_CHANGED'; end if;
  fn := replace(fn,old_part,new_part);
  old_part := 'when not commission_charge_enabled then ''platform_free''';
  new_part := 'when j.is_test and not j.test_force_wallet_commission then ''platform_free''
                          when not commission_charge_enabled then ''platform_free''';
  n := (length(fn)-length(replace(fn,old_part,'')))/length(old_part);
  if n<>1 then raise exception 'TEST_LAB_CONTRACT_ACCEPT_EVENT_CHANGED'; end if;
  execute replace(fn,old_part,new_part);
end;
$patch$;

-- Cree un cliente ficticio sólo para las carreras de Admin (no datos de usuario real).
-- Limitar a máximo 30 destinatarios. Los datos se validan en un solo cierre transaccional.
create or replace function public.admin_create_marketplace_test_job(
  target_project_id uuid,
  target_idempotency_key uuid,
  target_driver_user_ids uuid[],
  target_service_code text,
  target_vehicle_category_code text,
  target_origin_text text,
  target_destination_text text,
  target_final_price numeric,
  target_notes text default null,
  target_force_wallet_commission boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  mode_enabled boolean;
  normalized uuid[];
  count_drivers integer;
  valid_drivers integer;
  account_count integer;
  client_id uuid;
  request_id uuid;
  job_id uuid;
  rate numeric;
  payload text;
  previous record;
  request_mode text;
  inserted_count integer;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'settings.manage');

  if target_idempotency_key is null
     or target_driver_user_ids is null
     or pg_catalog.array_position(target_driver_user_ids,null) is not null
     or coalesce(target_service_code,'') = ''
     or nullif(pg_catalog.btrim(target_origin_text),'') is null
     or nullif(pg_catalog.btrim(target_destination_text),'') is null
     or target_final_price is null or target_final_price<=0 or target_final_price>100000
     or pg_catalog.length(target_origin_text)>180
     or pg_catalog.length(target_destination_text)>180
     or pg_catalog.length(coalesce(target_notes,''))>1000
  then
    raise exception 'TEST_LAB_INVALID_INPUT' using errcode='22023';
  end if;
  if coalesce(target_force_wallet_commission,false) then
    perform app_private.require_project_permission(target_project_id,'payments.manage');
    if not exists (
      select 1 from public.project_marketplace_financial_settings f
      where f.project_id=target_project_id and f.commission_enabled
    ) then
      raise exception 'TEST_LAB_COMMISSION_DISABLED' using errcode='22023';
    end if;
  end if;

  select array_agg(driver order by driver),count(*) into normalized,count_drivers
  from (select distinct unnest(target_driver_user_ids) as driver) d;
  if count_drivers not between 1 and 30 then
    raise exception 'TEST_LAB_INVALID_AUDIENCE' using errcode='22023';
  end if;
  request_mode := case when count_drivers=1 then 'individual' else 'group' end;
  payload:=pg_catalog.md5(pg_catalog.concat_ws('|',target_project_id::text,
    array_to_string(normalized,','),target_service_code,
    coalesce(target_vehicle_category_code,''),target_origin_text,
    target_destination_text,target_final_price::text,coalesce(target_notes,''),
    coalesce(target_force_wallet_commission,false)::text));

  -- Serializar idempotencia y alta; nunca generar dos carreras con un mismo key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'test-lab-admin:'||target_project_id::text||':'||target_idempotency_key::text,0
  ));
  select t.job_id,t.payload_hash into previous
  from public.marketplace_admin_test_jobs t
  where t.project_id=target_project_id and t.idempotency_key=target_idempotency_key;
  if found then
    if previous.payload_hash is distinct from payload then
      raise exception 'TEST_LAB_IDEMPOTENCY_MISMATCH' using errcode='22023';
    end if;
    return jsonb_build_object('job_id',previous.job_id,'replayed',true);
  end if;

  select m.enabled into mode_enabled from public.marketplace_test_mode m
  where m.project_id=target_project_id;
  if not coalesce(mode_enabled,false) then
    raise exception 'TEST_LAB_DISABLED' using errcode='22023';
  end if;

  select count(*) into valid_drivers
  from public.marketplace_test_audience a
  join public.driver_profiles d
    on d.project_id=a.project_id and d.user_id=a.driver_user_id
  where a.project_id=target_project_id
    and a.driver_user_id=any(normalized)
    and d.status='active' and d.activated_at is not null and d.suspended_at is null;
  if valid_drivers<>count_drivers then
    raise exception 'TEST_LAB_RECIPIENT_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if not exists (select 1 from public.service_types s where s.project_id=target_project_id
                 and s.code=target_service_code and s.active) then
    raise exception 'TEST_LAB_SERVICE_NOT_FOUND' using errcode='22023';
  end if;
  if target_vehicle_category_code is not null and not exists (
    select 1 from public.vehicle_categories v where v.project_id=target_project_id
      and v.code=target_vehicle_category_code and v.active
  ) then
    raise exception 'TEST_LAB_CATEGORY_NOT_FOUND' using errcode='22023';
  end if;

  select s.commission_rate into rate
  from public.project_marketplace_financial_settings s
  where s.project_id=target_project_id;
  if rate is null then raise exception 'TEST_LAB_FINANCIAL_CONFIG_MISSING'; end if;

  -- Siempre una identidad sintética dedicada. Aislada de clientes reales.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'test-lab-customer:'||target_project_id::text,0
  ));
  select c.customer_id into client_id from public.marketplace_admin_test_customers c
  where c.project_id=target_project_id;
  if client_id is null then
    insert into public.customers(project_id,display_name,whatsapp_phone)
    values(target_project_id,'Simulador administrativo (PRUEBA)',
           'TEST-'||target_project_id::text)
    returning id into client_id;
    insert into public.marketplace_admin_test_customers(project_id,customer_id)
    values(target_project_id,client_id);
  end if;

  insert into public.service_requests(
    project_id,customer_id,service_code,origin_text,destination_text,
    notes,vehicle_category_code,details
  ) values(
    target_project_id,client_id,target_service_code,
    pg_catalog.btrim(target_origin_text),pg_catalog.btrim(target_destination_text),
    nullif(pg_catalog.btrim(coalesce(target_notes,'')),''),
    target_vehicle_category_code,
    jsonb_build_object('admin_simulated',true,'test_lab',true)
  ) returning id into request_id;

  insert into public.jobs(
    project_id,service_request_id,service_code,status,recommended_price,
    final_price,currency,commission_rate_snapshot,is_test,
    test_driver_user_id,test_force_wallet_commission,pricing_breakdown
  ) values(
    target_project_id,request_id,target_service_code,'requested',
    target_final_price,target_final_price,'CUP',rate,true,
    case when count_drivers=1 then normalized[1] else null end,
    coalesce(target_force_wallet_commission,false),
    jsonb_build_object('test_lab',true,'manual_price',true)
  ) returning id into job_id;

  insert into public.marketplace_test_job_recipients(project_id,job_id,driver_user_id)
  select target_project_id,job_id,unnest(normalized);
  get diagnostics inserted_count = row_count;
  if inserted_count<>count_drivers then
    raise exception 'TEST_LAB_RECIPIENT_COUNT_MISMATCH';
  end if;

  insert into public.marketplace_admin_test_jobs(
    project_id,job_id,created_by,idempotency_key,destination_mode,recipient_count,payload_hash
  ) values(target_project_id,job_id,actor,target_idempotency_key,request_mode,count_drivers,payload);

  update public.jobs
  set status='published',published_at=now(),expires_at=now()+interval '20 minutes',
      state_version=state_version+1
  where project_id=target_project_id and id=job_id;

  insert into public.job_events(
    project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,
    operation_idempotency_key,metadata
  ) values(
    target_project_id,job_id,'requested','published','publish','admin',actor,
    target_idempotency_key,
    jsonb_build_object('test_lab',true,'recipient_count',count_drivers,
                       'destination_mode',request_mode)
  );

  return jsonb_build_object('job_id',job_id,'replayed',false,
                            'recipient_count',count_drivers,'destination_mode',request_mode);
end;
$function$;
revoke all on function public.admin_create_marketplace_test_job(uuid,uuid,uuid[],text,text,text,text,numeric,text,boolean)
from public,anon;
grant execute on function public.admin_create_marketplace_test_job(uuid,uuid,uuid[],text,text,text,text,numeric,text,boolean)
to authenticated;

-- Listado administrativo compacto: separado de los servicios reales.
create or replace function public.admin_list_marketplace_test_jobs(
  target_project_id uuid, target_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view');
  perform app_private.require_project_permission(target_project_id,'settings.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'job_id',v.job_id,
      'status',v.status,'created_at',v.created_at,
      'service_code',v.service_code,'origin_text',v.origin_text,
      'destination_text',v.destination_text,'final_price',v.final_price,
      'recipient_count',v.recipient_count,'destination_mode',v.destination_mode,
      'accepted_driver_user_id',v.assigned_driver_user_id,
      'recipients',v.recipients,'notification_status',v.notification_status,
      'deleted',v.deleted_at is not null
    ) order by v.created_at desc,v.job_id desc)
    from (
      select t.job_id,j.status,j.created_at,j.service_code,
        sr.origin_text,sr.destination_text,j.final_price,
        t.recipient_count,t.destination_mode,j.assigned_driver_user_id,
        j.test_deleted_at as deleted_at,
        (select coalesce(jsonb_agg(jsonb_build_object(
          'driver_user_id',r.driver_user_id,
          'display_name',coalesce(p.display_name,'Conductor'))
          order by p.display_name),'[]'::jsonb)
         from public.marketplace_test_job_recipients r
         left join public.profiles p on p.id=r.driver_user_id
         where r.project_id=j.project_id and r.job_id=j.id) as recipients,
        (select coalesce(jsonb_agg(jsonb_build_object(
          'driver_user_id',o.user_id,'delivery_status',o.delivery_status,
          'attempt_count',o.attempt_count)),'[]'::jsonb)
         from public.notification_outbox o
         where o.project_id=j.project_id
           and o.dedupe_key='marketplace-job:'||j.id::text) as notification_status
      from public.marketplace_admin_test_jobs t
      join public.jobs j on j.project_id=t.project_id and j.id=t.job_id
      join public.service_requests sr on sr.project_id=j.project_id
        and sr.id=j.service_request_id
      where t.project_id=target_project_id
        and j.is_test
      order by j.created_at desc,j.id desc
      limit least(greatest(coalesce(target_limit,30),1),100)
    ) v
  ),'[]'::jsonb);
end;
$function$;
revoke all on function public.admin_list_marketplace_test_jobs(uuid,integer) from public,anon;
grant execute on function public.admin_list_marketplace_test_jobs(uuid,integer) to authenticated;

-- El cliente ficticio interno NO debe contaminar el directorio de Clientes.
-- Compatibilidad con los listados administrativos antiguos y V2.
do $filter_test_customers$
declare
  signature text;
  fn text;
  needle text := 'where c.project_id = target_project_id';
  replacement text := 'where c.project_id = target_project_id
      and not exists (
        select 1 from public.marketplace_admin_test_customers tc
        where tc.project_id=c.project_id and tc.customer_id=c.id
      )';
  n integer;
begin
  foreach signature in array array[
    'public.admin_list_marketplace_customers_v2(uuid,text,text,integer,timestamptz,bigint,uuid)',
    'public.admin_list_marketplace_customers(uuid,integer,timestamptz,uuid)'
  ] loop
    fn := pg_catalog.pg_get_functiondef(signature::regprocedure);
    n := (length(fn)-length(replace(fn,needle,'')))/length(needle);
    if n <> 2 then raise exception 'TEST_LAB_CUSTOMER_DIRECTORY_CONTRACT_CHANGED: %',signature; end if;
    execute replace(fn,needle,replacement);
  end loop;
end;
$filter_test_customers$;
