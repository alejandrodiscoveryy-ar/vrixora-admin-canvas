-- P0-C: national preinvoice-first billing flow.

alter table public.payments
  add column if not exists preinvoice_id uuid,
  add column if not exists is_test boolean not null default false,
  add column if not exists billing_snapshot jsonb;

alter table public.preinvoices add column if not exists exchange_rate_updated_at timestamptz;
update public.preinvoices set exchange_rate_updated_at=issued_at where exchange_rate_updated_at is null;
alter table public.preinvoices alter column exchange_rate_updated_at set not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='payments_preinvoice_id_fkey') then
    alter table public.payments add constraint payments_preinvoice_id_fkey
      foreign key(preinvoice_id) references public.preinvoices(id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='payments_billing_snapshot_object') then
    alter table public.payments add constraint payments_billing_snapshot_object
      check(billing_snapshot is null or jsonb_typeof(billing_snapshot)='object');
  end if;
end $$;

create unique index if not exists payments_preinvoice_uidx
  on public.payments(preinvoice_id) where preinvoice_id is not null;
create index if not exists payments_project_real_paid_idx
  on public.payments(project_id,charged_at desc) where status='paid' and not is_test;

alter table public.billing_receipts alter column license_id drop not null;

create or replace function app_private.p0a_guard_preinvoice_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id
     or new.plan_code is distinct from old.plan_code or new.base_price is distinct from old.base_price
     or new.base_currency is distinct from old.base_currency or new.exchange_rate is distinct from old.exchange_rate
     or new.exchange_rate_source is distinct from old.exchange_rate_source
     or new.exchange_rate_updated_at is distinct from old.exchange_rate_updated_at
     or new.charge_currency is distinct from old.charge_currency or new.charge_amount is distinct from old.charge_amount
     or new.is_test is distinct from old.is_test or new.identity_snapshot is distinct from old.identity_snapshot
     or new.plan_snapshot is distinct from old.plan_snapshot or new.issued_at is distinct from old.issued_at
     or new.expires_at is distinct from old.expires_at or new.created_by is distinct from old.created_by then
    raise exception 'PREINVOICE_SNAPSHOT_IMMUTABLE' using errcode='22023';
  end if;
  return new;
end;
$$;

create or replace function app_private.p0c_guard_payment_provenance()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.preinvoice_id is distinct from old.preinvoice_id
     or new.is_test is distinct from old.is_test
     or new.billing_snapshot is distinct from old.billing_snapshot then
    raise exception 'PAYMENT_PROVENANCE_IMMUTABLE' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists p0c_guard_payment_provenance on public.payments;
create trigger p0c_guard_payment_provenance before update on public.payments
for each row execute function app_private.p0c_guard_payment_provenance();

create or replace function public.admin_create_preinvoice(
  target_project_id uuid, target_client_id uuid, target_plan_code text,
  target_charge_currency text default null, target_exchange_rate numeric default null,
  target_rate_source text default null, target_is_test boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; plan public.license_plans%rowtype; exchange public.project_exchange_settings%rowtype;
  test_mode boolean; issued timestamptz:=now(); created_id uuid; applied_rate numeric; applied_currency text;
begin
  actor:=app_private.require_project_permission(target_project_id,'payments.manage');
  if not exists(select 1 from public.profiles profile where profile.id=target_client_id)
     or not exists(
       select 1 from public.licenses license where license.project_id=target_project_id and license.user_id=target_client_id
       union all select 1 from public.payments payment where payment.project_id=target_project_id and payment.user_id=target_client_id
       union all select 1 from public.commercial_leads lead where lead.project_id=target_project_id
         and lead.user_id=target_client_id and lead.archived_at is null
     ) then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;
  select * into plan from public.license_plans where project_id=target_project_id and code=target_plan_code;
  if not found then raise exception 'PLAN_NOT_FOUND' using errcode='P0002'; end if;
  if plan.license_type in ('trial','admin') or plan.price<=0 then
    raise exception 'PLAN_NOT_BILLABLE' using errcode='22023';
  end if;
  if not plan.active then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode='P0002'; end if;
  select * into exchange from public.project_exchange_settings where project_id=target_project_id;
  if not found then raise exception 'EXCHANGE_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  select enabled into test_mode from public.project_test_settings where project_id=target_project_id;
  if coalesce(target_is_test,false) and not coalesce(test_mode,false) then
    raise exception 'TEST_MODE_DISABLED' using errcode='42501';
  end if;
  applied_currency:=coalesce(target_charge_currency,exchange.charge_currency);
  applied_rate:=coalesce(target_exchange_rate,exchange.current_rate);
  if applied_currency not in ('CUP','USD','EUR') or applied_rate<=0 then
    raise exception 'INVALID_EXCHANGE_RATE' using errcode='22023';
  end if;
  if plan.currency<>exchange.base_currency or applied_currency<>exchange.charge_currency
     or applied_rate<>exchange.current_rate
     or (target_rate_source is not null and btrim(target_rate_source)<>exchange.rate_source) then
    raise exception 'STALE_OR_MISMATCHED_EXCHANGE_SETTINGS' using errcode='22023';
  end if;
  insert into public.preinvoices(project_id,client_id,plan_code,base_price,base_currency,exchange_rate,
    exchange_rate_source,exchange_rate_updated_at,charge_currency,charge_amount,is_test,identity_snapshot,plan_snapshot,
    issued_at,expires_at,created_by)
  values(target_project_id,target_client_id,plan.code,plan.price,plan.currency,applied_rate,
    coalesce(nullif(btrim(target_rate_source),''),exchange.rate_source),exchange.rate_updated_at,applied_currency,
    round(plan.price*applied_rate,2),coalesce(target_is_test,false),
    app_private.p0a_document_identity_snapshot(target_project_id),
    jsonb_build_object('code',plan.code,'name',plan.name,'license_type',plan.license_type,
      'duration_days',plan.duration_days,'max_devices',plan.max_devices,'features',plan.features),
    issued,issued+interval '48 hours',actor)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.admin_preview_preinvoice_confirmation(
  target_project_id uuid,target_preinvoice_id uuid,target_charged_at timestamptz
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare invoice public.preinvoices%rowtype; current_license public.licenses%rowtype;
  preview jsonb; effective_at timestamptz:=coalesce(target_charged_at,now());
  duration integer; new_start timestamptz; new_expiry timestamptz;
begin
  perform app_private.require_project_permission(target_project_id,'payments.manage');
  select * into invoice from public.preinvoices where id=target_preinvoice_id and project_id=target_project_id;
  if not found then raise exception 'PREINVOICE_NOT_FOUND' using errcode='P0002'; end if;
  select * into current_license from public.licenses where project_id=target_project_id and user_id=invoice.client_id;
  duration:=nullif(invoice.plan_snapshot->>'duration_days','')::integer;
  if found then
    new_start:=case when current_license.license_type<>'trial' and current_license.status='active'
      and current_license.expires_at>effective_at then current_license.expires_at else effective_at end;
    new_expiry:=case when duration is null then null else new_start+make_interval(days=>duration) end;
    preview:=jsonb_build_object('license_id',current_license.id,'previous_plan',current_license.plan,
      'new_plan',invoice.plan_code,'license_type',invoice.plan_snapshot->>'license_type',
      'previous_expires_at',current_license.expires_at,'new_started_at',new_start,
      'new_expires_at',new_expiry,'duration_days',duration,
      'max_devices',(invoice.plan_snapshot->>'max_devices')::integer,'application_rule','after_expiry',
      'is_trial_conversion',current_license.license_type='trial');
  else
    preview:=jsonb_build_object(
      'license_id',null,'previous_plan',null,'new_plan',invoice.plan_code,
      'license_type',invoice.plan_snapshot->>'license_type','previous_expires_at',null,
      'new_started_at',effective_at,
      'new_expires_at',case when invoice.plan_snapshot->>'duration_days' is null then null
        else effective_at+make_interval(days=>(invoice.plan_snapshot->>'duration_days')::integer) end,
      'duration_days',(invoice.plan_snapshot->>'duration_days')::integer,
      'max_devices',(invoice.plan_snapshot->>'max_devices')::integer,
      'application_rule','apply_now','is_trial_conversion',false
    );
  end if;
  return preview||jsonb_build_object(
    'preinvoice_id',invoice.id,'client_id',invoice.client_id,'plan_name',coalesce(invoice.plan_snapshot->>'name',invoice.plan_code),
    'expected_amount',invoice.charge_amount,'currency',invoice.charge_currency,
    'base_price',invoice.base_price,'base_currency',invoice.base_currency,
    'exchange_rate',invoice.exchange_rate,'exchange_rate_source',invoice.exchange_rate_source,
    'issued_at',invoice.issued_at,'expires_at',invoice.expires_at,'is_test',invoice.is_test
  );
end;
$$;

create or replace function public.admin_confirm_preinvoice_payment(
  target_project_id uuid,target_preinvoice_id uuid,target_received_amount numeric,target_currency text,
  target_method text,target_reference text,target_charged_at timestamptz,target_notes text,
  target_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; invoice public.preinvoices%rowtype; current_license public.licenses%rowtype;
  updated_license public.licenses%rowtype; preview jsonb;
  payment public.payments%rowtype; receipt public.billing_receipts%rowtype;
  client public.profiles%rowtype; operator_email text; identity jsonb; snapshot jsonb;
  resolved_reference text; receipt_id uuid:=gen_random_uuid(); license_exists boolean; previous_license_type text;
  snapshot_license_type text; snapshot_duration integer; snapshot_max_devices integer;
  snapshot_features jsonb; new_start timestamptz; new_expiry timestamptz;
begin
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  select * into receipt from public.billing_receipts where idempotency_key=target_idempotency_key;
  if found then
    perform app_private.require_project_permission(receipt.project_id,'payments.manage');
    return receipt.snapshot;
  end if;
  select * into invoice from public.preinvoices
  where id=target_preinvoice_id and project_id=target_project_id for update;
  if not found then raise exception 'PREINVOICE_NOT_FOUND' using errcode='P0002'; end if;
  actor:=app_private.require_project_permission(target_project_id,'payments.manage');
  if invoice.status='paid' then
    select * into receipt from public.billing_receipts where payment_id=invoice.paid_payment_id;
    if found then return receipt.snapshot; end if;
    raise exception 'PREINVOICE_ALREADY_PAID' using errcode='22023';
  end if;
  if invoice.status='cancelled' then raise exception 'PREINVOICE_FINAL' using errcode='22023'; end if;
  if target_charged_at is null or target_charged_at>now()+interval '5 minutes'
     or target_charged_at<invoice.issued_at or target_charged_at>invoice.expires_at then
    if invoice.expires_at<=now() then update public.preinvoices set status='expired',updated_at=now() where id=invoice.id; end if;
    raise exception 'PAYMENT_OUTSIDE_PREINVOICE_VALIDITY' using errcode='22023';
  end if;
  if target_received_amount<>invoice.charge_amount or target_currency<>invoice.charge_currency then
    raise exception 'PREINVOICE_PAYMENT_MISMATCH' using errcode='22023';
  end if;
  if target_method not in ('cash','transfer','other') then raise exception 'INVALID_PAYMENT_METHOD' using errcode='22023'; end if;
  snapshot_license_type:=invoice.plan_snapshot->>'license_type';
  snapshot_duration:=nullif(invoice.plan_snapshot->>'duration_days','')::integer;
  snapshot_max_devices:=(invoice.plan_snapshot->>'max_devices')::integer;
  snapshot_features:=coalesce(invoice.plan_snapshot->'features','{}'::jsonb);
  if snapshot_license_type is null or snapshot_license_type in ('trial','admin')
     or snapshot_max_devices is null or invoice.base_price<=0 then
    raise exception 'PLAN_NOT_BILLABLE' using errcode='22023';
  end if;
  select * into client from public.profiles where id=invoice.client_id;
  if not found then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;
  select * into current_license from public.licenses
    where project_id=target_project_id and user_id=invoice.client_id for update;
  license_exists:=found;
  previous_license_type:=current_license.license_type;
  new_start:=case when license_exists and current_license.license_type<>'trial'
    and current_license.status='active' and current_license.expires_at>target_charged_at
    then current_license.expires_at else target_charged_at end;
  new_expiry:=case when snapshot_duration is null then null
    else new_start+make_interval(days=>snapshot_duration) end;
  if invoice.is_test then
    preview:=jsonb_build_object('previous_plan',case when license_exists then current_license.plan else null end,
      'previous_expires_at',case when license_exists then current_license.expires_at else null end,
      'new_started_at',new_start,'new_expires_at',new_expiry,
      'application_rule',case when license_exists then 'after_expiry' else 'apply_now' end);
  elsif license_exists then
    preview:=jsonb_build_object('previous_plan',current_license.plan,'previous_expires_at',current_license.expires_at,
      'new_started_at',new_start,'new_expires_at',new_expiry,'application_rule','after_expiry');
  else
    insert into public.licenses(project_id,user_id,license_key,license_type,plan,status,activated_at,expires_at,
      duration_days,max_devices,features,created_by,notes)
    values(target_project_id,invoice.client_id,app_private.generate_license_key(),snapshot_license_type,invoice.plan_code,
      'active',new_start,new_expiry,snapshot_duration,snapshot_max_devices,snapshot_features,
      actor,'Licencia creada al confirmar prefactura') returning * into current_license;
    preview:=jsonb_build_object('previous_plan',null,'previous_expires_at',null,
      'new_started_at',current_license.activated_at,'new_expires_at',current_license.expires_at,
      'application_rule','apply_now');
  end if;
  resolved_reference:=coalesce(nullif(btrim(target_reference),''),
    'PF-'||invoice.number::text||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)));
  insert into public.payments(project_id,user_id,license_id,plan,list_price,discount,amount,currency,
    method,reference,status,recorded_by,notes,charged_at,idempotency_key,license_applied_at,
    preinvoice_id,is_test,billing_snapshot)
  values(target_project_id,invoice.client_id,current_license.id,
    invoice.plan_code,invoice.charge_amount,0,invoice.charge_amount,invoice.charge_currency,target_method,
    resolved_reference,'paid',actor,nullif(btrim(target_notes),''),target_charged_at,target_idempotency_key,
    case when invoice.is_test then null else now() end,invoice.id,invoice.is_test,
    jsonb_build_object('base_price',invoice.base_price,'base_currency',invoice.base_currency,
      'exchange_rate',invoice.exchange_rate,'exchange_rate_source',invoice.exchange_rate_source,
      'rate_updated_at',invoice.exchange_rate_updated_at,'charge_amount',invoice.charge_amount,
      'charge_currency',invoice.charge_currency,'plan_snapshot',invoice.plan_snapshot))
  returning * into payment;
  if not invoice.is_test then
    update public.licenses set plan=invoice.plan_code,license_type=snapshot_license_type,status='active',
      activated_at=(preview->>'new_started_at')::timestamptz,
      expires_at=nullif(preview->>'new_expires_at','')::timestamptz,duration_days=snapshot_duration,
      max_devices=snapshot_max_devices,features=snapshot_features,revoked_at=null,last_renewed_at=now(),
      last_payment_id=payment.id,updated_at=now() where id=current_license.id returning * into updated_license;
  else updated_license:=current_license; end if;
  select email into operator_email from public.profiles where id=actor;
  identity:=app_private.p0a_document_identity_snapshot(target_project_id);
  snapshot:=jsonb_build_object(
    'receipt_id',receipt_id,'receipt_number','VRX-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(payment.id::text,'-',''),1,8)),
    'payment_id',payment.id,'preinvoice_id',invoice.id,'license_id',updated_license.id,'project_id',target_project_id,
    'project_name',identity->>'name','identity_snapshot',identity,
    'client_name',coalesce(client.display_name,client.email),'client_email',client.email,
    'masked_license_key',case when updated_license.id is null then 'Sin licencia (prueba)' else 'VRX-****-'||right(updated_license.license_key,4) end,
    'previous_plan',preview->>'previous_plan','plan',invoice.plan_code,
    'plan_name',coalesce(invoice.plan_snapshot->>'name',invoice.plan_code),
    'duration_days',(invoice.plan_snapshot->>'duration_days')::integer,
    'list_price',invoice.base_price,'amount',invoice.charge_amount,'currency',invoice.charge_currency,
    'method',payment.method,'reference',payment.reference,'charged_at',payment.charged_at,
    'started_at',preview->>'new_started_at','expires_at',preview->>'new_expires_at',
    'status',case when invoice.is_test then 'test' else updated_license.status end,
    'max_devices',(invoice.plan_snapshot->>'max_devices')::integer,'operator_email',operator_email,
    'notes',payment.notes,'whatsapp',identity->>'whatsapp','support_email',identity->>'support_email',
    'application_rule',preview->>'application_rule','is_test',invoice.is_test,
    'base_price',invoice.base_price,'base_currency',invoice.base_currency,'exchange_rate',invoice.exchange_rate,
    'exchange_rate_source',invoice.exchange_rate_source,'rate_updated_at',invoice.exchange_rate_updated_at
  );
  insert into public.billing_receipts(id,project_id,payment_id,license_id,user_id,idempotency_key,
    receipt_number,snapshot,created_by)
  values(receipt_id,target_project_id,payment.id,updated_license.id,invoice.client_id,target_idempotency_key,
    snapshot->>'receipt_number',snapshot,actor) returning * into receipt;
  update public.preinvoices set status='paid',paid_payment_id=payment.id,updated_at=now() where id=invoice.id;
  if not invoice.is_test then
    insert into public.license_audit_log(project_id,license_id,action,detail,actor_id,metadata)
    values(target_project_id,updated_license.id,
      case when preview->>'previous_plan' is null then 'license_created_from_preinvoice'
        when previous_license_type='trial' then 'trial_converted' else 'license_renewed' end,
      'Prefactura confirmada: pago, licencia y recibo en una transacción',actor,
      jsonb_build_object('preinvoice_id',invoice.id,'payment_id',payment.id,'receipt_id',receipt.id,
        'previous_expires_at',preview->>'previous_expires_at','new_expires_at',updated_license.expires_at,
        'amount',payment.amount,'currency',payment.currency));
  end if;
  return snapshot;
exception when unique_violation then
  select * into receipt from public.billing_receipts where idempotency_key=target_idempotency_key;
  if found then return receipt.snapshot; end if;
  select billing_receipt.* into receipt from public.billing_receipts billing_receipt
    join public.payments existing_payment on existing_payment.id=billing_receipt.payment_id
    where existing_payment.preinvoice_id=target_preinvoice_id;
  if found then return receipt.snapshot; end if;
  raise;
end;
$$;

create or replace function app_private.p0c_guard_real_referral_reward()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not new.is_test and exists(
    select 1 from public.payments payment
    where payment.id=new.qualifying_payment_id and payment.is_test
  ) then
    raise exception 'TEST_PAYMENT_CANNOT_EARN_REAL_REFERRAL_REWARD' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists p0c_guard_real_referral_reward on public.referral_reward_ledger;
create trigger p0c_guard_real_referral_reward before insert or update on public.referral_reward_ledger
for each row execute function app_private.p0c_guard_real_referral_reward();

create or replace function app_private.track_payment_analytics()
returns trigger language plpgsql security definer set search_path='' as $$
declare payment_row public.payments%rowtype;
begin
  payment_row:=case when tg_op='DELETE' then old else new end;
  delete from public.analytics_events
  where project_id=payment_row.project_id and event_name='payment_confirmed'
    and dedupe_key='payment:'||payment_row.id::text;
  if tg_op<>'DELETE' and not new.is_test and new.status='paid' and new.voided_at is null then
    perform app_private.insert_analytics_event(new.project_id,new.user_id,new.license_id,'payment_confirmed',
      coalesce(new.created_at,now()),null,null,null,null,null,null,null,null,new.plan,null,
      'payment:'||new.id::text,jsonb_build_object('amount',new.amount,'currency',new.currency,'payment_id',new.id));
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function app_private.p0c_guard_plan_with_open_preinvoice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.preinvoices invoice where invoice.project_id=old.project_id
      and invoice.plan_code=old.code and invoice.status in ('prepared','sent','pending')
      and invoice.expires_at>now()) then
    raise exception 'PLAN_HAS_ACTIVE_PREINVOICES' using errcode='23503';
  end if;
  return old;
end;
$$;

drop trigger if exists p0c_guard_plan_with_open_preinvoice on public.license_plans;
create trigger p0c_guard_plan_with_open_preinvoice before delete on public.license_plans
for each row execute function app_private.p0c_guard_plan_with_open_preinvoice();

drop function if exists public.admin_list_license_payments(uuid);
create function public.admin_list_license_payments(target_project_id uuid)
returns table(id uuid,user_email text,license_key text,plan text,plan_name text,list_price numeric,
  discount numeric,amount numeric,currency text,method text,reference text,paid_status text,
  recorded_by uuid,notes text,created_at timestamptz,license_id uuid,operator_label text,
  has_receipt boolean,preinvoice_id uuid,is_test boolean)
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_project_permission(target_project_id,'payments.view');
  return query select payment.id,client.email,license.license_key,payment.plan,
    coalesce(plan.name,receipt.snapshot->>'plan_name',payment.plan),payment.list_price,payment.discount,
    payment.amount,payment.currency,payment.method,payment.reference,payment.status,payment.recorded_by,
    payment.notes,payment.created_at,payment.license_id,
    coalesce(operator_profile.display_name,operator_profile.email,payment.recorded_by::text),
    receipt.id is not null,payment.preinvoice_id,payment.is_test
  from public.payments payment join public.profiles client on client.id=payment.user_id
  left join public.licenses license on license.id=payment.license_id
  left join public.license_plans plan on plan.project_id=payment.project_id and plan.code=payment.plan
  left join public.profiles operator_profile on operator_profile.id=payment.recorded_by
  left join public.billing_receipts receipt on receipt.payment_id=payment.id
  where payment.project_id=target_project_id order by payment.created_at desc;
end;
$$;

revoke all on function app_private.p0c_guard_payment_provenance(),app_private.p0c_guard_real_referral_reward(),
  app_private.track_payment_analytics(),app_private.p0c_guard_plan_with_open_preinvoice()
  from public,anon,authenticated;
revoke all on function public.admin_preview_preinvoice_confirmation(uuid,uuid,timestamptz),
  public.admin_confirm_preinvoice_payment(uuid,uuid,numeric,text,text,text,timestamptz,text,uuid),
  public.admin_list_license_payments(uuid) from public,anon;
grant execute on function public.admin_preview_preinvoice_confirmation(uuid,uuid,timestamptz),
  public.admin_confirm_preinvoice_payment(uuid,uuid,numeric,text,text,text,timestamptz,text,uuid),
  public.admin_list_license_payments(uuid) to authenticated;
