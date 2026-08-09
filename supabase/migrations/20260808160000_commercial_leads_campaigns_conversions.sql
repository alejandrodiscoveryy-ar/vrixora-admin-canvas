-- Commercial tracking reuses profiles, user_attribution, analytics_events,
-- licenses and payments as the authoritative conversion/accounting sources.

insert into public.project_permissions(code, name, category) values
  ('commercial.view', 'Ver seguimiento comercial', 'commercial'),
  ('commercial.manage', 'Gestionar seguimiento comercial', 'commercial')
on conflict do nothing;

insert into public.project_role_permissions(role_code, permission_code) values
  ('owner', 'commercial.view'), ('owner', 'commercial.manage'),
  ('marketing', 'commercial.view'), ('marketing', 'commercial.manage')
on conflict do nothing;

create table public.commercial_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  source text not null check (source in ('whatsapp','facebook','instagram','sms','referral','direct','other')),
  medium text,
  status text not null default 'active' check (status in ('draft','active','paused','closed')),
  starts_at date,
  ends_at date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(project_id, name)
);

create table public.commercial_leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  phone text not null check (phone ~ '^[+][1-9][0-9]{7,14}$'),
  email text,
  source text not null check (source in ('whatsapp','facebook','instagram','sms','referral','direct','other')),
  medium text,
  campaign_id uuid references public.commercial_campaigns(id) on delete set null,
  campaign text,
  referral_code text,
  referred_by_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new','contacted','interested','trial','ready_to_charge','customer','not_interested')),
  notes text,
  responsible_id uuid references public.profiles(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  last_interaction_at timestamptz,
  next_action_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.commercial_lead_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  lead_id uuid not null references public.commercial_leads(id) on delete restrict,
  event_type text not null check (event_type in ('created','status_changed','note_added','responsible_changed','linked_to_user','archived')),
  previous_value text,
  new_value text,
  note text,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index commercial_leads_project_status_idx on public.commercial_leads(project_id, status, updated_at desc) where archived_at is null;
create index commercial_leads_project_source_idx on public.commercial_leads(project_id, source) where archived_at is null;
create index commercial_leads_project_campaign_idx on public.commercial_leads(project_id, campaign) where archived_at is null;
create index commercial_leads_user_idx on public.commercial_leads(project_id, user_id) where user_id is not null;
create unique index commercial_leads_project_user_unique on public.commercial_leads(project_id, user_id) where user_id is not null and archived_at is null;
create index commercial_lead_history_lead_idx on public.commercial_lead_history(lead_id, created_at desc);
create index commercial_campaigns_project_idx on public.commercial_campaigns(project_id, status, updated_at desc) where archived_at is null;

alter table public.commercial_campaigns enable row level security;
alter table public.commercial_leads enable row level security;
alter table public.commercial_lead_history enable row level security;
revoke all on public.commercial_campaigns, public.commercial_leads, public.commercial_lead_history from public, anon, authenticated;

create trigger audit_commercial_campaigns_changes after insert or update on public.commercial_campaigns for each row execute function app_private.capture_audit_event();
create trigger audit_commercial_leads_changes after insert or update on public.commercial_leads for each row execute function app_private.capture_audit_event();

create or replace function public.admin_save_commercial_lead(
  target_project_id uuid, target_lead_id uuid, target_name text, target_phone text,
  target_email text, target_source text, target_medium text, target_campaign_id uuid,
  target_campaign text, target_referral_code text, target_referred_by_user_id uuid,
  target_status text, target_notes text, target_responsible_id uuid,
  target_next_action_at timestamptz, target_user_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  current_lead public.commercial_leads%rowtype;
  saved_lead public.commercial_leads%rowtype;
  normalized_phone text := regexp_replace(coalesce(target_phone,''), '[[:space:]()-]', '', 'g');
  linked_user uuid := target_user_id;
begin
  actor := app_private.require_project_permission(target_project_id, 'commercial.manage');
  if nullif(btrim(target_name),'') is null then raise exception 'LEAD_NAME_REQUIRED' using errcode='22023'; end if;
  if normalized_phone !~ '^[+][1-9][0-9]{7,14}$' then raise exception 'INVALID_LEAD_PHONE' using errcode='22023'; end if;
  if target_source not in ('whatsapp','facebook','instagram','sms','referral','direct','other') then raise exception 'INVALID_LEAD_SOURCE' using errcode='22023'; end if;
  if target_status not in ('new','contacted','interested','trial','ready_to_charge','customer','not_interested') then raise exception 'INVALID_LEAD_STATUS' using errcode='22023'; end if;
  if linked_user is null and nullif(btrim(target_email),'') is not null then
    select id into linked_user from public.profiles where lower(email)=lower(btrim(target_email));
  end if;
  if linked_user is not null and not exists (select 1 from public.profiles where id=linked_user) then raise exception 'PROFILE_NOT_FOUND' using errcode='P0002'; end if;
  if target_campaign_id is not null and not exists (select 1 from public.commercial_campaigns where id=target_campaign_id and project_id=target_project_id and archived_at is null) then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002'; end if;

  if target_lead_id is not null then
    select * into current_lead from public.commercial_leads where id=target_lead_id and project_id=target_project_id for update;
    if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0002'; end if;
  end if;

  insert into public.commercial_leads(id,project_id,name,phone,email,source,medium,campaign_id,campaign,referral_code,referred_by_user_id,status,notes,responsible_id,user_id,last_interaction_at,next_action_at,created_by)
  values(coalesce(target_lead_id,gen_random_uuid()),target_project_id,btrim(target_name),normalized_phone,nullif(lower(btrim(target_email)),''),target_source,nullif(btrim(target_medium),''),target_campaign_id,nullif(btrim(target_campaign),''),nullif(btrim(target_referral_code),''),target_referred_by_user_id,target_status,nullif(btrim(target_notes),''),target_responsible_id,linked_user,case when target_lead_id is null then now() else current_lead.last_interaction_at end,target_next_action_at,actor)
  on conflict(id) do update set name=excluded.name,phone=excluded.phone,email=excluded.email,source=excluded.source,medium=excluded.medium,campaign_id=excluded.campaign_id,campaign=excluded.campaign,referral_code=excluded.referral_code,referred_by_user_id=excluded.referred_by_user_id,status=excluded.status,notes=excluded.notes,responsible_id=excluded.responsible_id,user_id=coalesce(excluded.user_id,public.commercial_leads.user_id),next_action_at=excluded.next_action_at,updated_at=now()
  returning * into saved_lead;

  if target_lead_id is null then
    insert into public.commercial_lead_history(project_id,lead_id,event_type,new_value,actor_id) values(target_project_id,saved_lead.id,'created',saved_lead.status,actor);
  else
    if current_lead.status is distinct from saved_lead.status then insert into public.commercial_lead_history(project_id,lead_id,event_type,previous_value,new_value,actor_id) values(target_project_id,saved_lead.id,'status_changed',current_lead.status,saved_lead.status,actor); end if;
    if current_lead.responsible_id is distinct from saved_lead.responsible_id then insert into public.commercial_lead_history(project_id,lead_id,event_type,previous_value,new_value,actor_id) values(target_project_id,saved_lead.id,'responsible_changed',current_lead.responsible_id::text,saved_lead.responsible_id::text,actor); end if;
    if current_lead.user_id is distinct from saved_lead.user_id then insert into public.commercial_lead_history(project_id,lead_id,event_type,previous_value,new_value,actor_id) values(target_project_id,saved_lead.id,'linked_to_user',current_lead.user_id::text,saved_lead.user_id::text,actor); end if;
  end if;
  return saved_lead.id;
end; $$;

create or replace function public.admin_add_commercial_lead_note(target_project_id uuid,target_lead_id uuid,target_note text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=app_private.require_project_permission(target_project_id,'commercial.manage');
  if nullif(btrim(target_note),'') is null then raise exception 'NOTE_REQUIRED' using errcode='22023'; end if;
  update public.commercial_leads set notes=btrim(target_note),last_interaction_at=now(),updated_at=now() where id=target_lead_id and project_id=target_project_id and archived_at is null;
  if not found then raise exception 'LEAD_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.commercial_lead_history(project_id,lead_id,event_type,note,actor_id) values(target_project_id,target_lead_id,'note_added',btrim(target_note),actor);
end; $$;

create or replace function public.admin_save_commercial_campaign(target_project_id uuid,target_campaign_id uuid,target_name text,target_source text,target_medium text,target_status text,target_starts_at date,target_ends_at date)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; result_id uuid;
begin
  actor:=app_private.require_project_permission(target_project_id,'commercial.manage');
  if target_source not in ('whatsapp','facebook','instagram','sms','referral','direct','other') then raise exception 'INVALID_CAMPAIGN_SOURCE' using errcode='22023'; end if;
  insert into public.commercial_campaigns(id,project_id,name,source,medium,status,starts_at,ends_at,created_by)
  values(coalesce(target_campaign_id,gen_random_uuid()),target_project_id,btrim(target_name),target_source,nullif(btrim(target_medium),''),target_status,target_starts_at,target_ends_at,actor)
  on conflict(id) do update set name=excluded.name,source=excluded.source,medium=excluded.medium,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now()
  returning id into result_id; return result_id;
end; $$;

create or replace function public.admin_list_commercial_campaigns(target_project_id uuid)
returns setof public.commercial_campaigns language plpgsql security definer set search_path='' as $$
begin perform app_private.require_project_permission(target_project_id,'commercial.view'); return query select * from public.commercial_campaigns where project_id=target_project_id and archived_at is null order by updated_at desc; end; $$;

create or replace function public.admin_list_commercial_leads(target_project_id uuid)
returns table(id uuid,name text,phone text,email text,source text,medium text,campaign text,referral_code text,referred_by_user_id uuid,referred_by_name text,status text,notes text,responsible_id uuid,responsible_name text,user_id uuid,created_at timestamptz,last_interaction_at timestamptz,next_action_at timestamptz,registered boolean,trial_started boolean,paid boolean,renewal_count bigint,revenue jsonb)
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  return query select lead.id,lead.name,lead.phone,lead.email,coalesce(lead.source,attr.first_source),coalesce(lead.medium,attr.first_medium),coalesce(lead.campaign,attr.first_campaign),coalesce(lead.referral_code,attr.first_referral_code),lead.referred_by_user_id,coalesce(referrer.display_name,referrer.email),lead.status,lead.notes,lead.responsible_id,coalesce(resp.display_name,resp.email),lead.user_id,lead.created_at,lead.last_interaction_at,lead.next_action_at,
    lead.user_id is not null,
    lead.user_id is not null and (exists(select 1 from public.analytics_events e where e.project_id=target_project_id and e.user_id=lead.user_id and e.event_name='trial_started') or exists(select 1 from public.licenses l where l.project_id=target_project_id and l.user_id=lead.user_id and l.license_type='trial')),
    lead.user_id is not null and exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=lead.user_id and p.status='paid'),
    case when lead.user_id is null then 0 else (select greatest(count(*)-1,0) from public.payments p where p.project_id=target_project_id and p.user_id=lead.user_id and p.status='paid') end,
    case when lead.user_id is null then '{}'::jsonb else coalesce((select jsonb_object_agg(currency,total) from (select p.currency,sum(p.amount) total from public.payments p where p.project_id=target_project_id and p.user_id=lead.user_id and p.status='paid' group by p.currency) totals),'{}'::jsonb) end
  from public.commercial_leads lead left join public.profiles resp on resp.id=lead.responsible_id left join public.profiles referrer on referrer.id=lead.referred_by_user_id left join public.user_attribution attr on attr.project_id=lead.project_id and attr.user_id=lead.user_id
  where lead.project_id=target_project_id and lead.archived_at is null order by lead.updated_at desc;
end; $$;

create or replace function public.admin_get_commercial_metrics(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  select jsonb_build_object(
    'total_leads',count(*),'registered',count(*) filter(where l.user_id is not null),
    'trials',count(*) filter(where l.user_id is not null and (exists(select 1 from public.analytics_events e where e.project_id=target_project_id and e.user_id=l.user_id and e.event_name='trial_started') or exists(select 1 from public.licenses x where x.project_id=target_project_id and x.user_id=l.user_id and x.license_type='trial'))),
    'paid',count(*) filter(where l.user_id is not null and exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=l.user_id and p.status='paid')),
    'not_converted',count(*) filter(where l.user_id is null or not exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=l.user_id and p.status='paid')),
    'conversion_rate',case when count(*)=0 then 0 else round(100.0*count(*) filter(where l.user_id is not null and exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=l.user_id and p.status='paid'))/count(*),2) end,
    'top_source',coalesce((select source from public.commercial_leads x where x.project_id=target_project_id and x.archived_at is null group by source order by count(*) filter(where x.user_id is not null and exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=x.user_id and p.status='paid')) desc,count(*) desc limit 1),''),
    'top_campaign',coalesce((select campaign from public.commercial_leads x where x.project_id=target_project_id and x.archived_at is null and campaign is not null group by campaign order by count(*) filter(where x.user_id is not null and exists(select 1 from public.payments p where p.project_id=target_project_id and p.user_id=x.user_id and p.status='paid')) desc,count(*) desc limit 1),'')
  ) into result from public.commercial_leads l where l.project_id=target_project_id and l.archived_at is null;
  return result;
end; $$;

revoke all on function public.admin_save_commercial_lead(uuid,uuid,text,text,text,text,text,uuid,text,text,uuid,text,text,uuid,timestamptz,uuid), public.admin_add_commercial_lead_note(uuid,uuid,text), public.admin_save_commercial_campaign(uuid,uuid,text,text,text,text,date,date), public.admin_list_commercial_campaigns(uuid), public.admin_list_commercial_leads(uuid), public.admin_get_commercial_metrics(uuid) from public,anon;
grant execute on function public.admin_save_commercial_lead(uuid,uuid,text,text,text,text,text,uuid,text,text,uuid,text,text,uuid,timestamptz,uuid), public.admin_add_commercial_lead_note(uuid,uuid,text), public.admin_save_commercial_campaign(uuid,uuid,text,text,text,text,date,date), public.admin_list_commercial_campaigns(uuid), public.admin_list_commercial_leads(uuid), public.admin_get_commercial_metrics(uuid) to authenticated;
