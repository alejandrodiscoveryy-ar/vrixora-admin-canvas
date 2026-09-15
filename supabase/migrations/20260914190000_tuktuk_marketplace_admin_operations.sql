-- TukTuk Marketplace V1, Block 8A: administrative operations and incident closure.

insert into public.project_permissions(code, name, category) values
  ('marketplace.view', 'Ver operación de Trabajos', 'marketplace'),
  ('marketplace.manage', 'Gestionar operación de Trabajos', 'marketplace')
on conflict (code) do update set name = excluded.name, category = excluded.category;

insert into public.project_role_permissions(role_code, permission_code) values
  ('owner', 'marketplace.view'), ('owner', 'marketplace.manage'),
  ('admin', 'marketplace.view'), ('admin', 'marketplace.manage'),
  ('support', 'marketplace.view'), ('support', 'marketplace.manage'),
  ('accounting', 'marketplace.view')
on conflict do nothing;

delete from public.project_role_permissions
where permission_code in ('marketplace.view', 'marketplace.manage')
  and (role_code, permission_code) not in (
    ('owner', 'marketplace.view'), ('owner', 'marketplace.manage'),
    ('admin', 'marketplace.view'), ('admin', 'marketplace.manage'),
    ('support', 'marketplace.view'), ('support', 'marketplace.manage'),
    ('accounting', 'marketplace.view')
  );

create table public.marketplace_incident_resolutions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  driver_user_id uuid not null,
  billing_mode text not null check (billing_mode in ('trial_free', 'wallet_commission')),
  resolution text not null check (resolution in ('completed', 'cancelled')),
  resolution_note text not null check (nullif(btrim(resolution_note), '') is not null),
  commission_amount_snapshot numeric(14,2) not null check (commission_amount_snapshot >= 0),
  resolution_idempotency_key uuid not null,
  ledger_transaction_id uuid,
  resolved_by uuid not null references auth.users(id) on delete restrict,
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, id), unique (project_id, job_id), unique (project_id, resolution_idempotency_key),
  foreign key (project_id, job_id) references public.jobs(project_id, id) on delete restrict,
  foreign key (project_id, driver_user_id, ledger_transaction_id)
    references public.wallet_transactions(project_id, user_id, id) on delete restrict
);

create or replace function app_private.prevent_marketplace_incident_resolution_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin raise exception 'MARKETPLACE_INCIDENT_RESOLUTION_IMMUTABLE' using errcode = '42501'; end;
$$;
revoke all on function app_private.prevent_marketplace_incident_resolution_mutation() from public, anon, authenticated;
create trigger marketplace_incident_resolutions_immutable before update or delete on public.marketplace_incident_resolutions
for each row execute function app_private.prevent_marketplace_incident_resolution_mutation();
create trigger audit_marketplace_incident_resolutions after insert on public.marketplace_incident_resolutions
for each row execute function app_private.capture_audit_event();
create trigger audit_marketplace_driver_profiles after insert or update on public.driver_profiles
for each row execute function app_private.capture_audit_event();
alter table public.marketplace_incident_resolutions enable row level security;
revoke all on public.marketplace_incident_resolutions from public, anon, authenticated;

create or replace function public.admin_get_marketplace_overview(target_project_id uuid)
returns table(server_time timestamptz, drivers_total bigint, drivers_active bigint, drivers_suspended bigint,
  drivers_trial_active bigint, drivers_post_trial_active bigint, jobs_published bigint, jobs_active bigint,
  jobs_incident_open bigint, jobs_incident_resolved bigint, pending_topups bigint)
language plpgsql security definer set search_path = '' as $$
declare can_pay boolean;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  can_pay := app_private.has_project_permission(target_project_id, 'payments.view');
  return query select now(),
    count(*)::bigint, count(*) filter(where d.status='active' and d.suspended_at is null)::bigint,
    count(*) filter(where d.status='suspended')::bigint,
    count(*) filter(where d.status='active' and d.suspended_at is null and exists(select 1 from public.marketplace_work_trials t where t.project_id=d.project_id and t.user_id=d.user_id and t.started_at<=now() and now()<t.ends_at))::bigint,
    count(*) filter(where d.status='active' and d.suspended_at is null and not exists(select 1 from public.marketplace_work_trials t where t.project_id=d.project_id and t.user_id=d.user_id and t.started_at<=now() and now()<t.ends_at) and app_private.has_confirmed_marketplace_initial_deposit(d.user_id))::bigint,
    (select count(*) from public.jobs j where j.project_id=target_project_id and j.status='published')::bigint,
    (select count(*) from public.jobs j where j.project_id=target_project_id and j.status in ('accepted','en_route','pickup','in_progress','completed'))::bigint,
    (select count(*) from public.jobs j left join public.marketplace_incident_resolutions r on r.project_id=j.project_id and r.job_id=j.id where j.project_id=target_project_id and j.status='incident' and r.id is null)::bigint,
    (select count(*) from public.marketplace_incident_resolutions r where r.project_id=target_project_id)::bigint,
    case when can_pay then (select count(*) from public.topups t where t.project_id=target_project_id and t.status='requested')::bigint else null end
  from public.driver_profiles d where d.project_id=target_project_id;
end;
$$;

create or replace function public.admin_list_marketplace_drivers(target_project_id uuid, target_limit integer default 100,
  target_before_created_at timestamptz default null, target_before_user_id uuid default null)
returns table(user_id uuid, display_name text, phone text, status text, activated_at timestamptz, suspended_at timestamptz,
  suspension_reason text, created_at timestamptz, trial_started_at timestamptz, trial_ends_at timestamptz, trial_active boolean,
  initial_deposit_confirmed boolean, vehicle_id text, vehicle_name text, vehicle_status text, vehicle_category_code text,
  vehicle_propulsion_code text, vehicle_brand text, vehicle_model text, is_active_assignment boolean, is_available boolean,
  services jsonb, wallet_total_balance numeric, wallet_reserved_balance numeric, wallet_available_balance numeric)
language plpgsql security definer set search_path = '' as $$
declare can_pay boolean;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  if (target_before_created_at is null) <> (target_before_user_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
  can_pay := app_private.has_project_permission(target_project_id, 'payments.view');
  return query select d.user_id, p.display_name, p.phone, d.status, d.activated_at, d.suspended_at, d.suspension_reason, d.created_at,
    t.started_at, t.ends_at, coalesce(t.started_at<=now() and now()<t.ends_at, false), w.initial_deposit_confirmed_at is not null,
    a.vehicle_id, v.name, v.marketplace_status, v.category_code, v.propulsion_code, v.brand, v.model, a.is_active, a.is_available,
    coalesce((select jsonb_agg(s.service_code order by s.service_code) from public.vehicle_services s where s.project_id=d.project_id and s.vehicle_id=a.vehicle_id and s.enabled), '[]'::jsonb),
    case when can_pay then app_private.marketplace_wallet_total_balance(d.project_id,d.user_id) end,
    case when can_pay then app_private.marketplace_wallet_reserved_balance(d.project_id,d.user_id) end,
    case when can_pay then app_private.marketplace_wallet_available_balance(d.project_id,d.user_id) end
  from public.driver_profiles d join public.profiles p on p.id=d.user_id
  left join public.marketplace_work_trials t on t.project_id=d.project_id and t.user_id=d.user_id
  left join public.wallets w on w.project_id=d.project_id and w.user_id=d.user_id
  left join public.driver_vehicle_assignments a on a.project_id=d.project_id and a.driver_user_id=d.user_id
  left join public.vehicles v on v.project_id=a.project_id and v.id=a.vehicle_id
  where d.project_id=target_project_id and (target_before_created_at is null or (d.created_at,d.user_id)<(target_before_created_at,target_before_user_id))
  order by d.created_at desc,d.user_id desc limit least(greatest(coalesce(target_limit,100),1),200);
end;
$$;

create or replace function public.admin_list_marketplace_jobs(target_project_id uuid, target_status text default null, target_service_code text default null,
  target_limit integer default 100, target_before_created_at timestamptz default null, target_before_job_id uuid default null)
returns table(job_id uuid,status text,service_code text,origin_text text,destination_text text,scheduled_for timestamptz,final_price numeric,currency text,published_at timestamptz,expires_at timestamptz,created_at timestamptz,customer_display_name text,customer_whatsapp_phone text,driver_user_id uuid,driver_display_name text,driver_phone text,vehicle_id text,vehicle_name text,billing_mode text,commission_amount_snapshot numeric,reservation_status text,incident_from_status text,incident_opened_at timestamptz,incident_reason text)
language plpgsql security definer set search_path = '' as $$
declare can_customers boolean;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  if (target_before_created_at is null) <> (target_before_job_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
  can_customers := app_private.has_project_permission(target_project_id, 'customers.view');
  return query select j.id,j.status,j.service_code,r.origin_text,r.destination_text,r.scheduled_for,j.final_price,j.currency,j.published_at,j.expires_at,j.created_at,
    case when can_customers then c.display_name end,case when can_customers then c.whatsapp_phone end,a.driver_user_id,p.display_name,p.phone,a.vehicle_id,v.name,a.billing_mode,a.commission_amount_snapshot,cr.status,j.incident_from_status,j.incident_opened_at,j.incident_reason
  from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id join public.customers c on c.project_id=r.project_id and c.id=r.customer_id
  left join public.job_assignments a on a.project_id=j.project_id and a.job_id=j.id left join public.commission_reservations cr on cr.project_id=j.project_id and cr.job_id=j.id
  left join public.profiles p on p.id=a.driver_user_id left join public.vehicles v on v.project_id=j.project_id and v.id=a.vehicle_id
  where j.project_id=target_project_id and (target_status is null or j.status=target_status) and (target_service_code is null or j.service_code=target_service_code)
    and (target_before_created_at is null or (j.created_at,j.id)<(target_before_created_at,target_before_job_id))
  order by j.created_at desc,j.id desc limit least(greatest(coalesce(target_limit,100),1),200);
end;
$$;

create or replace function public.admin_get_marketplace_job_detail(target_project_id uuid, target_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare can_customers boolean; can_pay boolean; result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view'); can_customers:=app_private.has_project_permission(target_project_id,'customers.view'); can_pay:=app_private.has_project_permission(target_project_id,'payments.view');
  select jsonb_build_object(
    'job',jsonb_build_object('job_id',j.id,'status',j.status,'service_code',j.service_code,'final_price',j.final_price,'currency',j.currency,'published_at',j.published_at,'expires_at',j.expires_at,'created_at',j.created_at,'incident_from_status',j.incident_from_status,'incident_opened_at',j.incident_opened_at,'incident_reason',j.incident_reason),
    'service_request',jsonb_build_object('service_code',sr.service_code,'origin_text',sr.origin_text,'destination_text',sr.destination_text,'scheduled_for',sr.scheduled_for,'passenger_count',sr.passenger_count,'cargo_weight_kg',sr.cargo_weight_kg,'cargo_volume_m3',sr.cargo_volume_m3,'cargo_length_cm',sr.cargo_length_cm,'cargo_width_cm',sr.cargo_width_cm,'cargo_height_cm',sr.cargo_height_cm,'required_body_type',sr.required_body_type,'created_at',sr.created_at,'customer_id',case when can_customers then sr.customer_id end,'notes',case when can_customers then sr.notes end),
    'assignment',case when a.id is null then null else jsonb_build_object('driver_user_id',a.driver_user_id,'vehicle_id',a.vehicle_id,'accepted_at',a.accepted_at,'completed_at',a.completed_at,'cancelled_at',a.cancelled_at,'billing_mode',a.billing_mode,'commission_amount_snapshot',case when can_pay then a.commission_amount_snapshot end) end,
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('event_id',e.id,'from_status',e.from_status,'to_status',e.to_status,'action',e.action,'actor_kind',e.actor_kind,'actor_user_id',e.actor_user_id,'reason',e.reason,'created_at',e.created_at,'customer_id',case when can_customers then e.customer_id end,'metadata',case when e.action='incident_resolved' then jsonb_build_object('resolution',e.metadata->'resolution','resolution_id',e.metadata->'resolution_id') else '{}'::jsonb end) order by e.created_at,e.id) from public.job_events e where e.project_id=j.project_id and e.job_id=j.id),'[]'::jsonb),
    'incident_resolution',case when ir.id is null then null else jsonb_build_object('resolution_id',ir.id,'resolution',ir.resolution,'resolution_note',ir.resolution_note,'resolved_at',ir.resolved_at,'resolved_by',ir.resolved_by,'ledger_transaction_id',case when can_pay then ir.ledger_transaction_id end) end,
    'customer',case when can_customers then jsonb_build_object('customer_id',c.id,'display_name',c.display_name,'whatsapp_phone',c.whatsapp_phone) else null end,
    'financial',case when can_pay and cr.id is not null then jsonb_build_object('reservation_id',cr.id,'reservation_status',cr.status,'amount',cr.amount,'currency',cr.currency,'opened_at',cr.opened_at,'consumed_at',cr.consumed_at,'released_at',cr.released_at,'release_reason',cr.release_reason,'ledger_transaction_id',cr.ledger_transaction_id) else null end)
  into result from public.jobs j join public.service_requests sr on sr.project_id=j.project_id and sr.id=j.service_request_id join public.customers c on c.project_id=sr.project_id and c.id=sr.customer_id
  left join public.job_assignments a on a.project_id=j.project_id and a.job_id=j.id left join public.commission_reservations cr on cr.project_id=j.project_id and cr.job_id=j.id left join public.marketplace_incident_resolutions ir on ir.project_id=j.project_id and ir.job_id=j.id
  where j.project_id=target_project_id and j.id=target_job_id;
  if result is null then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if; return result;
end;
$$;

create or replace function public.admin_list_marketplace_customers(target_project_id uuid,target_limit integer default 100,target_before_created_at timestamptz default null,target_before_customer_id uuid default null)
returns table(customer_id uuid,display_name text,whatsapp_phone text,created_at timestamptz,jobs_total bigint,jobs_active bigint,jobs_settled bigint,last_job_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view'); perform app_private.require_project_permission(target_project_id,'customers.view');
  if (target_before_created_at is null)<>(target_before_customer_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
  return query select c.id,c.display_name,c.whatsapp_phone,c.created_at,count(j.*)::bigint,count(j.*) filter(where j.status in ('accepted','en_route','pickup','in_progress','completed'))::bigint,count(j.*) filter(where j.status='settled')::bigint,max(j.created_at)
  from public.customers c left join public.service_requests sr on sr.project_id=c.project_id and sr.customer_id=c.id left join public.jobs j on j.project_id=sr.project_id and j.service_request_id=sr.id
  where c.project_id=target_project_id and (target_before_created_at is null or (c.created_at,c.id)<(target_before_created_at,target_before_customer_id)) group by c.id order by c.created_at desc,c.id desc limit least(greatest(coalesce(target_limit,100),1),200);
end;
$$;

create or replace function public.admin_list_marketplace_topups(target_project_id uuid,target_status text default null,target_limit integer default 100,target_before_requested_at timestamptz default null,target_before_topup_id uuid default null)
returns table(topup_id uuid,user_id uuid,driver_display_name text,driver_phone text,amount numeric,currency text,status text,method text,reference text,notes text,was_initial_candidate boolean,initial_minimum_snapshot numeric,requested_at timestamptz,confirmed_at timestamptz,confirmed_by uuid,rejected_at timestamptz,rejection_reason text)
language plpgsql security definer set search_path = '' as $$
begin perform app_private.require_project_permission(target_project_id,'marketplace.view'); perform app_private.require_project_permission(target_project_id,'payments.view'); if (target_before_requested_at is null)<>(target_before_topup_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
return query select t.id,t.user_id,p.display_name,p.phone,t.amount,t.currency,t.status,t.method,t.reference,t.notes,t.was_initial_candidate,t.initial_minimum_snapshot,t.requested_at,t.confirmed_at,t.confirmed_by,t.rejected_at,t.rejection_reason from public.topups t join public.profiles p on p.id=t.user_id where t.project_id=target_project_id and (target_status is null or t.status=target_status) and (target_before_requested_at is null or (t.requested_at,t.id)<(target_before_requested_at,target_before_topup_id)) order by t.requested_at desc,t.id desc limit least(greatest(coalesce(target_limit,100),1),200); end;
$$;

create or replace function public.admin_list_marketplace_wallets(target_project_id uuid,target_limit integer default 100,target_before_updated_at timestamptz default null,target_before_user_id uuid default null)
returns table(user_id uuid,driver_display_name text,driver_phone text,currency text,total_balance numeric,reserved_balance numeric,available_balance numeric,initial_deposit_confirmed boolean,initial_deposit_confirmed_at timestamptz,initial_deposit_amount numeric,initial_minimum_snapshot numeric,updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin perform app_private.require_project_permission(target_project_id,'marketplace.view'); perform app_private.require_project_permission(target_project_id,'payments.view'); if (target_before_updated_at is null)<>(target_before_user_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
return query select w.user_id,p.display_name,p.phone,w.currency,app_private.marketplace_wallet_total_balance(w.project_id,w.user_id),app_private.marketplace_wallet_reserved_balance(w.project_id,w.user_id),app_private.marketplace_wallet_available_balance(w.project_id,w.user_id),w.initial_deposit_confirmed_at is not null,w.initial_deposit_confirmed_at,w.initial_deposit_amount,w.initial_minimum_snapshot,w.updated_at from public.wallets w join public.profiles p on p.id=w.user_id where w.project_id=target_project_id and (target_before_updated_at is null or (w.updated_at,w.user_id)<(target_before_updated_at,target_before_user_id)) order by w.updated_at desc,w.user_id desc limit least(greatest(coalesce(target_limit,100),1),200); end;
$$;

create or replace function public.admin_get_marketplace_financial_settings(target_project_id uuid)
returns table(wallet_currency text,initial_minimum_deposit numeric,commission_rate numeric,updated_at timestamptz,updated_by uuid)
language plpgsql security definer set search_path = '' as $$
begin perform app_private.require_project_permission(target_project_id,'marketplace.view'); perform app_private.require_project_permission(target_project_id,'settings.view'); return query select s.wallet_currency,s.initial_minimum_deposit,s.commission_rate,s.updated_at,s.updated_by from public.project_marketplace_financial_settings s where s.project_id=target_project_id; end;
$$;

create or replace function public.admin_list_marketplace_incidents(target_project_id uuid,target_resolved boolean default null,target_limit integer default 100,target_before_opened_at timestamptz default null,target_before_job_id uuid default null)
returns table(job_id uuid,service_code text,incident_from_status text,incident_opened_at timestamptz,incident_reason text,customer_display_name text,driver_user_id uuid,driver_display_name text,vehicle_id text,vehicle_name text,billing_mode text,commission_amount_snapshot numeric,reservation_status text,resolved boolean,resolution text,resolution_note text,resolved_at timestamptz,resolved_by uuid)
language plpgsql security definer set search_path = '' as $$
declare can_customers boolean;
begin perform app_private.require_project_permission(target_project_id,'marketplace.view'); if (target_before_opened_at is null)<>(target_before_job_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if; can_customers:=app_private.has_project_permission(target_project_id,'customers.view');
return query select j.id,j.service_code,j.incident_from_status,j.incident_opened_at,j.incident_reason,case when can_customers then c.display_name end,a.driver_user_id,p.display_name,a.vehicle_id,v.name,a.billing_mode,a.commission_amount_snapshot,cr.status,ir.id is not null,ir.resolution,ir.resolution_note,ir.resolved_at,ir.resolved_by from public.jobs j join public.service_requests sr on sr.project_id=j.project_id and sr.id=j.service_request_id join public.customers c on c.project_id=sr.project_id and c.id=sr.customer_id left join public.job_assignments a on a.project_id=j.project_id and a.job_id=j.id left join public.profiles p on p.id=a.driver_user_id left join public.vehicles v on v.project_id=j.project_id and v.id=a.vehicle_id left join public.commission_reservations cr on cr.project_id=j.project_id and cr.job_id=j.id left join public.marketplace_incident_resolutions ir on ir.project_id=j.project_id and ir.job_id=j.id where j.project_id=target_project_id and j.status='incident' and (target_resolved is null or (ir.id is not null)=target_resolved) and (target_before_opened_at is null or (j.incident_opened_at,j.id)<(target_before_opened_at,target_before_job_id)) order by j.incident_opened_at desc,j.id desc limit least(greatest(coalesce(target_limit,100),1),200); end;
$$;

create or replace function public.admin_resolve_marketplace_incident(target_project_id uuid,target_job_id uuid,target_resolution text,target_resolution_note text,target_idempotency_key uuid)
returns public.marketplace_incident_resolutions language plpgsql security definer set search_path = '' as $$
declare actor uuid; j public.jobs%rowtype; a public.job_assignments%rowtype; w public.wallets%rowtype; r public.commission_reservations%rowtype; prior numeric; ledger uuid; result public.marketplace_incident_resolutions%rowtype; note text:=nullif(btrim(target_resolution_note),'');
begin
 actor:=app_private.require_project_permission(target_project_id,'marketplace.manage'); if target_resolution not in ('completed','cancelled') then raise exception 'INVALID_INCIDENT_RESOLUTION' using errcode='22023'; end if; if note is null then raise exception 'RESOLUTION_NOTE_REQUIRED' using errcode='22023'; end if; if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tuktuk:incident-resolution:' || target_project_id::text || ':' || target_idempotency_key::text, 0));
 select * into result from public.marketplace_incident_resolutions where project_id=target_project_id and resolution_idempotency_key=target_idempotency_key; if found then if result.job_id=target_job_id and result.resolution=target_resolution and result.resolution_note=note then return result; end if; raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode='22023'; end if;
 select * into j from public.jobs where project_id=target_project_id and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if; if j.status<>'incident' then raise exception 'JOB_NOT_IN_INCIDENT' using errcode='22023'; end if;
 select * into result from public.marketplace_incident_resolutions where project_id=target_project_id and job_id=target_job_id; if found then if result.resolution=target_resolution and result.resolution_note=note then return result; end if; raise exception 'INCIDENT_ALREADY_RESOLVED' using errcode='22023'; end if;
 select * into a from public.job_assignments where project_id=target_project_id and job_id=j.id for update; if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
 if a.billing_mode='trial_free' then if a.commission_amount_snapshot<>0 or exists(select 1 from public.commission_reservations where project_id=target_project_id and job_id=j.id) then raise exception 'TRIAL_INCIDENT_PRECONDITION_FAILED' using errcode='22023'; end if;
 elsif a.billing_mode='wallet_commission' then
   select * into w from public.wallets where project_id=target_project_id and user_id=a.driver_user_id for update; if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND' using errcode='P0002'; end if;
   select * into r from public.commission_reservations where project_id=target_project_id and job_id=j.id for update; if not found then raise exception 'COMMISSION_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
   if r.user_id<>a.driver_user_id or r.amount<>a.commission_amount_snapshot then raise exception 'INCIDENT_RESERVATION_MISMATCH' using errcode='22023'; end if;
   if target_resolution='completed' then if r.status='released' then raise exception 'INCIDENT_RESERVATION_ALREADY_RELEASED' using errcode='22023'; elsif r.status='open' then prior:=app_private.marketplace_wallet_total_balance(target_project_id,a.driver_user_id); if prior<r.amount then raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' using errcode='22023'; end if; insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata) values(target_project_id,a.driver_user_id,w.currency,'commission',-r.amount,prior-r.amount,'job_commission',j.id::text,target_idempotency_key,actor,jsonb_build_object('incident_resolution',true)) returning id into ledger; update public.commission_reservations set status='consumed',ledger_transaction_id=ledger,consumed_at=now() where project_id=target_project_id and id=r.id; else ledger:=r.ledger_transaction_id; end if;
   else if r.status='open' then update public.commission_reservations set status='released',released_at=now(),release_reason=note where project_id=target_project_id and id=r.id; elsif r.status='consumed' then prior:=app_private.marketplace_wallet_total_balance(target_project_id,a.driver_user_id); insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata) values(target_project_id,a.driver_user_id,w.currency,'reversal',r.amount,prior+r.amount,'job_commission_reversal',j.id::text,target_idempotency_key,actor,jsonb_build_object('incident_resolution',true,'original_ledger_transaction_id',r.ledger_transaction_id)) returning id into ledger; end if; end if;
 else raise exception 'INVALID_BILLING_MODE' using errcode='22023'; end if;
 if target_resolution='completed' then
   if a.cancelled_at is not null then raise exception 'ASSIGNMENT_ALREADY_CANCELLED' using errcode='22023'; end if;
   update public.job_assignments set completed_at=coalesce(completed_at,now()) where project_id=target_project_id and job_id=j.id;
 elsif a.completed_at is null then
   update public.job_assignments set cancelled_at=coalesce(cancelled_at,now()) where project_id=target_project_id and job_id=j.id;
 end if;
 insert into public.marketplace_incident_resolutions(project_id,job_id,driver_user_id,billing_mode,resolution,resolution_note,commission_amount_snapshot,resolution_idempotency_key,ledger_transaction_id,resolved_by) values(target_project_id,j.id,a.driver_user_id,a.billing_mode,target_resolution,note,a.commission_amount_snapshot,target_idempotency_key,ledger,actor) returning * into result;
 insert into public.job_events(project_id,job_id,actor_user_id,actor_kind,action,from_status,to_status,operation_idempotency_key,metadata) values(target_project_id,j.id,actor,'admin','incident_resolved','incident','incident',target_idempotency_key,jsonb_build_object('resolution',target_resolution,'resolution_id',result.id));
 update public.driver_vehicle_assignments dva set is_available=true where dva.project_id=target_project_id and dva.driver_user_id=a.driver_user_id and dva.vehicle_id=a.vehicle_id and dva.is_active and not exists(select 1 from public.vehicles v where v.project_id=dva.project_id and v.id=dva.vehicle_id and (v.marketplace_status='suspended' or v.deleted_at is not null)) and not exists(select 1 from public.jobs x where x.project_id=dva.project_id and x.assigned_driver_user_id=dva.driver_user_id and x.assigned_vehicle_id=dva.vehicle_id and x.status in ('accepted','en_route','pickup','in_progress','completed'));
 return result;
end;
$$;

create or replace function public.admin_set_marketplace_driver_suspension(target_project_id uuid,target_user_id uuid,target_suspended boolean,target_reason text)
returns public.driver_profiles language plpgsql security definer set search_path = '' as $$
declare result public.driver_profiles%rowtype; reason text:=nullif(btrim(target_reason),'');
begin
 perform app_private.require_project_permission(target_project_id,'marketplace.manage'); select * into result from public.driver_profiles where project_id=target_project_id and user_id=target_user_id for update; if not found then raise exception 'DRIVER_NOT_FOUND' using errcode='P0002'; end if;
 if target_suspended then if reason is null then raise exception 'SUSPENSION_REASON_REQUIRED' using errcode='22023'; end if; update public.driver_profiles set status='suspended',suspended_at=now(),suspension_reason=reason where project_id=target_project_id and user_id=target_user_id returning * into result; update public.driver_vehicle_assignments set is_available=false where project_id=target_project_id and driver_user_id=target_user_id;
 else update public.driver_profiles set status=case when activated_at is not null then 'active' else 'incomplete' end,suspended_at=null,suspension_reason=null where project_id=target_project_id and user_id=target_user_id returning * into result; update public.driver_vehicle_assignments dva set is_available=true where dva.project_id=target_project_id and dva.driver_user_id=target_user_id and dva.is_active and exists(select 1 from public.vehicles v where v.project_id=dva.project_id and v.id=dva.vehicle_id and v.marketplace_status<>'suspended' and v.deleted_at is null) and not exists(select 1 from public.jobs j where j.project_id=dva.project_id and j.assigned_driver_user_id=dva.driver_user_id and j.assigned_vehicle_id=dva.vehicle_id and j.status in ('accepted','en_route','pickup','in_progress','completed')); end if; return result;
end;
$$;

revoke all on function public.admin_get_marketplace_overview(uuid), public.admin_list_marketplace_drivers(uuid,integer,timestamptz,uuid), public.admin_list_marketplace_jobs(uuid,text,text,integer,timestamptz,uuid), public.admin_get_marketplace_job_detail(uuid,uuid), public.admin_list_marketplace_customers(uuid,integer,timestamptz,uuid), public.admin_list_marketplace_topups(uuid,text,integer,timestamptz,uuid), public.admin_list_marketplace_wallets(uuid,integer,timestamptz,uuid), public.admin_get_marketplace_financial_settings(uuid), public.admin_list_marketplace_incidents(uuid,boolean,integer,timestamptz,uuid), public.admin_resolve_marketplace_incident(uuid,uuid,text,text,uuid), public.admin_set_marketplace_driver_suspension(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.admin_get_marketplace_overview(uuid), public.admin_list_marketplace_drivers(uuid,integer,timestamptz,uuid), public.admin_list_marketplace_jobs(uuid,text,text,integer,timestamptz,uuid), public.admin_get_marketplace_job_detail(uuid,uuid), public.admin_list_marketplace_customers(uuid,integer,timestamptz,uuid), public.admin_list_marketplace_topups(uuid,text,integer,timestamptz,uuid), public.admin_list_marketplace_wallets(uuid,integer,timestamptz,uuid), public.admin_get_marketplace_financial_settings(uuid), public.admin_list_marketplace_incidents(uuid,boolean,integer,timestamptz,uuid), public.admin_resolve_marketplace_incident(uuid,uuid,text,text,uuid), public.admin_set_marketplace_driver_suspension(uuid,uuid,boolean,text) to authenticated;
