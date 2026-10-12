-- TukTuk: catalogo comercial version 1 (administracion en borrador).
-- No conecta promociones con liquidaciones, precios, pruebas ni asignacion de trabajos.
-- NO se activa ninguna oferta hasta la aprobacion de un motor financiero separado.
create table if not exists public.marketplace_offer_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 4 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  kind text not null check (kind in (
    'commission_free','commission_reduced','free_rides','wallet_credit',
    'referral_bonus','reactivation','custom'
  )),
  benefit_value numeric(14,2) not null default 0 check (benefit_value between 0 and 1000000),
  benefit_duration_days integer check (benefit_duration_days between 1 and 365),
  benefit_ride_limit integer check (benefit_ride_limit between 1 and 100000),
  begins_at timestamptz not null,
  closes_at timestamptz not null,
  audience text not null check (audience in (
    'new_drivers','active_drivers','inactive_drivers','all_drivers','selected_drivers'
  )),
  audience_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(audience_rules)='object'),
  activation text not null check (activation in ('automatic','manual','code')),
  activation_trigger text not null check (activation_trigger in ('onboarding','first_job')),
  redemption_code text check (redemption_code is null or redemption_code ~ '^[A-Z0-9_-]{4,32}$'),
  max_participants integer check (max_participants between 1 and 1000000),
  max_budget_cup numeric(14,2) check (max_budget_cup>0),
  max_uses_per_driver integer not null default 1 check (max_uses_per_driver between 1 and 10000),
  priority integer not null default 100 check (priority between 1 and 1000),
  stacking text not null default 'best_only' check (stacking in ('best_only','exclusive')),
  terms text not null default '' check (char_length(terms)<=3000),
  status text not null default 'draft' check (status in ('draft','paused','archived')),
  revision integer not null default 1 check (revision>0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_offer_campaigns_window check (begins_at<closes_at),
  constraint marketplace_offer_campaigns_code check (
    (activation='code' and redemption_code is not null)
    or (activation<>'code' and redemption_code is null)
  ),
  constraint marketplace_offer_campaigns_value check (
    (kind in ('commission_free','free_rides','custom') and benefit_value=0)
    or (kind='commission_reduced' and benefit_value>0 and benefit_value<100)
    or (kind in ('wallet_credit','referral_bonus','reactivation') and benefit_value>0)
  ),
  constraint marketplace_offer_campaigns_ride_limit check (
    (kind='free_rides' and benefit_ride_limit is not null)
    or (kind<>'free_rides' and benefit_ride_limit is null)
  )
);
create index if not exists marketplace_offer_campaigns_project_status_idx
  on public.marketplace_offer_campaigns(project_id,status,begins_at desc);
create unique index if not exists marketplace_offer_campaigns_code_uniq
  on public.marketplace_offer_campaigns(project_id,redemption_code)
  where redemption_code is not null and status<>'archived';

create table if not exists public.marketplace_offer_campaign_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  campaign_id uuid not null references public.marketplace_offer_campaigns(id) on delete restrict,
  action text not null check(action in ('created','edited','paused','archived')),
  actor uuid not null references auth.users(id) on delete restrict,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists marketplace_offer_events_campaign_idx
  on public.marketplace_offer_campaign_events(campaign_id,created_at desc);

alter table public.marketplace_offer_campaigns enable row level security;
alter table public.marketplace_offer_campaign_events enable row level security;
revoke all on public.marketplace_offer_campaigns from public, anon, authenticated;
revoke all on public.marketplace_offer_campaign_events from public, anon, authenticated;

create or replace function public.admin_list_marketplace_offer_campaigns(target_project_id uuid)
returns setof public.marketplace_offer_campaigns
language plpgsql stable security definer set search_path = '' as $function$
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  return query select c.* from public.marketplace_offer_campaigns c
    where c.project_id=target_project_id order by c.created_at desc,c.id desc;
end;
$function$;

-- Solo el propietario del proyecto puede crear/editar una oferta.
-- Es intencional que V1 NO admita activacion: no existe conexion a liquidaciones.
create or replace function public.admin_save_marketplace_offer_campaign(
  target_project_id uuid, target_id uuid,
  target_name text, target_description text, target_kind text,
  target_benefit_value numeric, target_benefit_duration_days integer,
  target_benefit_ride_limit integer, target_begins_at timestamptz,
  target_closes_at timestamptz, target_audience text, target_audience_rules jsonb,
  target_activation text, target_activation_trigger text, target_redemption_code text,
  target_max_participants integer, target_max_budget_cup numeric,
  target_max_uses_per_driver integer, target_priority integer,
  target_stacking text, target_terms text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid;
  old_row public.marketplace_offer_campaigns%rowtype;
  new_row public.marketplace_offer_campaigns%rowtype;
  campaign_id uuid;
  clean_code text;
begin
  actor := app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists(select 1 from public.projects p where p.id=target_project_id and p.owner_id=actor and p.slug='tuktuk-control') then
    raise exception 'OFFERS_OWNER_ONLY' using errcode='42501';
  end if;
  if target_name is null or char_length(btrim(target_name)) not between 4 and 120
     or target_begins_at is null or target_closes_at is null
     or target_begins_at>=target_closes_at
     or target_closes_at-target_begins_at > interval '2 years' then
    raise exception 'INVALID_OFFER_WINDOW_OR_NAME' using errcode='22023';
  end if;
  if target_audience_rules is null or jsonb_typeof(target_audience_rules)<>'object'
     or octet_length(target_audience_rules::text)>6000 then
    raise exception 'INVALID_OFFER_SEGMENT' using errcode='22023';
  end if;
  if target_audience_rules ?| array['role','is_admin','project_id','billing_mode'] then
    raise exception 'RESERVED_OFFER_SEGMENT_KEYS' using errcode='22023';
  end if;
  clean_code := nullif(upper(btrim(coalesce(target_redemption_code,''))), '');
  if target_activation='code' and clean_code is null then
    raise exception 'OFFER_CODE_REQUIRED' using errcode='22023';
  end if;
  if target_activation is distinct from 'code' then clean_code := null; end if;

  if target_id is not null then
    select * into old_row from public.marketplace_offer_campaigns c
      where c.id=target_id and c.project_id=target_project_id for update;
    if not found then raise exception 'OFFER_NOT_FOUND' using errcode='P0002'; end if;
    if old_row.status not in ('draft','paused') then
      raise exception 'OFFER_IS_LOCKED' using errcode='22023';
    end if;
  end if;

  insert into public.marketplace_offer_campaigns(
    id,project_id,name,description,kind,benefit_value,benefit_duration_days,
    benefit_ride_limit,begins_at,closes_at,audience,audience_rules,
    activation,activation_trigger,redemption_code,max_participants,
    max_budget_cup,max_uses_per_driver,priority,stacking,terms,status,
    revision,created_by,updated_by
  ) values (
    coalesce(target_id,gen_random_uuid()), target_project_id,btrim(target_name),coalesce(target_description,''),
    target_kind,target_benefit_value,target_benefit_duration_days,target_benefit_ride_limit,
    target_begins_at,target_closes_at,target_audience,target_audience_rules,
    target_activation,target_activation_trigger,clean_code,target_max_participants,
    target_max_budget_cup,target_max_uses_per_driver,target_priority,target_stacking,
    coalesce(target_terms,''),coalesce(old_row.status,'draft'),
    coalesce(old_row.revision+1,1),coalesce(old_row.created_by,actor),actor
  )
  on conflict(id) do update set
    name=excluded.name, description=excluded.description,kind=excluded.kind,
    benefit_value=excluded.benefit_value, benefit_duration_days=excluded.benefit_duration_days,
    benefit_ride_limit=excluded.benefit_ride_limit,begins_at=excluded.begins_at,
    closes_at=excluded.closes_at,audience=excluded.audience,audience_rules=excluded.audience_rules,
    activation=excluded.activation,activation_trigger=excluded.activation_trigger,
    redemption_code=excluded.redemption_code,max_participants=excluded.max_participants,
    max_budget_cup=excluded.max_budget_cup,max_uses_per_driver=excluded.max_uses_per_driver,
    priority=excluded.priority,stacking=excluded.stacking,terms=excluded.terms,
    revision=excluded.revision,updated_by=actor,updated_at=now()
  where public.marketplace_offer_campaigns.project_id=target_project_id
  returning * into new_row;

  if new_row.id is null then raise exception 'OFFER_PROJECT_MISMATCH' using errcode='42501'; end if;

  insert into public.marketplace_offer_campaign_events(
    project_id,campaign_id,action,actor,before_snapshot,after_snapshot,reason
  ) values (
    target_project_id,new_row.id,
    case when target_id is null then 'created' else 'edited' end,
    actor,case when target_id is null then null else to_jsonb(old_row) end,
    to_jsonb(new_row),'Version administrativa: sin efecto financiero'
  );
  return new_row.id;
end;
$function$;

create or replace function public.admin_archive_marketplace_offer_campaign(
  target_project_id uuid,target_id uuid,target_reason text
)
returns boolean language plpgsql security definer set search_path='' as $function$
declare
  actor uuid;
  old_row public.marketplace_offer_campaigns%rowtype;
  changed public.marketplace_offer_campaigns%rowtype;
begin
  actor := app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists(select 1 from public.projects p where p.id=target_project_id and p.owner_id=actor and p.slug='tuktuk-control') then
    raise exception 'OFFERS_OWNER_ONLY' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(target_reason,'')))<8 then
    raise exception 'OFFER_ARCHIVE_REASON_REQUIRED' using errcode='22023';
  end if;
  select * into old_row from public.marketplace_offer_campaigns c
    where c.id=target_id and c.project_id=target_project_id for update;
  if not found then raise exception 'OFFER_NOT_FOUND' using errcode='P0002'; end if;
  if old_row.status='archived' then return true; end if;
  update public.marketplace_offer_campaigns
    set status='archived',revision=revision+1,updated_by=actor,updated_at=now()
    where id=target_id and project_id=target_project_id returning * into changed;
  insert into public.marketplace_offer_campaign_events(
    project_id,campaign_id,action,actor,before_snapshot,after_snapshot,reason
  ) values(target_project_id,target_id,'archived',actor,to_jsonb(old_row),to_jsonb(changed),btrim(target_reason));
  return true;
end;
$function$;

revoke all on function public.admin_list_marketplace_offer_campaigns(uuid),
  public.admin_save_marketplace_offer_campaign(uuid,uuid,text,text,text,numeric,integer,integer,timestamptz,timestamptz,text,jsonb,text,text,text,integer,numeric,integer,integer,text,text),
  public.admin_archive_marketplace_offer_campaign(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.admin_list_marketplace_offer_campaigns(uuid),
  public.admin_save_marketplace_offer_campaign(uuid,uuid,text,text,text,numeric,integer,integer,timestamptz,timestamptz,text,jsonb,text,text,text,integer,numeric,integer,integer,text,text),
  public.admin_archive_marketplace_offer_campaign(uuid,uuid,text)
  to authenticated;
