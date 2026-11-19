-- Aliados: short names at /tuk/nick share the public namespace with Impulsa.
-- Existing /cliente/tuk/?aliado=nick links, stats and settled rides are unchanged.
-- No change to customer/driver wallets, 15% collection, 5% commissions or private report links.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $preflight$
begin
  if exists (
    select 1 from app_private.marketplace_allies a
    join app_private.marketplace_driver_promo_aliases d on d.alias=a.slug
    join public.projects p on p.id=a.project_id and p.slug='tuktuk-control'
  ) then raise exception 'EXISTING_MARKETING_NICK_COLLISION' using errcode='23505'; end if;
end $preflight$;

CREATE OR REPLACE FUNCTION public.admin_create_marketplace_ally_v1(target_project_id uuid, target_name text, target_slug text, target_rate numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare raw_key text; item app_private.marketplace_allies%rowtype;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists(select 1 from public.projects where id=target_project_id and slug='tuktuk-control') then
    raise exception 'NOT_TUKTUK_PROJECT' using errcode='42501'; end if;
  if target_name is null or char_length(btrim(target_name)) not between 2 and 80 or
    target_slug is null or target_slug !~ '^[a-z0-9][a-z0-9-]{1,23}$' or right(target_slug,1)='-' or
    target_rate is null or target_rate<0 or target_rate>.05 then
    raise exception 'INVALID_ALLY_DETAILS' using errcode='22023'; end if;
  -- The public /tuk/nick namespace is shared with Impulsa drivers.
  perform pg_advisory_xact_lock(hashtextextended('tuktuk-shortlink:' || target_slug, 0));
  if exists (select 1 from app_private.marketplace_driver_promo_aliases d where d.alias=target_slug) then
    raise exception 'ALLY_NICK_TAKEN_BY_DRIVER' using errcode='23505';
  end if;
  raw_key:=encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.marketplace_allies(project_id,name,slug,rate,report_secret_hash,created_by)
    values(target_project_id,btrim(target_name),target_slug,target_rate,
      extensions.digest(pg_catalog.decode(raw_key,'hex'),'sha256'),auth.uid())
    returning * into item;
  return jsonb_build_object('id',item.id,'slug',item.slug,'name',item.name,
      'rate',item.rate,'report_key',raw_key,'expires_at',item.report_expires_at);
end $function$;

CREATE OR REPLACE FUNCTION app_private.set_marketplace_promo_alias_v1(target_project_id uuid, target_driver_user_id uuid, target_alias text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  perform pg_advisory_xact_lock(hashtextextended('tuktuk-shortlink:' || chosen, 0));
  if exists(select 1 from app_private.marketplace_allies a
    join public.projects t on t.id=a.project_id and t.slug='tuktuk-control'
    where a.slug=chosen) then
    raise exception 'PROMO_ALIAS_TAKEN' using errcode='23505';
  end if;
  -- Insert first; a collision can never transfer an old alias to another code.
  insert into app_private.marketplace_driver_promo_aliases(alias,promo_code,is_primary)
    values(chosen,p.code,false) on conflict(alias) do nothing;
  select a.promo_code into owner_code from app_private.marketplace_driver_promo_aliases a where a.alias=chosen;
  if owner_code is distinct from p.code then raise exception 'PROMO_ALIAS_TAKEN' using errcode='23505'; end if;
  update app_private.marketplace_driver_promo_aliases set is_primary=false where promo_code=p.code and is_primary;
  update app_private.marketplace_driver_promo_aliases set is_primary=true where alias=chosen and promo_code=p.code;
  return chosen;
end $function$;

CREATE OR REPLACE FUNCTION app_private.ensure_marketplace_promo_alias_v1(target_code text, target_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    perform pg_advisory_xact_lock(hashtextextended('tuktuk-shortlink:' || candidate, 0));
    if exists(select 1 from app_private.marketplace_allies a
      join public.projects p on p.id=a.project_id and p.slug='tuktuk-control'
      where a.slug=candidate) then
      continue;
    end if;
    insert into app_private.marketplace_driver_promo_aliases(alias,promo_code)
      values(candidate,target_code) on conflict do nothing;
    if found then return candidate; end if;
    select a.alias into existing from app_private.marketplace_driver_promo_aliases a
      where a.promo_code=target_code and a.is_primary;
    if existing is not null then return existing; end if;
  end loop;
  raise exception 'PROMO_ALIAS_UNAVAILABLE' using errcode='22023';
end $function$;

-- Server-side only; returned data is public marketing nick/status, never payments, keys or rates.
create or replace function public.get_public_marketplace_ally_shortlink_v1(target_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select jsonb_build_object(
    'slug',a.slug,
    'display_name',initcap(replace(a.slug,'-',' ')),
    'status',a.status
  )
  from app_private.marketplace_allies a
  join public.projects p on p.id=a.project_id and p.slug='tuktuk-control'
  where a.slug=lower(btrim(target_slug))
    and target_slug ~* '^[a-z0-9][a-z0-9-]{1,23}$'
    and right(a.slug,1)<>'-'
  limit 1
$function$;
revoke all on function public.get_public_marketplace_ally_shortlink_v1(text) from public, anon, authenticated;
grant execute on function public.get_public_marketplace_ally_shortlink_v1(text) to service_role;

commit;
