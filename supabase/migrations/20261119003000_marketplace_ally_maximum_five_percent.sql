-- TukTuk Aliados: the commercial partner receives at most 5 percentage points
-- from TukTuk's 15% gross commission. The driver's 15% general collection
-- and existing Impulsa 10%-own/5%-third-party policy remain unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (select 1 from app_private.marketplace_allies where rate > .05)
     or exists (select 1 from app_private.marketplace_ally_attributions where rate_snapshot > .05) then
    raise exception 'EXISTING_ALLY_RATE_ABOVE_FIVE_PERCENT';
  end if;
end;
$$;

alter table app_private.marketplace_allies
  drop constraint marketplace_allies_rate_check,
  add constraint marketplace_allies_rate_check check (rate >= 0 and rate <= .05);

alter table app_private.marketplace_ally_attributions
  drop constraint marketplace_ally_attributions_rate_snapshot_check,
  add constraint marketplace_ally_attributions_rate_snapshot_check check (rate_snapshot >= 0 and rate_snapshot <= .05);

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
  raw_key:=encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.marketplace_allies(project_id,name,slug,rate,report_secret_hash,created_by)
    values(target_project_id,btrim(target_name),target_slug,target_rate,
      extensions.digest(pg_catalog.decode(raw_key,'hex'),'sha256'),auth.uid())
    returning * into item;
  return jsonb_build_object('id',item.id,'slug',item.slug,'name',item.name,
      'rate',item.rate,'report_key',raw_key,'expires_at',item.report_expires_at);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_update_marketplace_ally_v1(target_project_id uuid, target_ally_id uuid, target_name text, target_rate numeric, target_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if target_name is null or char_length(btrim(target_name)) not between 2 and 80 or
    target_rate is null or target_rate<0 or target_rate>.05 or
    target_status not in ('active','paused') then
    raise exception 'INVALID_ALLY_DETAILS' using errcode='22023'; end if;
  update app_private.marketplace_allies set name=btrim(target_name),rate=target_rate,status=target_status,updated_at=now()
    where id=target_ally_id and project_id=target_project_id;
  if not found then raise exception 'ALLY_NOT_FOUND' using errcode='22023'; end if;
  return true;
end $function$;


commit;
