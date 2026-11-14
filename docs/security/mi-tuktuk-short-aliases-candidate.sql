-- Candidate: validate in disposable PostgreSQL before applying to production.
-- A short alias never activates a profile, changes consent, or replaces its opaque code.
begin;
create table app_private.marketplace_driver_promo_aliases (
  alias text primary key check (alias ~ '^[a-z0-9][a-z0-9-]{1,31}$' and right(alias,1)<>'-'),
  promo_code text not null check (promo_code ~ '^[0-9a-f]{32}$'),
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
alter table app_private.marketplace_driver_promo_aliases enable row level security;
revoke all on app_private.marketplace_driver_promo_aliases from public,anon,authenticated;
create unique index marketplace_promo_one_primary_alias on app_private.marketplace_driver_promo_aliases(promo_code) where is_primary;
create index marketplace_promo_alias_code_idx on app_private.marketplace_driver_promo_aliases(promo_code);

-- Keep old aliases reserved permanently, including after revocation.
-- All writes for the same code are serialized by locking its profile row.
create function app_private.ensure_marketplace_promo_alias_v1(target_code text,target_name text)
returns text language plpgsql security invoker set search_path='' as $$
declare base text; candidate text; existing text; attempt integer;
begin
  select a.alias into existing from app_private.marketplace_driver_promo_aliases a
    where a.promo_code=target_code and a.is_primary;
  if existing is not null then return existing; end if;
  base:=left(regexp_replace(split_part(lower(translate(btrim(target_name),
    'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),' ',1),'[^a-z0-9]','','g'),20);
  if char_length(coalesce(base,''))<2 or base in ('admin','api','tuktuk','soporte','impulsa','cliente','conductor','ayuda','login','registro') then
    base:='conductor-'||left(target_code,6);
  end if;
  for attempt in 1..1000 loop
    candidate:=base||case when attempt=1 then '' else attempt::text end;
    insert into app_private.marketplace_driver_promo_aliases(alias,promo_code)
      values(candidate,target_code) on conflict do nothing;
    if found then return candidate; end if;
    select a.alias into existing from app_private.marketplace_driver_promo_aliases a
      where a.promo_code=target_code and a.is_primary;
    if existing is not null then return existing; end if;
  end loop;
  raise exception 'PROMO_ALIAS_UNAVAILABLE' using errcode='22023';
end $$;
revoke all on function app_private.ensure_marketplace_promo_alias_v1(text,text) from public,anon,authenticated;

create function app_private.assign_marketplace_promo_alias_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.revoked_at is null and exists(select 1 from public.projects p where p.id=new.project_id and p.slug='tuktuk-control')
    and app_private.marketplace_driver_identity_verified_v1(new.project_id,new.driver_user_id) then
    perform app_private.ensure_marketplace_promo_alias_v1(new.code,new.public_name);
  end if;
  return new;
end $$;
revoke all on function app_private.assign_marketplace_promo_alias_v1() from public,anon,authenticated;
create trigger assign_marketplace_promo_alias after insert or update of code
on app_private.marketplace_driver_promo_profiles for each row execute function app_private.assign_marketplace_promo_alias_v1();

-- Backfill only already public, consented, verified and currently resolvable profiles.
do $$
declare p record;
begin
  for p in select q.code,q.public_name from app_private.marketplace_driver_promo_profiles q
    where q.revoked_at is null and app_private.marketplace_driver_identity_verified_v1(q.project_id,q.driver_user_id)
      and exists(select 1 from app_private.resolve_marketplace_promo_profile(q.code))
    order by q.consented_at,q.code for update
  loop
    perform app_private.ensure_marketplace_promo_alias_v1(p.code,p.public_name);
  end loop;
end $$;

create function app_private.set_marketplace_promo_alias_v1(target_project_id uuid,target_driver_user_id uuid,target_alias text)
returns text language plpgsql security invoker set search_path='' as $$
declare p app_private.marketplace_driver_promo_profiles%rowtype; chosen text; owner_code text;
begin
  select * into p from app_private.marketplace_driver_promo_profiles
    where project_id=target_project_id and driver_user_id=target_driver_user_id for update;
  if not found or p.revoked_at is not null
    or not app_private.marketplace_driver_identity_verified_v1(p.project_id,p.driver_user_id)
    or not exists(select 1 from app_private.resolve_marketplace_promo_profile(p.code)) then
    raise exception 'PROMO_PROFILE_UNAVAILABLE' using errcode='22023';
  end if;
  if target_alias is null then return app_private.ensure_marketplace_promo_alias_v1(p.code,p.public_name); end if;
  chosen:=lower(btrim(target_alias));
  if chosen !~ '^[a-z0-9][a-z0-9-]{1,31}$' or right(chosen,1)='-' or chosen in ('admin','api','tuktuk','soporte','impulsa','cliente','conductor','ayuda','login','registro') then
    raise exception 'PROMO_ALIAS_INVALID' using errcode='22023';
  end if;
  -- Insert first; a collision can never transfer an old alias to another code.
  insert into app_private.marketplace_driver_promo_aliases(alias,promo_code,is_primary)
    values(chosen,p.code,false) on conflict(alias) do nothing;
  select a.promo_code into owner_code from app_private.marketplace_driver_promo_aliases a where a.alias=chosen;
  if owner_code is distinct from p.code then raise exception 'PROMO_ALIAS_TAKEN' using errcode='23505'; end if;
  update app_private.marketplace_driver_promo_aliases set is_primary=false where promo_code=p.code and is_primary;
  update app_private.marketplace_driver_promo_aliases set is_primary=true where alias=chosen and promo_code=p.code;
  return chosen;
end $$;
revoke all on function app_private.set_marketplace_promo_alias_v1(uuid,uuid,text) from public,anon,authenticated;

create function public.my_marketplace_promo_alias_v1(target_alias text default null)
returns text language plpgsql security definer set search_path='' as $$
declare pid uuid; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  return app_private.set_marketplace_promo_alias_v1(pid,actor,target_alias);
end $$;
revoke all on function public.my_marketplace_promo_alias_v1(text) from public,anon,authenticated;
grant execute on function public.my_marketplace_promo_alias_v1(text) to authenticated;

create function public.admin_marketplace_promo_alias_v1(target_project_id uuid,target_driver_user_id uuid,target_alias text default null)
returns text language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  return app_private.set_marketplace_promo_alias_v1(target_project_id,target_driver_user_id,target_alias);
end $$;
revoke all on function public.admin_marketplace_promo_alias_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_marketplace_promo_alias_v1(uuid,uuid,text) to authenticated;

-- Only the existing rate-limited customer gateway may resolve an alias.
create function public.resolve_marketplace_promo_alias_v1(target_alias text)
returns text language sql stable security definer set search_path='' as $$
  select a.promo_code from app_private.marketplace_driver_promo_aliases a
  cross join lateral app_private.resolve_marketplace_promo_profile(a.promo_code) p
  where a.alias=lower(btrim(target_alias)) and a.is_primary
    and app_private.marketplace_driver_identity_verified_v1(p.project_id,p.driver_user_id)
$$;
revoke all on function public.resolve_marketplace_promo_alias_v1(text) from public,anon,authenticated;
grant execute on function public.resolve_marketplace_promo_alias_v1(text) to service_role;
-- Read the canonical alias for both public artwork and the authenticated card.
create function public.get_marketplace_promo_primary_alias_v1(target_code text)
returns text language sql stable security definer set search_path='' as $$
  select a.alias from app_private.marketplace_driver_promo_aliases a
  cross join lateral app_private.resolve_marketplace_promo_profile(a.promo_code) p
  where a.promo_code=target_code and a.is_primary
    and app_private.marketplace_driver_identity_verified_v1(p.project_id,p.driver_user_id)
$$;
revoke all on function public.get_marketplace_promo_primary_alias_v1(text) from public,anon,authenticated;
grant execute on function public.get_marketplace_promo_primary_alias_v1(text) to service_role;
commit;
