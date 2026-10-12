-- Comercial V2: politica de bienvenida, separada de ofertas en borrador.
-- Migracion NO destructiva: estado inicial habilitado y duracion vigente intacta.
-- Permite registrar una incorporacion sin dias gratis (snapshot=0), manteniendo
-- activacion del conductor, idempotencia, billetera y permisos preexistentes.

alter table public.project_marketplace_financial_settings
  add column if not exists promotion_enabled boolean not null default true;

-- Los snapshots previos (>0 dias) permanecen identicos. Cero representa
-- una incorporacion sin beneficio, NO un nuevo periodo de promocion.
alter table public.marketplace_work_trials
  drop constraint if exists marketplace_work_trials_duration_snapshot_check;
alter table public.marketplace_work_trials
  add constraint marketplace_work_trials_duration_snapshot_check
    check (duration_days_snapshot between 0 and 365 and
           ends_at = started_at + (duration_days_snapshot * interval '1 day'));
alter table public.marketplace_work_trials
  drop constraint if exists marketplace_work_trials_activation_source_check;
alter table public.marketplace_work_trials
  add constraint marketplace_work_trials_activation_source_check
    check (activation_source in ('legacy_explicit','onboarding_auto','legacy_backfill','onboarding_no_promotion'));

-- Mantiene el RPC existente para alta de conductor sin reescribirlo.
-- Opera exclusivamente en INSERT de la promocion automatica.
create or replace function app_private.marketplace_welcome_policy_before_trial_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  welcome_enabled boolean;
begin
  if new.activation_source <> 'onboarding_auto' then
    return new;
  end if;

  select s.promotion_enabled into welcome_enabled
    from public.project_marketplace_financial_settings s
    where s.project_id = new.project_id
    for share;

  if welcome_enabled is false then
    new.duration_days_snapshot := 0;
    new.ends_at := new.started_at;
    new.activation_source := 'onboarding_no_promotion';
  end if;
  return new;
end;
$function$;

drop trigger if exists marketplace_welcome_policy_before_trial_insert
  on public.marketplace_work_trials;
create trigger marketplace_welcome_policy_before_trial_insert
  before insert on public.marketplace_work_trials
  for each row execute function app_private.marketplace_welcome_policy_before_trial_insert();

create table if not exists public.marketplace_welcome_policy_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  actor uuid references auth.users(id) on delete set null,
  prior_enabled boolean not null,
  prior_days integer not null,
  new_enabled boolean not null,
  new_days integer not null,
  changed_at timestamptz not null default now()
);
create index if not exists marketplace_welcome_policy_events_project_date_idx
  on public.marketplace_welcome_policy_events(project_id,changed_at desc);
alter table public.marketplace_welcome_policy_events enable row level security;
revoke all on public.marketplace_welcome_policy_events from public, anon, authenticated;

-- Lectura bajo permisos reales de ajustes (no se confunde con ofertas borrador).
create or replace function public.admin_get_marketplace_welcome_policy(target_project_id uuid)
returns table(enabled boolean, duration_days integer, rule_version integer,
              commission_rate numeric, updated_at timestamptz, updated_by uuid)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform app_private.require_project_permission(target_project_id,'settings.view');
  return query
  select s.promotion_enabled,s.promotion_duration_days,s.promotion_rule_version,
         s.commission_rate,s.updated_at,s.updated_by
  from public.project_marketplace_financial_settings s
  where s.project_id=target_project_id;
end;
$function$;

create or replace function public.admin_set_marketplace_welcome_policy(
  target_project_id uuid,target_enabled boolean,target_duration_days integer)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  actor uuid;
  old_s public.project_marketplace_financial_settings%rowtype;
begin
  actor := app_private.require_project_permission(target_project_id,'settings.manage');
  if target_enabled is null or target_duration_days is null
     or target_duration_days not between 1 and 365 then
    raise exception 'INVALID_MARKETPLACE_WELCOME_POLICY' using errcode='22023';
  end if;

  select * into old_s
  from public.project_marketplace_financial_settings
  where project_id=target_project_id
  for update;
  if not found then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;
  if old_s.promotion_enabled is not distinct from target_enabled
     and old_s.promotion_duration_days is not distinct from target_duration_days then
    return;
  end if;

  update public.project_marketplace_financial_settings
     set promotion_enabled=target_enabled,
         promotion_duration_days=target_duration_days,
         promotion_rule_version=old_s.promotion_rule_version+1,
         promotion_effective_at=now(),
         updated_by=actor,
         updated_at=now()
   where project_id=target_project_id;

  insert into public.marketplace_welcome_policy_events
    (project_id,actor,prior_enabled,prior_days,new_enabled,new_days)
  values (target_project_id,actor,old_s.promotion_enabled,
          old_s.promotion_duration_days,target_enabled,target_duration_days);
end;
$function$;

-- Cambiar la comision no puede sobrescribir la politica de bienvenida aunque
-- haya dos administradores trabajando al mismo tiempo.
create or replace function public.admin_set_marketplace_commission_only(
  target_project_id uuid,target_commission_rate numeric)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  actor uuid;
begin
  actor := app_private.require_project_permission(target_project_id,'settings.manage');
  if target_commission_rate is null or target_commission_rate<=0
     or target_commission_rate>1 then
    raise exception 'INVALID_COMMISSION_RATE' using errcode='22023';
  end if;
  update public.project_marketplace_financial_settings
     set commission_rate=target_commission_rate, updated_by=actor,updated_at=now()
   where project_id=target_project_id;
  if not found then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;
end;
$function$;

create or replace function public.admin_list_marketplace_welcome_policy_events(
  target_project_id uuid)
returns table(changed_at timestamptz, prior_enabled boolean, prior_days integer,
              new_enabled boolean, new_days integer)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform app_private.require_project_permission(target_project_id,'settings.view');
  return query
  select e.changed_at,e.prior_enabled,e.prior_days,e.new_enabled,e.new_days
  from public.marketplace_welcome_policy_events e
  where e.project_id=target_project_id
  order by e.changed_at desc,e.id desc limit 10;
end;
$function$;

revoke all on function public.admin_get_marketplace_welcome_policy(uuid) from public,anon;
revoke all on function public.admin_set_marketplace_welcome_policy(uuid,boolean,integer) from public,anon;
revoke all on function public.admin_set_marketplace_commission_only(uuid,numeric) from public,anon;
revoke all on function public.admin_list_marketplace_welcome_policy_events(uuid) from public,anon;
grant execute on function public.admin_get_marketplace_welcome_policy(uuid) to authenticated;
grant execute on function public.admin_set_marketplace_welcome_policy(uuid,boolean,integer) to authenticated;
grant execute on function public.admin_set_marketplace_commission_only(uuid,numeric) to authenticated;
grant execute on function public.admin_list_marketplace_welcome_policy_events(uuid) to authenticated;

-- Impide reintroducir la edición de días desde clientes antiguos de Trabajo.
-- La comisión usa el nuevo RPC de actualización aislada.
revoke all on function public.admin_set_marketplace_commercial_settings(uuid,integer,numeric)
  from public,anon,authenticated;
