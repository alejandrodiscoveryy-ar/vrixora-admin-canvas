-- TukTuk Comercial: catalogue of customer promo PROPOSALS only.
-- No ACTIVE/PAUSED/SCHEDULED states, no checkout application, no wallet,
-- commissions, job updates, point awards, pushes or automated redemption.
-- An approved future transactional pricing engine is required to honor offers.
begin;

create table if not exists app_private.marketplace_customer_campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  code text not null check (code ~ '^tuktuk_[a-z0-9_]{1,20}$'),
  title text not null check (char_length(btrim(title)) between 4 and 90),
  description text not null default '' check (char_length(description) <= 600),
  benefit_kind text not null check (benefit_kind in ('percent','fixed','points')),
  benefit_value numeric(12,2) not null check (benefit_value > 0),
  max_discount_cup numeric(12,2),
  audience text not null check (audience in ('new','all','return')),
  starts_on date not null,
  ends_on date not null,
  max_uses integer not null check (max_uses between 1 and 100000),
  budget_cup numeric(14,2),
  status text not null default 'draft' check (status in ('draft','archived')),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_campaign_dates_check check (starts_on <= ends_on),
  constraint customer_campaign_amount_check check (
    (benefit_kind='percent' and benefit_value between 1 and 50
      and max_discount_cup > 0)
    or (benefit_kind='fixed' and benefit_value >= 1 and max_discount_cup is null)
    or (benefit_kind='points' and benefit_value>=1 and benefit_value=trunc(benefit_value)
      and max_discount_cup is null)
  ),
  constraint customer_campaign_budget_check check (
    budget_cup is null or budget_cup > 0
  ),
  unique(project_id,code)
);
create index if not exists marketplace_customer_campaign_drafts_by_project
  on app_private.marketplace_customer_campaign_drafts(project_id,status,created_at desc);
alter table app_private.marketplace_customer_campaign_drafts enable row level security;
revoke all on app_private.marketplace_customer_campaign_drafts
  from public,anon,authenticated,service_role;

create table if not exists app_private.marketplace_customer_campaign_draft_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id),
  draft_id uuid not null references app_private.marketplace_customer_campaign_drafts(id),
  action text not null check (action in ('created','edited','archived')),
  actor_id uuid not null,
  at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb
);
create index if not exists marketplace_customer_campaign_draft_history_lookup
  on app_private.marketplace_customer_campaign_draft_history(project_id,draft_id,at desc);
alter table app_private.marketplace_customer_campaign_draft_history enable row level security;
revoke all on app_private.marketplace_customer_campaign_draft_history
  from public,anon,authenticated,service_role;

create or replace function public.admin_list_marketplace_customer_campaign_drafts_v1(
  target_project_id uuid
) returns setof app_private.marketplace_customer_campaign_drafts
language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  if not exists (select 1 from public.projects p
    where p.id=target_project_id and p.slug='tuktuk-control') then
    raise exception 'NOT_TUKTUK_PROJECT' using errcode='42501';
  end if;
  return query
    select c.* from app_private.marketplace_customer_campaign_drafts c
    where c.project_id=target_project_id
    order by (c.status='draft') desc,c.created_at desc,c.id;
end;
$function$;
revoke all on function public.admin_list_marketplace_customer_campaign_drafts_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_list_marketplace_customer_campaign_drafts_v1(uuid)
  to authenticated;

create or replace function public.admin_save_marketplace_customer_campaign_draft_v1(
  target_project_id uuid,
  target_id uuid,
  target_code text,
  target_title text,
  target_description text,
  target_kind text,
  target_value numeric,
  target_max_discount_cup numeric,
  target_audience text,
  target_starts_on date,
  target_ends_on date,
  target_max_uses integer,
  target_budget_cup numeric
) returns uuid
language plpgsql security definer set search_path to ''
as $function$
declare
  actor uuid:=auth.uid();
  original app_private.marketplace_customer_campaign_drafts%rowtype;
  result_id uuid;
  after_record app_private.marketplace_customer_campaign_drafts%rowtype;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists (select 1 from public.projects p
    where p.id=target_project_id and p.slug='tuktuk-control' and p.owner_id=actor) then
    raise exception 'ONLY_OWNER_MAY_PLAN_CUSTOMER_BENEFITS' using errcode='42501';
  end if;
  if target_code is null or target_code !~ '^tuktuk_[a-z0-9_]{1,20}$'
    or char_length(btrim(coalesce(target_title,''))) not between 4 and 90
    or char_length(coalesce(target_description,'')) > 600
    or target_kind not in ('percent','fixed','points')
    or target_audience not in ('new','all','return')
    or target_starts_on is null or target_ends_on is null
    or target_starts_on > target_ends_on
    or target_ends_on - target_starts_on > 365
    or target_max_uses is null or target_max_uses not between 1 and 100000
    or target_value is null or target_value<=0
    or (target_kind='percent' and (
      target_value<1 or target_value>50 or target_max_discount_cup is null or target_max_discount_cup<=0))
    or (target_kind='fixed' and (target_value<1 or target_max_discount_cup is not null))
    or (target_kind='points' and (target_value<1 or target_value<>trunc(target_value)
      or target_max_discount_cup is not null))
    or (target_budget_cup is not null and target_budget_cup<=0)
  then
    raise exception 'INVALID_CUSTOMER_CAMPAIGN_DRAFT' using errcode='22023';
  end if;
  if target_id is null then
    insert into app_private.marketplace_customer_campaign_drafts (
      project_id,code,title,description,benefit_kind,benefit_value,
      max_discount_cup,audience,starts_on,ends_on,max_uses,budget_cup,
      status,created_by,updated_by
    ) values (
      target_project_id,target_code,btrim(target_title),btrim(coalesce(target_description,'')),
      target_kind,target_value,target_max_discount_cup,target_audience,
      target_starts_on,target_ends_on,target_max_uses,target_budget_cup,
      'draft',actor,actor
    ) returning id into result_id;
    select * into after_record from app_private.marketplace_customer_campaign_drafts
      where id=result_id and project_id=target_project_id;
    insert into app_private.marketplace_customer_campaign_draft_history(
      project_id,draft_id,action,actor_id,after_state)
      values(target_project_id,result_id,'created',actor,to_jsonb(after_record));
  else
    select * into original from app_private.marketplace_customer_campaign_drafts
      where project_id=target_project_id and id=target_id for update;
    if not found or original.status<>'draft' then
      raise exception 'DRAFT_NOT_EDITABLE' using errcode='22023';
    end if;
    if target_code<>original.code then
      raise exception 'DRAFT_CODE_IMMUTABLE' using errcode='22023';
    end if;
    update app_private.marketplace_customer_campaign_drafts
       set title=btrim(target_title),description=btrim(coalesce(target_description,'')),
           benefit_kind=target_kind,benefit_value=target_value,
           max_discount_cup=target_max_discount_cup,audience=target_audience,
           starts_on=target_starts_on,ends_on=target_ends_on,
           max_uses=target_max_uses,budget_cup=target_budget_cup,
           updated_by=actor,updated_at=now()
     where project_id=target_project_id and id=target_id
     returning * into after_record;
    result_id:=target_id;
    if to_jsonb(original)-'updated_at' IS DISTINCT FROM to_jsonb(after_record)-'updated_at' then
      insert into app_private.marketplace_customer_campaign_draft_history(
        project_id,draft_id,action,actor_id,before_state,after_state)
        values(target_project_id,result_id,'edited',actor,to_jsonb(original),to_jsonb(after_record));
    end if;
  end if;
  return result_id;
end;
$function$;
revoke all on function public.admin_save_marketplace_customer_campaign_draft_v1(
  uuid,uuid,text,text,text,text,numeric,numeric,text,date,date,integer,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_save_marketplace_customer_campaign_draft_v1(
  uuid,uuid,text,text,text,text,numeric,numeric,text,date,date,integer,numeric)
  to authenticated;

create or replace function public.admin_archive_marketplace_customer_campaign_draft_v1(
  target_project_id uuid,
  target_id uuid
) returns boolean
language plpgsql security definer set search_path to ''
as $function$
declare
  actor uuid:=auth.uid();
  old_record app_private.marketplace_customer_campaign_drafts%rowtype;
  new_record app_private.marketplace_customer_campaign_drafts%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists (select 1 from public.projects p
      where p.id=target_project_id and p.slug='tuktuk-control' and p.owner_id=actor) then
    raise exception 'ONLY_OWNER_MAY_PLAN_CUSTOMER_BENEFITS' using errcode='42501';
  end if;
  select * into old_record from app_private.marketplace_customer_campaign_drafts
    where project_id=target_project_id and id=target_id for update;
  if not found then raise exception 'DRAFT_NOT_FOUND' using errcode='22023'; end if;
  if old_record.status='archived' then return true; end if;
  update app_private.marketplace_customer_campaign_drafts
    set status='archived',updated_by=actor,updated_at=now()
    where project_id=target_project_id and id=target_id returning * into new_record;
  insert into app_private.marketplace_customer_campaign_draft_history(
    project_id,draft_id,action,actor_id,before_state,after_state)
    values(target_project_id,target_id,'archived',actor,to_jsonb(old_record),to_jsonb(new_record));
  return true;
end;
$function$;
revoke all on function public.admin_archive_marketplace_customer_campaign_draft_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_archive_marketplace_customer_campaign_draft_v1(uuid,uuid)
  to authenticated;

commit;
